import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OWNER_PRINCIPAL_ID,
  createSubscriberSession,
  readAccountSession,
  readAdminSession,
  subscriberPrincipalIdForUser,
  whopUserIdFromProfile,
} from '../functions/_lib/auth.js';
import {
  clearSubscriberEntitlementCacheForTests,
  subscriberProductId,
  verifySubscriberEntitlement,
} from '../functions/_lib/subscriber-auth.js';
import {
  clearSubscriberWhopOAuthFlowCookie,
  resolveWhopOAuthFlow,
  subscriberWhopOAuthFlowCookie,
  whopOAuthFlowCookie,
} from '../functions/_lib/whop-oauth-flow.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const secretEnv = { SNIPERPLUG_SESSION_SECRET: 'test-session-secret-with-enough-entropy' };

assert.equal(whopUserIdFromProfile({ sub: 'user_paid_alpha' }), 'user_paid_alpha');
assert.equal(whopUserIdFromProfile({ id: 'user_paid_compat' }), 'user_paid_compat');
assert.equal(whopUserIdFromProfile({ sub: 'not-a-user', id: 'also-wrong', email: 'person@example.com' }), '');
assert.equal(subscriberPrincipalIdForUser('user_paid_alpha'), 'whop-user:user_paid_alpha');
assert.throws(() => subscriberPrincipalIdForUser('person@example.com'), /stable user identity/i);

const first = await createSubscriberSession(secretEnv, { sub: 'user_paid_alpha', email: 'first@example.com' });
const second = await createSubscriberSession(secretEnv, { sub: 'user_paid_alpha', email: 'changed@example.com' });
assert.equal(first.session.principalId, 'whop-user:user_paid_alpha');
assert.equal(second.session.principalId, first.session.principalId, 'The same Whop user must map to one stable subscriber principal across devices.');
assert.notEqual(first.session.browserSid, second.session.browserSid, 'Two subscriber browser sessions must not collapse into one browser-session identifier.');
assert.equal(first.session.kind, 'subscriber');
assert.equal(first.session.v, 5);
assert.equal(first.session.whopUserId, 'user_paid_alpha');
assert.ok(!JSON.stringify(first.session).includes('first@example.com'), 'Subscriber application sessions must not use or persist email as identity.');

const cookiePair = first.cookie.split(';', 1)[0];
const subscriberRequest = new Request('https://sniperplug.com/api/control?action=session', { headers: { cookie: cookiePair } });
const subscriberRead = await readAccountSession(subscriberRequest, secretEnv);
assert.equal(subscriberRead?.principalId, first.session.principalId);
assert.equal(subscriberRead?.kind, 'subscriber');
assert.equal(await readAdminSession(subscriberRequest, secretEnv), null, 'Owner-only authentication must never accept a paid subscriber cookie.');

assert.equal(subscriberProductId({ WHOP_IMPORTER_PRODUCT_ID: 'prod_sniperplug_paid' }), 'prod_sniperplug_paid');
assert.throws(
  () => subscriberProductId({}),
  (error) => Number(error?.status) === 503 && error?.details?.code === 'subscriber_product_unconfigured',
  'Missing paid product configuration must fail closed without affecting owner authentication.',
);
assert.throws(() => subscriberProductId({ WHOP_IMPORTER_PRODUCT_ID: 'membership_123' }), /exact Whop product ID/i);

const originalFetch = globalThis.fetch;
async function withMembershipResponse(body, status = 200, work) {
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.whop.com');
    assert.equal(url.pathname, '/api/v1/memberships');
    calls += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  clearSubscriberEntitlementCacheForTests();
  try {
    return await work(() => calls);
  } finally {
    globalThis.fetch = originalFetch;
    clearSubscriberEntitlementCacheForTests();
  }
}

const whopSession = {
  accessToken: 'subscriber-access-token',
  tokenVersion: 7,
  profile: { sub: 'user_paid_alpha' },
};
const entitlementEnv = { WHOP_IMPORTER_PRODUCT_ID: 'prod_sniperplug_paid' };

await withMembershipResponse({
  data: [{ id: 'mem_paid', status: 'active', cancelation_status: null, product: { id: 'prod_sniperplug_paid' }, user: { id: 'user_paid_alpha' } }],
  page_info: { has_next_page: false },
}, 200, async (calls) => {
  const entitlement = await verifySubscriberEntitlement(whopSession, entitlementEnv);
  assert.equal(entitlement.productId, 'prod_sniperplug_paid');
  assert.equal(entitlement.membershipId, 'mem_paid');
  assert.equal(entitlement.status, 'active');
  const cached = await verifySubscriberEntitlement(whopSession, entitlementEnv);
  assert.equal(cached.membershipId, 'mem_paid');
  assert.equal(calls(), 1, 'A short entitlement cache should prevent duplicate Whop membership reads inside one burst.');
});

