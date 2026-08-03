import { requireDatabase } from './http.js';

export const MEDIA_STORAGE_LIMIT_BYTES = 8_000_000_000;
export const MAX_MEDIA_OBJECT_BYTES = 50_000_000;
export const MAX_MEDIA_OBJECTS = 25_000;
export const MAX_MEDIA_COPIES_PER_MONTH = 50_000;
export const MAX_MEDIA_COPIES_PER_DAY = 2_000;
export const MAX_MEDIA_ORIGIN_READS_PER_DAY = 10_000;
export const MAX_MEDIA_CLEANUP_MUTATIONS = 5_000;
export const MEDIA_INVENTORY_INTERVAL_MS = 24 * 60 * 60_000;
export const MEDIA_CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;
export const MEDIA_DELETE_GRACE_MS = 7 * 24 * 60 * 60_000;
const STALE_COPY_MS = 15 * 60_000;
const STATE_ID = 1;
const R2_PAGE_SIZE = 1000;
const SQL_BATCH_SIZE = 75;

let schemaPromise = null;
let inventoryPromise = null;
let cleanupPromise = null;
let maintenancePromise = null;

function nowIso() {
  return new Date().toISOString();
}

function utcDay() {
  return nowIso().slice(0, 10);
}

function utcMonth() {
  return nowIso().slice(0, 7);
}

