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
const service = read('functions/_lib/browser-capture.js');
const schema = read('migrations/0001_whop_guides.sql');

assert.equal(BETTER_CONTENT_APP_ID, 'app_zv9yxan92U9fNy', 'The capture bridge must stay pinned to the exact Better Content app ID.');
assert.deepEqual(manifest.permissions.sort(), ['scripting', 'storage', 'tabs', 'webNavigation'], 'The Firefox stable-recovery permissions were changed unexpectedly.');
assert.ok(!manifest.permissions.includes('cookies'), 'The capture extension must never request cookie access.');
assert.ok(!JSON.stringify(manifest).includes('<all_urls>'), 'The extension must not gain blanket access to every site.');
assert.ok(manifest.host_permissions.includes('https://*.apps.whop.com/*'), 'Whop-hosted app frames are not covered.');
assert.ok(manifest.host_permissions.includes('https://sniperplug.com/*'), 'The same-origin SniperPlug relay is not covered.');
assert.deepEqual(manifest.background?.scripts, ['background.js'], 'Firefox Android background-page fallback is missing.');
assert.equal(manifest.background?.service_worker, 'background.js', 'Chromium service-worker background is missing.');
assert.ok(manifest.browser_specific_settings?.gecko?.id === 'sniperplug-better-content@sniperplug.com', 'Firefox package ID is missing or unstable.');
assert.ok(manifest.browser_specific_settings?.gecko_android, 'Firefox Android compatibility metadata is missing.');
assert.deepEqual(manifest.content_scripts?.[0]?.js, ['content-capture.js'], 'Whop capture should load directly without a global URL monkeypatch.');
assert.equal(manifest.content_scripts?.[0]?.all_frames, true, 'Better Content iframe capture no longer covers all matching frames.');
assert.ok(!existsSync(join(root, 'browser-extension/frame-url-compat.js')), 'The obsolete global URL compatibility monkeypatch still exists.');

assert.ok(!/document\.cookie|chrome\.cookies|localStorage|sessionStorage/.test(captureScript), 'The Whop content script reads browser credentials or persistent site storage.');
assert.ok(!/\bfetch\s*\(/.test(captureScript), 'The Whop content script must remain DOM-only and must not probe Better Content private APIs.');
assert.ok(captureScript.includes('bodyMarkdown') && captureScript.includes('MutationObserver'), 'Rendered DOM$„	