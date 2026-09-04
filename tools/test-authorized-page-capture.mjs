import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthorizedCaptureSession, captureSourceGroupForTests } from '../functions/_lib/authorized-page-capture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const lib = read('functions/_lib/authorized-page-capture.js');
const mintRoute = read('functions/api/capture-session.js');
const ingestRoute = read('functions/api/capture-page.js');
const userscript = read('sniperplug-capture.user.js');
const controlRuntime = read('assets/js/control-center-capture.js');
const page = read('control-center/index.html');
const middleware = read('functions/_middleware.js');
const migration = read('migrations/0007_browser_capture_sessions.sql');
const publish = read('functions/_lib/publish.js');

new Function(userscript);
new Function(controlRuntime);

for (const forbidden of [
  'document.cookie',
  'localStorage',
  'sessionStorage',
  'x-whop-user-token',
  'x_whop_user_token',
  'XMLHttpRequest.prototype',
  'window.fetch =',
  'unsafeWindow.fetch',
]) {
  assert.equal(userscript.includes(forbidden), false, `Authorized userscript must not inspect or intercept credentials/network state: ${forbidden}`);
}

assert.ok(userscript.includes('@match        https://*.apps.whop.com/*'), 'Userscript is not constrained to Whop app hosting.');
assert.ok(userscript.includes('@match        https://*.whop.site/*'), 'Userscript is missing Whop site app hosting.');
assert.equal((userscript.match(/^\/\/ @connect/mg) || []).length, 1, 'Userscript should have one explicit cross-origin destination.');
assert.ok(userscript.includes('@connect      sniperplug.com'), 'Userscript can connect somewhere other than the SniperPlug capture endpoint.');
assert.ok(userscript.includes("const CAPTURE_URL = 'https://sniperplug.com/api/capture-page'"), 'Userscript does not post only to the canonical SniperPlug capture endpoint.');
assert.ok(userscript.includes('cloneNode(true)') && userscript.includes('nodeToMarkdown'), 'Userscript does not derive content from the rendered DOM.');
assert.ok(!userscript.includes('PerformanceObserver') && !userscript.includes('MutationObserver('), 'Capture helper must not become a hidden request or background surveillance layer.');
assert.ok(userscript.includes("button.textContent = 'Import to SniperPlug'"), 'Capture remains invisible instead of requiring a deliberate user action.');
assert.ok(userscript.includes('GM_xmlhttpRequest') && userscript.includes('Authorization: `Bearer ${token}`'), 'Rendered capture does not use its dedicated SniperPlug bearer token.');
assert.ok(userscript.includes("if (Number(error?.status || 0) === 401) await GM_deleteValue(TOKEN_KEY)"), 'Expired capture tokens are not cleared from helper storage.');

assert.ok(mintRoute.includes('requireSameOrigin(context.request)'), 'Capture token minting is not same-origin protected.');
assert.ok(mintRoute.includes('requireAdmin(context.request, context.env)'), 'Capture token minting does not require the owner Control Center session.');
assert.ok(mintRoute.includes('requireWhopSession(context.request, context.env, admin)'), 'Capture token minting does not require a live Whop connection.');
assert.ok(mintRoute.includes('rightsConfirmed: body.rightsConfirmed === true'), 'Capture token minting skips explicit rights confirmation.');
assert.ok(ingestRoute.includes('saveAuthorizedCapturedPage') && !ingestRoute.includes('requireAdmin('), 'Cross-origin capture ingest should authenticate with the dedicated capture bearer, not the Strict browser cookie.');

assert.ok(lib.includes('CAPTURE_TTL_MS = 30 * 60_000'), 'Capture token lifetime is no longer bounded to 30 minutes.');
assert.ok(lib.includes('CAPTURE_MAX_USES = 100'), 'Capture token use count is not bounded.');
assert.ok(lib.includes('token_hash TEXT PRIMARY KEY') && lib.includes('const tokenHash = await sha256(token)'), 'Raw capture tokens can be persisted instead of only their hashes.');
assert.ok(lib.includes("WHERE token_hash = ? AND use_count < max_uses AND expires_at > ?"), 'Capture token use is not atomically bounded.');
assert.ok(lib.includes("source_key IS NULL") && lib.includes("NULL, ?, ?, ?, ?, ?, ?, '{}', NULL"), 'Browser capture is being forged into the native whop_posts foreign-key path.');
assert.ok(lib.includes("type: 'browser-capture'") && lib.includes("captureMode: 'rendered-dom'"), 'Browser-capture provenance is missing.');
assert.ok(lib.includes('autoPublishEligible: false') && lib.includes('manualReviewCompleted: false'), 'Captured pages can bypass manual review.');
assert.ok(lib.includes('reviewCount: capture.imageUrls.length'), 'Captured image URLs are not held for explicit media review.');
assert.ok(publish.includes('Number(attachments.reviewCount || 0) > 0'), 'Publish guard no longer blocks unresolved captured media.');
assert.equal(captureSourceGroupForTests(), 'Authorized Whop page capture');

assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS browser_capture_sessions'), 'Capture session migration is missing.');
assert.ok(migration.includes('allowed_origins_json') && migration.includes('max_uses') && migration.includes('expires_at'), 'Capture session migration lost origin, use, or expiry bounds.');
assert.ok(middleware.includes("pathname === '/sniperplug-capture.user.js'"), 'Userscript cache policy is not explicit.');
assert.ok(middleware.includes("'public, no-store, max-age=0'"), 'Userscript can be cached stale across backend changes.');
assert.ok(page.includes('/assets/js/control-center-capture.js?v=20260904.1') && page.includes('/assets/css/control-center-capture.css?v=20260904.1'), 'Control Center pairing UI is not cache-busted and loaded.');
assert.ok(controlRuntime.includes("fetch('/api/capture-session'"), 'Control Center cannot mint the temporary capture token.');
assert.ok(controlRuntime.includes('navigator.clipboard.writeText') && controlRuntime.includes('data-install-capture-helper'), 'Control Center does not expose a usable token/install flow.');

class RecordingStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async run() {
    this.db.calls.push({ type: 'run', sql: this.sql, args: this.args });
    return { meta: { changes: 1 } };
  }
  async all() {
    this.db.calls.push({ type: 'all', sql: this.sql, args: this.args });
    if (this.sql.includes('FROM whop_experience_capabilities')) {
      return {
        results: [{
          app_json: JSON.stringify({ origin: 'https://better-content.apps.whop.com/' }),
        }],
      };
    }
    return { results: [] };
  }
  async first() {
    this.db.calls.push({ type: 'first', sql: this.sql, args: this.args });
    return null;
  }
}

class RecordingDb {
  constructor() {
    this.calls = [];
  }
  prepare(sql) {
    return new RecordingStatement(this, sql);
  }
  async batch(statements) {
    this.calls.push({ type: 'batch', count: statements.length });
    return statements.map(() => ({ success: true }));
  }
}

const db = new RecordingDb();
await assert.rejects(
  () => createAuthorizedCaptureSession({ SNIPERPLUG_DB: db }, { sid: 'sniperplug-owner' }, { rightsConfirmed: false }),
  (error) => error?.status === 422,
  'Capture token minting must fail without explicit rights confirmation.',
);

const before = Date.now();
const minted = await createAuthorizedCaptureSession(
  { SNIPERPLUG_DB: db },
  { sid: 'sniperplug-owner' },
  { rightsConfirmed: true },
);
const after = Date.now();
assert.match(minted.token, /^cap_[A-Za-z0-9_-]{20,}$/);
assert.equal(minted.maxUses, 100);
const expiryMs = Date.parse(minted.expiresAt);
assert.ok(expiryMs >= before + 29 * 60_000 && expiryMs <= after + 31 * 60_000, 'Capture token TTL drifted away from 30 minutes.');
assert.ok(minted.allowedOrigins.includes('https://whop.com'));
assert.ok(minted.allowedOrigins.includes('https://better-content.apps.whop.com'));
const insert = db.calls.find((call) => call.type === 'run' && call.sql.includes('INSERT INTO browser_capture_sessions'));
assert.ok(insert, 'Capture session was not persisted.');
assert.equal(insert.args.includes(minted.token), false, 'Raw capture token was written to D1.');
assert.ok(String(insert.args[0] || '').length >= 32, 'Capture token hash was not persisted.');

console.log('\nAUTHORIZED PAGE CAPTURE REGRESSION PASSED\n');
console.log('✓ Capture requires an explicit user action on a rendered Whop app page.');
console.log('✓ Whop cookies, iframe tokens, storage, and hidden network responses are not inspected.');
console.log('✓ Capture uses a short-lived, hashed, use-bounded SniperPlug bearer token.');
console.log('✓ Captured content enters the private draft queue with browser-capture provenance.');
console.log('✓ Captured image URLs remain blocked from publishing until manually resolved.');
console.log('✓ The Android helper is constrained to Whop app origins and the SniperPlug ingest endpoint.');
