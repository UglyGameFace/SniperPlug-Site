import { HttpError } from './http.js';
import { ensureImporterWorkspaceSchema, principalIdFrom } from './importer-workspace.js';
import { assertGuideNotRecovering } from './recovery-leases.js';

function nextVersion(previous = '') {
  const now = new Date();
  const prior = Date.parse(String(previous || ''));
  if (Number.isFinite(prior) && now.getTime() <= prior) now.setTime(prior + 1);
  return now.toISOString();
}

export async function reserveGuideVersion(env, principalValue, id, expectedUpdatedAt, operation = 'change') {
  const principalId = principalIdFrom(principalValue);
  await assertGuideNotRecovering(env, principalId, id);
  const db = await ensureImporterWorkspaceSchema(env);
  const expected = String(expectedUpdatedAt || '').trim();
  if (!expected) {
    throw new HttpError(409, `Refresh this guide before the ${operation} so SniperPlug can confirm you are using the newest version.`, {
      code: 'guide_version_required',
      guideId: Number(id),
      operation,
    });
  }
  const reservation = nextVersion(expected);
  const result = await db.prepare(`
    UPDATE guides SET updated_at = ?
    WHERE principal_id = ? AND id = ? AND updated_at = ?
  `).bind(reservation, principalId, id, expected).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    const current = await db.prepare(`
      SELECT updated_at, status FROM guides WHERE principal_id = ? AND id = ?
    `).bind(principalId, id).first();
    if (!current) throw new HttpError(404, 'Guide not found in this account workspace.');
    throw new HttpError(409, `This guide changed in another tab or workflow. The older ${operation} was not applied; refresh to load the newest version.`, {
      code: 'guide_version_stale',
      guideId: Number(id),
      operation,
      expectedUpdatedAt: expected,
      currentUpdatedAt: current.updated_at || null,
      currentStatus: current.status || null,
    });
  }
  return { id: Number(id), principalId, expected, reservation, operation };
}

export async function restoreGuideVersion(env, lease) {
  if (!lease?.id || !lease?.principalId || !lease?.expected || !lease?.reservation) return;
  const db = await ensureImporterWorkspaceSchema(env);
  await db.prepare(`
    UPDATE guides SET updated_at = ?
    WHERE principal_id = ? AND id = ? AND updated_at = ?
  `).bind(lease.expected, lease.principalId, lease.id, lease.reservation).run();
}
