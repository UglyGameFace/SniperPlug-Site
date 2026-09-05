import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const auth = read('functions/_lib/auth.js');
const whop = read('functions/_lib/whop.js');
const whopConnection = read('functions/_lib/whop-connection.js');
const oauthFlow = read('functions/_lib/whop-oauth-flow.js');
const control = read('functions/api/control.js');
const start = read('functions/api/whop/oauth/start.js');
const callback = read('functions/api/whop/oauth/callback.js');
const switchRoute = read('functions/api/whop-switch.js');
const disconnectRoute = read('functions/api/whop-disconnect.js');
const backupsRoute = read('functions/api/whop-backups.js');
const guard = read('assets/js/control-center-network-guard.js');
const client = read('assets/js/control-center-v2.js');
const page = read('control-center/index.html');

assert.ok(auth.includes("export const OWNER_PRINCIPAL_ID = 'sniperplug-owner'"));
assert.ok(auth.includes('export const OWNER_SESSION_ID = OWNER_PRINCIPAL_ID'));
assert.ok(auth.includes('v: 4') && auth.includes("kind: 'owner'"));
assert.ok(auth.includes('principalId: OWNER_PRINCIPAL_ID') && auth.includes('browserSid: `admin_${randomToken(24)}`'));
assert.ok(auth.includes('session.sid !== session.principalId'), 'Account principal and compatibility storage key can silently diverge.');
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
assert.ok(start.includes('appendCookie(redirect(authorizationUrl), whopOAuthFlowCookie(state))'), 'OAuth start does not bind the browser to the one-time callback state before leaving SniperPlug.');
assert.ok(!start.includes('OWNER_SESSION_ID') && !start.includes('purgeLegacyWhopSessions'), 'OAuth start still assumes or purges one global owner connection.');
assert.ok(!start.includes("searchParams.set('prompt'") && !start.includes('max_age'), 'OAuth start uses undocumented account-selection parameters.');
assert.ok(!callback.includes('requireAdmin(context.request, context.env)'), 'OAuth callback still depends on the SameSite=Strict owner cookie during the cross-site return from Whop.');
assert.ok(callback.includes('await requireWhopOAuthFlow(context.request)'), 'OAuth callback is not tied to the transient browser correlation cookie.');
assert.ok(!callback.includes('OWNER_SESSION_ID') && !callback.includes('purgeLegacyWhopSessions'), 'OAuth callback still hard-codes or purges the single owner principal.');
assert.ok(callback.includes('clearWhopOAuthFlowCookie()'), 'OAuth callback does not clear the transient correlation cookie after use.');
assert.ok(oauthFlow.includes("sameSite: 'Lax'") && oauthFlow.includes('path: WHOP_OAUTH_CALLBACK_PATH'), 'OAuth callback cookie is not narrowly scoped for a top-level cross-site return.');
assert.ok(oauthFlow.includes('constantTimeTextEqual(state, cookieState)'), 'OAuth callback state is not compared safely against the browser correlation cookie.');

for (const route of [switchRoute, disconnectRoute]) {
  assert.ok(route.includes("context.request.method !== 'POST'"), 'A destructive Whop route is callable with GET.');
  assert.ok(route.includes('requireSameOrigin(context.request)'), 'A destructive Whop route lacks same-origin protection.');
  assert.ok(route.includes('requireAdmin(context.request, context.env)'), 'A destructive Whop route is not application-authenticated.');
  assert.ok(route.includes('disconnectPrincipalWhop(context.request, context.env, admin)'), 'A destructive Whop route can still hit the global legacy disconnect path.');
  assert.ok(!route.includes('OWNER_SESSION_ID') && !route.includes('disconnectWhop('), 'A destructive Whop route still assumes one global owner token.');
}
assert.ok(!switchRoute.includes('beginWhopOAuth') && !switchRoute.includes("prompt',"), 'Switch route still tries to force an undocumented Whop account chooser.');
assert.ok(switchRoute.includes("whopUrl: 'https://whop.com/'") && switchRoute.includes("connectUrl: '/api/whop/oauth/start'"));
assert.ok(control.includes('disconnectPrincipalWhop(request, env, admin)'));
assert.ok(!control.includes('purgeLegacyWhopSessions'), 'Signing into one account can still purge other principals.');
assert.ok(backupsRoute.includes('disconnectPrincipalWhop(request, env, admin)'));
assert.ok(!backupsRoute.includes('disconnectWhop(request, env, admin)'), 'Backup reset can still invoke the global legacy disconnect path.');

