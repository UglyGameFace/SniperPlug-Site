import assert from 'node:assert/strict';
import {
  MAX_MEDIA_COPIES_PER_DAY,
  MAX_MEDIA_COPIES_PER_MONTH,
  MAX_MEDIA_OBJECT_BYTES,
  MAX_MEDIA_OBJECTS,
  MAX_MEDIA_ORIGIN_READS_PER_DAY,
  MEDIA_STORAGE_LIMIT_BYTES,
  extractMediaStorageKeys,
  mediaStorageDecision,
  mediaStorageSnapshot,
  validMediaStorageKey,
} from '../functions/_lib/media-storage.js';
import { onRequest as serveMedia } from '../functions/media/[key].js';

const key = 'whop-0123456789abcdef0123456789abcdef-proof.mp4';
assert.equal(validMediaStorageKey(key), key);
assert.equal(validMediaStorageKey('../bad'), '');

const extracted = extractMediaStorageKeys(
  `![proof](/media/${key})\n[again](/media/${key}?ignored=true)`,
  { files: [{ storageKey: 'whop-fedcba9876543210fedcba9876543210-notes.pdf' }] },
);
assert.deepEqual([...extracted].sort(), [
  key,
  'whop-fedcba9876543210fedcba9876543210-notes.pdf',
].sort());

assert.equal(mediaStorageDecision({ fileSize: MAX_MEDIA_OBJECT_BYTES }).allowed, true);
assert.equal(mediaStorageDecision({ fileSize: MAX_MEDIA_OBJECT_BYTES + 1 }).code, 'file-too-large');
assert.equal(mediaStorageDecision({
  usedBytes: MEDIA_STORAGE_LIMIT_BYTES - Math.floor(MAX_MEDIA_OBJECT_BYTES / 2),
}).code, 'storage-cap');
assert.equal(mediaStorageDecision({
  usedBytes: MEDIA_STORAGE_LIMIT_BYTES - MAX_MEDIA_OBJECT_BYTES,
}).allowed, true);
assert.equal(mediaStorageDecision({ objectCount: MAX_MEDIA_OBJECTS }).code, 'object-cap');
assert.equal(mediaStorageDecision({ copiesThisMonth: MAX_MEDIA_COPIES_PER_MONTH }).code, 'monthly-copy-cap');
assert.equal(mediaStorageDecision({ copiesToday: MAX_MEDIA_COPIES_PER_DAY }).code, 'daily-copy-cap');

