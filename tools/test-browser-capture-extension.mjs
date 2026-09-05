import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authorizeBrowserCaptureExperience,
  BETTER_CONTENT_APP_ID,
  normalizeBrowserCapture,
  validateBrowserCaptureBatch,
} from '../functions/_lib/browser-capture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('browser-extension/manifest.json'));
const captureScript = read('browser-extension/content-capture.js');
const background = read('browser-extension/background.js');
const popup = read('browser-extension/popup.js');
const popupHtml = read('browser-extension/popup.html');
const relay = read('browser-extension/sniperplug-relay.js');
const endpoint = read('functions/api/browser-capture.js');
const service = read('functions/_lib/browser-capture.js');
const schema = read('migrations/0001_whop_guides.sql');

assert.equal(BETTER_CONTENT_APP_ID, 'app_zv9yxan92U9fNy', 'The known Better Content app ID must remain stable while reader selection expands safely.');
assert.deepEqual([...manifest.permissions].sort(), ['scripting', 'storage', 'tabs', 'webNavigation'].sort(), 'Firefox capture permissions changed unexpectedly.');
assert.ok(!manifest.permissions.includes('cookies'), 'The capture extension must never request cookie access.');
assert.ok(!JSON.stringify(manifest).includes('<all_urls>'), 'The extension must not gain blanket access to every site.');
assert.ok(manifest.host_permissions.includes('https://*.apps.whop.com/*'), 'Whop-hosted app frames are not covered.');
assert.ok(manifest.host_permissions.includes('https://sniperplug.com/*'), 'The same-origin SniperPlug relay is not covered.');
assert.deepEqual(manifest.background?.scripts, ['background.js'], 'Firefox Android background-page fallback is missing.');
assert.equal(manifest.background?.service_worker, 'background.js', 'Chromium service-worker background is missing.');
assert.equal(manifest.browser_specific_settings?.gecko?.id, 'sniperplug-better-content@sniperplug.com', 'Firefox package ID is missing or unstable.');
assert.ok(manifest.browser_specific_settings?.gecko_android, 'Firefox Android compatibility metadata is missing.');
assert.deepEqual(manifest.content_scripts?.[0]?.matches, ['https://*.apps.whop.com/*'], 'Rendered extraction escaped the Whop app-frame boundary.');
assert.equal(manifest.content_scripts?.[0]?.all_frames, true, 'Rendered app iframe capture no longer covers matching subframes.');
assert.equal(manifest.content_scripts?.[0]?.match_about_blank, true, 'Whop-owned blank/srcdoc frames are no longer eligible for inherited content-script injection.');
assert.equal(manifest.content_scripts?.[0]?.match_origin_as_fallback, true, 'Whop-origin fallback frames are no longer eligible for inherited content-script injection.');

