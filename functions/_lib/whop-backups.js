import { randomToken, sha256, signValue, verifyValue } from './crypto.js';
import { extractMediaStorageKeys } from './media-storage.js';
import { HttpError, requireDatabase } from './http.js';

export const WHOP_BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_ROWS = 100_000;
const MAX_BACKUP_BYTES = 80_000_000;
const RESET_TOKEN_TTL_MS = 15 * 60_000;
const SQL_BATCH_SIZE = 60;
const ENTITY_ORDER = Object.freeze(['source', 'post', 'category', 'guide', 'course-video', 'media-object']);

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

function chunks(values, size = SQL_BATCH_SIZE) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function runBatches(db, statements) {
  const output = [];
  for (const group of chunks(statements)) output.push(...await db.batch(group));
  return output;
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
    db.prepare(`
      CREATE TABLE IF NOT EXISTS whop_import_backup_rows (
        backup_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_checksum TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (backup_id, entity_type, entity_key),
        FOREIGN KEY (backup_id) REFERENCES whop_import_backups(backup_id) ON DELETE CASCADE
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS whop_import_backup_media (
        backup_id TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        source_key TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (backup_id, storage_key),
        FOREIGN KEY (backup_id) REFERENCES whop_import_backups(backup_id) ON DELETE CASCADE
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_posts_current ON whop_posts (experience_id, stale_at, source_updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_backups_created ON whop_import_backups (deleted_at, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_backups_scope ON whop_import_backups (scope, experience_id, deleted_at, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_backup_rows_type ON whop_import_backup_rows (backup_id, entity_type, entity_key)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_import_backup_media_key ON whop_import_backup_media (storage_key, backup_id)'),
  ]);
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

function entityKey(type, row) {
  if (type === 'source') return String(row.experience_id || '');
  if (type === 'post') return String(row.source_key || '');
  if (type === 'category') return String(row.slug || '');
  if (type === 'guide') return String(row.id || row.source_key || row.slug || '');
  if (type === 'course-video') return String(row.video_key || '');
  if (type === 'media-object') return String(row.storage_key || '');
  return '';
}

async function backupRowsFor(type, rows) {
  const output = [];
  for (const row of rows) {
    const key = entityKey(type, row);
    if (!key) continue;
    const payloadJson = stableBackupJson(row);
    output.push({
      entityType: type,
      entityKey: key,
      payloadJson,
      payloadChecksum: await sha256(payloadJson),
    });
  }
  return output;
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
  let categories = [];
  if (categorySlugs.length) {
    const placeholders = categorySlugs.map(() => '?').join(',');
    categories = await optionalRows(db, `SELECT * FROM guide_categories WHERE slug IN (${placeholders}) ORDER BY slug`, categorySlugs, 'guide_categories');
  }

  const guideIds = guides.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
  let courseVideos = [];
  if (guideIds.length) {
    for (const group of chunks(guideIds, 400)) {
      const placeholders = group.map(() => '?').join(',');
      courseVideos.push(...await optionalRows(
        db,
        `SELECT * FROM course_video_sources WHERE guide_id IN (${placeholders}) ORDER BY video_key`,
        group,
        'course_video_sources',
      ));
    }
  }

  const mediaKeys = new Set();
  for (const guide of guides) {
    for (const key of extractMediaStorageKeys(guide.body_markdown, normalizedAttachments(guide.attachment_json))) mediaKeys.add(key);
  }
  let mediaObjects = [];
  const keys = [...mediaKeys].sort();
  for (const group of chunks(keys, 400)) {
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    mediaObjects.push(...await optionalRows(
      db,
      `SELECT * FROM media_objects WHERE storage_key IN (${placeholders}) ORDER BY storage_key`,
      group,
      'media_objects',
    ));
  }

  const sourceIds = [...new Set([
    ...sources.map((row) => String(row.experience_id || '')),
    ...posts.map((row) => String(row.experience_id || '')),
    ...guides.map((row) => String(row.source_experience_id || '')),
  ].filter(Boolean))].sort();

  return { sources, posts, categories, guides, courseVideos, mediaObjects, mediaKeys: keys, sourceIds };
}

async function snapshotFromRows(scope, rows) {
  const entityRows = [
    ...await backupRowsFor('source', rows.sources),
    ...await backupRowsFor('post', rows.posts),
    ...await backupRowsFor('category', rows.categories),
    ...await backupRowsFor('guide', rows.guides),
    ...await backupRowsFor('course-video', rows.courseVideos),
    ...await backupRowsFor('media-object', rows.mediaObjects),
  ].sort((left, right) => {
    const type = ENTITY_ORDER.indexOf(left.entityType) - ENTITY_ORDER.indexOf(right.entityType);
    return type || left.entityKey.localeCompare(right.entityKey);
  });

  if (entityRows.length > MAX_BACKUP_ROWS) throw new HttpError(413, 'This importer contains too many records for one backup. Back up one source at a time.');
  const payloadBytes = entityRows.reduce((sum, row) => sum + new TextEncoder().encode(row.payloadJson).byteLength, 0);
  if (payloadBytes > MAX_BACKUP_BYTES) throw new HttpError(413, 'This importer backup is larger than 80 MB. Back up one source at a time.');

  const contentRows = entityRows.filter((row) => ['source', 'post', 'guide', 'course-video'].includes(row.entityType));
  const checksumInput = entityRows.map((row) => [row.entityType, row.entityKey, row.payloadChecksum]);
  const contentChecksumInput = contentRows.map((row) => [row.entityType, row.entityKey, row.payloadChecksum]);
  const checksum = await sha256(stableBackupJson(checksumInput));
  const contentChecksum = await sha256(stableBackupJson(contentChecksumInput));
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
  return { scope, rows, entityRows, payloadBytes, checksum, contentChecksum, counts };
}

async function snapshotScope(env, input) {
  const scope = normalizedScope(input);
  const db = await ensureWhopBackupSchema(env);
  const rows = await currentScopeRows(db, scope);
  return snapshotFromRows(scope, rows);
}

function backupLabel(scope, rows) {
  if (scope.scope === 'all') return 'Entire Whop importer';
  return String(rows.sources[0]?.label || rows.sources[0]?.experience_name || scope.experienceId).slice(0, 160);
}

function backupSignatureValue(row) {
  return [row.backup_id, row.checksum, row.created_at, row.scope, row.experience_id || '', row.schema_version].join('.');
}

function manifestFor(backupId, ownerSessionId, snapshot, createdAt) {
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
    payloadBytes: snapshot.payloadBytes,
    checksum: snapshot.checksum,
    contentChecksum: snapshot.contentChecksum,
    mediaKeys: snapshot.rows.mediaKeys,
  };
}

async function persistSnapshot(db, row, snapshot, manifest) {
  await db.prepare(`
    INSERT INTO whop_import_backups (
      backup_id, owner_session_id, scope, experience_id, label, schema_version, status,
      manifest_json, checksum, signature, payload_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?)
  `).bind(
    row.backupId,
    row.ownerSessionId,
    snapshot.scope.scope,
    snapshot.scope.experienceId,
    row.label,
    WHOP_BACKUP_SCHEMA_VERSION,
    stableBackupJson(manifest),
    snapshot.checksum,
    row.signature,
    snapshot.payloadBytes,
    row.createdAt,
  ).run();

  const statements = snapshot.entityRows.map((entity) => db.prepare(`
    INSERT INTO whop_import_backup_rows (
      backup_id, entity_type, entity_key, payload_json, payload_checksum, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(row.backupId, entity.entityType, entity.entityKey, entity.payloadJson, entity.payloadChecksum, row.createdAt));
  await runBatches(db, statements);

  const mediaByKey = new Map(snapshot.rows.mediaObjects.map((item) => [String(item.storage_key || ''), item]));
  const mediaStatements = snapshot.rows.mediaKeys.map((key) => {
    const media = mediaByKey.get(key) || {};
    return db.prepare(`
      INSERT INTO whop_import_backup_media (
        backup_id, storage_key, size_bytes, content_type, source_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      row.backupId,
      key,
      Math.max(0, Number(media.size_bytes || 0)),
      String(media.content_type || 'application/octet-stream'),
      media.source_key || null,
      row.createdAt,
    );
  });
  if (mediaStatements.length) await runBatches(db, mediaStatements);
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
    payloadBytes: Number(row.payload_bytes || 0),
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

async function readBackupEntities(db, backupId) {
  const rows = await db.prepare(`
    SELECT entity_type, entity_key, payload_json, payload_checksum
    FROM whop_import_backup_rows WHERE backup_id = ?
    ORDER BY CASE entity_type
      WHEN 'source' THEN 1 WHEN 'post' THEN 2 WHEN 'category' THEN 3
      WHEN 'guide' THEN 4 WHEN 'course-video' THEN 5 WHEN 'media-object' THEN 6 ELSE 99 END,
      entity_key
  `).bind(backupId).all();
  return rows.results || [];
}

async function verifyBackup(env, backupId, { includePayload = true, allowCreating = false } = {}) {
  const db = await ensureWhopBackupSchema(env);
  const row = await backupRow(db, backupId);
  if (row.status !== 'verified' && !(allowCreating && row.status === 'creating')) throw new HttpError(409, 'This Whop backup is not verified and cannot be used.');
  const signatureValid = await verifyValue(backupSignatureValue(row), row.signature, env?.SNIPERPLUG_SESSION_SECRET);
  if (!signatureValid) throw new HttpError(409, 'This Whop backup signature is invalid. Do not reset or restore from it.');

  const entities = await readBackupEntities(db, row.backup_id);
  const computed = [];
  const grouped = Object.fromEntries(ENTITY_ORDER.map((type) => [type, []]));
  for (const entity of entities) {
    const checksum = await sha256(entity.payload_json);
    if (checksum !== entity.payload_checksum) throw new HttpError(409, `Whop backup record ${entity.entity_type}:${entity.entity_key} failed checksum verification.`);
    computed.push([entity.entity_type, entity.entity_key, checksum]);
    if (includePayload) {
      const payload = safeJson(entity.payload_json, null);
      if (!payload || typeof payload !== 'object') throw new HttpError(409, 'A Whop backup record could not be decoded safely.');
      if (!grouped[entity.entity_type]) grouped[entity.entity_type] = [];
      grouped[entity.entity_type].push(payload);
    }
  }
  const checksum = await sha256(stableBackupJson(computed));
  if (checksum !== row.checksum) throw new HttpError(409, 'The Whop backup manifest does not match its saved records.');
  const manifest = safeJson(row.manifest_json, null);
  if (!manifest || manifest.checksum !== checksum || Number(manifest.schemaVersion) !== WHOP_BACKUP_SCHEMA_VERSION) {
    throw new HttpError(409, 'The Whop backup manifest is incompatible or corrupted.');
  }
  const actualCounts = Object.fromEntries(ENTITY_ORDER.map((type) => [type, entities.filter((entity) => entity.entity_type === type).length]));
  const expectedCounts = {
    source: Number(manifest.counts?.sources || 0),
    post: Number(manifest.counts?.posts || 0),
    category: Number(manifest.counts?.categories || 0),
    guide: Number(manifest.counts?.guides || 0),
    'course-video': Number(manifest.counts?.courseVideos || 0),
    'media-object': Number(manifest.counts?.mediaObjects || 0),
  };
  for (const [type, expected] of Object.entries(expectedCounts)) {
    if (actualCounts[type] !== expected) throw new HttpError(409, `Whop backup ${type} count does not match its manifest.`);
  }
  return { db, row, manifest, entities: includePayload ? grouped : null };
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
  return {
    scope: snapshot.scope.scope,
    experienceId: snapshot.scope.experienceId,
    label: backupLabel(snapshot.scope, snapshot.rows),
    counts: snapshot.counts,
    payloadBytes: snapshot.payloadBytes,
    deletePublished: input.deletePublished === true,
    confirmationPhrase: resetConfirmationPhrase(snapshot.scope, input.deletePublished === true),
    warnings: [
      'A verified backup will be created and read back before deletion starts.',
      input.deletePublished === true
        ? 'Published guides are included in this reset.'
        : 'Published guides remain in the private library.',
      'R2 media is pinned by the backup and is not deleted during reset.',
    ],
  };
}

export async function createWhopImportBackup(env, ownerSessionId, input = {}) {
  const snapshot = await snapshotScope(env, input);
  const db = await ensureWhopBackupSchema(env);
  const createdAt = nowIso();
  const backupId = `wib_${randomToken(18)}`;
  const label = backupLabel(snapshot.scope, snapshot.rows);
  const manifest = manifestFor(backupId, String(ownerSessionId || 'sniperplug-owner'), snapshot, createdAt);
  const unsigned = {
    backup_id: backupId,
    checksum: snapshot.checksum,
    created_at: createdAt,
    scope: snapshot.scope.scope,
    experience_id: snapshot.scope.experienceId,
    schema_version: WHOP_BACKUP_SCHEMA_VERSION,
  };
  const signature = await signValue(backupSignatureValue(unsigned), env?.SNIPERPLUG_SESSION_SECRET);

  try {
    await persistSnapshot(db, { backupId, ownerSessionId: String(ownerSessionId || 'sniperplug-owner'), label, signature, createdAt }, snapshot, manifest);
    const creating = await db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first();
    if (!creating) throw new HttpError(500, 'SniperPlug could not read back the new Whop backup manifest.');
    await verifyBackup(env, backupId, { includePayload: false, allowCreating: true });
    const verifiedUpdate = await db.prepare(`UPDATE whop_import_backups SET status = 'verified', verified_at = ? WHERE backup_id = ? AND status = 'creating'`)
      .bind(nowIso(), backupId).run();
    if (changes(verifiedUpdate) !== 1) throw new HttpError(409, 'The Whop backup changed before verification could be finalized.');
    const verified = await verifyBackup(env, backupId, { includePayload: false });
    const authorization = input.authorizeReset === true
      ? await issueResetToken(env, verified.row, input)
      : null;
    const fresh = await db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first();
    return { backup: backupSummary(fresh), authorization };
  } catch (error) {
    await db.prepare(`UPDATE whop_import_backups SET status = 'failed' WHERE backup_id = ? AND status = 'creating'`).bind(backupId).run().catch(() => null);
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

export async function authorizeWhopReset(env, backupId, options = {}) {
  const verified = await verifyBackup(env, backupId, { includePayload: false });
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
  const verified = await verifyBackup(env, backupId, { includePayload: true });
  return {
    manifest: verified.manifest,
    signature: verified.row.signature,
    entities: verified.entities,
  };
}

function guideEquivalent(current, snapshot) {
  if (!current || !snapshot) return false;
  return GUIDE_COLUMNS.every((column) => (current[column] ?? null) === (snapshot[column] ?? null));
}

function safeRestoredSlug(value, backupId) {
  const base = String(value || 'restored-guide').trim().replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'restored-guide';
  return `${base}-${String(backupId).slice(-8).toLowerCase()}`;
}

async function restoreSourcesAndPosts(db, entities) {
  const sourceStatements = (entities.source || []).map((row) => db.prepare(`
    INSERT OR IGNORE INTO whop_sources (
      experience_id, label, company_id, company_title, experience_name,
      decision, default_group, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.experience_id, row.label, row.company_id ?? null, row.company_title ?? null,
    row.experience_name ?? null, row.decision, row.default_group ?? null, row.created_at, row.updated_at,
  ));
  if (sourceStatements.length) await runBatches(db, sourceStatements);

  const categoryStatements = (entities.category || []).map((row) => db.prepare(`
    INSERT OR IGNORE INTO guide_categories (
      slug, label, description, sort_order, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(row.slug, row.label, row.description, row.sort_order, row.active, row.created_at, row.updated_at));
  if (categoryStatements.length) await runBatches(db, categoryStatements);

  const postStatements = (entities.post || []).map((row) => db.prepare(`
    INSERT OR IGNORE INTO whop_posts (
      source_key, experience_id, post_id, title, excerpt, body_markdown, author_json, attachment_json,
      source_created_at, source_updated_at, source_fingerprint, integrity_json,
      decision, decision_updated_at, last_scanned_at, stale_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.source_key, row.experience_id, row.post_id, row.title, row.excerpt, row.body_markdown,
    row.author_json, row.attachment_json, row.source_created_at ?? null, row.source_updated_at ?? null,
    row.source_fingerprint ?? null, row.integrity_json, row.decision, row.decision_updated_at ?? null,
    row.last_scanned_at, row.stale_at ?? null,
  ));
  if (postStatements.length) await runBatches(db, postStatements);
}

async function restoreMediaLedger(db, entities) {
  const statements = (entities['media-object'] || []).map((row) => db.prepare(`
    INSERT OR IGNORE INTO media_objects (
      storage_key, size_bytes, reserved_bytes, status, reservation_id, managed,
      content_type, source_key, created_at, updated_at, last_referenced_at, unreferenced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    row.storage_key,
    Math.max(0, Number(row.size_bytes || 0)),
    Math.max(0, Number(row.reserved_bytes || 0)),
    row.status || 'ready',
    row.reservation_id ?? null,
    Number(row.managed ?? 1),
    row.content_type || 'application/octet-stream',
    row.source_key ?? null,
    row.created_at || nowIso(),
    nowIso(),
    nowIso(),
  ));
  if (!statements.length) return;
  try { await runBatches(db, statements); } catch (error) {
    if (!missingTable(error, 'media_objects')) throw error;
  }
}

export async function restoreWhopImportBackup(env, backupId, input = {}) {
  const verified = await verifyBackup(env, backupId, { includePayload: true });
  if (String(input.confirmation || '').trim() !== restoreConfirmationPhrase(backupId)) {
    throw new HttpError(422, `Type “${restoreConfirmationPhrase(backupId)}” exactly to restore this backup.`);
  }
  const db = verified.db;
  const selectedIds = new Set((Array.isArray(input.guideIds) ? input.guideIds : []).map(Number).filter((id) => Number.isFinite(id) && id > 0));
  const guideRows = (verified.entities.guide || []).filter((row) => !selectedIds.size || selectedIds.has(Number(row.id)));
  await restoreSourcesAndPosts(db, verified.entities);
  await restoreMediaLedger(db, verified.entities);

  const restored = [];
  const unchanged = [];
  const conflicts = [];
  const guideIdMap = new Map();
  for (const snapshot of guideRows) {
    let current = snapshot.source_key
      ? await db.prepare(`
          SELECT * FROM guides
          WHERE source_key = ?
             OR (source_key IS NULL AND source_experience_id = ? AND source_post_id = ?)
          ORDER BY CASE WHEN source_key = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).bind(snapshot.source_key, snapshot.source_experience_id, snapshot.source_post_id, snapshot.source_key).first()
      : await db.prepare('SELECT * FROM guides WHERE id = ?').bind(snapshot.id).first();
    if (current && guideEquivalent(current, snapshot)) {
      unchanged.push(Number(current.id));
      guideIdMap.set(Number(snapshot.id), Number(current.id));
      continue;
    }
    if (current && !current.source_key && snapshot.source_key && GUIDE_COLUMNS
      .filter((column) => column !== 'source_key')
      .every((column) => (current[column] ?? null) === (snapshot[column] ?? null))) {
      const reattached = await db.prepare('UPDATE guides SET source_key = ? WHERE id = ? AND source_key IS NULL')
        .bind(snapshot.source_key, current.id).run();
      if (changes(reattached) === 1) {
        restored.push(Number(current.id));
        guideIdMap.set(Number(snapshot.id), Number(current.id));
        continue;
      }
    }
    if (current) {
      conflicts.push({
        backupGuideId: Number(snapshot.id),
        currentGuideId: Number(current.id),
        title: current.title,
        currentUpdatedAt: current.updated_at,
        backupUpdatedAt: snapshot.updated_at,
      });
      continue;
    }

    let slug = snapshot.slug;
    const slugOwner = await db.prepare('SELECT id FROM guides WHERE slug = ?').bind(slug).first();
    if (slugOwner) slug = safeRestoredSlug(slug, backupId);
    const placeholders = GUIDE_COLUMNS.map(() => '?').join(',');
    const values = GUIDE_COLUMNS.map((column) => column === 'slug' ? slug : snapshot[column] ?? null);
    await db.prepare(`INSERT INTO guides (${GUIDE_COLUMNS.join(', ')}) VALUES (${placeholders})`).bind(...values).run();
    current = snapshot.source_key
      ? await db.prepare('SELECT * FROM guides WHERE source_key = ?').bind(snapshot.source_key).first()
      : await db.prepare('SELECT * FROM guides WHERE slug = ?').bind(slug).first();
    if (!current) throw new HttpError(409, `SniperPlug could not verify the restored guide “${snapshot.title || snapshot.id}”.`);
    guideIdMap.set(Number(snapshot.id), Number(current.id));
    restored.push(Number(current.id));
  }

  const videoStatements = [];
  for (const video of verified.entities['course-video'] || []) {
    const restoredGuideId = guideIdMap.get(Number(video.guide_id));
    if (!restoredGuideId) continue;
    videoStatements.push(db.prepare(`
      INSERT OR IGNORE INTO course_video_sources (
        video_key, guide_id, lesson_id, source_key, title, audio_only,
        duration_seconds, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      video.video_key, restoredGuideId, video.lesson_id, video.source_key, video.title,
      Number(video.audio_only || 0), video.duration_seconds ?? null, video.created_at, video.updated_at,
    ));
  }
  if (videoStatements.length) {
    try { await runBatches(db, videoStatements); } catch (error) {
      if (!missingTable(error, 'course_video_sources')) throw error;
    }
  }

  await db.prepare(`
    UPDATE whop_import_backups
    SET restored_at = ?, restore_count = restore_count + 1
    WHERE backup_id = ? AND status = 'verified'
  `).bind(nowIso(), backupId).run();
  return {
    backup: backupSummary(await db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first()),
    restored,
    unchanged,
    conflicts,
    complete: conflicts.length === 0,
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
  const verified = await verifyBackup(env, backupId, { includePayload: false });
  const scope = normalizedScope({ scope: verified.row.scope, experienceId: verified.row.experience_id });
  const options = safeJson(verified.row.reset_options_json, {}) || {};
  const expectedPhrase = resetConfirmationPhrase(scope, options.deletePublished === true);
  if (String(input.confirmation || '').trim() !== expectedPhrase) {
    throw new HttpError(422, `Type “${expectedPhrase}” exactly to continue.`);
  }
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

  const db = verified.db;
  const before = await resetCounts(db, scope, options.deletePublished === true);
  const guideCondition = scope.scope === 'source' ? 'source_experience_id = ?' : 'source_experience_id IS NOT NULL';
  const guideBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const sourceCondition = scope.scope === 'source' ? 'experience_id = ?' : '1 = 1';
  const sourceBindings = scope.scope === 'source' ? [scope.experienceId] : [];
  const statements = [
    db.prepare(`
      UPDATE whop_import_backups
      SET reset_used_at = ?
      WHERE backup_id = ? AND reset_token_hash = ? AND reset_used_at IS NULL AND status = 'verified'
    `).bind(nowIso(), backupId, verified.row.reset_token_hash),
    db.prepare(`DELETE FROM guides WHERE ${guideCondition} ${options.deletePublished === true ? '' : "AND status != 'published'"}`).bind(...guideBindings),
    db.prepare(`DELETE FROM whop_posts WHERE ${sourceCondition}`).bind(...sourceBindings),
    db.prepare(`DELETE FROM whop_sources WHERE ${sourceCondition}`).bind(...sourceBindings),
  ];
  const results = await db.batch(statements);
  if (changes(results[0]) !== 1) throw new HttpError(409, 'The reset authorization changed before deletion began. Nothing was deleted.');
  return {
    backup: backupSummary(await db.prepare('SELECT * FROM whop_import_backups WHERE backup_id = ?').bind(backupId).first()),
    scope: scope.scope,
    experienceId: scope.experienceId,
    options,
    deleted: {
      guides: changes(results[1]),
      posts: changes(results[2]),
      sources: changes(results[3]),
    },
    expected: before,
    publishedPreserved: options.deletePublished !== true,
  };
}

export async function deleteWhopImportBackup(env, backupId, confirmation) {
  const verified = await verifyBackup(env, backupId, { includePayload: false });
  const expected = deleteBackupConfirmationPhrase(backupId);
  if (String(confirmation || '').trim() !== expected) throw new HttpError(422, `Type “${expected}” exactly to delete this backup.`);
  const result = await verified.db.prepare('DELETE FROM whop_import_backups WHERE backup_id = ? AND status = ?')
    .bind(backupId, 'verified').run();
  if (changes(result) !== 1) throw new HttpError(409, 'SniperPlug could not delete this backup safely.');
  return { deleted: true, backupId };
}
