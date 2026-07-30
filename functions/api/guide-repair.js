import { requireAdmin } from '../_lib/auth.js';
import { restoreCourseVideos, snapshotCourseVideos } from '../_lib/course-video.js';
import { restoreGuideSnapshot } from '../_lib/guide-snapshots.js';
import { adminGuide, importApprovedPosts } from '../_lib/guides-media.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireDatabase, requireSameOrigin } from '../_lib/http.js';
import {
  acquireRecoveryLease,
  assertRecoveryLeaseOwned,
  releaseRecoveryLease,
  renewRecoveryLease,
} from '../_lib/recovery-leases.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

const PAGE_SIZE = 30;
const MAX_CLEANUP_ROWS = 1000;

function numericId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(422, 'Choose a valid removed guide.');
  return id;
}

async function rejectedImportCount(env) {
  const db = requireDatabase(env);
  const row = await db.prepare(`
    SELECT COUNT(*) AS total FROM guides
    WHERE status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
  `).first();
  return Number(row?.total || 0);
}

async function rejectedImports(env, offset = 0) {
  const db = requireDatabase(env);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const rows = await db.prepare(`
    SELECT id, title, description, source_key, source_group, source_experience_id,
           source_post_id, category_slug, updated_at
    FROM guides
    WHERE status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(PAGE_SIZE, safeOffset).all();
  const total = await rejectedImportCount(env);
  return {
    total,
    offset: safeOffset,
    limit: PAGE_SIZE,
    hasMore: safeOffset + PAGE_SIZE < total,
    removed: (rows.results || []).map((row) => ({
      id: Number(row.id),
      title: row.title,
      description: row.description,
      sourceKey: row.source_key,
      sourceGroup: row.source_group,
      experienceId: row.source_experience_id,
      sourcePostId: row.source_post_id,
      category: row.category_slug,
      removedAt: row.updated_at,
    })),
  };
}

async function discardRemoved(request, env) {
  requireSameOrigin(request);
  const input = await readJson(request, { maxBytes: 20_000 });
  const db = requireDatabase(env);
  const all = input?.all === true;
  const ids = [...new Set((Array.isArray(input?.guideIds) ? input.guideIds : [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0))];
  if (!all && !ids.length) throw new HttpError(422, 'Choose at least one removed import to clear.');

  let rows;
  if (all) {
    rows = await db.prepare(`
      SELECT id FROM guides
      WHERE status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
      ORDER BY updated_at DESC LIMIT ?
    `).bind(MAX_CLEANUP_ROWS).all();
  } else {
    const placeholders = ids.map(() => '?').join(',');
    rows = await db.prepare(`
      SELECT id FROM guides
      WHERE id IN (${placeholders}) AND status = 'rejected'
        AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
    `).bind(...ids).all();
  }
  const selected = (rows.results || []).map((row) => Number(row.id));
  if (!selected.length) return json({ cleared: 0, ...(await rejectedImports(env, 0)) });

  const now = new Date().toISOString();
  await db.batch(selected.map((id) => db.prepare(`
    UPDATE guides
    SET source_key = NULL,
        source_experience_id = NULL,
        source_post_id = NULL,
        updated_at = ?,
        integrity_json = json_set(COALESCE(integrity_json, '{}'), '$.recoveryCleared', 1, '$.recoveryClearedAt', ?)
    WHERE id = ? AND status = 'rejected'
  `).bind(now, now, id)));
  return json({ cleared: selected.length, ...(await rejectedImports(env, 0)) });
}

async function repairGuide(request, env, admin) {
  requireSameOrigin(request);
  const input = await readJson(request, { maxBytes: 20_000 });
  if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm that you own this content or have permission to republish it.');

  const id = numericId(input.guideId);
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'The removed guide no longer exists.');
  if (row.status !== 'rejected') throw new HttpError(409, 'This guide is no longer removed. Refresh the recovery list.');
  if (!row.source_key || !row.source_experience_id) throw new HttpError(422, 'This guide was not imported from a recoverable Whop Experience.');

  const lease = await acquireRecoveryLease(env, id);
  try {
    const lockedRow = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
    if (!lockedRow || lockedRow.status !== 'rejected' || lockedRow.source_key !== row.source_key) throw new HttpError(409, 'This guide changed before recovery started. Refresh the recovery list.');

    const whop = await requireWhopSession(request, env, admin);
    const experience = await retrieveExperience(whop, lockedRow.source_experience_id);
    const videoSnapshot = await snapshotCourseVideos(env, id);
    try {
      await renewRecoveryLease(env, lease);
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
      if (!result || !['created-draft', 'updated-draft'].includes(result.action)) throw new HttpError(409, result?.holdReason || 'Whop returned the item, but SniperPlug could not rebuild the draft.');
      const guideId = Number(result.guideId || id);
      if (guideId !== id) throw new HttpError(409, 'Recovery rebuilt a different guide record and was stopped.');
      const guide = await adminGuide(env, guideId);
      if (!guide || guide.status !== 'draft') throw new HttpError(409, 'The item was fetched but did not return to the private draft queue.');
      return json({ repaired: true, action: result.action, guide, import: output, ...(await rejectedImports(env, 0)) });
    } catch (error) {
      try {
        await assertRecoveryLeaseOwned(env, lease);
        const current = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
        if (!current || String(current.source_key || '') !== String(lockedRow.source_key || '')) throw new HttpError(409, 'The guide changed identity while recovery was running. Newer work was preserved.');
        await restoreGuideSnapshot(env, lockedRow, { expectedUpdatedAt: current.updated_at });
        await restoreCourseVideos(env, id, videoSnapshot);
      } catch (rollbackError) {
        throw new HttpError(500, 'Recovery failed and SniperPlug could not safely restore the original rejected guide and video state.', {
          recoveryError: String(error?.message || error), rollbackError: String(rollbackError?.message || rollbackError),
        });
      }
      throw error;
    }
  } finally {
    await releaseRecoveryLease(env, lease).catch(() => null);
  }
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method === 'GET') {
      const offset = new URL(context.request.url).searchParams.get('offset');
      return json(await rejectedImports(context.env, offset));
    }
    if (context.request.method === 'POST') {
      const clone = context.request.clone();
      const input = await readJson(clone, { maxBytes: 20_000 });
      if (input?.action === 'discard') return discardRemoved(context.request, context.env);
      return repairGuide(context.request, context.env, admin);
    }
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    return handleError(error);
  }
}
