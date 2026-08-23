import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const auth = read('functions/_lib/auth.js');
const whop = read('functions/_lib/whop.js');
const control = read('functions/api/control.js');
const start = read('functions/api/whop/oauth/start.js');
const callback = read('functions/api/whop/oauth/callback.js');
const switchRoute = read('functions/api/whop-switch.js');
const disconnectRoute = read('functions/api/whop-disconnect.js');
const guard = read('assets/js/control-center-network-guard.js');
const client = read('assets/js/control-center-v2.js');
const page = read('control-center/index.html');

assert.ok(auth.includes("export const OWNER_SESSION_ID = 'sniperplug-owner'"));
assert.ok(auth.includes("v: 3") && auth.includes("kind: 'owner'"));
assert.ok(!auth.includes('customer-pending') && !auth.includes('isCustomerSession') && !auth.includes('assertPaidImporterAccess'));
assert.ok(!auth.includes('resolveOwnerWhopSessionId') && !auth.includes('copySessionToOwner'));
assert.ok(!auth.includes('ORDER BY updated_at DESC LIMIT 1'), 'Owner auth can still adopt an arbitrary Whop session.');
assert.ok(!existsSync(join(root, 'functions/_lib/paid-access.js')), 'Obsolete paid-customer Control Center auth still exists.');
assert.ok(!existsSync(join(root, 'functions/api/importer-login.js')), 'Obsolete Whop-as-Control-Center-login route still exists.');

for (const oldAction of ['oauth-start', 'oauth-callback', 'whop-disconnect']) {
  assert.ok(!control.includes(`currentAction === '${oldAction}'`), `Legacy ${oldAction} action still exists inside /api/control.`);
}
assert.ok(!control.includes('beginWhopOAuth') && !control.includes('finishWhopOAuth'), 'Control API still contains a second OAuth implementation.');
assert.ok(page.includes('href="/api/whop/oauth/start" data-whop-connect'));
assert.ok(!page.includes('/api/control?action=oauth-start'));

assert.ok(start.includes('requireAdmin(context.request, context.env)'));
assert.ok(start.includes('beginWhopOAuth(context.request, context.env, admin)'));
assert.ok(!start.includes("searchParams.set('prompt'") && !start.includes('max_age'), 'OAuth start uses undocumented account-selection parameters.');
assert.ok(callback.includes('requireAdmin(context.request, context.env)'));
assert.ok(callback.includes('result.adminSessionId !== OWNER_SESSION_ID') && callback.includes('result.adminSessionId !== admin.sid'));

for (const route of [switchRoute, disconnectRoute]) {
  assert.ok(route.includes("context.request.method !== 'POST'"), 'A destructive Whop route is callable with GET.');
  assert.ok(route.includes('requireSameOrigin(context.request)'), 'A destructive Whop route lacks same-origin protection.');
  assert.ok(route.includes('requireAdmin(context.request, context.env)'), 'A destructive Whop route is not owner-authenticated.');
}
assert.ok(switchRoute.includes('disconnectWhop(context.request, context.env, admin)'));
assert.ok(!switchRoute.includes('beginWhopOAuth') && !switchRoute.includes("prompt',"), 'Switch route still tries to force an undocumented Whop account chooser.');
assert.ok(switchRoute.includes("whopUrl: 'https://whop.com/'") && switchRoute.includes("connectUrl: '/api/whop/oauth/start'"));

assert.ok(whop.includes("SELECT * FROM whop_sessions WHERE admin_session_id = ?") && whop.includes('.bind(OWNER_SESSION_ID)'));
assert.ok(!whop.includes("ORDER BY CASE WHEN admin_session_id = 'sniperplug-owner'"));
assert.ok(whop.includes('purgeLegacyWhopSessions'));
assert.ok(whop.includes("DELETE FROM whop_oauth_states WHERE admin_session_id = ?") && whop.includes("DELETE FROM whop_refresh_leases WHERE admin_session_id = ?"));

assert.ok(!guard.includes('data-whop-connect') && !guard.includes('data-whop-disconnect') && !guard.includes('MutationObserver'), 'Network guard still owns Whop UI state.');
assert.ok(client.includes("whopSwitch: $('[data-whop-switch]')"));
assert.ok(client.includes("requestJson('/api/whop-switch', { method: 'POST'"));
assert.ok(client.includes("requestJson('/api/whop-disconnect', { method: 'POST'"));
assert.ok(client.includes("sessionStorage.setItem('sniperplug:whop-switch-ready', '1')"));
assert.ok(page.includes('Open Whop to switch account') && page.includes('data-whop-switch-continue'));

for (const file of [
  'functions/_lib/auth.js',
  'functions/_lib/whop.js',
  'functions/api/control.js',
  'functions/api/whop/oauth/start.js',
  'functions/api/whop/oauth/callback.js',
  'functions/api/whop-switch.js',
  'functions/api/whop-disconnect.js',
  'assets/js/control-center-network-guard.js',
  'assets/js/control-center-v2.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG OWNER / WHOP AUTH AUDIT PASSED\n');
console.log('✓ The Control Center password is the only application login.');
console.log('✓ Whop OAuth is one owner-bound data connection, not an alternate login.');
console.log('✓ Legacy customer sessions, paid-access auth, and duplicate Control API OAuth routes are gone.');
console.log('✓ Disconnect/switch are same-origin POST actions and cannot be triggered by link prefetch.');
console.log('✓ Account switching explains Whop browser-session behavior instead of relying on undocumented OAuth prompts.');
