import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
const originGuard = read('functions/_lib/browser-capture-origin.js');
const service = read('functions/_lib/browser-capture.js');
const schema = read('migrations/0001_whop_guides.sql');

assert.equal(BETTER_CONTENT_APP_ID, 'app_zv9yxan92U9fNy', 'The capture bridge must stay pinned to the exact Better Content app ID.');
assert.deepEqual(manifest.permissions.sort(), ['scripting', 'storage', 'tabs'], 'The Firefox live-recovery permissions changed unexpectedly.');
assert.ok(!manifest.permissions.includes('cookies'), 'The capture extension must never request cookie access.');
assert.ok(!JSON.stringify(manifest).includes('<all_urls>'), 'The extension must not gain blanket access to every site.');
assert.ok(manifest.host_permissions.includes('https://*.apps.whop.com/*'), 'Whop-hosted app frames are not covered.');
assert.ok(manifest.host_permissions.includes('https://sniperplug.com/*'), 'The same-origin SniperPlug relay is not covered.');
assert.deepEqual(manifest.background?.scripts, ['background.js'], 'Firefox Android background-page fallback is missing.');
assert.equal(manifest.background?.service_worker, 'background.js', 'Chromium service-worker background is missing.');
assert.equal(manifest.browser_specific_settings?.gecko?.id, 'sniperplug-better-content@sniperplug.com', 'Firefox package ID is missing or unstable.');
assert.ok(manifest.browser_specific_settings?.gecko_android, 'Firefox Android compatibility metadata is missing.');
assert.deepEqual(manifest.content_scripts?.[0]?.matches, ['https://*.apps.whop.com/*'], 'Rendered capture is being injected into the top-level Whop shell again.');
assert.deepEqual(manifest.content_scripts?.[0]?.js, ['content-capture.js'], 'Whop capture should load directly without a global URL monkeypatch.');
assert.equal(manifest.content_scripts?.[0]?.all_frames, true, 'Better Content iframe capture no longer covers all matching frames.');
assert.equal(manifest.content_scripts?.[0]?.match_about_blank, true, 'Whop-owned blank/srcdoc frames are no longer eligible for capture injection.');
assert.equal(manifest.content_scripts?.[0]?.match_origin_as_fallback, true, 'Whop-origin fallback frames are no longer eligible for capture injection.');
assert.ok(!existsSync(join(root, 'browser-extension/frame-url-compat.js')), 'The obsolete global URL compatibility monkeypatch still exists.');

