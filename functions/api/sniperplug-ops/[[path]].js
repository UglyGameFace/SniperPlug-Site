import { requireAdmin } from '../../_lib/auth.js';
import { HttpError, handleError, json, methodNotAllowed } from '../../_lib/http.js';
import { sanitizeOpsSnapshot, summarizeOpsSnapshot } from '../../_lib/sniperplug-ops-telemetry.js';

const encoder = new TextEncoder();
const MAX_PAYLOAD_BYTES = 64_000;
const SOURCES = ['discloud-sniperplug'];
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

function checkSecret(env) {
  const key = String(env?.SNIPERPLUG_OPS_INGEST_SECRET || '');
  if (key.length < 32) throw new HttpError(503, 'SniperPlug operational feed is not configured.');
  return key;
}

function fixedTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
function hexBytes(raw) {
  if (!/^[0-9a-f]{64}$/i.test(raw || '')) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function authorizeIngest(request, bodyText, env, now = Date.now()) {
  const key = checkSecret(env);
  const timestamp = request.headers.get('x-sniperplug-timestamp') || '';
  const signature = request.headers.get('x-sniperplug-signature') || '';
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) {
    throw new HttpError(401, 'Telemetry signature timestamp invalid.');
  }
  const received = hexBytes(signature.replace(/^sha256=/i, ''));
  if (!received) throw new HttpError(401, 'Telemetry signature required.');
  const cryptoKey = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    'HMAC', cryptoKey, encoder.encode(timestamp + '.' + bodyText),
  ));
  if (!fixedTimeEqual(expected, received)) throw new HttpError(401, 'Telemetry signature invalid.');
}

async function ingest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  if (!env?.SNIPERPLUG_DB) throw new HttpError(503, 'Operational storage is not configured.');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_PAYLOAD_BYTES) throw new HttpError(413, 'Telemetry payload exceeds limit.');
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > MAX_PAYLOAD_BYTES) throw new HttpError(413, 'Telemetry payload exceeds limit.');
  await authorizeIngest(request, raw, env);
  let object;
  try { object = JSON.parse(raw); } catch { throw new HttpError(422, 'Invalid telemetry JSON.'); }
  const value = sanitizeOpsSnapshot(object);
  const now = new Date().toISOString();
  const db = env.SNIPERPLUG_DB;
  // Idempotent UUIDs prevent replayed packets from growing history.
  await db.prepare(`INSERT OR IGNORE INTO sniperplug_ops_snapshots
    (id, observed_at, received_at, source, schema_version, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(value.id, value.observed_at, now, value.source, value.schema, JSON.stringify(value))
    .run();
  // Only the isolated telemetry table is mutated. Historical bot SQLite remains untouched.
  const cutoff = new Date(Date.now() - 14 * 86400_000).toISOString();
  await db.prepare('DELETE FROM sniperplug_ops_snapshots WHERE received_at < ?')
    .bind(cutoff).run();
  return json({ received: true, id: value.id }, 202, headers);
}

async function live(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  await requireAdmin(request, env);
  if (!env?.SNIPERPLUG_DB) return json({
    state: 'storage_unavailable', stale: true, snapshot: null, history: [], missing: ['D1 binding'],
  }, 200, headers);
  let rows;
  try {
    const result = await env.SNIPERPLUG_DB.prepare(
      'SELECT observed_at, received_at, payload_json FROM sniperplug_ops_snapshots ORDER BY received_at DESC LIMIT 96',
    ).all();
    rows = result.results || [];
  } catch (error) {
    // A new installation without the additive migration must fail visibly.
    console.warn('SniperPlug telemetry store unavailable', String(error?.name || 'Error'));
    return json({
      state: 'migration_required', stale: true, snapshot: null, history: [],
      missing: ['Telemetry D1 migration 0008'],
    }, 200, headers);
  }
  const latest = rows[0] ? JSON.parse(rows[0].payload_json) : null;
  const summary = summarizeOpsSnapshot(latest, rows[0]?.received_at);
  const history = rows.slice().reverse().map((row) => {
    const data = JSON.parse(row.payload_json);
    return {
      at: row.observed_at,
      received_at: row.received_at,
      posted_24h: data.metrics?.posts?.posts_24h ?? null,
      verified: data.metrics?.queue?.verified ?? null,
      due: data.metrics?.queue?.due ?? null,
      catalog_timeouts: data.metrics?.workers?.catalog?.total_timeouts ?? null,
      exact_timeouts: data.metrics?.workers?.exact?.total_timeouts ?? null,
    };
  });
  return json({
    ...summary,
    history,
    missing: summary.stale ? ['Fresh bot telemetry'] : [],
    read_only: true,
  }, 200, headers);
}

export async function onRequest(context) {
  try {
    const path = new URL(context.request.url).pathname;
    if (path === '/api/sniperplug-ops/ingest') return await ingest(context);
    return await live(context);
  } catch (error) { return handleError(error); }
}

export const __test = { fixedTimeEqual, authorizeIngest };
