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
const callback = read('functions/api/whop/oauth/callback.js');
const middleware = read('functions/_middleware.js');
const flash = read('assets/js/control-center-whop-flash.js');
const guard = read('assets/js/control-center-network-guard.js');
const example = read('.dev.vars.example');

for (const setting of ['WHOP_IMPORTER_PRODUCT_ID', 'WHOP_API_KEY', 'SNIPERPLUG_REQUIRED_DISCORD_GUILD_IDS', 'DISCORD_BOT_TOKEN']) {
  assert.ok(access.includes(setting), `${setting} is not enforced by paid access.`);
  assert.ok(example.includes(setting), `${setting} is missing from the deployment example.`);
}
assert.ok(access.includes('/memberships') && access.includes("['active', 'trialing', 'completed']"), 'Current paid membership is not verified server-side.');
assert.ok(access.includes('/social_accounts') && access.includes("service || '').toLowerCase() === 'discord'"), 'The Discord identity linked to Whop is not resolved server-side.');
assert.ok(access.includes('/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}'), 'Live Discord guild membership is not checked.');
assert.ok(access.includes("code: 'paid_access_discord_membership_required'"), 'Missing required Discord membership does not fail clearly.');
assert.ok(access.includes('Access remains locked') && !access.includes('allowed: true'), 'Temporary entitlement failures may fail open.');

assert.ok(auth.includes("session.kind === 'customer-pending'") && auth.includes("code: 'customer_oauth_pending'"), 'An unfinished customer OAuth session can still enter general Control Center APIs.');
assert.ok(!auth.includes("if (session.kind === 'customer-pending') return session"), 'Pending customer OAuth still bypasses paid-access authorization.');
assert.ok(auth.includes('assertPaidImporterAccess(request, env, session)'), 'Customer API requests do not re-check paid access.');
assert.ok(auth.includes("kind: 'owner'"), 'The private owner fallback is not explicit.');
assert.ok(login.includes("kind: 'customer-pending'") && login.includes('beginWhopOAuth(context.request, context.env, result.session)'), 'Customer login does not bootstrap OAuth directly inside its isolated pending session.');
assert.ok(!login.includes('/api/control?action=oauth-start'), 'Pending customer sessions still depend on a general Control Center authorization bypass.');
assert.ok(callback.includes('profile?.sub || profile?.id'), 'OAuth userinfo does not accept the OIDC `sub` user identifier returned by Whop.');
assert.ok(callback.includes('whop-user:${userId}') && callback.includes("kind: 'customer'"), 'OAuth completion is not bound to the exact Whop user.');
assert.ok(callback.includes('DELETE FROM whop_sessions WHERE admin_session_id = ?'), 'Temporary customer OAuth sessions are not removed after promotion.');
assert.ok(callback.includes("browserSession?.kind !== 'customer-pending'") && callback.includes('disconnectWhop') && callback.includes('clearAdminSession()'), 'Failed customer OAuth can leave a pending cookie or encrypted Whop session behind.');
assert.ok(guard.includes('/api/importer-login') && guard.includes('Private owner password'), 'The customer Whop login and owner fallback are not clearly separated in the UI.');

assert.ok(middleware.includes('/assets/js/control-center-whop-flash.js?v=20260811.1'), 'The one-shot OAuth callback status runtime is not injected before the Control Center runtime.');
assert.ok(flash.includes("url.searchParams.delete('whop')") && flash.includes("url.searchParams.delete('message')") && flash.includes('history.replaceState'), 'OAuth callback query state can replay forever after refresh.');
assert.ok(flash.includes("'sniperplug:dashboard-refreshed'") && flash.includes("whopState === 'connected'"), 'Callback messages are not reconciled against the current verified Whop connection.');
assert.ok(flash.includes("callbackState === 'error' && whopState === 'disconnected'"), 'A real current OAuth error is not preserved when Whop remains disconnected.');

for (const file of [
  'functions/_lib/paid-access.js',
  'functions/_lib/auth.js',
  'functions/_middleware.js',
  'functions/api/importer-login.js',
  'functions/api/whop/oauth/callback.js',
  'assets/js/control-center-whop-flash.js',
  'assets/js/control-center-network-guard.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG PAID IMPORTER ACCESS AUDIT PASSED\n');
console.log('✓ Customers sign in with individual Whop identities instead of sharing the owner password.');
console.log('✓ Whop OIDC userinfo binds customer sessions from the canonical `sub` identity.');
console.log('✓ Unfinished or failed customer OAuth cannot become a general Control Center session.');
console.log('✓ OAuth callback messages are one-shot and cannot contradict a currently verified connection after refresh.');
console.log('✓ Current importer-product access and linked Discord identity are verified server-side.');
console.log('✓ Every configured Discord server confirms live membership before customer access is allowed.');
console.log('✓ Revoked, expired, unlinked, departed, or unverifiable customers fail closed.');
