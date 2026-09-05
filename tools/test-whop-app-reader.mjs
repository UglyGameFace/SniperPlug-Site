import assert from 'node:assert/strict';
import {
  BETTER_CONTENT_APP_ID,
  annotateWhopAppReaders,
  browserCaptureMatchesReader,
  clearWhopAppMetadataCacheForTests,
  inspectWhopApp,
  resolveWhopAppReader,
} from '../functions/_lib/whop-app-reader.js';

const originalFetch = globalThis.fetch;
const session = { accessToken: 'test-user-oauth-token' };
const experience = {
  id: 'exp_make_money_here',
  app: {
    id: BETTER_CONTENT_APP_ID,
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
          id: BETTER_CONTENT_APP_ID,
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
  assert.equal(metadata.id, BETTER_CONTENT_APP_ID);
  assert.equal(metadata.name, 'Better Content');
  assert.equal(metadata.metadataSource, 'public-app-list');
  assert.equal(metadata.metadataStatus, 'resolved');
  assert.equal(metadata.hasOpenapiView, true);
  assert.equal(metadata.hasSkillsView, true);
  assert.equal(metadata.openapiUrl, 'https://better-content.apps.whop.com/openapi.json');
  assert.equal(metadata.skillsUrl, 'https://better-content.apps.whop.com/skills/');
  assert.equal(metadata.experienceUrl, 'https://better-content.apps.whop.com/experiences/exp_make_money_here');
  assert.equal(metadata.reader.status, 'available');
  assert.equal(metadata.reader.mode, 'browser-capture');
  assert.equal(metadata.reader.experienceId, 'exp_make_money_here');
  assert.equal(metadata.reader.framePolicy, 'whop-app-frame');
  assert.equal(metadata.reader.metadataFrameHost, 'better-content.apps.whop.com');
  assert.equal(
    browserCaptureMatchesReader(metadata.reader, 'https://mfk8y74zmein6tne8o5e.apps.whop.com/experiences/exp_make_money_here/guides/guide_1'),
    true,
    'Whop may render an authorized app under an instance-specific *.apps.whop.com host instead of the metadata origin.',
  );
  assert.equal(browserCaptureMatchesReader(metadata.reader, 'https://another.apps.whop.com/experiences/exp_make_money_here'), true);
  assert.equal(
    browserCaptureMatchesReader(metadata.reader, 'https://another.apps.whop.com/experiences/exp_different_experience'),
    false,
    'A Whop app frame that declares a different exp_ identity must not be accepted for the selected Experience.',
  );
  assert.equal(browserCaptureMatchesReader(metadata.reader, 'https://opaque-instance.apps.whop.com/page/guide_without_exp_id'), true, 'Opaque Whop app routes without a declared exp_ ID remain compatible with server-side Experience re-verification.');
  assert.equal(browserCaptureMatchesReader(metadata.reader, 'https://example.com/experiences/exp_make_money_here'), false);
  assert.equal(browserCaptureMatchesReader(metadata.reader, 'http://better-content.apps.whop.com/experiences/exp_make_money_here'), false);

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
  assert.equal(noExactMatch.reader.status, 'available', 'The already-enrolled exact Better Content app ID must retain its rendered reader if public metadata is temporarily absent.');
  assert.equal(noExactMatch.reader.framePolicy, 'whop-app-frame');

  clearWhopAppMetadataCacheForTests();
  globalThis.fetch = async () => jsonResponse({ message: 'Unauthorized' }, 401);
  const unavailable = await inspectWhopApp(session, experience);
  assert.equal(unavailable.metadataStatus, 'unavailable');
  assert.equal(unavailable.metadataSource, 'public-app-list');
  assert.equal(unavailable.hasOpenapiView, false);
  assert.equal(unavailable.hasSkillsView, false);
  assert.equal(unavailable.reader.status, 'available', 'Metadata lookup failure must not disable the exact enrolled Better Content reader or become false membership denial.');

  const verifiedContent = {
    id: 'app_verified_content_123',
    name: 'Content',
    verified: true,
    origin: 'https://content-library.apps.whop.com/',
    metadataStatus: 'resolved',
    hasOpenapiView: false,
    hasSkillsView: false,
  };
  const contentReader = resolveWhopAppReader(verifiedContent, { id: 'exp_content', app: { id: verifiedContent.id, name: 'Content' } });
  assert.equal(contentReader.status, 'available');
  assert.equal(contentReader.mode, 'browser-capture');
  assert.equal(contentReader.experienceId, 'exp_content');
  assert.equal(contentReader.verifiedBy, 'whop-app-metadata+stable-app-id');
  assert.equal(contentReader.metadataFrameHost, 'content-library.apps.whop.com');
  assert.equal(contentReader.framePolicy, 'whop-app-frame');
  assert.equal(browserCaptureMatchesReader(contentReader, 'https://render-instance-42.apps.whop.com/experiences/exp_content'), true);
  assert.equal(browserCaptureMatchesReader(contentReader, 'https://render-instance-42.apps.whop.com/experiences/exp_other'), false);

  const unverifiedContent = resolveWhopAppReader({
    ...verifiedContent,
    id: 'app_unverified_content_123',
    verified: false,
  }, { id: 'exp_spoof', app: { id: 'app_unverified_content_123', name: 'Content' } });
  assert.equal(unverifiedContent.status, 'unavailable', 'An unverified app cannot enter the rendered Content reader merely by copying the app name.');

  const wrongOriginContent = resolveWhopAppReader({
    ...verifiedContent,
    id: 'app_wrong_origin_content_123',
    origin: 'https://example.invalid/',
  }, { id: 'exp_wrong_origin', app: { id: 'app_wrong_origin_content_123', name: 'Content' } });
  assert.equal(wrongOriginContent.status, 'unavailable', 'Verified Content-family apps still require a resolved HTTPS *.apps.whop.com metadata origin before reader enrollment.');

  const documentedOnly = resolveWhopAppReader({
    id: 'app_documented_123',
    name: 'Custom Knowledge App',
    verified: true,
    origin: 'https://knowledge.apps.whop.com/',
    metadataStatus: 'resolved',
    hasOpenapiView: true,
    openapiUrl: 'https://knowledge.apps.whop.com/openapi.json',
    hasSkillsView: false,
  }, { id: 'exp_documented', app: { id: 'app_documented_123', name: 'Custom Knowledge App' } });
  assert.equal(documentedOnly.status, 'contract-advertised');
  assert.equal(documentedOnly.mode, null, 'An advertised OpenAPI document is not permission to invent or auto-execute arbitrary operations.');
  assert.equal(documentedOnly.documentedInterface, 'openapi');

  const annotated = annotateWhopAppReaders({
    groups: [{
      company: { id: 'biz_1' },
      externalApps: [{
        experience: { id: 'exp_content', app: { id: verifiedContent.id, name: 'Content' } },
        capability: { app: verifiedContent, probeDeferred: false, reason: 'old generic reason' },
      }],
    }],
  });
  const annotatedEntry = annotated.groups[0].externalApps[0];
  assert.equal(annotatedEntry.capability.readerStatus, 'available');
  assert.equal(annotatedEntry.capability.readerMode, 'browser-capture');
  assert.match(annotatedEntry.capability.reason, /Access confirmed · reader available/);
  assert.match(annotatedEntry.capability.reason, /exact Experience/);
  assert.match(annotatedEntry.capability.reason, /membership and app identity/);
  assert.strictEqual(annotated.groups[0].unsupported[0], annotatedEntry, 'Legacy unsupported alias must point to the same annotated external-app entry used by the Control Center.');

  console.log('\nWHOP CUSTOM APP READER METADATA TEST PASSED\n');
  console.log('✓ Customer OAuth resolves public app metadata through GET /apps, never developer-only GET /apps/{id}.');
  console.log('✓ Exact Better Content remains an enrolled rendered reader while real instance-specific Whop app-frame hosts stay valid.');
  console.log('✓ Other Content-family apps require exact ID resolution, Whop verification, and a safe *.apps.whop.com metadata origin before enrollment.');
  console.log('✓ Runtime captures stay inside HTTPS *.apps.whop.com and reject a different exp_ identity when the rendered URL declares one.');
  console.log('✓ Published OpenAPI/Skills metadata is capability evidence only and never becomes guessed endpoint execution.');
  console.log('✓ Discovery differentiates access-confirmed reader availability from reader-unavailable state.');
} finally {
  globalThis.fetch = originalFetch;
  clearWhopAppMetadataCacheForTests();
}
