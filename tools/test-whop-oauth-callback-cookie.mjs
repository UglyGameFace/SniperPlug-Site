import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearSubscriberWhopOAuthFlowCookie,
  clearWhopOAuthFlowCookie,
  requireSubscriberWhopOAuthFlow,
  requireWhopOAuthFlow,
  resolveWhopOAuthFlow,
  subscriberWhopOAuthFlowCookie,
  whopOAuthFlowCookie,
} from '../functions/_lib/whop-oauth-flow.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const start = readFileSync(join(root, 'functions/api/whop/oauth/start.js'), 'utf8');
const subscriberStart = readFileSync(join(root, 'functions/api/subscriber/oauth/start.js'), 'utf8');
const callback = readFileSync(join(root, 'functions/api/whop/oauth/callback.js'), 'utf8');
const auth = readFileSync(join(root, 'functions/_lib/auth.js'), 'utf8');
const whop = readFileSync(join(root, 'functions/_lib/whop.js'), 'utf8');

const ownerState = 'oauth_owner_state_exact_123';
const subscriberState = 'oauth_subscriber_state_exact_456';
const ownerCookie = whopOAuthFlowCookie(ownerState);
const subscriberCookie = subscriberWhopOAuthFlowCookie(subscriberState);
for (const cookie of [ownerCookie, subscriberCookie]) {
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Path=/api/whop/oauth/callback'));
  assert.ok(cookie.includes('Max-Age=600'));
}
assert.ok(ownerCookie.startsWith(`sniperplug_whop_oauth=${ownerState};`));
assert.ok(subscriberCookie.startsWith(`sniperplug_subscriber_oauth=${subscriberState};`));
assert.ok(clearWhopOAuthFlowCookie().includes('Max-Age=0'));
assert.ok(clearSubscriberWhopOAuthFlowCookie().includes('Max-Age=0'));

const ownerRequest = new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${ownerState}`, {
  headers: { cookie: `sniperplug_whop_oauth=${ownerState}` },
});
assert.equal(await requireWhopOAuthFlow(ownerRequest), ownerState, 'Owner Whop return must succeed without the Strict application cookie when its owner-flow state cookie matches.');
assert.deepEqual(await resolveWhopOAuthFlow(ownerRequest), { kind: 'account-connection', state: ownerState });

const subscriberRequest = new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${subscriberState}`, {
  headers: { cookie: `sniperplug_subscriber_oauth=${subscriberState}` },
});
assert.equal(await requireSubscriberWhopOAuthFlow(subscriberRequest), subscriberState, 'Subscriber Whop return must use its own transient correlation cookie.');
assert.deepEqual(await resolveWhopOAuthFlow(subscriberRequest), { kind: 'subscriber', state: subscriberState });

for (const request of [
  new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${ownerState}`),
  new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${ownerState}`, {
    headers: { cookie: 'sniperplug_whop_oauth=wrong_state' },
  }),
]) {
  await assert.rejects(
    requireWhopOAuthFlow(request),
    (error) => Number(error?.status) === 401,
    'An owner callback without its exact OAuth-only correlation cookie must fail closed.',
  );
}

await assert.rejects(
  requireSubscriberWhopOAuthFlow(new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${subscriberState}`, {
    headers: { cookie: `sniperplug_whop_oauth=${subscriberState}` },
  })),
  (error) => Number(error?.status) === 401,
  'An owner-flow cookie must not authenticate a paid-subscriber callback.',
);
await assert.rejects(
  resolveWhopOAuthFlow(new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${subscriberState}`, {
    headers: { cookie: `sniperplug_whop_oauth=${subscriberState}; sniperplug_subscriber_oauth=${subscriberState}` },
  })),
  (error) => Number(error?.status) === 401 && error?.details?.code === 'whop_oauth_flow_ambiguous',
  'A callback that matches both flow cookies must fail closed instead of guessing which account type to create.',
);

assert.ok(auth.includes('secureCookie(ADMIN_COOKIE, `${payload}.${signature}`, ACCOUNT_TTL_SECONDS)'), 'The application session cookie implementation unexpectedly changed.');
assert.ok(start.includes('appendCookie(redirect(authorizationUrl), whopOAuthFlowCookie(state))'), 'Owner OAuth start does not issue its transient callback cookie before leaving SniperPlug.');
assert.ok(start.includes('beginWhopOAuth(context.request, context.env, admin)'), 'Owner OAuth start no longer binds pending D1 state to the authenticated owner principal.');
assert.ok(subscriberStart.includes('appendCookie(redirect(authorizationUrl), subscriberWhopOAuthFlowCookie(state))'), 'Subscriber OAuth start does not issue its distinct transient callback cookie.');
assert.ok(!subscriberStart.includes('requireAdmin('), 'Subscriber OAuth still requires the owner application session.');
assert.ok(callback.includes('await resolveWhopOAuthFlow(context.request)'), 'OAuth callback does not resolve the exact browser flow before token exchange.');
assert.ok(callback.includes("flow.kind === 'subscriber'") && callback.includes('finishSubscriberWhopOAuth(context.request, context.env)'), 'Subscriber callback no longer uses the entitlement-gated bootstrap path.');
assert.ok(callback.includes('await finishWhopOAuth(context.request, context.env)'), 'Owner OAuth callback no longer resolves the D1 state row that carries the authenticated owner principal into token storage.');
assert.ok(!callback.includes('requireAdmin(context.request, context.env)'), 'OAuth callback still requires the SameSite=Strict application cookie on the cross-site return.');
assert.ok(!callback.includes('OWNER_SESSION_ID') && !callback.includes('purgeLegacyWhopSessions'), 'OAuth callback can still collapse an account flow onto one legacy owner identity.');
assert.ok(whop.includes('INSERT INTO whop_oauth_states') && whop.includes('adminSession.sid'), 'OAuth start no longer stores the account principal in pending D1 state.');
assert.ok(whop.includes('pending.admin_session_id') && whop.includes('INSERT INTO whop_sessions'), 'OAuth callback no longer writes the Whop token under the principal carried by the pending state row.');
assert.ok(callback.includes('clearWhopOAuthFlowCookie()') && callback.includes('clearSubscriberWhopOAuthFlowCookie()'), 'OAuth callback does not clear both one-time correlation cookies after use.');

console.log('\nWHOP OAUTH CALLBACK COOKIE REGRESSION PASSED\n');
console.log('✓ Application sessions remain Strict while narrow Lax callback cookies survive Whop’s top-level return.');
console.log('✓ Owner connection and paid-subscriber sign-in use separate browser correlation cookies and ambiguous callbacks fail closed.');
console.log('✓ The account principal is carried through D1 OAuth state instead of being replaced by a global owner id.');
