import assert from 'node:assert/strict';
import { clearWhopAppMetadataCacheForTests, inspectWhopApp } from '../functions/_lib/whop-app-reader.js';

const originalFetch = globalThis.fetch;
const session = { accessToken: 'test-user-oauth-token' };
const experience = {
  id: 'exp_make_money_here',
  app: {
    id: 'app_zv9yxan92U9fNy',
    name: 'Better Content',
  },
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

try {
  clearWhopAppMetadataCacheForTests();
  let calls = 0;
  globalThis.fetch = async (input, options = {}) => {
    calls += 1;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.whop.com');
    assert.equal(url.pathname, '/api/v1/apps', 'Custom-app metadata must use Whop’s user-OAuth-compatible app list, not developer-only /apps/{id}.');
    assert.equal(url.searchParams.get('query'), 'Better Content');
    assert.equal(url.searchParams.get('first'), '25');
    assert.equal(options.headers?.authorization, 'Bearer test-user-oauth-token');
    return jsonResponse({
      data: [
        {
          id: 'app_unrelated',
          name: 'Unrelated app',
          app_type: 'b2c_app',
          domain_id: 'unrelated',
          origin: 'https://unrelated.apps.whop.com/',
          experience_path: '/experiences/[experienceId]',
          openapi_path: null,
          skills_path: null,
          verified: false,
        },
        {
          id: 'app_zv9yxan92U9fNy',
          name: 'Better Content',
          app_type: 'b2c_app',
          domain_id: 'better-content',
          origin: 'https://better-content.apps.whop.com/',
          experience_path: '/experiences/[experienceId]',
          openapi_path: '/openapi.json',
          skills_path: '/skills/',
          verified: true,
        },
      ],
      page_info: { has_next_page: false, end_cursor: null },
    });
  };

  const metadata = await inspectWhopApp(session, experience);
  assert.equal(calls, 1, 'Custom app metadata should be resolved with one bounded public app-list request.');
  assert.equal(metadata.id, 'app_zv9yxan92U9fNy');
  assert.equal(metadata.name, 'Better Content');
  assert.equal(metadata.metadataSource, 'public-app-list');
  assert.equal(metadata.metadataStatus, 'resolved');
  assert.equal(metadata.hasOpenapiView, true);
  assert.equal(metadata.hasSkillsView, true);
  assert.equal(metadata.openapiUrl, 'https://better-content.apps.whop.com/openapi.json');
  assert.equal(metadata.skillsUrl, 'https://better-content.apps.whop.com/skills/');
  assert.equal(metadata.experienceUrl, 'https://better-content.apps.whop.com/experiences/exp_make_money_here');

  const cached = await inspectWhopApp(session, experience);
  assert.deepEqual(cached, metadata, 'The short-lived app metadata cache changed the resolved reader contract.');
  assert.equal(calls, 1, 'Repeated source cards should not fan out duplicate app-list requests.');

  clearWhopAppMetadataCacheForTests();
  globalThis.fetch = async () => jsonResponse({
    data: [{
      id: 'app_someone_else',
      name: 'Better Content Clone',
      app_type: 'b2c_app',
      origin: 'https://clone.apps.whop.com/',
      openapi_path: '/openapi.json',
      skills_path: '/skills/',
    }],
    page_info: { has_next_page: false, end_cursor: null },
  });
  const noExactMatch = await inspectWhopApp(session, experience);
  assert.equal(noExactMatch.metadataStatus, 'not-listed');
  assert.equal(noExactMatch.hasOpenapiView, false, 'SniperPlug must not borrow an OpenAPI contract from a similarly named app.');
  assert.equal(noExactMatch.hasSkillsView, false, 'SniperPlug must not borrow a Skills contract from a similarly named app.');
  assert.equal(noExactMatch.openapiUrl, null);
  assert.equal(noExactMatch.skillsUrl, null);

  clearWhopAppMetadataCacheForTests();
  globalThis.fetch = async () => jsonResponse({ message: 'Unauthorized' }, 401);
  const unavailable = await inspectWhopApp(session, experience);
  assert.equal(unavailable.metadataStatus, 'unavailable');
  assert.equal(unavailable.metadataSource, 'public-app-list');
  assert.equal(unavailable.hasOpenapiView, false);
  assert.equal(unavailable.hasSkillsView, false);

  console.log('\nWHOP CUSTOM APP READER METADATA TEST PASSED\n');
  console.log('✓ Customer OAuth resolves public app metadata through GET /apps, never developer-only GET /apps/{id}.');
  console.log('✓ Stable app ID matching prevents similarly named apps from supplying a false reader contract.');
  console.log('✓ Published OpenAPI and Skills paths are normalized to safe HTTPS URLs.');
  console.log('✓ Metadata lookup failure remains reader-unavailable and never becomes false membership denial.');
} finally {
  globalThis.fetch = originalFetch;
  clearWhopAppMetadataCacheForTests();
}