function parsedTime(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function chunks(values, size = SQL_BATCH_SIZE) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export function validMediaStorageKey(value) {
  const key = String(value || '');
  return /^whop-[a-f0-9]{32}-[a-zA-Z0-9._-]{1,120}$/.test(key) ? key : '';
}

export function extractMediaStorageKeys(body, attachments = null) {
  const keys = new Set();
  const text = String(body || '');
  const expression = /\/media\/(whop-[a-f0-9]{32}-[a-zA-Z0-9._-]{1,120})/g;
  for (const match of text.matchAll(expression)) {
    const key = validMediaStorageKey(match[1]);
    if (key) keys.add(key);
  }
  const files = Array.isArray(attachments?.files) ? attachments.files : [];
  for (const file of files) {
    const key = validMediaStorageKey(file?.storageKey);
    if (key) keys.add(key);
  }
  return keys;
}

export function mediaStorageHoldReason(code) {
  const reasons = {
    'file-too-large': 'This media file is larger than the 50 MB automatic-copy limit and will stay in private draft review.',
    'storage-cap': 'SniperPlug reached its 8 GB hard-free media limit. This file stays in private draft review instead of creating billable storage.',
    'object-cap': 'SniperPlug reached its 25,000-object safety limit. This file stays in private draft review instead of creating billable operations.',
    'monthly-copy-cap': 'SniperPlug reached its 50,000-copy monthly safety limit. This file stays in private draft review until the next monthly reset.',
    'daily-copy-cap': 'SniperPlug reached its 2,000-copy daily safety limit. This file stays in private draft review until the next UTC day.',
    'daily-origin-read-cap': 'SniperPlug reached its 10,000 uncached R2-read daily safety limit. Cached media still works; retry this copy after the UTC reset.',
  };
  return reasons[code] || null;
}

export function mediaStorageDecision({
  fileSize = 0,
  usedBytes = 0,
  reservedBytes = 0,
  objectCount = 0,
  copiesThisMonth = 0,
  copiesToday = 0,
} = {}) {
  const size = Math.max(0, Number(fileSize || 0));
  const used = Math.max(0, Number(usedBytes || 0));
  const reserved = Math.max(0, Number(reservedBytes || 0));
  if (size > MAX_MEDIA_OBJECT_BYTES) {
    return { allowed: false, code: 'file-too-large', reason: mediaStorageHoldReason('file-too-large') };
  }
  if (used + reserved + MAX_MEDIA_OBJECT_BYTES > MEDIA_STORAGE_LIMIT_BYTES) {
    return { allowed: false, code: 'storage-cap', reason: mediaStorageHoldReason('storage-cap') };
  }
  if (Math.max(0, Number(objectCount || 0)) >= MAX_MEDIA_OBJECTS) {
    return { allowed: false, code: 'object-cap', reason: mediaStorageHoldReason('object-cap') };
  }
  if (Math.max(0, Number(copiesThisMonth || 0)) >= MAX_MEDIA_COPIES_PER_MONTH) {
    return { allowed: false, code: 'monthly-copy-cap', reason: mediaStorageHoldReason('monthly-copy-cap') };
  }
  if (Math.max(0, Number(copiesToday || 0)) >= MAX_MEDIA_COPIES_PER_DAY) {
    return { allowed: false, code: 'daily-copy-cap', reason: mediaStorageHoldReason('daily-copy-cap') };
  }
  return { allowed: true, code: 'allowed', reason: null };
}

async function schemaProbe(db) {
  try {
    const state = await db.prepare(`
      SELECT id, copy_month, copies_this_month, copy_day, copies_today, read_day, origin_reads_today
      FROM media_storage_state WHERE id = 1
    `).first();
    await db.prepare('SELECT storage_key, managed, unreferenced_at FROM media_objects LIMIT 1').first();
    return { ready: true, hasState: Boolean(state) };
  } catch (error) {
    if (/no such table|no such column/i.test(String(error?.message || ''))) return { ready: false, hasState: false };
    throw error;
  }
}

async function tableColumns(db, table) {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((rows.results || []).map((row) => String(row.name || '')));
}

async function addMissingColumns(db, table, definitions) {
  const present = await tableColumns(db, table);
  for (const [name, definition] of definitions) {
    if (present.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
    } catch (error) {
      if (!/duplicate column/i.test(String(error?.message || ''))) throw error;
    }
  }
}

async function repairSchema(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS media_storage_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        used_bytes INTEGER NOT NULL DEFAULT 0,
        reserved_bytes INTEGER NOT NULL DEFAULT 0,
        object_count INTEGER NOT NULL DEFAULT 0,
        copy_month TEXT,
        copies_this_month INTEGER NOT NULL DEFAULT 0,
        copy_day TEXT,
        copies_today INTEGER NOT NULL DEFAULT 0,
        read_day TEXT,
        origin_reads_today INTEGER NOT NULL DEFAULT 0,
        last_inventory_at TEXT,
        last_cleanup_at TEXT,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS media_objects (
        storage_key TEXT PRIMARY KEY,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        reserved_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('copying', 'ready')),
        reservation_id TEXT,
        managed INTEGER NOT NULL DEFAULT 1 CHECK (managed IN (0, 1)),
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        source_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_referenced_at TEXT,
        unreferenced_at TEXT
      )
    `),
  ]);
  await addMissingColumns(db, 'media_storage_state', [
    ['used_bytes', 'INTEGER NOT NULL DEFAULT 0'],
    ['reserved_bytes', 'INTEGER NOT NULL DEFAULT 0'],
    ['object_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['copy_month', 'TEXT'],
    ['copies_this_month', 'INTEGER NOT NULL DEFAULT 0'],
    ['copy_day', 'TEXT'],
    ['copies_today', 'INTEGER NOT NULL DEFAULT 0'],
    ['read_day', 'TEXT'],
    ['origin_reads_today', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_inventory_at', 'TEXT'],
    ['last_cleanup_at', 'TEXT'],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"],
  ]);
  await addMissingColumns(db, 'media_objects', [
    ['size_bytes', 'INTEGER NOT NULL DEFAULT 0'],
    ['reserved_bytes', 'INTEGER NOT NULL DEFAULT 0'],
    ['status', "TEXT NOT NULL DEFAULT 'ready'"],
    ['reservation_id', 'TEXT'],
    ['managed', 'INTEGER NOT NULL DEFAULT 1'],
    ['content_type', "TEXT NOT NULL DEFAULT 'application/octet-stream'"],
    ['source_key', 'TEXT'],
    ['created_at', "TEXT NOT NULL DEFAULT ''"],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"],
    ['last_referenced_at', 'TEXT'],
    ['unreferenced_at', 'TEXT'],
  ]);
  await db.batch([
    db.prepare('CREATE INDEX IF NOT EXISTS idx_media_objects_status ON media_objects (status, updated_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_media_objects_cleanup ON media_objects (managed, status, unreferenced_at)'),
  ]);
}

async function insertStateRow(db) {
  return db.prepare(`
    INSERT OR IGNORE INTO media_storage_state (
      id, used_bytes, reserved_bytes, object_count, copy_month, copies_this_month,
      copy_day, copies_today, read_day, origin_reads_today,
      last_inventory_at, last_cleanup_at, updated_at
    ) VALUES (1, 0, 0, 0, ?, 0, ?, 0, ?, 0, NULL, NULL, ?)
  `).bind(utcMonth(), utcDay(), utcDay(), nowIso()).run();
}

async function ensureSchema(env) {
  const db = requireDatabase(env);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const probe = await schemaProbe(db);
      if (!probe.ready) await repairSchema(db);
      if (!probe.hasState) await insertStateRow(db);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
  return db;
}

async function stateRow(db) {
  return db.prepare('SELECT * FROM media_storage_state WHERE id = ?').bind(STATE_ID).first();
}

async function normalizeOperationWindows(db) {
  const current = await stateRow(db);
  const month = utcMonth();
  const day = utcDay();
  if (current?.copy_month === month && current?.copy_day === day && current?.read_day === day) return current;
  await db.prepare(`
    UPDATE media_storage_state
    SET copy_month = ?,
        copies_this_month = CASE WHEN copy_month = ? THEN copies_this_month ELSE 0 END,
        copy_day = ?,
        copies_today = CASE WHEN copy_day = ? THEN copies_today ELSE 0 END,
        read_day = ?,
        origin_reads_today = CASE WHEN read_day = ? THEN origin_reads_today ELSE 0 END,
        updated_at = ?
    WHERE id = ?
  `).bind(month, month, day, day, day, day, nowIso(), STATE_ID).run();
  return stateRow(db);
}

async function recomputeState(db, { inventoryAt = null, cleanupAt = null } = {}) {
  const totals = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'ready' THEN size_bytes ELSE 0 END), 0) AS used_bytes,
      COALESCE(SUM(CASE WHEN status = 'copying' THEN reserved_bytes ELSE 0 END), 0) AS reserved_bytes,
      COALESCE(SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END), 0) AS object_count
    FROM media_objects
  `).first();
  const current = await stateRow(db);
  await db.prepare(`
    UPDATE media_storage_state
    SET used_bytes = ?, reserved_bytes = ?, object_count = ?,
        last_inventory_at = ?, last_cleanup_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    Math.max(0, Number(totals?.used_bytes || 0)),
    Math.max(0, Number(totals?.reserved_bytes || 0)),
    Math.max(0, Number(totals?.object_count || 0)),
    inventoryAt || current?.last_inventory_at || null,
    cleanupAt || current?.last_cleanup_at || null,
    nowIso(),
    STATE_ID,
  ).run();
}

export function mediaStorageSnapshot(row = {}, connected = true) {
  const usedBytes = Math.max(0, Number(row.used_bytes || 0));
  const reservedBytes = Math.max(0, Number(row.reserved_bytes || 0));
  const totalCommittedBytes = usedBytes + reservedBytes;
  const remainingBytes = Math.max(0, MEDIA_STORAGE_LIMIT_BYTES - totalCommittedBytes);
  const usagePercent = Math.min(100, Math.round((totalCommittedBytes / MEDIA_STORAGE_LIMIT_BYTES) * 1000) / 10);
  const objectCount = Math.max(0, Number(row.object_count || 0));
  const copiesThisMonth = Math.max(0, Number(row.copies_this_month || 0));
  const copiesToday = Math.max(0, Number(row.copies_today || 0));
  const originReadsToday = Math.max(0, Number(row.origin_reads_today || 0));
  const stopReason = remainingBytes < MAX_MEDIA_OBJECT_BYTES
    ? 'storage-cap'
    : objectCount >= MAX_MEDIA_OBJECTS
      ? 'object-cap'
      : copiesThisMonth >= MAX_MEDIA_COPIES_PER_MONTH
        ? 'monthly-copy-cap'
        : copiesToday >= MAX_MEDIA_COPIES_PER_DAY
          ? 'daily-copy-cap'
          : originReadsToday >= MAX_MEDIA_ORIGIN_READS_PER_DAY
            ? 'daily-origin-read-cap'
            : null;
  return {
    connected: Boolean(connected),
    mode: 'hard-free',
    limitBytes: MEDIA_STORAGE_LIMIT_BYTES,
    maxFileBytes: MAX_MEDIA_OBJECT_BYTES,
    maxObjects: MAX_MEDIA_OBJECTS,
    maxCopiesPerMonth: MAX_MEDIA_COPIES_PER_MONTH,
    maxCopiesPerDay: MAX_MEDIA_COPIES_PER_DAY,
    maxOriginReadsPerDay: MAX_MEDIA_ORIGIN_READS_PER_DAY,
    usedBytes,
    reservedBytes,
    totalCommittedBytes,
    remainingBytes,
    objectCount,
    copiesThisMonth,
    copiesToday,
    originReadsToday,
    copyMonth: row.copy_month || utcMonth(),
    copyDay: row.copy_day || utcDay(),
    readDay: row.read_day || utcDay(),
    usagePercent,
    hardStopped: connected && Boolean(stopReason),
    stopReason,
    lastInventoryAt: row.last_inventory_at || null,
    lastCleanupAt: row.last_cleanup_at || null,
    inventoryDue: !row.last_inventory_at || Date.now() - parsedTime(row.last_inventory_at) >= MEDIA_INVENTORY_INTERVAL_MS,
    cleanupDue: !row.last_cleanup_at || Date.now() - parsedTime(row.last_cleanup_at) >= MEDIA_CLEANUP_INTERVAL_MS,
  };
}

export async function getMediaStorageStatus(env) {
  if (!env?.SNIPERPLUG_MEDIA) return mediaStorageSnapshot({}, false);
  const db = await ensureSchema(env);
  return mediaStorageSnapshot(await normalizeOperationWindows(db), true);
}

async function registerExistingObject(env, object, { sourceKey = null, managed = null } = {}) {
  const key = String(object?.key || '');
  if (!key) return null;
  const db = await ensureSchema(env);
  const now = nowIso();
  const isManaged = managed === null ? Boolean(validMediaStorageKey(key)) : Boolean(managed);
  const result = await db.prepare(`
    INSERT OR IGNORE INTO media_objects (
      storage_key, size_bytes, reserved_bytes, status, reservation_id, managed,
      content_type, source_key, created_at, updated_at, last_referenced_at, unreferenced_at
    ) VALUES (?, ?, 0, 'ready', NULL, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    key,
    Math.max(0, Number(object?.size || 0)),
    isManaged ? 1 : 0,
    String(object?.httpMetadata?.contentType || object?.contentType || 'application/octet-stream'),
    sourceKey,
    now,
    now,
    isManaged ? now : null,
  ).run();
  if (changes(result) > 0) {
    await db.prepare(`
      UPDATE media_storage_state
      SET used_bytes = used_bytes + ?, object_count = object_count + 1, updated_at = ?
      WHERE id = ?
    `).bind(Math.max(0, Number(object?.size || 0)), now, STATE_ID).run();
  }
  return db.prepare('SELECT * FROM media_objects WHERE storage_key = ?').bind(key).first();
}

