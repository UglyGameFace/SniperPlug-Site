import { HttpError, requireDatabase } from './http.js';
import { assertGuideNotRecovering } from './recovery-leases.js';

function nextVersion(previous = '') {
  const now = new Date();
  const prior = Date.parse(String(previous || ''));
  if (Number.isFinite(prior) && now.getTime() <= prior) now.setTime(prior + 1);
  return now.toISOString();
}

export async function reserveGuideVersion(env, id, expectedUpdatedAt, operation = 'change') {
  await assertGuideNotRecovering(env, id);
  const db = requireDatabase(env);
  const expected = String(expectedUpdatedAt || '').trim();
  if (!expected) {
    throw new HttpError(409, `Refresh this guide before the ${operation} so SniperPlug can confirm you are using the newest version.`, {
      code: 'guide_version_required',
      guideId: Number(id),
      operation,
    });
  }
  const reservation = nextVersion(expected);
  const result = await db.prepare('UPDATE guides SET updated_at = ? WHERE id = ? AND updated_at = ?')
    .bind(reservation, id, expected).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    const current = await db.prepare('SELECT updated_at, status FROM guides WHERE id = ?').bind(id).first();
    throw new HttpError(409, `This guide changed in another tab or workflow. The older ${operation} was not applied; refresh to load the newest version.`, {
      code: 'guide_version_stale',
      guideId: Number(id),
      operation,
      expectedUpdatedAt: expected,
      currentUpdatedAt: current?.updated_at || null,
      currentStatus: current?.status || null,
    });
  }
  return { id: Number(id), expected, reservation, operation };
}

export async function restoreGuideVersion(env, lease) {
  if (!lease?.id || !lease?.expected || !lease?.reservation) return;
  const db = requireDatabase(env);
  await db.prepare('UPDATE guides SET updated_at = ? WHERE id = ? AND updated_at = ?')
    .bind(lease.expected, lease.id, lease.reservation).run();
}
