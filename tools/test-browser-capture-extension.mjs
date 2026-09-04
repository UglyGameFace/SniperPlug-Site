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
const relay = read('browser-extension/sniperplug-relay.js');
const endpoint = read('functions/api/browser-capture.js');
const service = read('functions/_lib/browser-capture.js');

assert.equal(BETTER_CONTENT_APP_ID, 'app_zv9yxan92U9fNy', 'The capture bridge must stay pinned to the exact Better Content app ID.');
assert.deepEqual(manifest.permissions.sort(), ['storage', 'tabs'], 'The extension gained an unexpected privileged browser permission.');
assert.ok(!manifest.permissions.includes('cookies'), 'The capture extension must never request cookie access.');
assert.ok(!JSON.stringify(manifest).includes('<all_urls>'), 'The extension must not gain blanket access to every site.');
assert.ok(manifest.host_permissions.includes('https://*.apps.whop.com/*'), 'Whop-hosted app frames are not covered.');
assert.ok(manifest.host_permissions.includes('https://sniperplug.com/*'), 'The same-origin SniperPlug relay is not covered.');
assert.ok(!/document\.cookie|chrome\.cookies|localStorage|sessionStorage/.test(captureScript), 'The Whop content script reads browser credentials or persistent site storage.');
assert.ok(!/\bfetch\s*\(/.test(captureScript), 'The Whop content script must remain DOM-only instead of probing Better Content private APIs.');
assert.ok(captureScript.includes('bodyMarkdown') && captureScript.includes('MutationObserver'), 'Rendered DOM extraction or navigation-aware capture is missing.');
assert.ok(background.includes('MAX_QUEUE = 25') && background.includes('sniperplug:auto-capture'), 'Bounded multi-page capture queue is missing.');
assert.ok(relay.includes("fetch('/api/browser-capture'") && relay.includes("credentials: 'same-origin'"), 'Captured content is not handed off through the signed-in SniperPlug page.');
assert.ok(!relay.includes('api.whop.com') && !background.includes('api.whop.com'), 'The extension must not impersonate the SniperPlug OAuth client or call Whop APIs directly.');
assert.ok(endpoint.includes('requireAdmin') && endpoint.includes('requireWhopSession') && endpoint.includes('requireSameOrigin'), 'Browser capture endpoint is not protected by owner, Whop, and same-origin checks.');
assert.ok(service.includes("captureMethod: 'extension-dom'") && service.includes("status = 'draft'"), 'Browser capture is not constrained to the private draft path.');
assert.ok(service.includes('changed-published-held') && service.includes('changed-reviewed-held') && service.includes('removed-held'), 'A later browser capture can still overwrite published, reviewed, or removed owner work.');
assert.ok(service.includes('autoPublishEligible: false') && service.includes('manualReviewCompleted: false'), 'Browser-captured content can bypass explicit owner review before publication.');

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
console.log('✓ Multi-page captures cross into SniperPlug through a same-origin Control Center relay.');
console.log('✓ Server re-verifies the exact Better Content Whop experience before writing anything.');
console.log('✓ Captures are private drafts, manual-review only, with previously reviewed/published/removed work protected.');
console.log('✓ Sensitive query credentials are removed from stored capture URLs and image metadata.');
