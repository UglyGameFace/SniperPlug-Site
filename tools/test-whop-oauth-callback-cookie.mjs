import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearWhopOAuthFlowCookie,
  requireWhopOAuthFlow,
  whopOAuthFlowCookie,
} from '../functions/_lib/whop-oauth-flow.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const start = readFileSync(join(root, 'functions/api/whop/oauth/start.js'), 'utf8');
const callback = readFileSync(join(root, 'functions/api/whop/oauth/callback.js'), 'utf8');
const auth = readFileSync(join(root, 'functions/_lib/auth.js'), 'utf8');

const state = 'oauth_state_exact_123';
const cookie = whopOAuthFlowCookie(state);
assert.ok(cookie.startsWith(`sniperplug_whop_oauth=${state};`));
assert.ok(cookie.includes('HttpOnly'));
assert.ok(cookie.includes('Secure'));
assert.ok(cookie.includes('SameSite=Lax'));
assert.ok(cookie.includes('Path=/api/whop/oauth/callback'));
assert.ok(cookie.includes('Max-Age=600'));
assert.ok(clearWhopOAuthFlowCookie().includes('Max-Age=0'));

const callbackRequest = new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${state}`, {
  headers: {
    cookie: `sniperplug_whop_oauth=${state}`,
  },
});
assert.equal(await requireWhopOAuthFlow(callbackRequest), state, 'A Whop top-level callback must succeed without the Strict admin cookie when its OAuth-only state cookie matches.');

await assert.rejects(
  requireWhopOAuthFlow(new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${state}`)),
  (error) => Number(error?.status) === 401,
  'A callback without the OAuth-only correlation cookie must fail closed.',
);
await assert.rejects(
  requireWhopOAuthFlow(new Request(`https://sniperplug.com/api/whop/oauth/callback?code=abc&state=${state}`, {
    headers: { cookie: 'sniperplug_whop_oauth=wrong_state' },
  })),
  (error) => Number(error?.status) === 401,
  'A callback with a mismatched OAuth state cookie must fail closed.',
);

assert.ok(auth.includes("secureCookie(ADMIN_COOKIE, `${payload}.${signature}`, ADMIN_TTL_SECONDS)"), 'The owner session cookie implementation unexpectedly changed.');
assert.ok(start.includes('appendCookie(redirect(authorizationUrl), whopOAuthFlowCookie(state))'), 'OAuth start does not issue the transient callback cookie before leaving SniperPlug.');
assert.ok(callback.includes('await requireWhopOAuthFlow(context.request)'), 'OAuth callback does not bind the return to the transient state cookie.');
assert.ok(!callback.includes('requireAdmin(context.request, context.env)'), 'OAuth callback still requires the SameSite=Strict owner cookie on the cross-site return.');
assert.ok(callback.includes('result.adminSessionId !== OWNER_SESSION_ID'), 'OAuth callback no longer verifies the pending flow belongs to the canonical owner session.');
assert.ok(callback.includes('clearWhopOAuthFlowCookie()'), 'OAuth callback does not clear the one-time correlation cookie.');

console.log('\nWHOP OAUTH CALLBACK COOKIE REGRESSION PASSED\n');
console.log('✓ Owner session remains Strict while a narrow Lax callback cookie survives Whop’s top-level return.');
console.log('✓ Matching OAuth state succeeds without the owner cookie; missing or mismatched state fails closed.');
console.log('✓ Callback still accepts only OAuth state bound to the canonical SniperPlug owner session.');
