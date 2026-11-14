// Whitelist a small, aggregate-only telemetry envelope. Never persist raw
// Discord payloads, request headers, local paths, SQL snapshots or secrets.
import { HttpError } from './http.js';

const MAX_DEALS = 40;
const VALID_STATES = new Set([
  'pending', 'retry', 'failed', 'verifying', 'page_retry',
  'verified_markdown', 'verified_page_price', 'verified_no_reference',
  'verified_reference', 'verified_under_threshold',
  'not_buyable', 'incomplete_identity', 'identity_mismatch', 'unavailable',
]);
const VALID_ERROR_CLASSES = new Set([
  '', 'timeout', 'rate_limited', 'access_denied', 'identity_incomplete',
  'seller_proof', 'offer_proof', 'price_missing', 'availability',
  'database_busy', 'other_error',
]);
const VALID_RETAILERS = new Set(['walmart', 'target', 'home_depot', 'best_buy', 'other']);

const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const boundedText = (value, max = 100) =>
  typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';
const number = (value, max = 1e10) =>
  Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const iso = (value) => {
  if (typeof value !== 'string' || value.length > 40 || !/\d{4}-\d\d-\d\dT/.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? new Date(epoch).toISOString() : null;
};
function safeLink(value) {
  if (typeof value !== 'string' || value.length > 350) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Only exact retailer product pages; no data exfiltration or redirects.
    if (!['www.walmart.com', 'walmart.com'].includes(url.hostname)) return null;
    if (!/^\/ip\/[A-Za-z0-9_-]+\/\d{5,20}$|^\/ip\/\d{5,20}$/.test(url.pathname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}
const metric = (value) => {
  const o = record(value);
  return Object.fromEntries([
    'total', 'due', 'verified', 'pending', 'retry', 'failed',
    'page_retry', 'identity_blocked', 'posts_24h', 'reserved_24h',
    'events_24h', 'processed_24h', 'event_errors_24h',
  ].map((k) => [k, number(o[k])]).filter(([, v]) => v !== null));
};
const worker = (value) => {
  const o = record(value);
  return {
    total_cycles: number(o.total_cycles),
    total_failures: number(o.total_failures),
    total_timeouts: number(o.total_timeouts),
    consecutive_failures: number(o.consecutive_failures),
    last_batch_claimed: number(o.last_batch_claimed),
    last_api_price_missing: number(o.last_api_price_missing),
    last_cycle_at: iso(o.last_cycle_at),
    last_success_at: iso(o.last_success_at),
    last_failure_at: iso(o.last_failure_at),
  };
};
export function sanitizeOpsSnapshot(value, now = Date.now()) {
  const payload = record(value);
  if (payload.schema !== 1 || payload.source !== 'discloud-sniperplug') {
    throw new HttpError(422, 'Unknown SniperPlug telemetry schema or source.');
  }
  const id = boundedText(payload.id, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
    throw new HttpError(422, 'Invalid telemetry event ID.');
  }
  const observed = iso(payload.observed_at);
  if (!observed || Math.abs(now - Date.parse(observed)) > 15 * 60_000) {
    throw new HttpError(422, 'Telemetry observation timestamp must be recent.');
  }
  const bot = record(payload.bot);
  const state = record(payload.metrics);
  const catalog = record(state.catalog);
  const posts = record(state.posts);
  const events = record(state.events);
  const queue = record(state.queue);
  const latest = Array.isArray(payload.deals) ? payload.deals : [];
  if (latest.length > MAX_DEALS) throw new HttpError(422, 'Too many item records.');
  return {
    schema: 1, id, source: 'discloud-sniperplug', observed_at: observed,
    bot: {
      ready: bot.ready === true,
      guild_count: number(bot.guild_count, 100_000),
      backend: boundedText(bot.backend, 24) || 'unknown',
      uptime_seconds: number(bot.uptime_seconds, 1e9),
      release_sha: /^[a-f0-9]{40}$/i.test(String(bot.release_sha || ''))
        ? String(bot.release_sha).toLowerCase() : null,
    },
    metrics: {
      queue: { ...metric(queue), last_verified_at: iso(queue.last_verified_at) },
      posts: { ...metric(posts), latest_post_at: iso(posts.latest_post_at) },
      events: { ...metric(events), latest_event_at: iso(events.latest_event_at) },
      catalog: {
        completed_routes: number(catalog.completed_routes),
        completed_passes: number(catalog.completed_passes),
        last_started_at: iso(catalog.last_started_at),
        last_completed_at: iso(catalog.last_completed_at),
        claim_active: catalog.claim_active === true,
      },
      workers: {
        catalog: worker(record(state.workers).catalog),
        exact: worker(record(state.workers).exact),
      },
    },
    deals: latest.map((row) => {
      const item = record(row);
      const itemId = boundedText(item.item_id, 20);
      if (!/^\d{5,20}$/.test(itemId)) throw new HttpError(422, 'Invalid item ID.');
      const status = boundedText(item.status, 64);
      const errorClass = boundedText(item.error_class, 32);
      return {
        item_id: itemId,
        title: boundedText(item.title, 180),
        retailer: VALID_RETAILERS.has(item.retailer) ? item.retailer : 'other',
        status: VALID_STATES.has(status) ? status : 'unavailable',
        route: boundedText(item.route, 70) || 'unknown',
        product_url: safeLink(item.product_url),
        exact_current_cents: number(item.exact_current_cents, 10_000_000_000),
        exact_reference_cents: number(item.exact_reference_cents, 10_000_000_000),
        apparent_current_cents: number(item.apparent_current_cents, 10_000_000_000),
        first_seen_at: iso(item.first_seen_at),
        last_seen_at: iso(item.last_seen_at),
        verified_at: iso(item.verified_at),
        last_attempt_at: iso(item.last_attempt_at),
        error_class: VALID_ERROR_CLASSES.has(errorClass) ? errorClass : 'other_error',
      };
    }),
  };
}

export function summarizeOpsSnapshot(data, receivedAt, now = Date.now()) {
  if (!data) return { state: 'not_connected', snapshot: null, stale: true };
  const received = Date.parse(receivedAt);
  const ageSeconds = Number.isFinite(received) ? Math.max(0, Math.round((now - received) / 1000)) : null;
  return {
    state: ageSeconds != null && ageSeconds <= 12 * 60 ? 'connected' : 'stale',
    stale: ageSeconds == null || ageSeconds > 12 * 60,
    age_seconds: ageSeconds,
    received_at: receivedAt,
    snapshot: data,
  };
}
