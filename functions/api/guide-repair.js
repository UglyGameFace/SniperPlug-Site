import { restoreCourseVideos, snapshotCourseVideos } from '../_lib/course-video.js';
import { restoreGuideSnapshot } from '../_lib/guide-snapshots.js';
import { adminGuide, importApprovedPosts } from '../_lib/guides-media.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { ensureImporterWorkspaceSchema, principalIdFrom, upstreamSourceKey } from '../_lib/importer-workspace.js';
import {
  acquireRecoveryLease,
  assertRecoveryLeaseOwned,
  releaseRecoveryLease,
  renewRecoveryLease,
} from '../_lib/recovery-leases.js';
import { recoveryMediaState, whopRecoveryError } from '../_lib/recovery-media.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

const PAGE_SIZE = 30;
const MAX_CLEANUP_ROWS = 1000;

function numericId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(422, 'Choose a valid removed guide.');
  return id;
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

async function rejectedImportCount(env, principalValue) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const row = await db.prepare(`
    SELECT COUNT(*) AS total FROM guides
    WHERE principal_id = ? AND status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
  `).bind(principalId).first();
  return Number(row?.total || 0);
}

async function rejectedImports(env, principalValue, offset = 0) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
  const rows = await db.prepare(`
    SELECT id, title, description, source_key, upstream_source_key, source_group, source_experience_id,
           source_post_id, category_slug, body_markdown, attachment_json, updated_at
    FROM guides
    WHERE principal_id = ? AND status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).bind(principalId, PAGE_SIZE, safeOffset).all();
  const total = await rejectedImportCount(env, principalId);
  const removedRows = rows.results || [];
  return {
    total,
    offset: safeOffset,
    limit: PAGE_SIZE,
    hasMore: safeOffset + removedRows.length < total,
    removed: removedRows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      description: row.description,
      sourceKey: upstreamSourceKey(row),
      sourceGroup: row.source_group,
      experienceId: row.source_experience_id,
      sourcePostId: row.source_post_id,
      category: row.category_slug,
      removedAt: row.updated_at,
      ...recoveryMediaState(row),
    })),
  };
}

async function discardRemoved(request, env, admin) {
  requireSameOrigin(request);
  const input = await readJson(request, { maxBytes: 20_000 });
  const principalId = principalIdFrom(admin);
  const db = await ensureImporterWorkspaceSchema(env);
  const all = input?.all === true;
  const ids = [...new Set((Array.isArray(input?.guideIds) ? input.guideIds : [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0))];
  if (!all && !ids.length) throw new HttpError(422, 'Choose at least one removed import to clear.');

  let rows;
  if (all) {
    rows = await db.prepare(`
      SELECT id FROM guides
      WHERE principal_id = ? AND status = 'rejected' AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
      ORDER BY updated_at DESC LIMIT ?
    `).bind(principalId, MAX_CLEANUP_ROWS).all();
  } else {
    const placeholders = ids.map(() => '?').join(',');
    rows = await db.prepare(`
      SELECT id FROM guides
      WHERE principal_id = ? AND id IN (${placeholders}) AND status = 'rejected'
        AND source_key IS NOT NULL AND source_experience_id IS NOT NULL
    `).bind(principalId, ...ids).all();
  }
  const selected = (rows.results || []).map((row) => Number(row.id));
  if (!selected.length) return json({ cleared: 0, ...(await rejectedImports(env, principalId, 0)) });

  const now = new Date().toISOString();
  const updates = selected.map((id) => db.prepare(`
    UPDATE guides
    SET source_key = NULL,
        upstream_source_key = NULL,
        source_experience_id = NULL,
        source_post_id = NULL,
        updated_at = ?,
        integrity_json = CASE
          WHEN integrity_json IS NOT NULL AND json_valid(integrity_json)
            THEN json_set(integrity_json, '$.recoveryCleared', 1, '$.recoveryClearedAt', ?)
          ELSE json_object('recoveryCleared', 1, 'recoveryClearedAt', ?)
        END
    WHERE principal_id = ? AND id = ? AND status = 'rejected'
  `).bind(now, now, now, principalId, id));

  for (let index = 0; index < updates.length; index += 50) await db.batch(updates.slice(index, index + 50));
  return json({ cleared: selected.length, ...(await rejectedImports(env, principalId, 0)) });
}

async function restoreSavedCopy(env, principalValue, row) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const now = new Date().toISOString();
  const integrity = safeJson(row.integrity_json, {});
  const result = await db.prepare(`
    UPDATE guides
    SET status = 'draft', published_at = NULL, updated_at = ?, integrity_json = ?
    WHERE principal_id = ? AND id = ? AND status = 'rejected' AND source_key = ? AND updated_at = ?
  `).bind(
    now,
    JSON.stringify({
      ...integrity,
      restoredFromPermanentCopy: true,
      restoredFromPermanentCopyAt: now,
      recoveryMode: 'saved-r2-copy',
      quarantined: false,
      quarantineReason: null,
      quarantinedAt: null,
    }),
    principalId,
    row.id,
    row.source_key,
    row.updated_at,
  ).run();
  if (Number(result.meta?.changes || 0) !== 1) throw new HttpError(409, 'This removed guide changed before its permanent copy could be restored. Refresh the recovery list.');
  const guide = await adminGuide(env, principalId, row.id);
  if (!guide || guide.status !== 'draft') throw new HttpError(409, 'The permanent copy was restored but did not return to this account’s private draft queue.');
  return guide;
}

async function liveExperience(request, env, admin, row) {
  let whop;
  try {
    whop = await requireWhopSession(request, env, admin);
  } catch (error) {
    throw whopRecoveryError(error, { experienceId: row.source_experience_id, sourceKey: upstreamSourceKey(row), operation: 're-import this removed guide' });
  }
  let experience;
  try {
    experience = await retrieveExperience(whop, row.source_experience_id);
  } catch (error) {
    throw whopRecoveryError(error, { experienceId: row.source_experience_id, sourceKey: upstreamSourceKey(row), operation: 're-import this removed guide' });
  }
  return { whop, experience };
}

async function rollbackRecovery(env, lease, id, lockedRow, videoSnapshot, originalError) {
  try {
    await assertRecoveryLeaseOwned(env, lease);
    const db = await ensureImporterWorkspaceSchema(env);
    const current = await db.prepare('SELECT * FROM guides WHERE principal_id = ? AND id = ?').bind(lease.principalId, id).first();
    if (!current || String(current.source_key || '') !== String(lockedRow.source_key || '')) throw new HttpError(409, 'The guide changed identity while recovery was running. Newer work was preserved.');
    await restoreGuideSnapshot(env, lease.principalId, lockedRow, { expectedUpdatedAt: current.updated_at });
    await restoreCourseVideos(env, id, videoSnapshot);
  } catch (rollbackError) {
    throw new HttpError(500, 'Recovery failed and SniperPlug could not safely restore the original rejected guide and video state.', {
      code: 'guide_recovery_rollback_failed',
      recoveryError: String(originalError?.message || originalError),
      rollbackError: String(rollbackError?.message || rollbackError),
    });
  }
}

async function repairGuide(request, env, admin) {
  requireSameOrigin(request);
  const input = await readJson(request, { maxBytes: 20_000 });
  if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm that you own this content or have permission to republish it.');

  const principalId = principalIdFrom(admin);
  const id = numericId(input.guideId);
  const db = await ensureImporterWorkspaceSchema(env);
  const row = await db.prepare('SELECT * FROM guides WHERE principal_id = ? AND id = ?').bind(principalId, id).first();
  if (!row) throw new HttpError(404, 'The removed guide no longer exists in this account workspace.');
  if (row.status !== 'rejected') throw new HttpError(409, 'This guide is no longer removed. Refresh the recovery list.');
  if (!row.source_key || !row.source_experience_id || !upstreamSourceKey(row)) throw new HttpError(422, 'This guide was not imported from a recoverable Whop Experience.');

  const lease = await acquireRecoveryLease(env, principalId, id);
  try {
    const lockedRow = await db.prepare('SELECT * FROM guides WHERE principal_id = ? AND id = ?').bind(principalId, id).first();
    if (!lockedRow || lockedRow.status !== 'rejected' || lockedRow.source_key !== row.source_key) throw new HttpError(409, 'This guide changed before recovery started. Refresh the recovery list.');

    const videoSnapshot = await snapshotCourseVideos(env, id);
    try {
      await renewRecoveryLease(env, lease);
      const mediaTruth = recoveryMediaState(lockedRow);
      if (mediaTruth.canRestoreSavedCopy) {
        const guide = await restoreSavedCopy(env, principalId, lockedRow);
        return json({ repaired: true, action: 'restored-saved-copy', recoveryMode: 'saved-r2-copy', guide, media: mediaTruth, ...(await rejectedImports(env, principalId, 0)) });
      }

      const { whop, experience } = await liveExperience(request, env, admin, lockedRow);
      const logicalSourceKey = upstreamSourceKey(lockedRow);
      const output = await importApprovedPosts(env, principalId, whop, {
        experienceId: experience.id,
        sourceKeys: [logicalSourceKey],
        recoveryGuideId: id,
        category: lockedRow.category_slug || undefined,
        autoCategorize: !lockedRow.category_slug,
        automaticWorkflow: false,
        rightsConfirmed: true,
      });
      const result = (output.results || []).find((item) => String(item.sourceKey) === logicalSourceKey);
      if (!result || !['created-draft', 'updated-draft'].includes(result.action)) throw new HttpError(409, result?.holdReason || 'Whop returned the item, but SniperPlug could not rebuild the draft.');
      const guideId = Number(result.guideId || id);
      if (guideId !== id) throw new HttpError(409, 'Recovery rebuilt a different guide record and was stopped.');
      const guide = await adminGuide(env, principalId, guideId);
      if (!guide || guide.status !== 'draft') throw new HttpError(409, 'The item was fetched but did not return to this account’s private draft queue.');
      return json({ repaired: true, action: result.action, recoveryMode: 'live-whop-reimport', guide, import: output, ...(await rejectedImports(env, principalId, 0)) });
    } catch (error) {
      await rollbackRecovery(env, lease, id, lockedRow, videoSnapshot, error);
      throw error;
    }
  } finally {
    await releaseRecoveryLease(env, lease).catch(() => null);
  }
}

export async function onRequest(context) {
  try {
    const account = await requireControlAccount(context.request, context.env);
    if (context.request.method === 'GET') {
      const offset = new URL(context.request.url).searchParams.get('offset');
      return json(await rejectedImports(context.env, account, offset));
    }
    if (context.request.method === 'POST') {
      const clone = context.request.clone();
      const input = await readJson(clone, { maxBytes: 20_000 });
      if (input?.action === 'discard') return discardRemoved(context.request, context.env, account);
      return repairGuide(context.request, context.env, account);
    }
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    return handleError(error);
  }
}
