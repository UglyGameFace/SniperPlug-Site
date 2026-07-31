import assert from 'node:assert/strict';
import { createAdminSession } from '../functions/_lib/auth.js';
import {
  PrivateGuideAuthError,
  privateGuidePageGate,
  requirePrivateGuideOwner,
} from '../functions/_lib/private-guides.js';

const env = {
  SNIPERPLUG_SESSION_SECRET: 'private-guide-test-session-secret-2026',
};

function requestWithCookie(cookie = '') {
  return new Request('https://sniperplug.com/guides/', {
    headers: cookie ? { cookie } : {},
  });
}

function cookiePair(setCookie) {
  return String(setCookie || '').split(';', 1)[0];
}

await assert.rejects(
  () => requirePrivateGuideOwner(requestWithCookie(), env),
  (error) => error instanceof PrivateGuideAuthError
    && error.status === 401
    && error.details?.code === 'PRIVATE_GUIDE_OWNER_REQUIRED'
    && /Control Center/i.test(error.message),
  'Anonymous guide access should require the Control Center session.',
);

const owner = await createAdminSession(env);
const ownerRequest = requestWithCookie(cookiePair(owner.cookie));
const ownerSession = await requirePrivateGuideOwner(ownerRequest, env);
assert.equal(ownerSession.kind, 'owner');
assert.equal(await privateGuidePageGate(ownerRequest, env), null, 'Owner session should pass the private guide gate.');

const customer = await createAdminSession(env, {
  sid: 'customer-test-session',
  kind: 'customer-pending',
  whopUserId: 'user_test',
});
const customerRequest = requestWithCookie(cookiePair(customer.cookie));
await assert.rejects(
  () => requirePrivateGuideOwner(customerRequest, env),
  (error) => error instanceof PrivateGuideAuthError
    && error.status === 403
    && error.details?.code === 'PRIVATE_GUIDE_OWNER_REQUIRED'
    && /owner/i.test(error.message),
  'Customer importer sessions must not open owner-only guides.',
);

const anonymousGate = await privateGuidePageGate(requestWithCookie(), env);
assert.equal(anonymousGate.status, 401);
assert.match(anonymousGate.headers.get('cache-control') || '', /private, no-store/);
assert.match(anonymousGate.headers.get('x-robots-tag') || '', /noindex/);
const anonymousHtml = await anonymousGate.text();
assert.match(anonymousHtml, /same password you already use for the SniperPlug Control Center/i);
assert.match(anonymousHtml, /private-guides-login\.js/);
assert.match(anonymousHtml, /<form method="post" action="\/api\/control\?action=session" data-private-guide-login-form>/i);
assert.match(anonymousHtml, /<noscript>/i);
assert.doesNotMatch(anonymousHtml, /<form(?![^>]*method="post")[^>]*data-private-guide-login-form/i);
assert.doesNotMatch(anonymousHtml, /Sports betting|Casino|Auto checkout|Crypto and trading/i);

const customerGate = await privateGuidePageGate(customerRequest, env);
assert.equal(customerGate.status, 403);
assert.match(await customerGate.text(), /owner Control Center password/i);

console.log('\nSNIPERPLUG PRIVATE GUIDE AUTH TEST PASSED\n');
console.log('✓ Anonymous requests receive the private lock page.');
console.log('✓ Owner sessions use the existing Control Center cookie.');
console.log('✓ Customer importer sessions cannot reach the owner guide library.');
console.log('✓ The fallback form cannot place the Control Center password in the URL.');