assert.ok(!/document\.cookie|chrome\.cookies|localStorage|sessionStorage/.test(captureScript), 'The Whop content script reads browser credentials or persistent site storage.');
assert.ok(!/\bfetch\s*\(/.test(captureScript), 'The Whop content script must remain DOM-only instead of probing Better Content private APIs.');
assert.ok(captureScript.includes('bodyMarkdown') && captureScript.includes('MutationObserver'), 'Rendered DOM extraction or navigation-aware capture is missing.');
const appFrameGuardIndex = captureScript.indexOf('const APP_FRAME_HOST = isWhopAppHost(location.hostname)');
const reinjectionIndex = captureScript.indexOf('globalThis.__sniperplugBetterContentCapture?.registerCandidate');
assert.ok(appFrameGuardIndex >= 0 && reinjectionIndex > appFrameGuardIndex, 'App-frame validation must happen before the reinjection shortcut.');
assert.ok(captureScript.includes("if (!APP_FRAME_HOST || location.protocol !== 'https:') return;") && captureScript.includes("endsWith('.apps.whop.com')"), 'The content extractor can still run against the Whop shell or a non-HTTPS document.');
assert.ok(captureScript.includes('currentAppFrameFallbackUrl') && captureScript.includes('return currentFrameFallback'), 'Firefox current-frame HTTPS fallback is not kept inside the app-frame extractor.');
assert.ok(captureScript.includes('__sniperplugBetterContentCapture') && captureScript.includes('registerCandidate'), 'Dynamic reinjection can create duplicate capture observers instead of reprobeing the existing frame.');
assert.ok(!captureScript.includes('Object.defineProperty(globalThis, \'URL\'') && !captureScript.includes('SniperPlugURL'), 'The global URL constructor is being monkeypatched again.');

assert.ok(background.includes('MAX_QUEUE = 25') && background.includes('sniperplug:auto-capture'), 'Bounded multi-page capture queue is missing.');
assert.ok(background.includes('bestCandidateAcrossTabs') && background.includes('WHOP_TAB_PATTERNS'), 'Mobile capture still depends only on the tab where the extension popup was opened.');
assert.ok(background.includes('linkExperienceAcrossFrames') && background.includes('EXPERIENCE_LINK_WINDOW_MS'), 'Cross-frame experience linking disappeared.');
assert.ok(background.includes('chrome.scripting.executeScript') && background.includes('allFrames: true'), 'Firefox cannot actively inject the capture script into an already-open Whop tab.');
assert.ok(background.includes("files: ['content-capture.js']") && background.includes('recoverCandidateAcrossWhopTabs'), 'Live Whop recovery does not inject the same audited DOM-only content script.');
assert.ok(background.includes("candidate?.likelyAppFrame !== true || !isWhopAppHost(candidate?.host)"), 'Background storage can accept a top-level whop.com shell candidate.');
assert.ok(background.includes('const tabExperienceId = experienceIdFromUrl(sender?.tab?.url);'), 'Current top-level Whop exp_ identity is not attached to the app frame.');
assert.ok(background.includes('clearCandidatesForTab') && background.includes('waitForAppCandidate'), 'Fresh popup recovery can return a stale candidate or return before the app frame settles.');
assert.ok(background.includes('isSafeAppCapture') && background.includes('safeAppFrameUrl'), 'Queue/pending storage can retain shell-frame capture payloads.');
assert.ok(background.includes('resolveCandidate(') && background.includes("message?.type === 'sniperplug:popup-state'"), 'Opening the extension does not invoke live candidate recovery.');
assert.ok(background.includes("message?.type === 'sniperplug:open-whop'") && popup.includes("type: 'sniperplug:open-whop'"), 'Mobile UI cannot open/focus Whop inside Firefox when no browser tab is available.');
assert.ok(popupHtml.includes('id="openWhop"') && popup.includes('native Whop app is separate from Firefox'), 'The mobile popup does not clearly distinguish Firefox-rendered Whop from the native Whop app.');
assert.ok(relay.includes("fetch('/api/browser-capture'") && relay.includes("credentials: 'same-origin'"), 'Captured content is not handed off through the signed-in SniperPlug page.');
assert.ok(!relay.includes('api.whop.com') && !background.includes('api.whop.com'), 'The extension must not impersonate the SniperPlug OAuth client or call Whop APIs directly.');
assert.ok(endpoint.includes('requireAdmin') && endpoint.includes('requireWhopSession') && endpoint.includes('requireSameOrigin'), 'Browser capture endpoint is not protected by owner, Whop, and same-origin checks.');
assert.ok(endpoint.includes('requireWhopAppFrameCaptures(body)') && originGuard.includes("endsWith('.apps.whop.com')"), 'The server no longer independently rejects shell-frame capture URLs.');
assert.ok(service.includes("captureMethod: 'extension-dom'") && service.includes("status = 'draft'"), 'Browser capture is not constrained to the private draft path.');
assert.ok(service.includes('changed-published-held') && service.includes('changed-reviewed-held') && service.includes('removed-held'), 'A later browser capture can still overwrite published, reviewed, or removed owner work.');
assert.ok(service.includes('autoPublishEligible: false') && service.includes('manualReviewCompleted: false'), 'Browser-captured content can bypass explicit owner review before publication.');

assert.ok(schema.includes('FOREIGN KEY (source_key) REFERENCES whop_posts(source_key)'), 'The regression no longer models the production guide source foreign key.');
const sourceRowWrite = service.indexOf('INSERT INTO whop_posts (');
const guideRowWrite = service.indexOf('INSERT INTO guides (');
assert.ok(sourceRowWrite >= 0 && guideRowWrite > sourceRowWrite, 'Browser capture writes a guide before materializing the whop_posts source row required by D1 foreign keys.');
assert.ok(service.includes('upsertBrowserCaptureSourceRow') && service.includes('browser_capture_source_unconfirmed'), 'Browser-capture source persistence is not verified before guide creation.');
assert.ok(service.includes("decision = 'approved'") && service.includes('sourceType: BROWSER_CAPTURE_SOURCE_TYPE'), 'Browser-capture source rows are not retained as approved, typed source records.');

const normalized = normalizeBrowserCapture({
  experienceId: 'exp_hidden_123',
  title: 'Make Money Here — Test Guide',
  pageUrl: 'https://abc.apps.whop.com/experiences/exp_hidden_123/pages/guide?view=member&token=super-secret&state=oauth-state#section',
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

const allowed = await authorizeBrowserCaptureExperience({}, 'exp_hidden_123', {
  retrieveExperienceFn: async () => ({ id: 'exp_hidden_123', app: { id: BETTER_CONTENT_APP_ID, name: 'Better Content' } }),
});
assert.equal(allowed.app.id, BETTER_CONTENT_APP_ID);
await assert.rejects(
  () => authorizeBrowserCaptureExperience({}, 'exp_hidden_123', {
    retrieveExperienceFn: async () => ({ id: 'exp_hidden_123', app: { id: 'app_wrong', name: 'Pretend Better Content' } }),
  }),
  /restricted to the exact Better Content/i,
  'A similarly named third-party Whop app can impersonate Better Content in the capture bridge.',
);

console.log('\nBETTER CONTENT BROWSER CAPTURE REGRESSION PASSED\n');
console.log('✓ Extension reads rendered DOM only and requests no cookie or blanket-host permission.');
console.log('✓ Static extraction is restricted to *.apps.whop.com and the shell is rejected before reinjection logic.');
console.log('✓ Firefox can actively inject the audited content script into already-open Whop tabs.');
console.log('✓ Fresh recovery waits for the app frame and cannot select stale shell candidates.');
console.log('✓ Firefox current-frame HTTPS fallback lives inside the extractor and no longer replaces global URL.');
console.log('✓ Queue and server boundaries independently reject top-level Whop shell captures.');
console.log('✓ Browser captures persist a verified whop_posts source row before the foreign-keyed guide draft.');
console.log('✓ Multi-page captures cross into SniperPlug through a same-origin Control Center relay.');
console.log('✓ Server re-verifies the exact Better Content Whop experience before writing anything.');
console.log('✓ Captures are private drafts, manual-review only, with previously reviewed/published/removed work protected.');
console.log('✓ Sensitive query credentials are removed from stored capture URLs and image metadata.');