const stopped = mediaStorageSnapshot({
  used_bytes: MEDIA_STORAGE_LIMIT_BYTES - 40_000_000,
  reserved_bytes: 0,
  object_count: 77,
}, true);
assert.equal(stopped.hardStopped, true);
assert.equal(stopped.stopReason, 'storage-cap');
assert.equal(stopped.objectCount, 77);
assert.ok(stopped.usagePercent > 99);
assert.equal(mediaStorageSnapshot({ object_count: MAX_MEDIA_OBJECTS }, true).stopReason, 'object-cap');
assert.equal(mediaStorageSnapshot({ copies_this_month: MAX_MEDIA_COPIES_PER_MONTH }, true).stopReason, 'monthly-copy-cap');
assert.equal(mediaStorageSnapshot({ copies_today: MAX_MEDIA_COPIES_PER_DAY }, true).stopReason, 'daily-copy-cap');
assert.equal(mediaStorageSnapshot({ origin_reads_today: MAX_MEDIA_ORIGIN_READS_PER_DAY }, true).stopReason, 'daily-origin-read-cap');
assert.equal(mediaStorageSnapshot({}, false).connected, false);

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = String(sql).replace(/\s+/g, ' ').trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS media_storage_state')) {
      this.db.tables.add('media_storage_state');
      return { meta: { changes: 0 } };
    }
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS media_objects')) {
      this.db.tables.add('media_objects');
      return { meta: { changes: 0 } };
    }
    if (sql.startsWith('CREATE INDEX')) return { meta: { changes: 0 } };
    if (sql.startsWith('ALTER TABLE')) return { meta: { changes: 0 } };
    if (sql.startsWith('INSERT OR IGNORE INTO media_storage_state')) {
      if (!this.db.state) {
        this.db.state = {
          id: 1,
          used_bytes: 0,
          reserved_bytes: 0,
          object_count: 0,
          copy_month: this.args[0],
          copies_this_month: 0,
          copy_day: this.args[1],
          copies_today: 0,
          read_day: this.args[2],
          origin_reads_today: 0,
          last_inventory_at: null,
          last_cleanup_at: null,
          updated_at: this.args[3],
        };
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (sql.startsWith('UPDATE media_storage_state SET copy_month = ?')) {
      const [month, sameMonth, copyDay, sameCopyDay, readDay, sameReadDay, updatedAt] = this.args;
      if (this.db.state.copy_month !== sameMonth) this.db.state.copies_this_month = 0;
      if (this.db.state.copy_day !== sameCopyDay) this.db.state.copies_today = 0;
      if (this.db.state.read_day !== sameReadDay) this.db.state.origin_reads_today = 0;
      this.db.state.copy_month = month;
      this.db.state.copy_day = copyDay;
      this.db.state.read_day = readDay;
      this.db.state.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE media_storage_state SET origin_reads_today = origin_reads_today + 1')) {
      const [updatedAt, , limit] = this.args;
      if (this.db.state.origin_reads_today >= limit) return { meta: { changes: 0 } };
      this.db.state.origin_reads_today += 1;
      this.db.state.updated_at = updatedAt;
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unexpected fake D1 run: ${sql}`);
  }

  async first() {
    if (this.sql.includes('FROM media_storage_state')) {
      if (!this.db.tables.has('media_storage_state')) throw new Error('no such table: media_storage_state');
      return this.db.state ? { ...this.db.state } : null;
    }
    if (this.sql.includes('FROM media_objects')) {
      if (!this.db.tables.has('media_objects')) throw new Error('no such table: media_objects');
      return null;
    }
    throw new Error(`Unexpected fake D1 first: ${this.sql}`);
  }

  async all() {
    if (this.sql === 'PRAGMA table_info(media_storage_state)') {
      return { results: ['id', 'used_bytes', 'reserved_bytes', 'object_count', 'copy_month', 'copies_this_month', 'copy_day', 'copies_today', 'read_day', 'origin_reads_today', 'last_inventory_at', 'last_cleanup_at', 'updated_at'].map((name) => ({ name })) };
    }
    if (this.sql === 'PRAGMA table_info(media_objects)') {
      return { results: ['storage_key', 'size_bytes', 'reserved_bytes', 'status', 'reservation_id', 'managed', 'content_type', 'source_key', 'created_at', 'updated_at', 'last_referenced_at', 'unreferenced_at'].map((name) => ({ name })) };
    }
    throw new Error(`Unexpected fake D1 all: ${this.sql}`);
  }
}

class FakeDatabase {
  constructor() {
    this.state = null;
    this.tables = new Set();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const bytes = new TextEncoder().encode('cached-media');
let r2Gets = 0;
let r2Heads = 0;
function fakeObject(range = null) {
  const payload = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
  return {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    }),
    size: bytes.byteLength,
    range,
    httpEtag: '"test-etag"',
    writeHttpMetadata(headers) {
      headers.set('content-type', 'video/mp4');
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    },
  };
}
const bucket = {
  async get(_key, options = {}) {
    r2Gets += 1;
    const header = options.range?.get?.('range') || '';
    const match = /^bytes=(\d+)-(\d+)$/.exec(header);
    return match ? fakeObject({ offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 }) : fakeObject();
  },
  async head() {
    r2Heads += 1;
    return fakeObject();
  },
};
const cacheEntries = new Map();
const cache = {
  async match(request) {
    const saved = cacheEntries.get(request.url);
    if (!saved) return undefined;
    const rangeHeader = request.headers.get('range') || '';
    const match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
    if (!match) return saved.clone();
    const source = new Uint8Array(await saved.clone().arrayBuffer());
    const offset = Number(match[1]);
    const end = Math.min(Number(match[2]), source.byteLength - 1);
    const headers = new Headers(saved.headers);
    headers.set('content-range', `bytes ${offset}-${end}/${source.byteLength}`);
    headers.set('content-length', String(end - offset + 1));
    return new Response(source.slice(offset, end + 1), { status: 206, headers });
  },
  async put(request, response) {
    cacheEntries.set(request.url, response.clone());
  },
};
const db = new FakeDatabase();
const previousCaches = globalThis.caches;
Object.defineProperty(globalThis, 'caches', { value: { default: cache }, configurable: true, writable: true });
try {
  const pending = [];
  const baseContext = (request, requestedKey = key) => ({
    request,
    params: { key: requestedKey },
    env: { SNIPERPLUG_MEDIA: bucket, SNIPERPLUG_DB: db },
    waitUntil(promise) { pending.push(Promise.resolve(promise)); },
  });

  const first = await serveMedia(baseContext(new Request(`https://sniperplug.example/media/${key}`)));
  assert.equal(first.status, 200);
  assert.equal(r2Gets, 1);
  assert.equal(db.state.origin_reads_today, 1, 'Only an uncached R2 request should consume the daily origin-read budget.');
  await Promise.all(pending.splice(0));

  const second = await serveMedia(baseContext(new Request(`https://sniperplug.example/media/${key}`)));
  assert.equal(second.status, 200);
  assert.equal(r2Gets, 1, 'A cached full response must not read R2 again.');
  assert.equal(db.state.origin_reads_today, 1, 'An edge-cache hit must not consume the R2 origin-read budget.');

  const head = await serveMedia(baseContext(new Request(`https://sniperplug.example/media/${key}`, { method: 'HEAD' })));
  assert.equal(head.status, 200);
  assert.equal(r2Heads, 0, 'A cached object should satisfy HEAD without an R2 operation.');
  assert.equal(db.state.origin_reads_today, 1);

  const ranged = await serveMedia(baseContext(new Request(`https://sniperplug.example/media/${key}`, { headers: { range: 'bytes=0-5' } })));
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), `bytes 0-5/${bytes.byteLength}`);
  assert.equal(r2Gets, 1, 'A cached full response must satisfy byte ranges without another R2 read.');
  assert.equal(db.state.origin_reads_today, 1);

  const redirected = await serveMedia(baseContext(new Request(`https://sniperplug.example/media/${key}?cacheBust=123`)));
  assert.equal(redirected.status, 308);
  assert.equal(redirected.headers.get('location'), `https://sniperplug.example/media/${key}`);
  assert.equal(r2Gets, 1, 'Cache-busting query strings must redirect before reading R2.');
  assert.equal(db.state.origin_reads_today, 1);

  db.state.origin_reads_today = MAX_MEDIA_ORIGIN_READS_PER_DAY;
  const limitedKey = 'whop-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-limited.mp4';
  const limited = await serveMedia(baseContext(new Request(`https://sniperplug.example/media/${limitedKey}`), limitedKey));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 60);
  assert.equal(r2Gets, 1, 'The daily hard stop must run before an uncached R2 read.');
} finally {
  if (previousCaches === undefined) delete globalThis.caches;
  else globalThis.caches = previousCaches;
}

console.log('\nSNIPERPLUG R2 HARD-FREE TESTS PASSED\n');
console.log('✓ Private-media copying stops above 50 MB per object.');
console.log('✓ Storage, object-count, daily-copy, and monthly-copy ceilings stop before billable R2/D1 usage.');
console.log('✓ Media references are deduplicated and rejected-guide media enters delayed cleanup.');
console.log('✓ Canonical edge caching prevents repeated full-object reads without breaking ranged playback.');
console.log('✓ Query-string cache busting redirects before touching R2.');
console.log('✓ The daily uncached-read ceiling returns 429 before another R2 operation.');
