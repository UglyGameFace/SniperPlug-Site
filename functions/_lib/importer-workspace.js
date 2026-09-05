import { OWNER_PRINCIPAL_ID } from './auth.js';
import { sha256 } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';

let schemaPromise = null;

export function principalIdFrom(value) {
  const principalId = String(value?.principalId || value?.sid || value || '').trim();
  if (!principalId) throw new HttpError(401, 'The SniperPlug account principal is missing. Sign in again.');
  return principalId.slice(0, 180);
}

async function tableColumns(db, table) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((rows.results || []).map((row) => String(row.name || '')));
}

async function addColumn(db, table, name, definition) {
  const columns = await tableColumns(db, table);
  if (columns.has(name)) return;
  try {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
  } catch (error) {
    if (!/duplicate column/i.test(String(error?.message || ''))) throw error;
  }
}

async function repairWorkspaceSchema(db) {
  await addColumn(db, 'whop_sources', 'principal_id', `TEXT NOT NULL DEFAULT '${OWNER_PRINCIPAL_ID}'`);
  await addColumn(db, 'whop_sources', 'upstream_experience_id', 'TEXT');
  await addColumn(db, 'whop_posts', 'principal_id', `TEXT NOT NULL DEFAULT '${OWNER_PRINCIPAL_ID}'`);
  await addColumn(db, 'whop_posts', 'upstream_source_key', 'TEXT');
  await addColumn(db, 'whop_posts', 'upstream_experience_id', 'TEXT');
  await addColumn(db, 'guides', 'principal_id', `TEXT NOT NULL DEFAULT '${OWNER_PRINCIPAL_ID}'`);
  await addColumn(db, 'guides', 'upstream_source_key', 'TEXT');

  await db.batch([
    db.prepare(`
      UPDATE whop_sources SET upstream_experience_id = experience_id
      WHERE upstream_experience_id IS NULL OR upstream_experience_id = ''
    `),
    db.prepare(`
      UPDATE whop_posts SET upstream_source_key = source_key
      WHERE upstream_source_key IS NULL OR upstream_source_key = ''
    `),
    db.prepare(`
      UPDATE whop_posts SET upstream_experience_id = (
        SELECT COALESCE(s.upstream_experience_id, s.experience_id)
        FROM whop_sources s WHERE s.experience_id = whop_posts.experience_id
      )
      WHERE upstream_experience_id IS NULL OR upstream_experience_id = ''
    `),
    db.prepare(`
      UPDATE guides SET upstream_source_key = source_key
      WHERE source_key IS NOT NULL AND (upstream_source_key IS NULL OR upstream_source_key = '')
    `),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_whop_sources_principal_upstream ON whop_sources (principal_id, upstream_experience_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_sources_principal_decision ON whop_sources (principal_id, decision, updated_at DESC)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_whop_posts_principal_upstream ON whop_posts (principal_id, upstream_source_key)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_posts_principal_experience ON whop_posts (principal_id, upstream_experience_id, decision, source_updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_guides_principal_status ON guides (principal_id, status, updated_at DESC)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_guides_principal_upstream ON guides (principal_id, upstream_source_key) WHERE upstream_source_key IS NOT NULL'),
  ]);
  return db;
}

export async function ensureImporterWorkspaceSchema(env) {
  const db = requireDatabase(env);
  if (!schemaPromise) {
    schemaPromise = repairWorkspaceSchema(db).then(() => db).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function tenantStorageKey(principalId, kind, upstreamId) {
  const principal = principalIdFrom(principalId);
  const upstream = String(upstreamId || '').trim();
  if (!upstream) throw new HttpError(422, `A valid ${kind} upstream identifier is required.`);
  if (principal === OWNER_PRINCIPAL_ID) return upstream;
  const accountHash = (await sha256(`principal:${principal}`)).slice(0, 16);
  const itemHash = (await sha256(`${kind}:${upstream}`)).slice(0, 32);
  return `ws_${accountHash}_${kind}_${itemHash}`;
}

export function upstreamExperienceId(row) {
  return String(row?.upstream_experience_id || row?.experience_id || '').trim();
}

export function upstreamSourceKey(row) {
  return String(row?.upstream_source_key || row?.source_key || '').trim();
}

export async function sourceStorageId(principalId, upstreamId) {
  return tenantStorageKey(principalId, 'source', upstreamId);
}

export async function postStorageKey(principalId, upstreamKey) {
  return tenantStorageKey(principalId, 'post', upstreamKey);
}

export async function guideStorageKey(principalId, upstreamKey) {
  return postStorageKey(principalId, upstreamKey);
}

export async function sourceRowForPrincipal(env, principalValue, logicalExperienceId) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  return db.prepare(`
    SELECT * FROM whop_sources
    WHERE principal_id = ? AND upstream_experience_id = ?
  `).bind(principalId, String(logicalExperienceId || '').trim()).first();
}

export async function postRowForPrincipal(env, principalValue, logicalSourceKey) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  return db.prepare(`
    SELECT * FROM whop_posts
    WHERE principal_id = ? AND upstream_source_key = ?
  `).bind(principalId, String(logicalSourceKey || '').trim()).first();
}
