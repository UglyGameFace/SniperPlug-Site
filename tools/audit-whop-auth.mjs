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
const subscriberAuth = read('functions/_lib/subscriber-auth.js');
const control = read('functions/api/control.js');
const start = read('functions/api/whop/oauth/start.js');
const subscriberStart = read('functions/api/subscriber/oauth/start.js');
const callback = read('functions/api/whop/oauth/callback.js');
const switchRoute = read('functions/api/whop-switch.js');
const disconnectRoute = read('functions/api/whop-disconnect.js');
const backupsRoute = read('functions/api/whop-backups.js');
const publishRoute = read('functions/api/publish-ready.js');
const guard = read('assets/js/control-center-network-guard.js');
const client = read('assets/js/control-center-v2.js');
const subscriberUi = read('assets/js/control-center-subscriber.js');
const journeyCss = read('assets/css/control-center-journey.css');
const page = read('control-center/index.html');

assert.ok(auth.includes("export const OWNER_PRINCIPAL_ID = 'sniperplug-owner'"));
assert.ok(auth.includes("export const SUBSCRIBER_PRINCIPAL_PREFIX = 'whop-user:'"));
assert.ok(auth.includes('export const OWNER_SESSION_ID = OWNER_PRINCIPAL_ID'));
assert.ok(auth.includes('v: 4') && auth.includes("kind: 'owner'"));
assert.ok(auth.includes('v: 5') && auth.includes("kind: 'subscriber'"));
assert.ok(auth.includes('principalId: OWNER_PRINCIPAL_ID') && auth.includes('browserSid: `admin_${randomToken(24)}`'));
assert.ok(auth.includes('browserSid: `subscriber_${randomToken(24)}`'));
assert.ok(auth.includes('subscriberPrincipalIdForUser(whopUserId)'));
assert.ok(auth.includes("return session?.kind === 'owner' ? session : null"), 'Owner-only session reader can accept a subscriber account.');
assert.ok(auth.includes("session.kind !== 'owner' || session.principalId !== OWNER_PRINCIPAL_ID"), 'Owner-only requireAdmin boundary is missing.');
assert.ok(!auth.includes('customer-pending') && !auth.includes('isCustomerSession') && !auth.includes('assertPaidImporterAccess'));
assert.ok(!auth.includes('resolveOwnerWhopSessionId') && !auth.includes('copySessionToOwner'));
assert.ok(!auth.includes('ORDER BY updated_at DESC LIMIT 1'), 'Owner auth can still adopt an arbitrary Whop session.');
assert.ok(!existsSync(join(root, 'functions/_lib/paid-access.js')), 'Obsolete paid-customer Control Center auth still exists.');
assert.ok(!existsSync(join(root, 'functions/api/importer-login.js')), 'Obsolete Whop-as-Control-Center-login route still exists.');

assert.ok(subscriberAuth.includes('requireControlAccount'));
assert.ok(subscriberAuth.includes('verifySubscriberAccountAccess'));
assert.ok(subscriberAuth.includes('membershipProductId(entry) === productId') && subscriberAuth.includes('membershipGrantsAccess(entry)'), 'Subscriber access does not verify the exact configured product with the canonical membership predicate.');
assert.ok(subscriberAuth.includes('subscriberPrincipalIdForUser(whopUserId) !== account.principalId'), 'Subscriber Whop identity can drift from the application principal.');
assert.ok(subscriberAuth.includes("code: 'subscriber_entitlement_unavailable'"), 'Temporary entitlement failures do not fail closed.');
assert.ok(!subscriberAuth.includes('DISCORD_BOT_TOKEN') && !subscriberAuth.includes('SNIPERPLUG_REQUIRED_DISCORD_GUILD_IDS') && !subscriberAuth.includes('WHOP_API_KEY'), 'Obsolete Discord/server-key coupling returned to paid subscriber access.');

for (const oldAction of ['oauth-start', 'oauth-callback', 'whop-disconnect']) {
  assert.ok(!control.includes(`currentAction === '${oldAction}'`), `Legacy ${oldAction} action still exists inside /api/control.`);
}
assert.ok(!control.includes('beginWhopOAuth') && !control.includes('finishWhopOAuth'), 'Control API still contains a second OAuth implementation.');
assert.ok(page.includes('href="/api/whop/oauth/start" data-whop-connect'));
assert.ok(page.includes('href="/api/subscriber/oauth/start" data-subscriber-login'));
assert.ok(!page.includes('/api/control?action=oauth-start'));

