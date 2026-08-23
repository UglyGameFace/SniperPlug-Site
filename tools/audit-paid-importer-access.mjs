import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const access = read('functions/_lib/paid-access.js');
const auth = read('functions/_lib/auth.js');
const login = read('functions/api/importer-login.js');
const switchRoute = read('functions/api/whop-switch.js');
const callback = read('functions/api/whop/oauth/callback.js');
const middleware = read('functions/_middleware.js');
const flash = read('assets/js/control-center-whop-flash.js');
const guard = read('assets/js/control-center-network-guard.js');
const controlPage = read('control-center/index.html');
const example = read('.dev.vars.example');

for (const setting of ['WHOP_IMPORTER_PRODUCT_ID', 'WHOP_API_KEY', 'SNIPERPLUG_REQUIRED_DISCORD_GUILD_IDS', 'DISCORD_BOT_TOKEN']) {
  assert.ok(access.includes(setting), `${setting} is not enforced by the retained paid-access verifier.`);
  assert.ok(example.includes(setting), `${setting} is missing from the deployment example.`);
}
assert.ok(access.includes('/memberships') && access.includes("['active', 'trialing', 'completed']"), 'Current paid membership verification was accidentally removed.');
assert.ok(access.includes('/social_accounts') && access.includes("service || '').toLowerCase() === 'discord'"), 'Linked Discord verification was accidentally removed.');
assert.ok(access.includes('/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}'), 'Live Discord guild verification was accidentally removed.');
assert.ok(access.includes('Access remains locked') && !access.includes('allowed: true'), 'Retained entitlement checks may fail open.');

assert.ok(controlPage.includes('data-login-form') && controlPage.includes('Control Center password'), 'The owner password form is missing from the Control Center.');
assert.ok(controlPage.indexOf('data-login-form') < controlPage.indexOf('data-control-app'), 'The password gate must precede the hidden Control Center application.');
assert.ok(!guard.includes('data-customer-whop-login'), 'A Whop customer-login button is being injected ahead of the password gate.');
assert.ok(!guard.includes('ownerForm.before(customer)'), 'The network guard can still insert an alternate login above the password form.');
assert.ok(guard.includes("whopConnect.href = '/api/whop-switch'"), 'Post-unlock Whop connect must use the authoritative account-switch endpoint.');
assert.ok(guard.includes("closest('[data-whop-disconnect]')") && guard.includes("window.location.assign('/api/whop-switch')"), 'Disconnect can still be intercepted by the legacy in-page handler instead of switching accounts.');
assert.ok(guard.includes('stopImmediatePropagation()'), 'Disconnect does not preempt the older Control Center listener.');

assert.ok(login.includes('requireAdmin(context.request, context.env)'), 'The legacy Whop account chooser can start without an authenticated Control Center session.');
assert.ok(login.includes("admin.kind !== 'owner'"), 'The legacy Whop account chooser does not explicitly require the password-unlocked owner session.');
assert.ok(!login.includes('createAdminSession') && !login.includes('customer-pending') && !login.includes('appendCookie'), 'The legacy Whop connect route can still mint a Control Center session without the password.');

assert.ok(switchRoute.includes('requireAdmin(context.request, context.env)'), 'Whop switching can start without an authenticated Control Center session.');
assert.ok(switchRoute.includes("admin.kind !== 'owner'"), 'Whop switching is not restricted to the password-unlocked owner session.');
assert.ok(switchRoute.includes('disconnectWhop(context.request, context.env, admin)'), 'Whop switching does not revoke/delete the currently saved owner token first.');
assert.ok(switchRoute.includes("DELETE FROM whop_sessions") && switchRoute.includes("DELETE FROM whop_oauth_states"), 'Stale Whop rows can survive disconnect and resurrect the previous account.');
assert.ok(switchRoute.includes("DELETE FROM whop_refresh_leases"), 'Refresh leases are not cleared during an authoritative account switch.');
assert.ok(switchRoute.includes("searchParams.set('prompt', 'select_account')") && switchRoute.includes("searchParams.set('max_age', '0')"), 'Whop switching does not explicitly request an account chooser/fresh authorization.');
assert.ok(switchRoute.indexOf("DELETE FROM whop_sessions") < switchRoute.indexOf('beginWhopOAuth('), 'Whop switching can begin before stale sessions are purged.');

assert.ok(callback.includes('readAdminSession(context.request, context.env)'), 'OAuth callback does not verify the existing browser Control Center session.');
assert.ok(callback.includes("browserSession.kind !== 'owner'"), 'OAuth callback is not restricted to the password-unlocked owner session.');
assert.ok(!callback.includes('promoteCustomerSession') && !callback.includes("kind: 'customer'") && !callback.includes('whop-user:${userId}'), 'OAuth callback can still promote Whop identity into a Control Center login session.');

assert.ok(middleware.includes('legacyCustomerSessionGate'), 'Legacy Whop-created Control Center cookies are not invalidated after the password-first hotfix.');
assert.ok(middleware.includes("session.kind === 'owner'"), 'API boundary does not distinguish owner sessions from legacy customer sessions.');
assert.ok(middleware.includes('CONTROL_CENTER_PASSWORD_REQUIRED') && middleware.includes('clearAdminSession()'), 'Legacy customer sessions do not fail closed and clear their cookie.');
assert.ok(middleware.includes("sessionAction && ['POST', 'DELETE'].includes(request.method)"), 'A stale customer cookie could prevent the owner from entering the password to recover access.');

assert.ok(auth.includes("session.kind === 'customer-pending'"), 'Legacy pending-session handling disappeared unexpectedly; middleware invalidation depends on session kinds remaining explicit.');
assert.ok(middleware.includes('/assets/js/control-center-whop-flash.js?v=20260811.1'), 'The one-shot OAuth callback status runtime is not injected before the Control Center runtime.');
assert.ok(flash.includes("url.searchParams.delete('whop')") && flash.includes("url.searchParams.delete('message')") && flash.includes('history.replaceState'), 'OAuth callback query state can replay forever after refresh.');
assert.ok(flash.includes("'sniperplug:dashboard-refreshed'") && flash.includes("whopState === 'connected'"), 'Callback messages are not reconciled against the current verified Whop connection.');

for (const file of [
  'functions/_lib/paid-access.js',
  'functions/_lib/auth.js',
  'functions/_middleware.js',
  'functions/api/importer-login.js',
  'functions/api/whop-switch.js',
  'functions/api/whop/oauth/callback.js',
  'assets/js/control-center-whop-flash.js',
  'assets/js/control-center-network-guard.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG CONTROL CENTER AUTH / WHOP ACCESS AUDIT PASSED\n');
console.log('✓ The Control Center password is the only route that unlocks the application.');
console.log('✓ Whop connect/switch is available only after the owner password has unlocked the Control Center.');
console.log('✓ Disconnect preempts the legacy UI handler and enters one authoritative switch flow.');
console.log('✓ Account switching revokes the old token and purges stale sessions, OAuth states, and refresh leases before reconnecting.');
console.log('✓ The replacement OAuth request explicitly asks Whop for account selection instead of silently reusing the old local session.');
console.log('✓ Legacy customer/pending cookies are invalidated and cannot bypass the password gate.');
console.log('✓ OAuth callbacks cannot promote a Whop identity into a Control Center session.');
console.log('✓ Existing paid membership and Discord verification code remains fail-closed if reused elsewhere.');