assert.ok(whopConnection.includes('principalIdForSession(accountSession)'));
assert.ok(whopConnection.includes("DELETE FROM whop_sessions WHERE admin_session_id = ?") && whopConnection.includes('.bind(principalId)'));
assert.ok(whopConnection.includes("DELETE FROM whop_oauth_states WHERE admin_session_id = ?") && whopConnection.includes("DELETE FROM whop_refresh_leases WHERE admin_session_id = ?"));
assert.ok(!whopConnection.includes('DELETE FROM whop_sessions WHERE admin_session_id !='), 'Principal disconnect contains a cross-account delete.');
assert.ok(whopConnection.includes("openJson(row.refresh_cipher") && whopConnection.includes('https://api.whop.com/oauth/revoke'), 'Principal disconnect no longer attempts remote refresh-token revocation.');

assert.ok(whop.includes('SELECT * FROM whop_sessions WHERE admin_session_id = ?') && whop.includes('.bind(adminSession.sid)'));
assert.ok(!whop.includes("ORDER BY CASE WHEN admin_session_id = 'sniperplug-owner'"));

assert.ok(!guard.includes('data-whop-connect') && !guard.includes('data-whop-disconnect'), 'Network guard still owns Whop UI state.');
assert.ok(guard.includes("document.documentElement.dataset.sniperplugControlAuth = unlocked ? 'unlocked' : 'locked'"), 'Control Center gate does not keep an explicit locked/unlocked browser state.');
assert.ok(guard.includes('setControlAuthState(false);\n  window.SniperPlugControlAuthGate'), 'Control Center does not fail closed before asynchronous session checks begin.');
assert.ok(guard.includes('html[data-sniperplug-control-auth="locked"] [data-control-root] [data-control-app] { display: none !important; }'), 'Locked state does not forcibly hide the Control Center app shell.');
assert.ok(guard.includes('html[data-sniperplug-control-auth="locked"] [data-control-root] [data-login-panel] { display: block !important; }'), 'Locked state does not forcibly expose the password panel.');
assert.ok(guard.includes("event.target.closest('[data-logout]')") && guard.includes('if (target) setControlAuthState(false);'), 'Lock button does not restore the password gate immediately.');
assert.ok(guard.includes('if (response.status === 401)') && guard.includes('setControlAuthState(false);'), 'An unauthorized API response can leave the Control Center visible.');
assert.ok(guard.includes("if (action === 'dashboard' && response.ok) setControlAuthState(true);"), 'The app is not tied to a successful protected dashboard response.');

assert.ok(client.includes("whopSwitch: $('[data-whop-switch]')"));
assert.ok(client.includes("requestJson('/api/whop-switch', { method: 'POST'"));
assert.ok(client.includes("requestJson('/api/whop-disconnect', { method: 'POST'"));
assert.ok(client.includes("sessionStorage.setItem('sniperplug:whop-switch-ready', '1')"));
assert.ok(page.includes('Open Whop to switch account') && page.includes('data-whop-switch-continue'));

for (const file of [
  'functions/_lib/auth.js',
  'functions/_lib/whop.js',
  'functions/_lib/whop-connection.js',
  'functions/_lib/whop-oauth-flow.js',
  'functions/api/control.js',
  'functions/api/whop-backups.js',
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

console.log('\nSNIPERPLUG PRINCIPAL / WHOP AUTH AUDIT PASSED\n');
console.log('✓ Browser login sessions and SniperPlug account principals are explicit separate concepts.');
console.log('✓ Whop OAuth remains account-scoped so the same subscriber can use multiple devices.');
console.log('✓ Login, callback, switch, disconnect, and reset cannot intentionally purge other principals.');
console.log('✓ Principal disconnect revokes/deletes only that account’s saved Whop connection artifacts.');
console.log('✓ OAuth return still uses a narrow one-time Lax correlation cookie while the application session remains Strict.');
console.log('✓ The Control Center fails closed and stays hidden until a protected dashboard request succeeds.');
