import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createAdminSession } from '../functions/_lib/auth.js';
import { sanitizeOpsSnapshot, summarizeOpsSnapshot } from '../functions/_lib/sniperplug-ops-telemetry.js';
import { onRequest as operations } from '../functions/api/sniperplug-ops/[[path]].js';
import { onRequest as middleware } from '../functions/_middleware.js';

const secret = 'test-only-signed-operational-observations-2026';
const now = new Date().toISOString();
const valid = {
  schema: 1, id: '123e4567-e89b-42d3-a456-426614174000',
  source: 'discloud-sniperplug', observed_at: now,
  bot: { ready: true, guild_count: 9, backend: 'sqlite', uptime_seconds: 120 },
  metrics: {
    queue: { total: 22, due: 3, verified: 12, pending: 1 },
    posts: { posts_24h: 5, latest_post_at: now },
    events: { events_24h: 8, processed_24h: 7, event_errors_24h: 1 },
    catalog: { completed_routes: 300, last_completed_at: now, claim_active: false },
    workers: { catalog: { total_cycles: 55, total_timeouts: 1, last_success_at: now }, exact: { total_cycles: 130, total_timeouts: 0, last_success_at: now } },
    decisions: { quality_blocked: 2, posted: 5, category_muted: 4 },
  },
  deals: [
    { item_id: '12345678', title: '<script>alert(1)</script> Laptop', retailer: 'walmart',
      status: 'verified_markdown', exact_current_cents: 1999, exact_reference_cents: 18000,
      route: 'computers', product_url: 'https://www.walmart.com/ip/12345678?tracking=true',
      verified_at: now, error_class: '' },
  ],
};
const cleaned = sanitizeOpsSnapshot({ ...valid, bot: { ...valid.bot, dangerous: 'DISCORD_TOKEN=secret' },
  dangerous: { password: 'example' } });
assert.equal(cleaned.bot.guild_count, 9);
assert.equal(cleaned.metrics.posts.posts_24h, 5);
assert.equal(cleaned.metrics.decisions.quality_blocked, 2);
assert(!JSON.stringify(cleaned).includes('DISCORD_TOKEN'));
assert(!JSON.stringify(cleaned).includes('tracking=true'));
assert.equal(cleaned.deals[0].product_url, 'https://www.walmart.com/ip/12345678');
assert.throws(() => sanitizeOpsSnapshot({ ...valid, deals: Array(50).fill(valid.deals[0]) }), /Too many item/);
assert.throws(() => sanitizeOpsSnapshot({ ...valid, observed_at: '2020-01-01T00:00:00Z' }), /recent/);
assert.throws(() => sanitizeOpsSnapshot({ ...valid, source: 'fake-bot' }), /Unknown/);
assert.equal(summarizeOpsSnapshot(null, null).state, 'not_connected');
assert.equal(summarizeOpsSnapshot(cleaned, new Date(Date.now() - 20 * 60_000).toISOString()).state, 'stale');

class Db {
  constructor() { this.rows = new Map(); this.queries = []; }
  prepare(sql) {
    const db = this;
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() {
        db.queries.push(sql);
        if (sql.startsWith('INSERT')) {
          const [id, observed_at, received_at, source, schema_version, payload_json] = this.args;
          if (!db.rows.has(id)) db.rows.set(id, { id, observed_at, received_at, source, schema_version, payload_json });
        } else if (sql.startsWith('DELETE')) {
          const [cutoff] = this.args;
          for (const [id, row] of db.rows) if (row.received_at < cutoff) db.rows.delete(id);
        } else { throw Error('Unexpected query: ' + sql); }
        return { success: true };
      },
      async all() {
        assert.match(sql, /SELECT observed_at, received_at, payload_json/);
        return { results: [...db.rows.values()].sort((a, b) =>
          b.received_at.localeCompare(a.received_at)).slice(0, 96) };
      },
    };
  }
}
const db = new Db();
const env = { SNIPERPLUG_DB: db, SNIPERPLUG_SESSION_SECRET: secret,
  SNIPERPLUG_OPS_INGEST_SECRET: secret };
const owner = await createAdminSession(env);
const cookie = owner.cookie.split(';', 1)[0];
const get = (url, auth = false) => new Request('https://sniperplug.com' + url,
  { headers: auth ? { cookie } : {} });
const anonymous = await operations({ request: get('/api/sniperplug-ops/live'), env });
assert.equal(anonymous.status, 401);
const empty = await operations({ request: get('/api/sniperplug-ops/live', true), env });
assert.equal(empty.status, 200);
assert.equal((await empty.json()).state, 'not_connected');
assert.match(empty.headers.get('cache-control'), /no-store/);

function signed(body, timestamp = Math.floor(Date.now() / 1000), overrideSignature = '') {
  const raw = JSON.stringify(body);
  const signature = overrideSignature || createHmac('sha256', secret)
    .update(String(timestamp) + '.' + raw).digest('hex');
  return new Request('https://sniperplug.com/api/sniperplug-ops/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sniperplug-timestamp': String(timestamp),
      'x-sniperplug-signature': 'sha256=' + signature },
    body: raw,
  });
}
assert.equal((await operations({ request: signed(valid, 1234567890), env })).status, 401);
assert.equal((await operations({ request: signed(valid, undefined, '0'.repeat(64)), env })).status, 401);
assert.equal(db.rows.size, 0);
const success = await operations({ request: signed(valid), env });
assert.equal(success.status, 202);
assert.equal(db.rows.size, 1);
assert.equal((await operations({ request: signed(valid), env })).status, 202);
assert.equal(db.rows.size, 1, 'Replayed event ID must be idempotent');
const live = await operations({ request: get('/api/sniperplug-ops/live', true), env });
assert.equal(live.status, 200);
const report = await live.json();
assert.equal(report.state, 'connected');
assert.equal(report.read_only, true);
assert.equal(report.snapshot.metrics.queue.due, 3);
assert.equal(report.snapshot.metrics.decisions.category_muted, 4);
assert.equal(report.history.length, 1);
assert.equal(report.history[0].posted_24h, 5);
assert.equal((await operations({ request: get('/api/sniperplug-ops/ingest'), env })).status, 405);
assert.equal((await operations({ request: new Request('https://sniperplug.com/api/sniperplug-ops/live', { method: 'POST' }), env })).status, 405);

let reachedStatic = false;
const blocked = await middleware({
  request: get('/operations/'), env,
  next: async () => { reachedStatic = true; return new Response('EXPOSED'); },
});
assert.equal(blocked.status, 401);
assert.equal(reachedStatic, false);
const allowed = await middleware({
  request: get('/operations/', true), env,
  next: async () => new Response('<html>Operations</html>', { headers: { 'content-type': 'text/html' } }),
});
assert.equal(allowed.status, 200);
assert.match(allowed.headers.get('cache-control'), /no-store/);
const markup = await readFile(new URL('../operations/index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('../assets/js/deal-ops.js', import.meta.url), 'utf8');
for (const name of ['overview', 'deals', 'delivery', 'timing', 'quality', 'readiness']) {
  assert.match(markup, new RegExp('data-tab="' + name + '"'));
}
assert.match(markup, /No live bot feed connected/);
assert.match(ui, /\/api\/sniperplug-ops\/live/);
assert.doesNotMatch(ui, /innerHTML\s*=/, 'Untrusted source strings must never render as HTML');
assert.doesNotMatch(ui, /\bfetch\([^)]*method:\s*['"]POST/i, 'Dashboard cannot write');
console.log('SNIPERPLUG REAL OPERATIONS OWNER / TELEMETRY / UI REGRESSIONS PASSED');
