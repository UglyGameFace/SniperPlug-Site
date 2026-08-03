import { randomToken, sha256, signValue, verifyValue } from './crypto.js';
import {
  cancelMediaCopy,
  completeMediaCopy,
  extractMediaStorageKeys,
  prepareMediaCopy,
} from './media-storage.js';
import { HttpError, requireDatabase } from './http.js';

export const WHOP_BACKUP_SCHEMA_VERSION = 2;
const MAX_BACKUP_ROWS = 50_000;
const MAX_BACKUP_BYTES = 10_000_000;
const JSON_BATCH_BYTES = 1_400_000;
const RESET_TOKEN_TTL_MS = 15 * 60_000;

const GUIDE_COLUMNS = Object.freeze([
  'slug', 'title', 'description', 'category_slug', 'body_markdown', 'status', 'featured', 'sort_order',
  'source_key', 'source_group', 'source_experience_id', 'source_post_id', 'source_fingerprint',
  'attachment_json', 'integrity_json', 'author_json', 'source_created_at', 'source_updated_at',
  'imported_at', 'updated_at', 'published_at',
]);

let schemaPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function missingTable(error, table) {
  const text = String(error?.message || '').toLowerCase();
  return text.includes('no such table') && text.includes(String(table || '').toLowerCase());
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableBackupJson(value) {
  return JSON.stringify(stableValue(value));
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || '')).byteLength;
}

