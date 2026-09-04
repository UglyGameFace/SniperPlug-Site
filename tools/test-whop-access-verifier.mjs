import assert from 'node:assert/strict';
import { enforceLiveWhopAccess } from '../functions/_lib/access-truth.js';

const originalFetch = globalThis.fetch;
const requests = [];

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  requests.push({ url: url.toString(), authorization: init?.headers?.authorization || init?.headers?.Authorization || '' });
  assert.equal(url.pathname, '/api/v1/memberships', `Access verification must use the memberships endpoint, not ${url.pathname}.`);
  assert.equal(init?.headers?.authorization, 'Bearer test-access-token');

  return new Response(JSON.stringify({
    data: [
      {
        id: 'mem_live_1',
        status: 'active',
        joined_at: '2026-09-01T12:00:00.000Z',
        company: { id: 'biz_live', title: 'Live Group' },
        product: { id: 'prod_live', title: 'Live Product' },
        member: { id: 'mber_live' },
        user: { id: 'user_owner' },
      },
      {
        id: 'mem_live_2',
        status: 'trialing',
        joined_at: '2026-09-02T12:00:00.000Z',
        company: { id: 'biz_live', title: 'Live Group' },
        product: { id: 'prod_trial', title: 'Trial Product' },
        member: { id: 'mber_live' },
        user: { id: 'user_owner' },
      },
      {
        id: 'mem_left',
        status: 'completed',
        cancelation_status: 'left',
        joined_at: '2026-08-01T12:00:00.000Z',
        company: { id: 'biz_old', title: 'Old Group' },
        product: { id: 'prod_old', title: 'Old Product' },
        member: { id: 'mber_old' },
        user: { id: 'user_owner' },
      },
    ],
    page_info: {
      has_next_page: false,
      end_cursor: null,
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

try {
  const discovery = {
    groups: [
      {
        company: { id: 'biz_live', title: 'Live Group' },
        sources: [
          {
            experience: { id: 'exp_live' },
            capability: { sourceType: 'course' },
            source: { decision: 'approved' },
          },
        ],
        externalApps: [
          {
            experience: { id: 'exp_custom' },
            capability: { sourceType: 'unsupported' },
          },
        ],
      },
      {
        company: { id: 'biz_old', title: 'Old Group' },
        sources: [
          {
            experience: { id: 'exp_old' },
            capability: { sourceType: 'forum' },
            source: { decision: 'approved' },
          },
        ],
        externalApps: [],
      },
    ],
    counts: {
      groups: 2,
      sources: 2,
      courses: 1,
      forums: 1,
      externalApps: 1,
      approved: 2,
    },
  };

  const result = await enforceLiveWhopAccess({
    accessToken: 'test-access-token',
    profile: { sub: 'user_owner', name: 'Owner' },
  }, discovery);

  assert.equal(requests.length, 1, 'Access verification should need one paginated membership request for this fixture.');
  assert.ok(!requests.some((request) => new URL(request.url).pathname.includes('/members/')), 'The verifier must never require the phone-gated member-detail endpoint.');
  assert.equal(result.accessVerification, 'membership-list');
  assert.equal(result.groups.length, 1, 'Only companies with a current access-granting membership should remain.');
  assert.equal(result.groups[0].company.id, 'biz_live');
  assert.equal(result.counts.groups, 1);
  assert.equal(result.counts.sources, 1);
  assert.equal(result.counts.courses, 1);
  assert.equal(result.counts.forums, 0);
  assert.equal(result.counts.externalApps, 1, 'Custom app modules must remain visible when membership access is valid.');
  assert.equal(result.counts.deniedGroups, 1);
  assert.equal(result.accessChecks.length, 2);

  const liveCheck = result.accessChecks.find((check) => check.companyId === 'biz_live');
  assert.equal(liveCheck?.granted, true);
  assert.equal(liveCheck?.verifiedBy, 'membership-list');
  assert.deepEqual(liveCheck?.memberships.map((membership) => membership.status).sort(), ['active', 'trialing']);
  assert.ok(!JSON.stringify(result.accessChecks).includes('email'), 'Access diagnostics must not expose membership email data.');

  const oldCheck = result.accessChecks.find((check) => check.companyId === 'biz_old');
  assert.equal(oldCheck?.granted, false, 'Explicitly left historical memberships must not restore access.');

  console.log('\nWHOP ACCESS VERIFIER REGRESSION PASSED\n');
  console.log('✓ Live access is verified from the OAuth-authorized memberships endpoint.');
  console.log('✓ No member-detail request can introduce the unrelated member:phone:read requirement.');
  console.log('✓ Current memberships keep native and custom-app experiences visible; explicitly left history stays denied.');
} finally {
  globalThis.fetch = originalFetch;
}