async function releaseReservation(env, key, reservationId, reservedBytes) {
  const db = await ensureSchema(env);
  const row = await db.prepare(`
    SELECT storage_key FROM media_objects
    WHERE storage_key = ? AND status = 'copying' AND reservation_id = ?
  `).bind(key, reservationId).first();
  if (!row) return;
  await db.batch([
    db.prepare('DELETE FROM media_objects WHERE storage_key = ? AND status = \'copying\' AND reservation_id = ?')
      .bind(key, reservationId),
    db.prepare(`
      UPDATE media_storage_state
      SET reserved_bytes = MAX(0, reserved_bytes - ?), updated_at = ?
      WHERE id = ?
    `).bind(reservedBytes, nowIso(), STATE_ID),
  ]);
}

async function finalizeReservation(env, reservation, { sizeBytes, contentType, sourceKey }) {
  const db = await ensureSchema(env);
  const row = await db.prepare(`
    SELECT storage_key FROM media_objects
    WHERE storage_key = ? AND status = 'copying' AND reservation_id = ?
  `).bind(reservation.key, reservation.id).first();
  if (!row) throw new Error('SniperPlug lost the media quota reservation before the copy finished.');
  const now = nowIso();
  const size = Math.max(0, Number(sizeBytes || 0));
  await db.batch([
    db.prepare(`
      UPDATE media_objects
      SET size_bytes = ?, reserved_bytes = 0, status = 'ready', reservation_id = NULL,
          managed = 1, content_type = ?, source_key = ?, updated_at = ?,
          last_referenced_at = ?, unreferenced_at = NULL
      WHERE storage_key = ? AND status = 'copying' AND reservation_id = ?
    `).bind(size, String(contentType || 'application/octet-stream'), sourceKey || null, now, now, reservation.key, reservation.id),
    db.prepare(`
      UPDATE media_storage_state
      SET used_bytes = used_bytes + ?, reserved_bytes = MAX(0, reserved_bytes - ?),
          object_count = object_count + 1, updated_at = ?
      WHERE id = ?
    `).bind(size, reservation.bytes, now, STATE_ID),
  ]);
}