function exactExperienceId(value) {
  const id = String(value || '').trim();
  return /^exp_[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function normalizedScope(input = {}) {
  const scope = String(input.scope || (input.experienceId ? 'source' : 'all')).trim().toLowerCase();
  if (!['all', 'source'].includes(scope)) throw new HttpError(422, 'Choose one Whop source or the entire importer.');
  const experienceId = scope === 'source' ? exactExperienceId(input.experienceId) : null;
  if (scope === 'source' && !experienceId) throw new HttpError(422, 'Choose an exact Whop experience before continuing.');
  return { scope, experienceId };
}

function scopeSuffix(scope) {
  return scope.scope === 'source' ? String(scope.experienceId).slice(-6).toUpperCase() : 'ALL';
}

export function resetConfirmationPhrase(scopeInput, deletePublished = false) {
  const scope = normalizedScope(scopeInput);
  const base = scope.scope === 'source' ? `CLEAR SOURCE ${scopeSuffix(scope)}` : 'RESET WHOP IMPORTER';
  return deletePublished ? `${base} INCLUDING PUBLISHED` : base;
}

export function restoreConfirmationPhrase(backupId) {
  return `RESTORE ${String(backupId || '').slice(-6).toUpperCase()}`;
}

export function deleteBackupConfirmationPhrase(backupId) {
  return `DELETE BACKUP ${String(backupId || '').slice(-6).toUpperCase()}`;
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

async function addBackupColumns(db) {
  const definitions = [
    ['owner_session_id', "TEXT NOT NULL DEFAULT 'sniperplug-owner'"],
    ['scope', "TEXT NOT NULL DEFAULT 'all'"],
    ['experience_id', 'TEXT'],
    ['label', "TEXT NOT NULL DEFAULT 'Whop importer backup'"],
    ['schema_version', 'INTEGER NOT NULL DEFAULT 2'],
    ['status', "TEXT NOT NULL DEFAULT 'failed'"],
    ['manifest_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['checksum', "TEXT NOT NULL DEFAULT ''"],
    ['signature', "TEXT NOT NULL DEFAULT ''"],
    ['payload_bytes', 'INTEGER NOT NULL DEFAULT 0'],
    ['archive_key', "TEXT NOT NULL DEFAULT ''"],
    ['archive_checksum', "TEXT NOT NULL DEFAULT ''"],
    ['archive_bytes', 'INTEGER NOT NULL DEFAULT 0'],
    ['reset_token_hash', 'TEXT'],
    ['reset_token_expires_at', 'TEXT'],
    ['reset_options_json', 'TEXT'],
    ['reset_used_at', 'TEXT'],
    ['created_at', "TEXT NOT NULL DEFAULT ''"],
    ['verified_at', 'TEXT'],
    ['restored_at', 'TEXT'],
    ['restore_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['deleted_at', 'TEXT'],
  ];
  const present = await tableColumns(db, 'whop_import_backups');
  for (const [name, definition] of definitions) {
    if (present.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE whop_import_backups ADD COLUMN ${name} ${definition}`).run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error?.message || ''))) throw error;
    }
  }
}

async function repairSchema(db) {
  await addColumn(db, 'whop_posts', 'stale_at', 'TEXT');
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS whop_import_backups (
        backup_id TEXT PRIMARY KEY,
        owner_session_id TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('all', 'source')),
        experience_id TEXT,
        label TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('creating', 'verified', 'failed')),
        manifest_json TEXT NOT NULL DEFAULT '{}',
        checksum TEXT NOT NULL DEFAULT '',
        signature TEXT NOT NULL DEFAULT '',
        payload_bytes INTEGER NOT NULL DEFAULT 0,
        archive_key TEXT NOT NULL DEFAULT '',
        archive_checksum TEXT NOT NULL DEFAULT '',
        archive_bytes INTEGER NOT NULL DEFAULT 0,
        reset_token_hash TEXT,
        reset_token_expires_at TEXT,
        reset_options_json TEXT,
        reset_used_at TEXT,
        created_at TEXT NOT NULL,
        verified_at TEXT,
        restored_at TEXT,
        restore_count INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_posts_current ON whop_posts (experience_id, stale_at, source_updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_backups_created ON whop_import_backups (deleted_at, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_backups_scope ON whop_import_backups (scope, experience_id, deleted_at, created_at DESC)'),
  ]);
  await addBackupColumns(db);
}

export async function ensureWhopBackupSchema(env) {
  const db = requireDatabase(env);
  if (!schemaPromise) {
    schemaPromise = repairSchema(db).then(() => db).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function optionalRows(db, sql, bindings = [], missing = '') {
  try {
    const result = await db.prepare(sql).bind(...bindings).all();
    return result.results || [];
  } catch (error) {
    if (missing && missingTable(error, missing)) return [];
    throw error;
  }
}

async function optionalRowsByJsonValues(db, sql, values, missing = '') {
  const output = [];
  for (const group of backupJsonBatches(values)) {
    output.push(...await optionalRows(db, sql, [stableBackupJson(group)], missing));
  }
  return output;
}

export function backupJsonBatches(rows, maxBytes = JSON_BATCH_BYTES) {
  const values = Array.isArray(rows) ? rows : [];
  const output = [];
  let current = [];
  let currentBytes = 2;
  for (const value of values) {
    const encoded = stableBackupJson(value);
    const size = byteLength(encoded) + (current.length ? 1 : 0);
    if (size > maxBytes) throw new HttpError(413, 'One imported method is too large to restore safely in a Cloudflare D1 batch.');
    if (current.length && currentBytes + size > maxBytes) {
      output.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(value);
    currentBytes += size;
  }
  if (current.length) output.push(current);
  return output;
}

async function runJsonBatches(db, rows, sql) {
  const results = [];
  for (const group of backupJsonBatches(rows)) results.push(await db.prepare(sql).bind(stableBackupJson(group)).run());
  return results;
}

function normalizedAttachments(value) {
  return safeJson(value, {}) || {};
}

async function currentScopeRows(db, scope) {
  const sourceWhere = scope.scope === 'source' ? 'WHERE experience_id = ?' : '';
  const sourceBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const guideWhere = scope.scope === 'source'
    ? 'WHERE source_experience_id = ?'
    : 'WHERE source_experience_id IS NOT NULL';
  const guideBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const postWhere = scope.scope === 'source' ? 'WHERE experience_id = ?' : '';
  const postBindings = scope.scope === 'source' ? [scope.experienceId] : [];

  const [sources, posts, guides] = await Promise.all([
    optionalRows(db, `SELECT * FROM whop_sources ${sourceWhere} ORDER BY experience_id`, sourceBindings, 'whop_sources'),
    optionalRows(db, `SELECT * FROM whop_posts ${postWhere} ORDER BY source_key`, postBindings, 'whop_posts'),
    optionalRows(db, `SELECT * FROM guides ${guideWhere} ORDER BY id`, guideBindings, 'guides'),
  ]);

  const categorySlugs = [...new Set(guides.map((row) => String(row.category_slug || '')).filter(Boolean))];
  const categories = categorySlugs.length
    ? await optionalRowsByJsonValues(
      db,
      'SELECT * FROM guide_categories WHERE slug IN (SELECT value FROM json_each(?)) ORDER BY slug',
      categorySlugs,
      'guide_categories',
    )
    : [];

  const guideIds = guides.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  const courseVideos = guideIds.length
    ? await optionalRowsByJsonValues(
      db,
      'SELECT * FROM course_video_sources WHERE guide_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?)) ORDER BY video_key',
      guideIds,
      'course_video_sources',
    )
    : [];

  const mediaKeySet = new Set();
  for (const guide of guides) {
    for (const key of extractMediaStorageKeys(guide.body_markdown, normalizedAttachments(guide.attachment_json))) mediaKeySet.add(key);
  }
  const mediaKeys = [...mediaKeySet].sort();
  const mediaObjects = mediaKeys.length
    ? await optionalRowsByJsonValues(
      db,
      'SELECT * FROM media_objects WHERE storage_key IN (SELECT value FROM json_each(?)) ORDER BY storage_key',
      mediaKeys,
      'media_objects',
    )
    : [];

  const sourceIds = [...new Set([
    ...sources.map((row) => String(row.experience_id || '')),
    ...posts.map((row) => String(row.experience_id || '')),
    ...guides.map((row) => String(row.source_experience_id || '')),
  ].filter(Boolean))].sort();

  return { sources, posts, categories, guides, courseVideos, mediaObjects, mediaKeys, sourceIds };
}

async function snapshotScope(env, input) {
  const scope = normalizedScope(input);
  const db = await ensureWhopBackupSchema(env);
  const rows = await currentScopeRows(db, scope);
  const totalRows = rows.sources.length + rows.posts.length + rows.categories.length + rows.guides.length + rows.courseVideos.length + rows.mediaObjects.length;
  if (totalRows > MAX_BACKUP_ROWS) throw new HttpError(413, 'This importer contains too many records for one backup. Back up one source at a time.');
  const entities = {
    sources: rows.sources,
    posts: rows.posts,
    categories: rows.categories,
    guides: rows.guides,
    courseVideos: rows.courseVideos,
    mediaObjects: rows.mediaObjects,
  };
  const entityChecksum = await sha256(stableBackupJson(entities));
  const contentChecksum = await sha256(stableBackupJson({
    sources: rows.sources,
    posts: rows.posts,
    guides: rows.guides,
    courseVideos: rows.courseVideos,
  }));
  const counts = {
    sources: rows.sources.length,
    posts: rows.posts.length,
    currentPosts: rows.posts.filter((row) => !row.stale_at).length,
    stalePosts: rows.posts.filter((row) => Boolean(row.stale_at)).length,
    categories: rows.categories.length,
    guides: rows.guides.length,
    drafts: rows.guides.filter((row) => row.status === 'draft').length,
    published: rows.guides.filter((row) => row.status === 'published').length,
    rejected: rows.guides.filter((row) => row.status === 'rejected').length,
    courseVideos: rows.courseVideos.length,
    mediaReferences: rows.mediaKeys.length,
    mediaObjects: rows.mediaObjects.length,
  };
  return { scope, rows, entities, entityChecksum, contentChecksum, counts };
}

function backupLabel(scope, rows) {
  if (scope.scope === 'all') return 'Entire Whop importer';
  return String(rows.sources[0]?.label || rows.sources[0]?.experience_name || scope.experienceId).slice(0, 160);
}

function backupSignatureValue(row) {
  return [
    row.backup_id,
    row.owner_session_id || '',
    row.checksum,
    row.archive_key || '',
    row.created_at,
    row.scope,
    row.experience_id || '',
    row.schema_version,
  ].join('.');
}

function manifestFor(backupId, ownerSessionId, snapshot, createdAt, archiveKey) {
  return {
    format: 'sniperplug-whop-import-backup',
    schemaVersion: WHOP_BACKUP_SCHEMA_VERSION,
    backupId,
    ownerSessionId,
    scope: snapshot.scope.scope,
    experienceId: snapshot.scope.experienceId,
    sourceIds: snapshot.rows.sourceIds,
    createdAt,
    counts: snapshot.counts,
    entityChecksum: snapshot.entityChecksum,
    contentChecksum: snapshot.contentChecksum,
    mediaKeys: snapshot.rows.mediaKeys,
    archiveKey,
  };
}

function backupSummary(row) {
  const manifest = safeJson(row.manifest_json, {}) || {};
  return {
    backupId: row.backup_id,
    scope: row.scope,
    experienceId: row.experience_id || null,
    label: row.label,
    schemaVersion: Number(row.schema_version || 0),
    status: row.status,
    counts: manifest.counts || {},
    payloadBytes: Number(row.archive_bytes || row.payload_bytes || 0),
    createdAt: row.created_at,
    verifiedAt: row.verified_at || null,
    restoredAt: row.restored_at || null,
    restoreCount: Number(row.restore_count || 0),
    resetUsedAt: row.reset_used_at || null,
    downloadUrl: `/api/whop-backups?action=download&id=${encodeURIComponent(row.backup_id)}`,
    restorePhrase: restoreConfirmationPhrase(row.backup_id),
    deletePhrase: deleteBackupConfirmationPhrase(row.backup_id),
  };
}

async function backupRow(db, backupId) {
  const id = String(backupId || '').trim();
  if (!/^wib_[A-Za-z0-9_-]{12,}$/.test(id)) throw new HttpError(422, 'Choose a valid Whop backup.');
  const row = await db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ? AND deleted_at IS NULL').bind(id).first();
  if (!row) throw new HttpError(404, 'Whop backup not found.');
  return row;
}

function assertArchiveShape(archive, row) {
  if (!archive || typeof archive !== 'object' || !archive.manifest || !archive.entities) {
    throw new HttpError(409, 'The Whop backup archive is not readable.');
  }
  if (archive.signature !== row.signature) throw new HttpError(409, 'The Whop backup archive signature does not match D1.');
  if (archive.manifest.backupId !== row.backup_id || archive.manifest.archiveKey !== row.archive_key) {
    throw new HttpError(409, 'The Whop backup archive identity does not match D1.');
  }
  if (Number(archive.manifest.schemaVersion) !== WHOP_BACKUP_SCHEMA_VERSION) {
    throw new HttpError(409, 'The Whop backup archive uses an unsupported schema version.');
  }
}

function archiveCounts(entities) {
  const guides = Array.isArray(entities.guides) ? entities.guides : [];
  const posts = Array.isArray(entities.posts) ? entities.posts : [];
  return {
    sources: Array.isArray(entities.sources) ? entities.sources.length : 0,
    posts: posts.length,
    currentPosts: posts.filter((row) => !row.stale_at).length,
    stalePosts: posts.filter((row) => Boolean(row.stale_at)).length,
    categories: Array.isArray(entities.categories) ? entities.categories.length : 0,
    guides: guides.length,
    drafts: guides.filter((row) => row.status === 'draft').length,
    published: guides.filter((row) => row.status === 'published').length,
    rejected: guides.filter((row) => row.status === 'rejected').length,
    courseVideos: Array.isArray(entities.courseVideos) ? entities.courseVideos.length : 0,
    mediaObjects: Array.isArray(entities.mediaObjects) ? entities.mediaObjects.length : 0,
  };
}

async function verifyBackup(env, backupId, { allowCreating = false } = {}) {
  if (!env?.SNIPERPLUG_MEDIA) throw new HttpError(503, 'Whop backup storage is unavailable because SNIPERPLUG_MEDIA is not connected.');
  const db = await ensureWhopBackupSchema(env);
  const row = await backupRow(db, backupId);
  if (row.status !== 'verified' && !(allowCreating && row.status === 'creating')) {
    throw new HttpError(409, 'This Whop backup is not verified and cannot be used.');
  }
  const signatureValid = await verifyValue(backupSignatureValue(row), row.signature, env?.SNIPERPLUG_SESSION_SECRET);
  if (!signatureValid) throw new HttpError(409, 'This Whop backup signature is invalid. Do not reset or restore from it.');
  const object = await env.SNIPERPLUG_MEDIA.get(row.archive_key);
  if (!object?.body) throw new HttpError(409, 'The verified Whop backup archive is missing from R2.');
  if (Number(object.size || 0) > MAX_BACKUP_BYTES) throw new HttpError(409, 'The Whop backup archive exceeds the supported recovery size.');
  const archiveJson = await object.text();
  if (byteLength(archiveJson) > MAX_BACKUP_BYTES) throw new HttpError(409, 'The Whop backup archive exceeds the supported recovery size.');
  const archiveChecksum = await sha256(archiveJson);
  if (archiveChecksum !== row.archive_checksum) throw new HttpError(409, 'The Whop backup archive checksum does not match D1.');
  const archive = safeJson(archiveJson, null);
  assertArchiveShape(archive, row);
  const manifest = safeJson(row.manifest_json, null);
  if (!manifest || stableBackupJson(manifest) !== stableBackupJson(archive.manifest)) {
    throw new HttpError(409, 'The Whop backup manifest does not match its R2 archive.');
  }
  const entityChecksum = await sha256(stableBackupJson(archive.entities));
  if (entityChecksum !== row.checksum || entityChecksum !== manifest.entityChecksum) {
    throw new HttpError(409, 'The Whop backup content checksum is invalid.');
  }
  const contentChecksum = await sha256(stableBackupJson({
    sources: archive.entities.sources || [],
    posts: archive.entities.posts || [],
    guides: archive.entities.guides || [],
    courseVideos: archive.entities.courseVideos || [],
  }));
  if (contentChecksum !== manifest.contentChecksum) throw new HttpError(409, 'The Whop backup reset checksum is invalid.');
  const actual = archiveCounts(archive.entities);
  for (const [key, value] of Object.entries(actual)) {
    if (Number(manifest.counts?.[key] || 0) !== Number(value || 0)) {
      throw new HttpError(409, `The Whop backup ${key} count does not match its manifest.`);
    }
  }
  if (Number(manifest.counts?.mediaReferences || 0) !== (manifest.mediaKeys || []).length) {
    throw new HttpError(409, 'The Whop backup media-reference count does not match its manifest.');
  }
  return { db, row, manifest, entities: archive.entities, archiveJson };
}

async function issueResetToken(env, row, options) {
  const db = await ensureWhopBackupSchema(env);
  const token = `wrt_${randomToken(24)}`;
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  const normalized = {
    deletePublished: options?.deletePublished === true,
    resync: options?.resync === true,
    disconnectWhop: options?.disconnectWhop === true,
  };
  const result = await db.prepare(`
    UPDATE whop_import_backups
    SET reset_token_hash = ?, reset_token_expires_at = ?, reset_options_json = ?, reset_used_at = NULL
    WHERE backup_id = ? AND status = 'verified' AND deleted_at IS NULL
  `).bind(tokenHash, expiresAt, stableBackupJson(normalized), row.backup_id).run();
  if (changes(result) !== 1) throw new HttpError(409, 'SniperPlug could not authorize this verified backup for reset.');
  return {
    token,
    expiresAt,
    options: normalized,
    confirmationPhrase: resetConfirmationPhrase({ scope: row.scope, experienceId: row.experience_id }, normalized.deletePublished),
  };
}

export async function previewWhopReset(env, input = {}) {
  const snapshot = await snapshotScope(env, input);
  const estimatedBytes = byteLength(stableBackupJson(snapshot.entities));
  if (estimatedBytes > MAX_BACKUP_BYTES) throw new HttpError(413, 'This source is larger than the 10 MB safe backup limit. Back up a smaller source before resetting.');
  return {
    scope: snapshot.scope.scope,
    experienceId: snapshot.scope.experienceId,
    label: backupLabel(snapshot.scope, snapshot.rows),
    counts: snapshot.counts,
    payloadBytes: estimatedBytes,
    deletePublished: input.deletePublished === true,
    confirmationPhrase: resetConfirmationPhrase(snapshot.scope, input.deletePublished === true),
    warnings: [
      'A signed R2 recovery archive will be created and read back before deletion starts.',
      input.deletePublished === true ? 'Published guides are included in this reset.' : 'Published guides remain in the private library.',
      'Referenced media and the recovery archive remain pinned until this backup is deleted.',
    ],
  };
}

export async function createWhopImportBackup(env, ownerSessionId, input = {}) {
  if (!env?.SNIPERPLUG_MEDIA) throw new HttpError(503, 'Connect the SNIPERPLUG_MEDIA R2 bucket before creating a restorable Whop backup.');
  const snapshot = await snapshotScope(env, input);
  const db = await ensureWhopBackupSchema(env);
  const createdAt = nowIso();
  const backupId = `wib_${randomToken(18)}`;
  const ownerId = String(ownerSessionId || 'sniperplug-owner');
  const digest = await sha256(`backup:${backupId}:${snapshot.entityChecksum}`);
  const archiveKey = `whop-${digest.slice(0, 32)}-whop-import-backup.json`;
  const manifest = manifestFor(backupId, ownerId, snapshot, createdAt, archiveKey);
  const unsigned = {
    backup_id: backupId,
    owner_session_id: ownerId,
    checksum: snapshot.entityChecksum,
    archive_key: archiveKey,
    created_at: createdAt,
    scope: snapshot.scope.scope,
    experience_id: snapshot.scope.experienceId,
    schema_version: WHOP_BACKUP_SCHEMA_VERSION,
  };
  const signature = await signValue(backupSignatureValue(unsigned), env?.SNIPERPLUG_SESSION_SECRET);
  const archiveJson = stableBackupJson({ manifest, signature, entities: snapshot.entities });
  const archiveBytes = byteLength(archiveJson);
  if (archiveBytes > MAX_BACKUP_BYTES) throw new HttpError(413, 'This source is larger than the 10 MB safe backup limit. Back up a smaller source before resetting.');
  const archiveChecksum = await sha256(archiveJson);
  const prepared = await prepareMediaCopy(env, archiveKey, {
    declaredSize: archiveBytes,
    contentType: 'application/json',
    sourceKey: `whop-backup:${backupId}`,
  });
  if (prepared.status !== 'reserved') {
    throw new HttpError(409, prepared.reason || `SniperPlug could not reserve R2 storage for this backup (${prepared.status}).`, {
      code: 'backup_storage_reservation_failed',
      status: prepared.status,
    });
  }
  const reservation = prepared.reservation;
  let stored = false;
  try {
    const storedObject = await env.SNIPERPLUG_MEDIA.put(archiveKey, new Blob([archiveJson], { type: 'application/json' }), {
      storageClass: 'Standard',
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'private, no-store, max-age=0',
        contentDisposition: `attachment; filename="sniperplug-whop-backup-${backupId}.json"`,
      },
      customMetadata: {
        source: 'sniperplug-whop-import-backup',
        backupId,
        scope: snapshot.scope.scope,
        experienceId: snapshot.scope.experienceId || '',
        checksum: archiveChecksum,
      },
    });
    if (!storedObject) throw new HttpError(409, 'R2 did not confirm the Whop backup archive write.');
    stored = true;
    await db.prepare(`
      INSERT INTO whop_import_backups (
        backup_id, owner_session_id, scope, experience_id, label, schema_version, status,
        manifest_json, checksum, signature, payload_bytes, archive_key, archive_checksum,
        archive_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      backupId,
      ownerId,
      snapshot.scope.scope,
      snapshot.scope.experienceId,
      backupLabel(snapshot.scope, snapshot.rows),
      WHOP_BACKUP_SCHEMA_VERSION,
      stableBackupJson(manifest),
      snapshot.entityChecksum,
      signature,
      archiveBytes,
      archiveKey,
      archiveChecksum,
      Number(storedObject.size || archiveBytes),
      createdAt,
    ).run();
    await verifyBackup(env, backupId, { allowCreating: true });
    const stableScope = await snapshotScope(env, snapshot.scope);
    if (stableScope.contentChecksum !== snapshot.contentChecksum) {
      throw new HttpError(409, 'The importer changed while SniperPlug was creating this backup. The incomplete archive was not verified; create it again.', {
        code: 'backup_scope_changed_during_create',
        backupId,
      });
    }
    await completeMediaCopy(env, reservation, {
      sizeBytes: Number(storedObject.size || archiveBytes),
      contentType: 'application/json',
      sourceKey: `whop-backup:${backupId}`,
    });
    const verifiedAt = nowIso();
    const verifiedUpdate = await db.prepare(`
      UPDATE whop_import_backups SET status = 'verified', verified_at = ?
      WHERE backup_id = ? AND status = 'creating'
    `).bind(verifiedAt, backupId).run();
    if (changes(verifiedUpdate) !== 1) throw new HttpError(409, 'The Whop backup changed before verification could be finalized.');
    const fresh = await db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first();
    const authorization = input.authorizeReset === true ? await issueResetToken(env, fresh, input) : null;
    return { backup: backupSummary(fresh), authorization };
  } catch (error) {
    await db.prepare("UPDATE whop_import_backups SET status = 'failed' WHERE backup_id = ? AND status = 'creating'").bind(backupId).run().catch(() => null);
    if (stored) await env.SNIPERPLUG_MEDIA.delete(archiveKey).catch(() => null);
    await cancelMediaCopy(env, reservation).catch(() => null);
    throw error;
  }
}

export async function listWhopImportBackups(env, { limit = 30 } = {}) {
  const db = await ensureWhopBackupSchema(env);
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 30)));
  const rows = await db.prepare(`
    SELECT * FROM whop_import_backups
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC LIMIT ?
  `).bind(safeLimit).all();
  return (rows.results || []).map(backupSummary);
}

export async function verifiedWhopResetContext(env, backupId) {
  const verified = await verifyBackup(env, backupId);
  const options = safeJson(verified.row.reset_options_json, {}) || {};
  return {
    backupId: verified.row.backup_id,
    scope: verified.row.scope,
    experienceId: verified.row.experience_id || null,
    options: {
      deletePublished: options.deletePublished === true,
      resync: options.resync === true,
      disconnectWhop: options.disconnectWhop === true,
    },
    confirmationPhrase: resetConfirmationPhrase({
      scope: verified.row.scope,
      experienceId: verified.row.experience_id,
    }, options.deletePublished === true),
  };
}

export async function authorizeWhopReset(env, backupId, options = {}) {
  const verified = await verifyBackup(env, backupId);
  const current = await snapshotScope(env, { scope: verified.row.scope, experienceId: verified.row.experience_id });
  if (current.contentChecksum !== verified.manifest.contentChecksum) {
    throw new HttpError(409, 'The importer changed after this backup was created. Create a new backup before resetting so no newer work is lost.', {
      code: 'backup_scope_changed',
      backupId: verified.row.backup_id,
    });
  }
  return issueResetToken(env, verified.row, options);
}

export async function exportWhopImportBackup(env, backupId) {
  const verified = await verifyBackup(env, backupId);
  return { backup: backupSummary(verified.row), archiveJson: verified.archiveJson };
}

function guideEquivalent(current, snapshot) {
  if (!current || !snapshot) return false;
  return GUIDE_COLUMNS.every((column) => (current[column] ?? null) === (snapshot[column] ?? null));
}

async function restoreSourcesAndPosts(db, entities) {
  await runJsonBatches(db, entities.sources || [], `
    INSERT OR IGNORE INTO whop_sources (
      experience_id, label, company_id, company_title, experience_name,
      decision, default_group, created_at, updated_at
    )
    SELECT
      json_extract(value, '$.experience_id'), json_extract(value, '$.label'),
      json_extract(value, '$.company_id'), json_extract(value, '$.company_title'),
      json_extract(value, '$.experience_name'), json_extract(value, '$.decision'),
      json_extract(value, '$.default_group'), json_extract(value, '$.created_at'),
      json_extract(value, '$.updated_at')
    FROM json_each(?)
  `);
  await runJsonBatches(db, entities.categories || [], `
    INSERT OR IGNORE INTO guide_categories (
      slug, label, description, sort_order, active, created_at, updated_at
    )
    SELECT
      json_extract(value, '$.slug'), json_extract(value, '$.label'),
      json_extract(value, '$.description'), json_extract(value, '$.sort_order'),
      json_extract(value, '$.active'), json_extract(value, '$.created_at'),
      json_extract(value, '$.updated_at')
    FROM json_each(?)
  `);
  await runJsonBatches(db, entities.posts || [], `
    INSERT OR IGNORE INTO whop_posts (
      source_key, experience_id, post_id, title, excerpt, body_markdown, author_json, attachment_json,
      source_created_at, source_updated_at, source_fingerprint, integrity_json,
      decision, decision_updated_at, last_scanned_at, stale_at
    )
    SELECT
      json_extract(value, '$.source_key'), json_extract(value, '$.experience_id'),
      json_extract(value, '$.post_id'), json_extract(value, '$.title'),
      json_extract(value, '$.excerpt'), json_extract(value, '$.body_markdown'),
      json_extract(value, '$.author_json'), json_extract(value, '$.attachment_json'),
      json_extract(value, '$.source_created_at'), json_extract(value, '$.source_updated_at'),
      json_extract(value, '$.source_fingerprint'), json_extract(value, '$.integrity_json'),
      json_extract(value, '$.decision'), json_extract(value, '$.decision_updated_at'),
      json_extract(value, '$.last_scanned_at'), json_extract(value, '$.stale_at')
    FROM json_each(?)
  `);
}

async function restoreMediaLedger(db, entities) {
  try {
    await runJsonBatches(db, entities.mediaObjects || [], `
      INSERT OR IGNORE INTO media_objects (
        storage_key, size_bytes, reserved_bytes, status, reservation_id, managed,
        content_type, source_key, created_at, updated_at, last_referenced_at, unreferenced_at
      )
      SELECT
        json_extract(value, '$.storage_key'), json_extract(value, '$.size_bytes'),
        json_extract(value, '$.reserved_bytes'), json_extract(value, '$.status'),
        json_extract(value, '$.reservation_id'), json_extract(value, '$.managed'),
        json_extract(value, '$.content_type'), json_extract(value, '$.source_key'),
        json_extract(value, '$.created_at'), json_extract(value, '$.updated_at'),
        json_extract(value, '$.last_referenced_at'), NULL
      FROM json_each(?)
    `);
  } catch (error) {
    if (!missingTable(error, 'media_objects')) throw error;
  }
}

function guideLookupKey(row) {
  if (row?.source_key) return `source:${row.source_key}`;
  if (row?.source_experience_id && row?.source_post_id) return `post:${row.source_experience_id}:${row.source_post_id}`;
  return `slug:${row?.slug || ''}`;
}

async function currentGuidesForBatch(db, batch) {
  const payload = stableBackupJson(batch);
  const rows = await db.prepare(`
    SELECT * FROM guides
    WHERE source_key IN (
      SELECT json_extract(value, '$.source_key') FROM json_each(?)
      WHERE json_extract(value, '$.source_key') IS NOT NULL
    )
    OR slug IN (
      SELECT json_extract(value, '$.slug') FROM json_each(?)
      WHERE json_extract(value, '$.source_key') IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM json_each(?) AS input
      WHERE guides.source_key IS NULL
        AND guides.source_experience_id = json_extract(input.value, '$.source_experience_id')
        AND guides.source_post_id = json_extract(input.value, '$.source_post_id')
    )
  `).bind(payload, payload, payload).all();
  return rows.results || [];
}

async function restoreGuides(db, guideRows) {
  const restored = [];
  const unchanged = [];
  const conflicts = [];
  const guideIdMap = new Map();
  for (const batch of backupJsonBatches(guideRows)) {
    const beforeRows = await currentGuidesForBatch(db, batch);
    const beforeByKey = new Map();
    for (const row of beforeRows) {
      beforeByKey.set(guideLookupKey(row), row);
      if (row.source_experience_id && row.source_post_id) beforeByKey.set(`post:${row.source_experience_id}:${row.source_post_id}`, row);
    }
    await db.prepare(`
      INSERT OR IGNORE INTO guides (${GUIDE_COLUMNS.join(', ')})
      SELECT
        json_extract(value, '$.slug'), json_extract(value, '$.title'),
        json_extract(value, '$.description'), json_extract(value, '$.category_slug'),
        json_extract(value, '$.body_markdown'), json_extract(value, '$.status'),
        json_extract(value, '$.featured'), json_extract(value, '$.sort_order'),
        json_extract(value, '$.source_key'), json_extract(value, '$.source_group'),
        json_extract(value, '$.source_experience_id'), json_extract(value, '$.source_post_id'),
        json_extract(value, '$.source_fingerprint'), json_extract(value, '$.attachment_json'),
        json_extract(value, '$.integrity_json'), json_extract(value, '$.author_json'),
        json_extract(value, '$.source_created_at'), json_extract(value, '$.source_updated_at'),
        json_extract(value, '$.imported_at'), json_extract(value, '$.updated_at'),
        json_extract(value, '$.published_at')
      FROM json_each(?)
    `).bind(stableBackupJson(batch)).run();
    const currentRows = await currentGuidesForBatch(db, batch);
    const currentByKey = new Map();
    for (const row of currentRows) {
      currentByKey.set(guideLookupKey(row), row);
      if (row.source_experience_id && row.source_post_id) currentByKey.set(`post:${row.source_experience_id}:${row.source_post_id}`, row);
    }
    for (const snapshot of batch) {
      const key = guideLookupKey(snapshot);
      const postKey = snapshot.source_experience_id && snapshot.source_post_id
        ? `post:${snapshot.source_experience_id}:${snapshot.source_post_id}`
        : '';
      const before = beforeByKey.get(key) || (postKey ? beforeByKey.get(postKey) : null) || null;
      const current = currentByKey.get(key) || (postKey ? currentByKey.get(postKey) : null) || null;
      if (before) {
        if (guideEquivalent(before, snapshot)) {
          unchanged.push(Number(before.id));
          guideIdMap.set(Number(snapshot.id), Number(before.id));
        } else {
          conflicts.push({ backupGuideId: Number(snapshot.id), currentGuideId: Number(before.id), title: before.title, currentUpdatedAt: before.updated_at, backupUpdatedAt: snapshot.updated_at });
        }
        continue;
      }
      if (current && guideEquivalent(current, snapshot)) {
        restored.push(Number(current.id));
        guideIdMap.set(Number(snapshot.id), Number(current.id));
      } else {
        conflicts.push({ backupGuideId: Number(snapshot.id), currentGuideId: current ? Number(current.id) : null, title: current?.title || snapshot.title, reason: current ? 'current-guide-differs' : 'slug-or-constraint-conflict' });
      }
    }
  }
  return { restored, unchanged, conflicts, guideIdMap };
}

async function restoreCourseVideos(db, videos, guideIdMap) {
  const mapped = (videos || []).map((video) => ({ ...video, guide_id: guideIdMap.get(Number(video.guide_id)) || null })).filter((video) => video.guide_id);
  try {
    await runJsonBatches(db, mapped, `
      INSERT OR IGNORE INTO course_video_sources (
        video_key, guide_id, lesson_id, source_key, title, audio_only,
        duration_seconds, created_at, updated_at
      )
      SELECT
        json_extract(value, '$.video_key'), json_extract(value, '$.guide_id'),
        json_extract(value, '$.lesson_id'), json_extract(value, '$.source_key'),
        json_extract(value, '$.title'), json_extract(value, '$.audio_only'),
        json_extract(value, '$.duration_seconds'), json_extract(value, '$.created_at'),
        json_extract(value, '$.updated_at')
      FROM json_each(?)
    `);
  } catch (error) {
    if (!missingTable(error, 'course_video_sources')) throw error;
  }
}

export async function reattachPreservedWhopGuides(env, experienceId) {
  const id = exactExperienceId(experienceId);
  if (!id) return { reattached: 0, conflicts: [] };
  const db = await ensureWhopBackupSchema(env);
  const result = await db.prepare(`
    UPDATE guides
    SET source_key = (
      SELECT posts.source_key
      FROM whop_posts AS posts
      WHERE posts.experience_id = guides.source_experience_id
        AND posts.post_id = guides.source_post_id
        AND posts.stale_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM guides AS owner
          WHERE owner.source_key = posts.source_key AND owner.id != guides.id
        )
      ORDER BY posts.source_key LIMIT 1
    )
    WHERE source_experience_id = ?
      AND status = 'published'
      AND source_key IS NULL
      AND EXISTS (
        SELECT 1 FROM whop_posts AS posts
        WHERE posts.experience_id = guides.source_experience_id
          AND posts.post_id = guides.source_post_id
          AND posts.stale_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM guides AS owner
            WHERE owner.source_key = posts.source_key AND owner.id != guides.id
          )
      )
  `).bind(id).run();
  return { reattached: changes(result), conflicts: [] };
}

export async function restoreWhopImportBackup(env, backupId, input = {}) {
  const verified = await verifyBackup(env, backupId);
  if (String(input.confirmation || '').trim() !== restoreConfirmationPhrase(backupId)) {
    throw new HttpError(422, `Type “${restoreConfirmationPhrase(backupId)}” exactly to restore this backup.`);
  }
  const selectedIds = new Set((Array.isArray(input.guideIds) ? input.guideIds : []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
  const guideRows = (verified.entities.guides || []).filter((row) => !selectedIds.size || selectedIds.has(Number(row.id)));
  await restoreSourcesAndPosts(verified.db, verified.entities);
  await restoreMediaLedger(verified.db, verified.entities);
  for (const sourceId of verified.manifest.sourceIds || []) await reattachPreservedWhopGuides(env, sourceId);
  const guideResult = await restoreGuides(verified.db, guideRows);
  await restoreCourseVideos(verified.db, verified.entities.courseVideos || [], guideResult.guideIdMap);
  await verified.db.prepare(`
    UPDATE whop_import_backups
    SET restored_at = ?, restore_count = restore_count + 1
    WHERE backup_id = ? AND status = 'verified'
  `).bind(nowIso(), backupId).run();
  return {
    backup: backupSummary(await verified.db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first()),
    restored: guideResult.restored,
    unchanged: guideResult.unchanged,
    conflicts: guideResult.conflicts,
    complete: guideResult.conflicts.length === 0,
  };
}

async function resetCounts(db, scope, deletePublished) {
  const guideCondition = scope.scope === 'source' ? 'source_experience_id = ?' : 'source_experience_id IS NOT NULL';
  const bindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const sourceCondition = scope.scope === 'source' ? 'experience_id = ?' : '1 = 1';
  const sourceBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const [guides, posts, sources] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM guides WHERE ${guideCondition} ${deletePublished ? '' : "AND status != 'published'"}`).bind(...bindings).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM whop_posts WHERE ${sourceCondition}`).bind(...sourceBindings).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM whop_sources WHERE ${sourceCondition}`).bind(...sourceBindings).first(),
  ]);
  return { guides: Number(guides?.count || 0), posts: Number(posts?.count || 0), sources: Number(sources?.count || 0) };
}

export async function resetWhopImporter(env, backupId, input = {}) {
  const verified = await verifyBackup(env, backupId);
  const scope = normalizedScope({ scope: verified.row.scope, experienceId: verified.row.experience_id });
  const options = safeJson(verified.row.reset_options_json, {}) || {};
  const expectedPhrase = resetConfirmationPhrase(scope, options.deletePublished === true);
  if (String(input.confirmation || '').trim() !== expectedPhrase) throw new HttpError(422, `Type “${expectedPhrase}” exactly to continue.`);
  const token = String(input.resetToken || '').trim();
  if (!token || await sha256(token) !== verified.row.reset_token_hash) throw new HttpError(403, 'This reset authorization is invalid. Create or re-authorize a verified backup.');
  if (verified.row.reset_used_at) throw new HttpError(409, 'This reset authorization was already used.');
  if (Date.parse(String(verified.row.reset_token_expires_at || '')) <= Date.now()) throw new HttpError(409, 'This reset authorization expired. Verify the backup again before resetting.');
  const current = await snapshotScope(env, scope);
  if (current.contentChecksum !== verified.manifest.contentChecksum) {
    throw new HttpError(409, 'The importer changed after this backup was verified. Nothing was deleted; create a new backup first.', {
      code: 'backup_scope_changed',
      backupId,
    });
  }
  const before = await resetCounts(verified.db, scope, options.deletePublished === true);
  const guideCondition = scope.scope === 'source' ? 'source_experience_id = ?' : 'source_experience_id IS NOT NULL';
  const guideBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const sourceCondition = scope.scope === 'source' ? 'experience_id = ?' : '1 = 1';
  const sourceBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const results = await verified.db.batch([
    verified.db.prepare(`
      UPDATE whop_import_backups SET reset_used_at = ?
      WHERE backup_id = ? AND reset_token_hash = ? AND reset_used_at IS NULL AND status = 'verified'
    `).bind(nowIso(), backupId, verified.row.reset_token_hash),
    verified.db.prepare(`DELETE FROM guides WHERE ${guideCondition} ${options.deletePublished === true ? '' : "AND status != 'published'"}`).bind(...guideBindings),
    verified.db.prepare(`DELETE FROM whop_posts WHERE ${sourceCondition}`).bind(...sourceBindings),
    verified.db.prepare(`DELETE FROM whop_sources WHERE ${sourceCondition}`).bind(...sourceBindings),
  ]);
  if (changes(results[0]) !== 1) throw new HttpError(409, 'The reset authorization changed before deletion began. Nothing was deleted.');
  return {
    backup: backupSummary(await verified.db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first()),
    scope: scope.scope,
    experienceId: scope.experienceId,
    options,
    deleted: { guides: changes(results[1]), posts: changes(results[2]), sources: changes(results[3]) },
    expected: before,
    publishedPreserved: options.deletePublished !== true,
  };
}

export async function deleteWhopImportBackup(env, backupId, confirmation) {
  const verified = await verifyBackup(env, backupId);
  const expected = deleteBackupConfirmationPhrase(backupId);
  if (String(confirmation || '').trim() !== expected) throw new HttpError(422, `Type “${expected}” exactly to delete this backup.`);
  const result = await verified.db.prepare(`
    UPDATE whop_import_backups
    SET deleted_at = ?, reset_token_hash = NULL, reset_token_expires_at = NULL
    WHERE backup_id = ? AND status = 'verified' AND deleted_at IS NULL
  `).bind(nowIso(), backupId).run();
  if (changes(result) !== 1) throw new HttpError(409, 'SniperPlug could not delete this backup safely.');
  return { deleted: true, backupId, archiveCleanup: 'grace-period' };
}