assert.ok(start.includes('requireAdmin(context.request, context.env)'));
assert.ok(start.includes('beginWhopOAuth(context.request, context.env, admin)'));
assert.ok(start.includes('appendCookie(redirect(authorizationUrl), whopOAuthFlowCookie(state))'), 'Owner OAuth start does not bind the browser to the one-time callback state before leaving SniperPlug.');
assert.ok(!start.includes('OWNER_SESSION_ID') && !start.includes('purgeLegacyWhopSessions'), 'Owner OAuth start still assumes or purges one global connection.');
assert.ok(!start.includes("searchParams.set('prompt'") && !start.includes('max_age'), 'Owner OAuth start uses undocumented account-selection parameters.');

assert.ok(subscriberStart.includes('beginSubscriberWhopOAuth(context.request, context.env)'));
assert.ok(subscriberStart.includes('subscriberWhopOAuthFlowCookie(state)'));
assert.ok(!subscriberStart.includes('requireAdmin('), 'Subscriber sign-in still requires the owner password session.');

assert.ok(!callback.includes('requireAdmin(context.request, context.env)'), 'OAuth callback still depends on the SameSite=Strict application cookie during the cross-site return from Whop.');
assert.ok(callback.includes('await resolveWhopOAuthFlow(context.request)'), 'OAuth callback is not tied to one of the transient browser correlation cookies.');
assert.ok(callback.includes("flow.kind === 'subscriber'") && callback.includes('finishSubscriberWhopOAuth(context.request, context.env)'), 'Subscriber OAuth callback bypasses the entitlement-gated bootstrap path.');
assert.ok(callback.includes('createSubscriberSession(context.env, completed.profile)'), 'Subscriber OAuth callback does not issue the stable application session after entitlement verification.');
assert.ok(!callback.includes('OWNER_SESSION_ID') && !callback.includes('purgeLegacyWhopSessions'), 'OAuth callback still hard-codes or purges the single owner principal.');
assert.ok(callback.includes('clearWhopOAuthFlowCookie()') && callback.includes('clearSubscriberWhopOAuthFlowCookie()'), 'OAuth callback does not clear both transient correlation cookies after use.');
assert.ok(oauthFlow.includes("sameSite: 'Lax'") && oauthFlow.includes('path: WHOP_OAUTH_CALLBACK_PATH'), 'OAuth callback cookies are not narrowly scoped for a top-level cross-site return.');
assert.ok(oauthFlow.includes('constantTimeTextEqual(state, cookieState)'), 'OAuth callback state is not compared safely against the browser correlation cookie.');
assert.ok(oauthFlow.includes("code: 'whop_oauth_flow_ambiguous'"), 'A callback matching both owner and subscriber flows does not fail closed.');

for (const route of [switchRoute, disconnectRoute]) {
  assert.ok(route.includes("context.request.method !== 'POST'"), 'A destructive Whop route is callable with GET.');
  assert.ok(route.includes('requireSameOrigin(context.request)'), 'A destructive Whop route lacks same-origin protection.');
  assert.ok(route.includes('requireControlAccount(context.request, context.env)'), 'A destructive Whop route is not current-entitlement application-authenticated.');
  assert.ok(route.includes('disconnectPrincipalWhop(context.request, context.env, account)'), 'A destructive Whop route can still hit the global legacy disconnect path.');
  assert.ok(!route.includes('OWNER_SESSION_ID') && !route.includes('disconnectWhop('), 'A destructive Whop route still assumes one global owner token.');
}
assert.ok(!switchRoute.includes('beginWhopOAuth') && !switchRoute.includes("prompt',"), 'Switch route still tries to force an undocumented Whop account chooser.');
assert.ok(switchRoute.includes("whopUrl: 'https://whop.com/'") && switchRoute.includes("'/api/subscriber/oauth/start'") && switchRoute.includes("'/api/whop/oauth/start'"), 'Account switching does not keep owner and subscriber reconnect paths separate.');
assert.ok(control.includes('disconnectPrincipalWhop(request, env, admin)'));
assert.ok(!control.includes('purgeLegacyWhopSessions'), 'Signing into one account can still purge other principals.');
assert.ok(backupsRoute.includes('requireControlAccount(context.request, context.env)'));
assert.ok(backupsRoute.includes('disconnectPrincipalWhop(request, env, account)'));
assert.ok(!backupsRoute.includes('disconnectWhop(request, env, account)'), 'Backup reset can still invoke the global legacy disconnect path.');

assert.ok(whopConnection.includes('principalIdForSession(accountSession)'));
assert.ok(whopConnection.includes("DELETE FROM whop_sessions WHERE admin_session_id = ?") && whopConnection.includes('.bind(principalId)'));
assert.ok(whopConnection.includes("DELETE FROM whop_oauth_states WHERE admin_session_id = ?") && whopConnection.includes("DELETE FROM whop_refresh_leases WHERE admin_session_id = ?"));
assert.ok(!whopConnection.includes('DELETE FROM whop_sessions WHERE admin_session_id !='), 'Principal disconnect contains a cross-account delete.');
assert.ok(whopConnection.includes('openJson(row.refresh_cipher') && whopConnection.includes('https://api.whop.com/oauth/revoke'), 'Principal disconnect no longer attempts remote refresh-token revocation.');