await withMembershipResponse({
  data: [{ id: 'mem_wrong', status: 'active', product: { id: 'prod_other' }, user: { id: 'user_paid_alpha' } }],
  page_info: { has_next_page: false },
}, 200, async () => {
  await assert.rejects(
    verifySubscriberEntitlement(whopSession, entitlementEnv),
    (error) => Number(error?.status) === 403 && error?.details?.code === 'subscriber_entitlement_required',
    'A different Whop product must not unlock the subscriber importer.',
  );
});

await withMembershipResponse({
  data: [{ id: 'mem_left', status: 'active', cancelation_status: 'left', product: { id: 'prod_sniperplug_paid' }, user: { id: 'user_paid_alpha' } }],
  page_info: { has_next_page: false },
}, 200, async () => {
  await assert.rejects(
    verifySubscriberEntitlement(whopSession, entitlementEnv),
    (error) => Number(error?.status) === 403 && error?.details?.code === 'subscriber_entitlement_required',
    'A membership that has left the product must not retain importer access.',
  );
});

await withMembershipResponse({ message: 'temporary upstream problem' }, 400, async () => {
  await assert.rejects(
    verifySubscriberEntitlement(whopSession, entitlementEnv),
    (error) => Number(error?.status) === 503 && error?.details?.code === 'subscriber_entitlement_unavailable',
    'A billing verification failure must lock subscriber access rather than guessing.',
  );
});

const ownerState = 'owner_state_123';
const subscriberState = 'subscriber_state_456';
const ownerCookie = whopOAuthFlowCookie(ownerState);
const subscriberCookie = subscriberWhopOAuthFlowCookie(subscriberState);
assert.ok(ownerCookie.includes('SameSite=Lax') && subscriberCookie.includes('SameSite=Lax'));
assert.ok(ownerCookie.includes('Path=/api/whop/oauth/callback') && subscriberCookie.includes('Path=/api/whop/oauth/callback'));
assert.notEqual(ownerCookie.split('=', 1)[0], subscriberCookie.split('=', 1)[0], 'Owner and subscriber OAuth callbacks need separate browser correlation cookies.');
assert.ok(clearSubscriberWhopOAuthFlowCookie().includes('Max-Age=0'));
assert.deepEqual(
  await resolveWhopOAuthFlow(new Request(`https://sniperplug.com/api/whop/oauth/callback?state=${subscriberState}`, {
    headers: { cookie: `sniperplug_subscriber_oauth=${subscriberState}` },
  })),
  { kind: 'subscriber', state: subscriberState },
);
await assert.rejects(
  resolveWhopOAuthFlow(new Request(`https://sniperplug.com/api/whop/oauth/callback?state=${subscriberState}`, {
    headers: { cookie: `sniperplug_subscriber_oauth=${subscriberState}; sniperplug_whop_oauth=${subscriberState}` },
  })),
  (error) => Number(error?.status) === 401 && error?.details?.code === 'whop_oauth_flow_ambiguous',
  'A callback matching both browser flows must fail closed.',
);

const auth = read('functions/_lib/auth.js');
const subscriberAuth = read('functions/_lib/subscriber-auth.js');
const subscriberStart = read('functions/api/subscriber/oauth/start.js');
const callback = read('functions/api/whop/oauth/callback.js');
const control = read('functions/api/control.js');
const discover = read('functions/api/discover.js');
const bulk = read('functions/api/bulk-jobs.js');
const capture = read('functions/api/browser-capture.js');
const backups = read('functions/api/whop-backups.js');
const recovery = read('functions/api/guide-repair.js');
const mediaRepair = read('functions/api/guide-media-repair.js');
const safeSave = read('functions/api/guide-save-safe.js');
const recent = read('functions/api/recent-actions.js');
const bulkReset = read('functions/api/bulk-job-reset.js');
const publishReady = read('functions/api/publish-ready.js');
const ownerWhopStart = read('functions/api/whop/oauth/start.js');
const privateGuides = read('functions/_lib/private-guides.js');
const page = read('control-center/index.html');
const subscriberUi = read('assets/js/control-center-subscriber.js');
const journeyCss = read('assets/css/control-center-journey.css');
const example = read('.dev.vars.example');

assert.ok(auth.includes("SUBSCRIBER_PRINCIPAL_PREFIX = 'whop-user:'"));
assert.ok(auth.includes("kind: 'subscriber'") && auth.includes('v: 5'));
assert.ok(auth.includes('readAdminSession') && auth.includes("return session?.kind === 'owner' ? session : null"), 'Owner-only auth no longer excludes subscriber sessions.');
assert.ok(subscriberAuth.includes('requireControlAccount') && subscriberAuth.includes('verifySubscriberAccountAccess'));
assert.ok(subscriberAuth.includes('subscriberPrincipalIdForUser(whopUserId) !== account.principalId'), 'Subscriber account access does not rebind Whop identity to the stable principal.');
assert.ok(subscriberAuth.includes('membershipGrantsAccess(entry)') && subscriberAuth.includes('membershipProductId(entry) === productId'));
assert.ok(!subscriberAuth.includes('email') && !subscriberAuth.includes('DISCORD') && !subscriberAuth.includes('WHOP_API_KEY'), 'Subscriber access restored obsolete email/Discord/server-key identity coupling.');
assert.ok(!existsSync(join(root, 'functions/_lib/paid-access.js')) && !existsSync(join(root, 'functions/api/importer-login.js')));
assert.ok(!auth.includes('customer-pending') && !subscriberAuth.includes('customer-pending'));