async function recoverStaleCopies(env) {
  if (!env?.SNIPERPLUG_MEDIA) return;
  const db = await ensureSchema(env);
  const cutoff = new Date(Date.now() - STALE_COPY_MS).toISOString();
  const rows = await db.prepare(`
    SELECT storage_key, reservation_id, reserved_bytes, source_key
    FROM media_objects
    WHERE status = 'copying' AND updated_at < ?
    ORDER BY updated_at ASC LIMIT 20
  `).bind(cutoff).all();
  for (const row of rows.results || []) {
    const read = await reserveMediaOriginRead(env);
    if (!read.allowed) break;
    const object = await env.SNIPERPLUG_MEDIA.head(row.storage_key).catch(() => null);
    if (object) {
      await finalizeReservation(env, { key: row.storage_key, id: row.reservation_id, bytes: Number(row.reserved_bytes || 0) }, {
        sizeBytes: object.size,
        contentType: object.httpMetadata?.contentType,
        sourceKey: row.source_key,
      }).catch(async () => {
        await recomputeState(db);
      });
    } else {
      await releaseReservation(env, row.storage_key, row.reservation_id, Number(row.reserved_bytes || 0));
    }
  }
  await recomputeState(db);
}

async function tryReserve(db, bytes) {
  await normalizeOperationWindows(db);
  return db.prepare(`
    UPDATE media_storage_state
    SET reserved_bytes = reserved_bytes + ?, copies_this_month = copies_this_month + 1, copies_today = copies_today + 1, updated_at = ?
    WHERE id = ?
      AND used_bytes + reserved_bytes + ? <= ?
      AND object_count + (SELECT COUNT(*) FROM media_objects WHERE status = 'copying') < ?
      AND copies_this_month < ?
      AND copies_today < ?
  `).bind(
    bytes,
    nowIso(),
    STATE_ID,
    bytes,
    MEDIA_STORAGE_LIMIT_BYTES,
    MAX_MEDIA_OBJECTS,
    MAX_MEDIA_COPIES_PER_MONTH,
    MAX_MEDIA_COPIES_PER_DAY,
  ).run();
}

