import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  clearWhopSwitchIntentCookie,
  readWhopSwitchIntent,
  whopSwitchIntentCookie,
  whopSwitchReturnedSameAccount,
} from '../functions/_lib/whop-switch-intent.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const env = { SNIPERPLUG_SESSION_SECRET: 'test-switch-secret-that-is-not-production' };
const account = {
  sid: 'sniperplug-owner',
  principalId: 'sniperplug-owner',
  kind: 'owner',
};
const oldProfile = { sub: 'user_old_account' };
const newProfile = { sub: 'user_new_account' };

const setCookie = await whopSwitchIntentCookie(env, account, oldProfile);
assert.match(setCookie, /^sniperplug_whop_switch_intent=/);
assert.match(setCookie, /Path=\/api\/whop\/oauth\/callback/);
assert.match(setCookie, /HttpOnly/);
assert.match(setCookie, /Secure/);
assert.match(setCookie, /SameSite=Lax/);
assert.match(setCookie, /Max-Age=600/);

const cookiePair = setCookie.split(';', 1)[0];
const request = new Request('https://sniperplug.com/api/whop/oauth/callback?code=test&state=test', {
  headers: { cookie: cookiePair },
});
const intent = await readWhopSwitchIntent(request, env);
assert.equal(intent.previousWhopUserId, 'user_old_account');
assert.equal(intent.previousPrincipalId, 'sniperplug-owner');
assert.equal(intent.accountKind, 'owner');
assert.equal(whopSwitchReturnedSameAccount(intent, oldProfile, 'owner'), true);
assert.equal(whopSwitchReturnedSameAccount(intent, newProfile, 'owner'), false);
assert.equal(whopSwitchReturnedSameAccount(intent, oldProfile, 'subscriber'), false);

const [cookieName, cookieValue] = cookiePair.split('=', 2);
const tamperedValue = `${cookieValue.slice(0, -1)}${cookieValue.endsWith('a') ? 'b' : 'a'}`;
const tamperedRequest = new Request(request.url, {
  headers: { cookie: `${cookieName}=${tamperedValue}` },
});
assert.equal(await readWhopSwitchIntent(tamperedRequest, env), null, 'Tampered switch intent must not be trusted.');

const clearCookie = clearWhopSwitchIntentCookie();
assert.match(clearCookie, /^sniperplug_whop_switch_intent=/);
assert.match(clearCookie, /Max-Age=0/);
assert.match(clearCookie, /Path=\/api\/whop\/oauth\/callback/);

console.log('\nSNIPERPLUG WHOP ACCOUNT SWITCH GUARD TEST PASSED\n');
console.log('✓ A deliberate switch remembers the Whop identity being left.');
console.log('✓ The same identity is rejected while a different Whop identity is allowed.');
console.log('✓ The browser switch intent is signed, callback-scoped, short-lived, and tamper-resistant.');