assert.ok(subscriberStart.includes('beginSubscriberWhopOAuth(context.request, context.env)'));
assert.ok(subscriberStart.includes('subscriberWhopOAuthFlowCookie(state)'));
assert.ok(!subscriberStart.includes('requireAdmin('), 'Paid subscriber OAuth still requires the owner password.');
assert.ok(callback.includes('resolveWhopOAuthFlow(context.request)'));
assert.ok(callback.includes("flow.kind === 'subscriber'") && callback.includes('finishSubscriberWhopOAuth'));
assert.ok(callback.includes('createSubscriberSession(context.env, completed.profile)'));
assert.ok(callback.includes('clearSubscriberWhopOAuthFlowCookie()') && callback.includes('clearWhopOAuthFlowCookie()'));

for (const [name, text] of Object.entries({ discover, bulk, capture, backups, recovery, mediaRepair, safeSave, recent, bulkReset })) {
  assert.ok(text.includes('requireControlAccount(context.request, context.env)'), `${name} is not routed through current paid entitlement verification.`);
}
assert.ok(control.includes('requireControlAccount(request, env)') && control.includes('requireControlAccount(context.request, context.env)'));
assert.ok(control.includes("status === 'published') requireOwnerPrincipal"), 'Individual public publication is not explicitly owner-only before mutation.');
assert.ok(control.includes("requireOwnerPrincipal(admin, 'change the shared guide category catalog')"), 'Shared category mutation is not owner-only.');
assert.ok(publishReady.includes('requireAdmin(context.request, context.env)'), 'Bulk public publishing is no longer owner-authenticated.');
assert.ok(ownerWhopStart.includes('requireAdmin(context.request, context.env)'), 'Owner Whop connection can be started from a subscriber application session.');
assert.ok(privateGuides.includes('requirePrivateGuideOwner') && privateGuides.includes("session.kind !== 'owner'"), 'Owner private guide library was opened to subscribers.');

assert.ok(page.includes('href="/api/subscriber/oauth/start" data-subscriber-login'));
assert.ok(page.includes('data-subscriber-workspace'));
assert.ok(page.includes('/assets/js/control-center-subscriber.js?v=20260906.1'));
for (const ownerOnly of ['data-publish-guide data-owner-only', 'data-publish-all-ready data-owner-only', 'id="category-registry" data-owner-only']) {
  assert.ok(page.includes(ownerOnly), `Control Center is missing an owner-only presentation boundary: ${ownerOnly}`);
}
assert.ok(subscriberUi.includes('data-sniperplug-account-kind') && subscriberUi.includes('subscriberCopy'));
assert.ok(!subscriberUi.includes("document.createElement('style')"), 'Subscriber runtime injects a competing presentation stylesheet.');
assert.ok(journeyCss.includes('html[data-sniperplug-account-kind="subscriber"] [data-owner-only]') && journeyCss.includes('.subscriber-login-card'), 'Subscriber presentation is not owned by the canonical Control Center stylesheet.');
assert.ok(subscriberUi.includes('Subscriber workspaces never publish to the public SniperPlug guide site.'));
assert.ok(!subscriberUi.includes('MutationObserver'), 'Subscriber presentation added a broad DOM observer instead of using existing lifecycle events.');
assert.ok(example.includes('WHOP_IMPORTER_PRODUCT_ID=prod_'));
assert.ok(!example.includes('DISCORD_BOT_TOKEN') && !example.includes('SNIPERPLUG_REQUIRED_DISCORD_GUILD_IDS') && !example.includes('WHOP_API_KEY='));
assert.equal(OWNER_PRINCIPAL_ID, 'sniperplug-owner');

console.log('\nPAID SUBSCRIBER ONBOARDING REGRESSION PASSED\n');
console.log('✓ Whop OIDC user identity maps to a stable tenant principal while browser sessions stay independent.');
console.log('✓ Exact current product entitlement is required and verification failures lock access.');
console.log('✓ Subscriber OAuth has its own one-time callback correlation and cannot require the owner password.');
console.log('✓ Import, capture, recovery, backup, and bulk routes reverify subscriber access while public publishing stays owner-only.');
console.log('✓ Account presentation is bounded and styled by the canonical Control Center CSS rather than injected runtime CSS.');