export async function reserveMediaOriginRead(env) {
  if (!env?.SNIPERPLUG_MEDIA) return { allowed: false, reason: 'missing-storage' };
  const db = await ensureSchema(env);
  await normalizeOperationWindows(db);
  const result = await db.prepare(`
    UPDATE media_storage_state
    SET origin_reads_today = origin_reads_today + 1, updated_at = ?
    WHERE id = ? AND origin_reads_today < ?
  `).bind(nowIso(), STATE_ID, MAX_MEDIA_ORIGIN_READS_PER_DAY).run();
  if (changes(result) === 0) {
    return {
      allowed: false,
      reason: 'daily-origin-read-cap',
      retryAfterSeconds: Math.max(60, Math.ceil((Date.parse(`${utcDay()}T23:59:59.999Z`) - Date.now()) / 1000)),
    };
  }
  const row = await stateRow(db);
  return { allowed: true, used: Number(row?.origin_reads_today || 0), limit: MAX_MEDIA_ORIGIN_READS_PER_DAY };
}

export async function prepareMediaCopy(env, key, { declaredSize = 0, contentType = '', sourceKey = '' } = {}) {
  if (!env?.SNIPERPLUG_MEDIA) return { status: 'missing-storage' };
  const safeKey = validMediaStorageKey(key);
  if (!safeKey) return { status: 'invalid-key' };

  await reconcileMediaStorageInventory(env);
  await recoverStaleCopies(env);
  const db = await ensureSchema(env);
  const saved = await db.prepare('SELECT * FROM media_objects WHERE storage_key = ?').bind(safeKey).first();
  if (saved?.status === 'ready') {
    await db.prepare('UPDATE media_objects SET last_referenced_at = ?, unreferenced_at = NULL, updated_at = ? WHERE storage_key = ?')
      .bind(nowIso(), nowIso(), safeKey).run();
    return { status: 'existing', object: saved };
  }
  if (saved?.status === 'copying') return { status: 'copying' };

  const sizePolicy = mediaStorageDecision({ fileSize: declaredSize });
  if (!sizePolicy.allowed) return { status: sizePolicy.code, reason: sizePolicy.reason };

  const read = await reserveMediaOriginRead(env);
  if (!read.allowed) return { status: read.reason, reason: mediaStorageHoldReason(read.reason) };
  const existing = await env.SNIPERPLUG_MEDIA.head(safeKey).catch(() => null);
  if (existing) {
    return { status: 'existing', object: await registerExistingObject(env, { ...existing, key: safeKey }, { sourceKey, managed: true }) };
  }

  const reservationBytes = MAX_MEDIA_OBJECT_BYTES;
  let reservationResult = await tryReserve(db, reservationBytes);
  if (changes(reservationResult) === 0) {
    await cleanupUnreferencedMedia(env, { force: true });
    reservationResult = await tryReserve(db, reservationBytes);
  }
  if (changes(reservationResult) === 0) {
    const status = await getMediaStorageStatus(env);
    const code = status.stopReason || 'storage-cap';
    return { status: code, reason: mediaStorageHoldReason(code) || mediaStorageHoldReason('storage-cap') };
  }

  const reservationId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = nowIso();
  try {
    const inserted = await db.prepare(`
      INSERT INTO media_objects (
        storage_key, size_bytes, reserved_bytes, status, reservation_id, managed,
        content_type, source_key, created_at, updated_at, last_referenced_at, unreferenced_at
      ) VALUES (?, 0, ?, 'copying', ?, 1, ?, ?, ?, ?, ?, NULL)
    `).bind(safeKey, reservationBytes, reservationId, String(contentType || 'application/octet-stream'), sourceKey || null, now, now, now).run();
    if (changes(inserted) === 0) throw new Error('Media reservation could not be created.');
  } catch {
    await db.prepare(`
      UPDATE media_storage_state
      SET reserved_bytes = MAX(0, reserved_bytes - ?),
          copies_this_month = MAX(0, copies_this_month - 1),
          copies_today = MAX(0, copies_today - 1),
          updated_at = ? WHERE id = ?
    `).bind(reservationBytes, nowIso(), STATE_ID).run();
    const concurrent = await db.prepare('SELECT * FROM media_objects WHERE storage_key = ?').bind(safeKey).first();
    return concurrent?.status === 'ready' ? { status: 'existing', object: concurrent } : { status: 'copying' };
  }
  return { status: 'reserved', reservation: { key: safeKey, id: reservationId, bytes: reservationBytes } };
}