assert.ok(!/document\.cookie|chrome\.cookies|localStorage|sessionStorage/.test(captureScript), 'The Whop content script reads browser credentials or persistent site storage.');
assert.ok(!/\bfetch\s*\(/.test(captureScript), 'The Whop content script must remain DOM-only instead of probing custom-app private APIs.');
assert.ok(captureScript.includes('bodyMarkdown') && captureScript.includes('MutationObserver'), 'Rendered DOM extraction or navigation-aware capture is missing.');
assert.ok(captureScript.includes('function safeCurrentFrameUrl') && captureScript.includes("location.protocol !== 'https:'"), 'Firefox current-frame HTTPS fallback moved outside the extractor or lost its scheme check.');
assert.ok(captureScript.includes('__sniperplugBetterContentCapture') && captureScript.includes('registerCandidate'), 'Dynamic reinjection can create duplicate capture observers instead of reprobeing the existing frame.');
assert.ok(!captureScript.includes('Object.defineProperty(globalThis, \'URL\'') && !captureScript.includes('SniperPlugURL'), 'The global URL constructor is being monkeypatched again.');

assert.ok(background.includes('MAX_QUEUE = 25') && background.includes('sniperplug:auto-capture'), 'Bounded multi-page capture queue is missing.');
assert.ok(background.includes('bestCandidateAcrossTabs') && background.includes('WHOP_TAB_PATTERNS'), 'Mobile capture still depends only on the tab where the extension popup was opened.');
assert.ok(background.includes('verifyCandidate') && background.includes("type: 'sniperplug:probe-now'"), 'Known-good Firefox candidates are not actively verified before reuse.');
assert.ok(!background.includes('await clearCandidatesForTab(tab.id);'), 'Popup recovery still deletes a working candidate before probing it.');
assert.ok(background.includes('chrome.webNavigation?.getAllFrames') && background.includes('frameIds: [frameId]'), 'Firefox does not inventory and target the exact app frame before broad fallback.');
assert.ok(background.includes('APP_FRAME_SETTLE_MS = 4000'), 'Firefox Android app-frame recovery is still using the brittle short settle window.');
assert.ok(background.includes('target: { tabId, allFrames: true }'), 'Last-resort all-frame recovery was removed instead of remaining as a bounded fallback.');
assert.ok(background.includes("message?.type === 'sniperplug:open-whop'") && popup.includes("type: 'sniperplug:open-whop'"), 'Mobile UI cannot open/focus Whop inside Firefox when no browser tab is available.');
assert.ok(popupHtml.includes('id="openWhop"') && popup.includes('native Whop app is separate from Firefox'), 'The mobile popup does not clearly distinguish Firefox-rendered Whop from the native Whop app.');
assert.ok(relay.includes("fetch('/api/browser-capture'") && relay.includes("credentials: 'same-origin'"), 'Captured content is not handed off through the signed-in SniperPlug page.');
assert.ok(!relay.includes('api.whop.com') && !background.includes('api.whop.com'), 'The extension must not impersonate the SniperPlug OAuth client or call Whop APIs directly.');
assert.ok(endpoint.includes('requireControlAccount') && endpoint.includes('requireWhopSession') && endpoint.includes('requireSameOrigin'), 'Browser capture endpoint is not protected by current account entitlement, Whop, and same-origin checks.');
assert.ok(endpoint.includes('importBrowserCaptures(context.env, account, whop, body)'), 'Browser capture drops the authenticated tenant principal before persistence.');
assert.ok(endpoint.includes('requireWhopAppFrameCaptures'), 'Server preflight no longer rejects captures outside HTTPS Whop app frames.');
assert.ok(service.includes('inspectWhopApp') && service.includes('browserCaptureMatchesReader'), 'Server no longer binds rendered captures to the canonical app-reader decision and Whop app-frame boundary.');
assert.ok(service.includes("captureMethod: 'extension-dom'") && service.includes("status = 'draft'"), 'Browser capture is not constrained to the private draft path.');
assert.ok(service.includes('changed-published-held') && service.includes('changed-reviewed-held') && service.includes('removed-held'), 'A later browser capture can still overwrite published, reviewed, or removed work.');
assert.ok(service.includes('autoPublishEligible: false') && service.includes('manualReviewCompleted: false'), 'Browser-captured content can bypass explicit review before publication.');

assert.ok(schema.includes('FOREIGN KEY (source_key) REFERENCES whop_posts(source_key)'), 'The regression no longer models the production guide source foreign key.');
const sourceRowWrite = service.indexOf('INSERT INTO whop_posts (');
const guideRowWrite = service.indexOf('INSERT INTO guides (');
assert.ok(sourceRowWrite >= 0 && guideRowWrite > sourceRowWrite, 'Browser capture writes a guide before materializing the whop_posts source row required by D1 foreign keys.');
assert.ok(service.includes('upsertBrowserCaptureSourceRow') && service.includes('browser_capture_source_unconfirmed'), 'Browser-capture source persistence is not verified before guide creation.');
assert.ok(service.includes("decision = 'approved'") && service.includes('sourceType: BROWSER_CAPTURE_SOURCE_TYPE'), 'Browser-capture source rows are not retained as approved, typed source records.');

const normalized = normalizeBrowserCapture({
  experienceId: 'exp_hidden_123',
  title: 'Make Money Here — Test Guide',
  pageUrl: 'https://mfk8y74zmein6tne8o5e.apps.whop.com/experiences/exp_hidden_123/pages/guide?view=member&token=super-secret&state=oauth-state#section',
  bodyMarkdown: '# Make Money Here\n\nThis is a rendered guide with enough instructional content to pass the browser capture minimum.',
  images: [
    { url: 'https://cdn.example.com/image.png?signature=private-value&width=1200', alt: 'Example image' },
    { url: 'javascript:alert(1)', alt: 'Bad image' },
  ],
});
assert.equal(normalized.experienceId, 'exp_hidden_123');
assert.ok(normalized.pageUrl.includes('view=member'), 'Non-sensitive page identity parameters were stripped unnecessarily.');
assert.ok(!normalized.pageUrl.includes('token=') && !normalized.pageUrl.includes('state='), 'Sensitive URL query data leaked into a saved capture.');
assert.equal(normalized.images.length, 1, 'Unsafe image URLs were retained.');
assert.ok(!normalized.images[0].url.includes('signature='), 'Signed image credentials leaked into capture metadata.');

assert.throws(
  () => validateBrowserCaptureBatch({ rightsConfirmed: false, captures: [normalized] }),
  /own this content|explicit permission/i,
  'The browser bridge lost the existing republishing-rights confirmation gate.',
);
assert.equal(validateBrowserCaptureBatch({ rightsConfirmed: true, captures: [normalized] }).length, 1);

const betterMetadata = {
  id: BETTER_CONTENT_APP_ID,
  name: 'Better Content',
  verified: true,
  origin: 'https://better-content.apps.whop.com/',
  metadataStatus: 'resolved',
  hasOpenapiView: true,
  openapiUrl: 'https://better-content.apps.whop.com/openapi.json',
  hasSkillsView: false,
};
const allowed = await authorizeBrowserCaptureExperience({}, 'exp_hidden_123', {
  pageUrl: normalized.pageUrl,
  retrieveExperienceFn: async () => ({ id: 'exp_hidden_123', app: { id: BETTER_CONTENT_APP_ID, name: 'Better Content' } }),
  inspectWhopAppFn: async () => betterMetadata,
});
assert.equal(allowed.app.id, BETTER_CONTENT_APP_ID);
assert.equal(allowed._sniperplugAppReader.framePolicy, 'whop-app-frame');
assert.equal(allowed._sniperplugAppReader.metadataFrameHost, 'better-content.apps.whop.com');

const verifiedContentId = 'app_verified_content_123';
const contentAllowed = await authorizeBrowserCaptureExperience({}, 'exp_content_123', {
  pageUrl: 'https://render-instance-42.apps.whop.com/experiences/exp_content_123/page/guide_1',
  retrieveExperienceFn: async () => ({ id: 'exp_content_123', app: { id: verifiedContentId, name: 'Content' } }),
  inspectWhopAppFn: async () => ({
    id: verifiedContentId,
    name: 'Content',
    verified: true,
    origin: 'https://content-library.apps.whop.com/',
    metadataStatus: 'resolved',
    hasOpenapiView: false,
    hasSkillsView: false,
  }),
});
assert.equal(contentAllowed._sniperplugAppReader.mode, 'browser-capture', 'A verified exact Content-family app with a resolved Whop app origin should use the same safe rendered reader.');

await assert.rejects(
  () => authorizeBrowserCaptureExperience({}, 'exp_hidden_123', {
    pageUrl: 'https://pretend.apps.whop.com/experiences/exp_hidden_123',
    retrieveExperienceFn: async () => ({ id: 'exp_hidden_123', app: { id: 'app_wrong', name: 'Pretend Better Content' } }),
    inspectWhopAppFn: async () => ({ id: 'app_wrong', name: 'Pretend Better Content', verified: true, origin: 'https://pretend.apps.whop.com/', metadataStatus: 'resolved' }),
  }),
  /does not have an authorized rendered-app reader/i,
  'A similarly named third-party Whop app can impersonate a supported Content reader.',
);

await assert.rejects(
  () => authorizeBrowserCaptureExperience({}, 'exp_hidden_123', {
    pageUrl: 'https://example.com/experiences/exp_hidden_123',
    retrieveExperienceFn: async () => ({ id: 'exp_hidden_123', app: { id: BETTER_CONTENT_APP_ID, name: 'Better Content' } }),
    inspectWhopAppFn: async () => betterMetadata,
  }),
  /frame host does not match|rendered frame/i,
  'A capture outside HTTPS *.apps.whop.com can enter a supported rendered reader.',
);

console.log('\nAUTHORIZED WHOP APP BROWSER CAPTURE REGRESSION PASSED\n');
console.log('✓ Extension remains rendered-DOM only and requests no cookie or blanket-host permission.');
console.log('✓ Firefox preserves and verifies working candidates instead of deleting them during popup recovery.');
console.log('✓ Server resolves the exact app reader and constrains each capture to Whop’s HTTPS app-frame boundary.');
console.log('✓ Real instance-specific Better Content hosts remain valid while exact Experience/app identity is reverified separately.');
console.log('✓ Verified Content-family apps can use the same safe rendered reader; lookalike/unverified apps fail closed.');
console.log('✓ Captures remain private drafts with reviewed/published/removed work protected.');
console.log('✓ Sensitive query credentials are removed from stored capture URLs and image metadata.');
