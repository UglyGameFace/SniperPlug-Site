import { requireAdmin } from '../_lib/auth.js';
import { adminGuide, importApprovedPosts } from '../_lib/guides-media.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireDatabase, requireSameOrigin } from '../_lib/http.js';
import { savePostDecision } from '../_lib/posts.js';
import { saveSourceDecision } from '../_lib/source-policy.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

const MAX_RECOVERY_ROWS = 250;

function numericId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(422, 'Choose a valid removed guide.');
  return id;
}

async function rejectedImports(env) {
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT id, title, description, source_key, source_group, source_experience_id,
           source_post_id, category_slug, updated_at
    FROM guides
    WHERE status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(MAX_RECOVERY_ROWS).all();
  return (rows.results || []).map((row) => ({
    id: Number(row.id),
    title: row.title,
    description: row.description,
    sourceKey: row.source_key,
    sourceGroup: row.source_group,
    experienceId: row.source_experience_id,
    sourcePostId: row.source_post_id,
    category: row.category_slug,
    removedAt: row.updated_at,
  }));
}

async function policySnapshot(db, row) {
  const [source, post] = await Promise.all([
    db.prepare('SELECT decision, updated_at FROM whop_sources WHERE experience_id = ?')
      .bind(row.source_experience_id).first(),
    db.prepare('SELECT decision, decision_updated_at FROM whop_posts WHERE source_key = ?')
      .bind(row.source_key).first(),
  ]);
  return { source, post };
}

async function restorePolicySnapshot(db, row, snapshot) {
  const statements = [];
  if (snapshot.source) {
    statements.push(db.prepare(`
      UPDATE whop_sources SET decision = ?, updated_at = ? WHERE experience_id = ?
    `).bind(snapshot.source.decision, snapshot.source.updated_at, row.source_experience_id));
  } else {
    statements.push(db.prepare('DELETE FROM whop_sources WHERE experience_id = ?').bind(row.source_experience_id));
  }
  if (snapshot.post) {
    statements.push(db.prepare(`
      UPDATE whop_posts SET decision = ?, decision_updated_at = ? WHERE source_key = ?
    `).bind(snapshot.post.decision, snapshot.post.decision_updated_at, row.source_key));
  }
  if (statements.length) await db.batch(statements);
}

async function returnGuideToRejected(db, row) {
  await db.prepare(`
    UPDATE guides
    SET status = 'rejected', published_at = NULL, updated_at = ?
    WHERE id = ?
  `).bind(row.updated_at || new Date().toISOString(), row.id).run();
}

async function repairGuide(request, env, admin) {
  requireSameOrigin(request);
  const input = await readJson(request, { maxBytes: 20_000 });
  if (input?.rightsConfirmed !== true) {
    throw new HttpError(422, 'Confirm that you own this content or have permission to republish it.');
  }

  const id = numericId(input.guideId);
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'The removed guide no longer exists.');
  if (row.status !== 'rejected') throw new HttpError(409, 'This guide is no longer removed. Refresh the recovery list.');
  if (!row.source_key || !row.source_experience_id) {
    throw new HttpError(422, 'This guide was not imported from a recoverable Whop Experience.');
  }

  const whop = await requireWhopSession(request, env, admin);
  const experience = await retrieveExperience(whop, row.source_experience_id);
  const snapshot = await policySnapshot(db, row);

  let output;
  try {
    // Recovery temporarily makes only the exact source and item importable. The
    // owner's prior review decisions are restored before this request returns,
    // whether the rebuild succeeds or fails.
    await saveSourceDecision(env, experience, experience.id, 'approved');
    await savePostDecision(env, [row.source_key], 'approved');

    output = await importApprovedPosts(env, whop, {
      experienceId: experience.id,
      sourceKeys: [row.source_key],
      category: row.category_slug || undefined,
      autoCategorize: !row.category_slug,
      automaticWorkflow: false,
      rightsConfirmed: true,
    });

    const result = (output.results || []).find((item) => String(item.sourceKey) === String(row.source_key));
    if (!result || !['created-draft', 'updated-draft', 'unchanged'].includes(result.action)) {
      throw new HttpError(409, result?.holdReason || 'Whop returned the item, but SniperPlug could not rebuild the draft.');
    }

    const guideId = Number(result.guideId || id);
    const guide = await adminGuide(env, guideId);
    if (!guide || guide.status !== 'draft') {
      throw new HttpError(409, 'The item was fetched but did not return to the private draft queue.');
    }

    await restorePolicySnapshot(db, row, snapshot);
    return json({
      repaired: true,
      action: result.action,
      guide,
      import: output,
      remaining: await rejectedImports(env),
    });
  } catch (error) {
    try {
      await restorePolicySnapshot(db, row, snapshot);
      await returnGuideToRejected(db, row);
    } catch (rollbackError) {
      throw new HttpError(500, 'Recovery failed and SniperPlug could not fully restore the previous private state.', {
        recoveryError: String(error?.message || error),
        rollbackError: String(rollbackError?.message || rollbackError),
      });
    }
    throw error;
  }
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method === 'GET') {
      return json({ removed: await rejectedImports(context.env) });
    }
    if (context.request.method === 'POST') {
      return repairGuide(context.request, context.env, admin);
    }
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    return handleError(error);
  }
}