export async function completeMediaCopy(env, reservation, details) {
  await finalizeReservation(env, reservation, details);
}

export async function cancelMediaCopy(env, reservation) {
  if (!reservation) return;
  await releaseReservation(env, reservation.key, reservation.id, reservation.bytes);
}

async function listBucketObjects(bucket) {
  const objects = [];
  let cursor = undefined;
  do {
    const options = { limit: R2_PAGE_SIZE };
    if (cursor) options.cursor = cursor;
    const page = await bucket.list(options);
    objects.push(...(page.objects || []));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

export async function reconcileMediaStorageInventory(env, { force = false } = {}) {
  if (!env?.SNIPERPLUG_MEDIA) return getMediaStorageStatus(env);
  if (inventoryPromise) return inventoryPromise;
  const db = await ensureSchema(env);
  const current = await stateRow(db);
  if (!force && current?.last_inventory_at && Date.now() - parsedTime(current.last_inventory_at) < MEDIA_INVENTORY_INTERVAL_MS) {
    return mediaStorageSnapshot(current, true);
  }

  inventoryPromise = (async () => {
    const [objects, ledgerResult] = await Promise.all([
      listBucketObjects(env.SNIPERPLUG_MEDIA),
      db.prepare('SELECT storage_key, size_bytes, status, managed FROM media_objects').all(),
    ]);
    const ledgerRows = ledgerResult.results || [];
    const ledger = new Map(ledgerRows.map((row) => [row.storage_key, row]));
    const now = nowIso();
    const seen = new Set();
    const statements = [];
    for (const object of objects) {
      const key = String(object.key || '');
      if (!key) continue;
      seen.add(key);
      const size = Math.max(0, Number(object.size || 0));
      const managed = Boolean(validMediaStorageKey(key));
      const saved = ledger.get(key);
      if (saved && saved.status === 'ready' && Number(saved.size_bytes || 0) === size && Boolean(saved.managed) === managed) continue;
      statements.push(db.prepare(`
        INSERT INTO media_objects (
          storage_key, size_bytes, reserved_bytes, status, reservation_id, managed,
          content_type, source_key, created_at, updated_at, last_referenced_at, unreferenced_at
        ) VALUES (?, ?, 0, 'ready', NULL, ?, ?, NULL, ?, ?, NULL, NULL)
        ON CONFLICT(storage_key) DO UPDATE SET
          size_bytes = CASE WHEN media_objects.status = 'copying' THEN media_objects.size_bytes ELSE excluded.size_bytes END,
          reserved_bytes = CASE WHEN media_objects.status = 'copying' THEN media_objects.reserved_bytes ELSE 0 END,
          status = CASE WHEN media_objects.status = 'copying' THEN media_objects.status ELSE 'ready' END,
          reservation_id = CASE WHEN media_objects.status = 'copying' THEN media_objects.reservation_id ELSE NULL END,
          managed = excluded.managed,
          content_type = CASE WHEN media_objects.content_type = '' THEN excluded.content_type ELSE media_objects.content_type END,
          updated_at = excluded.updated_at
      `).bind(
        key,
        size,
        managed ? 1 : 0,
        String(object.httpMetadata?.contentType || 'application/octet-stream'),
        object.uploaded ? new Date(object.uploaded).toISOString() : now,
        now,
      ));
    }
    for (const group of chunks(statements)) await db.batch(group);

    const missing = ledgerRows.filter((row) => row.status === 'ready' && !seen.has(row.storage_key));
    for (const group of chunks(missing)) {
      await db.batch(group.map((row) => db.prepare("DELETE FROM media_objects WHERE storage_key = ? AND status = 'ready'").bind(row.storage_key)));
    }
    await recomputeState(db, { inventoryAt: now });
    return getMediaStorageStatus(env);
  })().finally(() => { inventoryPromise = null; });
  return inventoryPromise;
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

export async function pruneDetachedGuideMedia(env, guideId, body) {
  const db = await ensureSchema(env);
  const row = await db.prepare('SELECT attachment_json FROM guides WHERE id = ?').bind(guideId).first();
  if (!row) return { removed: [], attachments: {} };
  const attachments = safeJson(row.attachment_json, {});
  const bodyKeys = extractMediaStorageKeys(body);
  const files = Array.isArray(attachments.files) ? attachments.files : [];
  const removed = [];
  const kept = files.filter((file) => {
    const key = validMediaStorageKey(file?.storageKey);
    if (!key || bodyKeys.has(key)) return true;
    removed.push(key);
    return false;
  });
  if (!removed.length) return { removed, attachments };
  const next = {
    ...attachments,
    files: kept,
    mirroredMedia: kept.filter((file) => file?.mirrored === true).length,
    reviewCount: kept.filter((file) => file?.durable !== true || !file?.url).length,
  };
  await db.prepare('UPDATE guides SET attachment_json = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(next), nowIso(), guideId).run();
  return { removed, attachments: next };
}

async function guideReferenceKeys(db) {
  const rows = await db.prepare("SELECT body_markdown, attachment_json FROM guides WHERE status IN ('draft', 'published')").all();
  const keys = new Set();
  for (const row of rows.results || []) {
    const attachments = safeJson(row.attachment_json, {});
    for (const key of extractMediaStorageKeys(row.body_markdown, attachments)) keys.add(key);
  }
  try {
    const backupRows = await db.prepare(`
      SELECT DISTINCT media.storage_key
      FROM whop_import_backup_media AS media
      JOIN whop_import_backups AS backup ON backup.backup_id = media.backup_id
      WHERE backup.status = 'verified' AND backup.deleted_at IS NULL
    `).all();
    for (const row of backupRows.results || []) {
      const key = validMediaStorageKey(row.storage_key);
      if (key) keys.add(key);
    }
  } catch (error) {
    if (!/no such table/i.test(String(error?.message || ''))) throw error;
  }
  return keys;
}

export async function cleanupUnreferencedMedia(env, { force = false } = {}) {
  if (!env?.SNIPERPLUG_MEDIA) return getMediaStorageStatus(env);
  if (cleanupPromise) return cleanupPromise;
  const db = await ensureSchema(env);
  const current = await stateRow(db);
  if (!force && current?.last_cleanup_at && Date.now() - parsedTime(current.last_cleanup_at) < MEDIA_CLEANUP_INTERVAL_MS) {
    return mediaStorageSnapshot(current, true);
  }

  cleanupPromise = (async () => {
    const referenced = await guideReferenceKeys(db);
    const rows = await db.prepare(`
      SELECT storage_key, size_bytes, unreferenced_at
      FROM media_objects WHERE managed = 1 AND status = 'ready'
    `).all();
    const now = nowIso();
    const markReferenced = [];
    const markUnreferenced = [];
    const remove = [];
    for (const row of rows.results || []) {
      if (referenced.has(row.storage_key)) {
        if (row.unreferenced_at) markReferenced.push(row.storage_key);
      } else if (!row.unreferenced_at) {
        markUnreferenced.push(row.storage_key);
      } else if (Date.now() - parsedTime(row.unreferenced_at) >= MEDIA_DELETE_GRACE_MS) {
        remove.push(row);
      }
    }
    const selectedRemove = remove.slice(0, MAX_MEDIA_CLEANUP_MUTATIONS);
    let mutationBudget = MAX_MEDIA_CLEANUP_MUTATIONS - selectedRemove.length;
    const selectedReferenced = markReferenced.slice(0, mutationBudget);
    mutationBudget -= selectedReferenced.length;
    const selectedUnreferenced = markUnreferenced.slice(0, mutationBudget);

    for (const group of chunks(selectedRemove, 1000)) {
      await env.SNIPERPLUG_MEDIA.delete(group.map((row) => row.storage_key));
      for (const statements of chunks(group, SQL_BATCH_SIZE)) {
        await db.batch(statements.map((row) => db.prepare("DELETE FROM media_objects WHERE storage_key = ? AND status = 'ready'").bind(row.storage_key)));
      }
    }
    for (const group of chunks(selectedReferenced)) {
      await db.batch(group.map((key) => db.prepare(`
        UPDATE media_objects SET unreferenced_at = NULL, last_referenced_at = ?, updated_at = ? WHERE storage_key = ?
      `).bind(now, now, key)));
    }
    for (const group of chunks(selectedUnreferenced)) {
      await db.batch(group.map((key) => db.prepare(`
        UPDATE media_objects SET unreferenced_at = ?, updated_at = ? WHERE storage_key = ?
      `).bind(now, now, key)));
    }
    await recomputeState(db, { cleanupAt: now });
    return {
      ...(await getMediaStorageStatus(env)),
      deletedObjects: selectedRemove.length,
      pendingCleanupMutations: Math.max(0, remove.length + markReferenced.length + markUnreferenced.length - MAX_MEDIA_CLEANUP_MUTATIONS),
    };
  })().finally(() => { cleanupPromise = null; });
  return cleanupPromise;
}

export async function runMediaStorageMaintenance(env, { force = false } = {}) {
  if (!env?.SNIPERPLUG_MEDIA) return getMediaStorageStatus(env);
  if (maintenancePromise) return maintenancePromise;
  maintenancePromise = (async () => {
    await reconcileMediaStorageInventory(env, { force });
    return cleanupUnreferencedMedia(env, { force });
  })().finally(() => { maintenancePromise = null; });
  return maintenancePromise;
}
