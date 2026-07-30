import { requireAdmin } from '../_lib/auth.js';
import { restoreCourseVideos, snapshotCourseVideos } from '../_lib/course-video.js';
import { adminGuide, importApprovedPosts } from '../_lib/guides-media.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireDatabase, requireSameOrigin } from '../_lib/http.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

const MAX_RECOVERY_ROWS = 250;
const RECOVERY_LEASE_MS = 5 * 60 * 1000;
const GUIDE_RESTORE_COLUMNS = [
  'slug', 'title', 'description', 'category_slug', 'body_markdown', 'status', 'featured', 'sort_order',
  'source_key', 'source_group', 'source_experience_id', 'source_post_id', 'source_fingerprint',
  'attachment_json', 'integrity_json', 'author_json', 'source_created_at', 'source_updated_at',
  'imported_at', 'updated_at', 'published_at',
];

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

async function ensureRecoveryLeaseTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS guide_recovery_leases (
      guide_id INTEGER PRIMARY KEY,
      lease_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE
    )
  `).run();
}

async function acquireRecoveryLease(db, guideId) {
  await ensureRecoveryLeaseTable(db);
  const now = new Date();
  const nowIso = now.toISOString();
  const token = crypto.randomUUID();
  await db.prepare('DELETE FROM guide_recovery_leases WHERE expires_at <= ?').bind(nowIso).run();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO guide_recovery_leases (guide_id, lease_token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(guideId, token, new Date(now.getTime() + RECOVERY_LEASE_MS).toISOString(), nowIso).run();
  if (!Number(result.meta?.changes || 0)) {
    throw new HttpError(409, 'This guide is already being restored in another tab or request. Wait for that operation to finish, then refresh.');
  }
  return token;
}

async function releaseRecoveryLease(db, guideId, token) {
  await db.prepare('DELETE FROM guide_recovery_leases WHERE guide_id = ? AND lease_token = ?')
    .bind(guideId, token).run();
}

async function restoreGuideSnapshot(db, row) {
  const assignments = GUIDE_RESTORE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  await db.prepare(`UPDATE guides SET ${assignments} WHERE id = ?`)
    .bind(...GUIDE_RESTORE_COLUMNS.map((column) => row[column] ?? null), row.id)
    .run();
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

  const leaseToken = await acquireRecoveryLease(db, id);
  try {
    const lockedRow = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
    if (!lockedRow || lockedRow.status !== 'rejected' || lockedRow.source_key !== row.source_key) {
      throw new HttpError(409, 'This guide changed before recovery started. Refresh the recovery list.');
    }

    const whop = await requireWhopSession(request, env, admin);
    const experience = await retrieveExperience(whop, lockedRow.source_experience_id);
    const videoSnapshot = await snapshotCourseVideos(env, id);

    try {
      const output = await importApprovedPosts(env, whop, {
        experienceId: experience.id,
        sourceKeys: [lockedRow.source_key],
        recoveryGuideId: id,
        category: lockedRow.category_slug || undefined,
        autoCategorize: !lockedRow.category_slug,
        automaticWorkflow: false,
        rightsConfirmed: true,
      });

      const result = (output.results || []).find((item) => String(item.sourceKey) === String(lockedRow.source_key));
      if (!result || !['created-draft', 'updated-draft'].includes(result.action)) {
        throw new HttpError(409, result?.holdReason || 'Whop returned the item, but SniperPlug could not rebuild the draft.');
      }

      const guideId = Number(result.guideId || id);
      if (guideId !== id) throw new HttpError(409, 'Recovery rebuilt a different guide record and was stopped.');
      const guide = await adminGuide(env, guideId);
      if (!guide || guide.status !== 'draft') {
        throw new HttpError(409, 'The item was fetched but did not return to the private draft queue.');
      }

      return json({
        repaired: true,
        action: result.action,
        guide,
        import: output,
        remaining: await rejectedImports(env),
      });
    } catch (error) {
      try {
        await restoreGuideSnapshot(db, lockedRow);
        await restoreCourseVideos(env, id, videoSnapshot);
      } catch (rollbackError) {
        throw new HttpError(500, 'Recovery failed and SniperPlug could not restore the original rejected guide and video state.', {
          recoveryError: String(error?.message || error),
          rollbackError: String(rollbackError?.message || rollbackError),
        });
      }
      throw error;
    }
  } finally {
    await releaseRecoveryLease(db, id, leaseToken).catch(() => null);
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
