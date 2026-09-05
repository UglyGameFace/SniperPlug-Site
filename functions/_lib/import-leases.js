import { randomToken } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';
import { postStorageKey, principalIdFrom } from './importer-workspace.js';

const IMPORT_LEASE_MS = 10 * 60_000;

function normalizedKeys(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))].sort();
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS whop_import_leases (
      source_key TEXT PRIMARY KEY,
      lease_token TEXT NOT NULL,
      lease_until TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_leases_until ON whop_import_leases (lease_until)').run();
}

async function releaseRows(db, keys, token) {
  for (const key of keys) {
    await db.prepare('DELETE FROM whop_import_leases WHERE source_key = ? AND lease_token = ?')
      .bind(key, token).run().catch(() => null);
  }
}

export async function acquireImportLeases(env, principalValue, sourceKeys) {
  const principalId = principalIdFrom(principalValue);
  const logicalKeys = normalizedKeys(sourceKeys);
  if (!logicalKeys.length) throw new HttpError(422, 'Choose at least one exact Whop item to import.');
  const storageKeys = await Promise.all(logicalKeys.map((key) => postStorageKey(principalId, key)));
  const db = requireDatabase(env);
  await ensureTable(db);
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + IMPORT_LEASE_MS).toISOString();
  const token = `import_${randomToken(18)}`;
  const acquired = [];

  try {
    await db.prepare('DELETE FROM whop_import_leases WHERE lease_until <= ?').bind(nowIso).run();
    for (let index = 0; index < storageKeys.length; index += 1) {
      const storageKey = storageKeys[index];
      const result = await db.prepare(`
        INSERT OR IGNORE INTO whop_import_leases (source_key, lease_token, lease_until, started_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(storageKey, token, leaseUntil, nowIso, nowIso).run();
      if (Number(result.meta?.changes || 0) !== 1) {
        throw new HttpError(409, 'This exact Whop item is already being imported or restored in this SniperPlug account. Refresh its saved state before retrying.', {
          code: 'guide_import_in_progress',
          sourceKey: logicalKeys[index],
        });
      }
      acquired.push(storageKey);
    }
    return { token, keys: storageKeys, logicalKeys, principalId };
  } catch (error) {
    await releaseRows(db, acquired, token);
    throw error;
  }
}

export async function renewImportLeases(env, lease) {
  if (!lease?.token || !Array.isArray(lease.keys) || !lease.keys.length) {
    throw new HttpError(409, 'The guide import no longer owns its saved work.', { code: 'guide_import_lease_missing' });
  }
  const db = requireDatabase(env);
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntil = new Date(now.getTime() + IMPORT_LEASE_MS).toISOString();
  for (let index = 0; index < lease.keys.length; index += 1) {
    const key = lease.keys[index];
    const result = await db.prepare(`
      UPDATE whop_import_leases
      SET lease_until = ?, updated_at = ?
      WHERE source_key = ? AND lease_token = ?
    `).bind(leaseUntil, nowIso, key, lease.token).run();
    if (Number(result.meta?.changes || 0) !== 1) {
      throw new HttpError(409, 'This guide import lost ownership before all media could be saved. Refresh instead of retrying blindly.', {
        code: 'guide_import_lease_lost',
        sourceKey: lease.logicalKeys?.[index] || null,
      });
    }
  }
}

export async function releaseImportLeases(env, lease) {
  if (!lease?.token || !Array.isArray(lease.keys)) return;
  const db = requireDatabase(env);
  await releaseRows(db, lease.keys, lease.token);
}
