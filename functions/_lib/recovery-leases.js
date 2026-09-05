import { HttpError, requireDatabase } from './http.js';
import { randomToken } from './crypto.js';
import { ensureImporterWorkspaceSchema, principalIdFrom } from './importer-workspace.js';

const RECOVERY_LEASE_MS = 5 * 60_000;

async function ensureRecoveryLeaseTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS guide_recovery_leases (
      guide_id INTEGER PRIMARY KEY,
      lease_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE
    )
  `).run();
  try {
    await db.prepare("ALTER TABLE guide_recovery_leases ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''").run();
  } catch (error) {
    if (!/duplicate column/i.test(String(error?.message || ''))) throw error;
  }
}

async function removeExpired(db, nowIso) {
  await db.prepare('DELETE FROM guide_recovery_leases WHERE expires_at <= ?').bind(nowIso).run();
}

async function requireOwnedGuide(db, principalId, guideId) {
  const row = await db.prepare('SELECT id FROM guides WHERE principal_id = ? AND id = ?')
    .bind(principalId, guideId).first();
  if (!row) throw new HttpError(404, 'Guide not found in this account workspace.');
  return row;
}

export async function acquireRecoveryLease(env, principalValue, guideId) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  await requireOwnedGuide(db, principalId, guideId);
  await ensureRecoveryLeaseTable(db);
  const now = new Date();
  const nowIso = now.toISOString();
  const token = `recovery_${randomToken(18)}`;
  await removeExpired(db, nowIso);
  const result = await db.prepare(`
    INSERT OR IGNORE INTO guide_recovery_leases (guide_id, lease_token, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(guideId, token, new Date(now.getTime() + RECOVERY_LEASE_MS).toISOString(), nowIso, nowIso).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This guide is already being restored in another tab or request. Wait for that operation to finish, then refresh.', {
      code: 'guide_recovery_in_progress',
      guideId: Number(guideId),
    });
  }
  return { guideId: Number(guideId), principalId, token };
}

export async function renewRecoveryLease(env, lease) {
  if (!lease?.guideId || !lease?.principalId || !lease?.token) throw new HttpError(409, 'Recovery ownership is missing. Refresh before retrying.');
  const db = await ensureImporterWorkspaceSchema(env);
  await requireOwnedGuide(db, lease.principalId, lease.guideId);
  const now = new Date();
  const result = await db.prepare(`
    UPDATE guide_recovery_leases
    SET expires_at = ?, updated_at = ?
    WHERE guide_id = ? AND lease_token = ?
  `).bind(new Date(now.getTime() + RECOVERY_LEASE_MS).toISOString(), now.toISOString(), lease.guideId, lease.token).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This recovery lost ownership before it finished. Refresh instead of retrying blindly.', {
      code: 'guide_recovery_lease_lost',
      guideId: Number(lease.guideId),
    });
  }
  return lease;
}

export async function assertRecoveryLeaseOwned(env, lease) {
  if (!lease?.guideId || !lease?.principalId || !lease?.token) throw new HttpError(409, 'Recovery ownership is missing.');
  const db = await ensureImporterWorkspaceSchema(env);
  await requireOwnedGuide(db, lease.principalId, lease.guideId);
  const nowIso = new Date().toISOString();
  await removeExpired(db, nowIso);
  const row = await db.prepare(`
    SELECT guide_id FROM guide_recovery_leases
    WHERE guide_id = ? AND lease_token = ? AND expires_at > ?
  `).bind(lease.guideId, lease.token, nowIso).first();
  if (!row) {
    throw new HttpError(409, 'This recovery no longer owns the guide. Newer work was preserved.', {
      code: 'guide_recovery_lease_lost',
      guideId: Number(lease.guideId),
    });
  }
  return true;
}

export async function assertGuideNotRecovering(env, principalValue, guideId) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  await requireOwnedGuide(db, principalId, guideId);
  await ensureRecoveryLeaseTable(db);
  const nowIso = new Date().toISOString();
  await removeExpired(db, nowIso);
  const row = await db.prepare(`
    SELECT expires_at FROM guide_recovery_leases
    WHERE guide_id = ? AND expires_at > ?
  `).bind(guideId, nowIso).first();
  if (row) {
    throw new HttpError(409, 'This guide is currently being restored from Whop. Wait for recovery to finish, then refresh before editing or changing status.', {
      code: 'guide_recovery_in_progress',
      guideId: Number(guideId),
      expiresAt: row.expires_at,
    });
  }
}

export async function releaseRecoveryLease(env, lease) {
  if (!lease?.guideId || !lease?.token) return;
  const db = requireDatabase(env);
  await db.prepare('DELETE FROM guide_recovery_leases WHERE guide_id = ? AND lease_token = ?')
    .bind(lease.guideId, lease.token).run();
}