assert.ok(whop.includes('SELECT * FROM whop_sessions WHERE admin_session_id = ?') && whop.includes('.bind(adminSession.sid)'));
assert.ok(!whop.includes("ORDER BY CASE WHEN admin_session_id = 'sniperplug-owner'"));
assert.ok(control.includes("status === 'published') requireOwnerPrincipal"), 'Subscriber guide-status path can reach public publication.');
assert.ok(control.includes("requireOwnerPrincipal(admin, 'change the shared guide category catalog')"), 'Shared category changes are not owner-only.');
assert.ok(publishRoute.includes('requireAdmin(context.request, context.env)'), 'Bulk public publisher is no longer owner-authenticated.');

assert.ok(!guard.includes('data-whop-connect') && !guard.includes('data-whop-disconnect'), 'Network guard still owns Whop UI state.');
assert.ok(guard.includes("document.documentElement.dataset.sniperplugControlAuth = unlocked ? 'unlocked' : 'locked'"), 'Control Center gate does not keep an explicit locked/unlocked browser state.');
assert.ok(guard.includes('setControlAuthState(false);\n  window.SniperPlugControlAuthGate'), 'Control Center does not fail closed before asynchronous session checks begin.');
assert.ok(guard.includes('html[data-sniperplug-control-auth="locked"] [data-control-root] [data-control-app] { display: none !important; }'), 'Locked state does not forcibly hide the Control Center app shell.');
assert.ok(guard.includes('html[data-sniperplug-control-auth="locked"] [data-control-root] [data-login-panel] { display: block !important; }'), 'Locked state does not forcibly expose the login panel.');
assert.ok(guard.includes("event.target.closest('[data-logout]')") && guard.includes('if (target) setControlAuthState(false);'), 'Lock button does not restore the auth gate immediately.');
assert.ok(guard.includes('if (response.status === 401)') && guard.includes('setControlAuthState(false);'), 'An unauthorized API response can leave the Control Center visible.');
assert.ok(guard.includes("if (action === 'dashboard' && response.ok) setControlAuthState(true);"), 'The app is not tied to a successful protected dashboard response.');

assert.ok(client.includes("whopSwitch: $('[data-whop-switch]')"));
assert.ok(client.includes("requestJson('/api/whop-switch', { method: 'POST'"));
assert.ok(client.includes("requestJson('/api/whop-disconnect', { method: 'POST'"));
assert.ok(client.includes("sessionStorage.setItem('sniperplug:whop-switch-ready', '1')"));
assert.ok(page.includes('Open Whop to switch account') && page.includes('data-whop-switch-continue'));
assert.ok(page.includes('/assets/js/control-center-subscriber.js?v=20260906.1'));
assert.ok(subscriberUi.includes('data-sniperplug-account-kind') && subscriberUi.includes('subscriberCopy'));
assert.ok(!subscriberUi.includes("document.createElement('style')"), 'Subscriber account runtime injects presentation CSS.');
assert.ok(journeyCss.includes('html[data-sniperplug-account-kind="subscriber"] [data-owner-only]'), 'Owner-only subscriber visibility is not defined in canonical Control Center CSS.');
assert.ok(!subscriberUi.includes('MutationObserver'), 'Subscriber UI added a broad observer instead of using existing lifecycle events.');

for (const file of [
  'functions/_lib/auth.js',
  'functions/_lib/whop.js',
  'functions/_lib/whop-connection.js',
  'functions/_lib/whop-oauth-flow.js',
  'functions/_lib/subscriber-auth.js',
  'functions/api/control.js',
  'functions/api/whop-backups.js',
  'functions/api/whop/oauth/start.js',
  'functions/api/subscriber/oauth/start.js',
  'functions/api/whop/oauth/callback.js',
  'functions/api/whop-switch.js',
  'functions/api/whop-disconnect.js',
  'assets/js/control-center-network-guard.js',
  'assets/js/control-center-subscriber.js',
  'assets/js/control-center-v2.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG PRINCIPAL / WHOP AUTH AUDIT PASSED\n');
console.log('✓ Owner and paid subscriber browser sessions map to explicit stable account principals.');
console.log('✓ Subscriber access revalidates the exact Whop product entitlement without restoring legacy customer/Discord coupling.');
console.log('✓ Owner and subscriber OAuth flows use separate one-time callback cookies and ambiguous callbacks fail closed.');
console.log('✓ Disconnect/reset remain principal-scoped while public publishing and shared categories remain owner-only.');
console.log('✓ The Control Center stays fail-closed until a protected dashboard request succeeds.');
console.log('✓ Subscriber presentation uses canonical CSS instead of runtime style injection.');
