import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const background = readFileSync(join(root, 'browser-extension/background.js'), 'utf8');
const captureScript = readFileSync(join(root, 'browser-extension/content-capture.js'), 'utf8');
const relay = readFileSync(join(root, 'browser-extension/sniperplug-relay.js'), 'utf8');
const popup = readFileSync(join(root, 'browser-extension/popup.js'), 'utf8');
const popupHtml = readFileSync(join(root, 'browser-extension/popup.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'browser-extension/manifest.json'), 'utf8'));
const versionContract = JSON.parse(readFileSync(join(root, 'browser-extension-version.json'), 'utf8'));

assert.equal(manifest.version, '0.2.3', 'Authorized content-sync extension version was not bumped.');
assert.equal(versionContract.latest, manifest.version, 'Published extension-version contract drifted from the packaged manifest.');
assert.ok(captureScript.includes('function discoverTraversalTargets') && captureScript.includes('function safeTraversalUrl'), 'The DOM reader does not discover bounded safe traversal targets.');
assert.ok(captureScript.includes("url.origin !== location.origin") && captureScript.includes('targetExperience !== experienceId'), 'Traversal lost same-origin or same-experience confinement.');
assert.ok(captureScript.includes('queryLooksSensitive(url)') && captureScript.includes('BLOCKED_TRAVERSAL_PATH'), 'Traversal does not reject credential-bearing or sensitive routes before navigation.');
assert.ok(captureScript.includes('expandLazyContent') && captureScript.includes('scrollForLazyRender') && captureScript.includes('waitForImages') && captureScript.includes('collectTabPanels'), 'Capture-all no longer prepares lazy/collapsed/tabbed rendered content before extraction.');
assert.ok(captureScript.includes("type: `${MESSAGE_PREFIX}traversal-page`") && captureScript.includes('location.assign(target)'), 'Rendered traversal snapshots or app-frame navigation are missing.');
assert.ok(captureScript.includes('traversalDirty') && captureScript.includes('if (traversalTimer) return;'), 'Capture-all traversal scheduling can be starved by repeated page mutations again.');
assert.ok(captureScript.includes('reportTraversalProgress') && popup.includes("message?.type !== 'sniperplug:traversal-progress'"), 'Live capture-all preparation phases are no longer wired to the popup.');
assert.ok(!/\bfetch\s*\(/.test(captureScript), 'Capture-all must remain DOM/navigation driven and must not probe Better Content private APIs.');
assert.ok(background.includes("TRAVERSAL_KEY = 'sniperplugTraversalTabs'") && background.includes('MAX_TRAVERSAL_VISITS = 240'), 'Traversal state is not bounded and persisted across iframe reloads.');
assert.ok(background.includes('persistentStore()') && background.includes('chrome.storage?.local || chrome.storage?.session'), 'Traversal/queue state no longer survives browser background restarts with a safe test fallback.');
assert.ok(background.includes('MAX_TRAVERSAL_RETRIES = 3') && background.includes('retryOrSkipCurrent'), 'Bounded per-page retries are missing.');
assert.ok(background.includes('classifySyncCapture') && background.includes('captureFingerprint') && background.includes('HISTORY_KEY'), 'Change detection/history-based sync is missing.');
assert.ok(background.includes('MAX_QUEUE = 120') && background.includes('MAX_QUEUE_BODY_CHARS = 4_000_000'), 'Capture-all queue is not large enough for real directories or is unbounded.');
assert.ok(background.includes("message?.type === 'sniperplug:start-traversal'") && background.includes("message?.type === 'sniperplug:traversal-page'"), 'Background traversal orchestration messages are missing.');
assert.ok(popupHtml.includes('id="crawl"') && popupHtml.includes('id="crawlScope"') && popupHtml.includes('id="sendWhenDone"'), 'Firefox popup is missing capture-all scope or one-click handoff controls.');
assert.ok(popup.includes("type: 'sniperplug:start-traversal'") && popup.includes('crawlCanResume'), 'Firefox popup does not start/resume Capture all guides.');
assert.ok(popupHtml.includes('role="progressbar"') && popupHtml.includes('id="crawlProgressBar"') && popupHtml.includes('id="crawlProgressPercent"'), 'Firefox popup is missing the visible Capture-all progress bar or percentage readout.');
assert.ok(popup.includes('function crawlProgressState') && popup.includes('Math.max(discovered, finished + remaining)') && popup.includes("status === 'running' ? 99 : 100"), 'Capture-all progress is not derived from authoritative known crawler work or can claim 100% before completion.');
assert.ok(popup.includes("removeAttribute('aria-valuenow')") && popup.includes("setAttribute('aria-valuenow'") && popupHtml.includes('prefers-reduced-motion'), 'Progress accessibility or reduced-motion behavior regressed.');
assert.ok(relay.includes('MAX_CAPTURE_BATCH_COUNT = 25') && relay.includes('captureBatches') && relay.includes('MAX_TRANSIENT_RETRIES = 2'), 'Large queues are not split/retried in server-safe browser-capture batches.');

const storageState = Object.create(null);
let activeTabId = 77;
const whopTab = () => ({
  id: activeTabId,
  url: 'https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app',
  lastAccessed: Date.now(),
  windowId: 1,
});
const host = 'mfk8y74zmein6tne8o5e.apps.whop.com';
const directoryUrl = `https://${host}/experiences/exp_rpaFYR2AD7Mb9d/pages`;
const guide1Url = `${directoryUrl}/guide-1`;
const guide2Url = `${directoryUrl}/guide-2`;
let runtimeListener = null;
let removedListener = null;
const navigationRequests = [];

function storageGet(key) {
  if (typeof key === 'string') return { [key]: storageState[key] };
  const output = {};
  for (const item of Array.isArray(key) ? key : Object.keys(key || {})) output[item] = storageState[item];
  return output;
}

function shortTimer(fn, ms = 0) {
  if (ms >= 10_000) return 999;
  return setTimeout(fn, Math.min(ms, 2));
}

async function dispatch(message, sender = {}) {
  assert.equal(typeof runtimeListener, 'function', 'Background runtime listener was not registered.');
  return new Promise((resolve, reject) => {
    try {
      const pending = runtimeListener(message, sender, resolve);
      if (pending !== true) resolve(undefined);
    } catch (error) {
      reject(error);
    }
  });
}

function capture(url, title, bodySuffix = title) {
  return {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    title,
    pageUrl: url,
    frameUrl: url,
    pageIdentity: `${url}|${title}`,
    bodyMarkdown: `# ${title}\n\nThis is a complete rendered Better Content guide body for ${bodySuffix}, with enough text to be safely captured and fingerprinted.`,
    textLength: 380,
    images: [],
  };
}

const context = {
  URL,
  Date,
  Number,
  String,
  Object,
  Array,
  Boolean,
  Math,
  Promise,
  RegExp,
  Error,
  setTimeout: shortTimer,
  clearTimeout: () => {},
  crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
  chrome: {
    storage: {
      session: {
        get: async (key) => storageGet(key),
        set: async (value) => Object.assign(storageState, value),
      },
    },
    runtime: {
      getManifest: () => ({ version: '0.2.3' }),
      onMessage: { addListener: (listener) => { runtimeListener = listener; } },
    },
    tabs: {
      query: async ({ url } = {}) => {
        const patterns = Array.isArray(url) ? url : [url];
        if (patterns.some((item) => String(item || '').includes('sniperplug.com'))) return [];
        return patterns.some((item) => String(item || '').includes('whop.com')) ? [whopTab()] : [];
      },
      sendMessage: async (_tabId, message, options = {}) => {
        assert.equal(options.frameId, 4);
        if (message.type === 'sniperplug:probe-now') return { ok: true };
        if (message.type === 'sniperplug:set-auto') return { ok: true, enabled: message.enabled };
        if (message.type === 'sniperplug:set-traversal') return { ok: true, enabled: message.enabled };
        if (message.type === 'sniperplug:traverse-navigate') {
          navigationRequests.push(message.url);
          return { ok: true };
        }
        return { ok: true };
      },
      update: async () => whopTab(),
      create: async () => whopTab(),
      onRemoved: { addListener: (listener) => { removedListener = listener; } },
    },
    windows: { update: async () => ({}) },
    webNavigation: {
      getAllFrames: async () => [{ frameId: 0, url: whopTab().url }, { frameId: 4, url: directoryUrl }],
      onCommitted: { addListener: () => {} },
    },
    scripting: { executeScript: async () => [] },
  },
};
context.globalThis = context;
runInNewContext(background, context, { filename: 'browser-extension/background.js' });
assert.equal(typeof removedListener, 'function');

async function registerCandidate(tabId = activeTabId, pageUrl = directoryUrl, title = 'Content') {
  return dispatch({
    type: 'sniperplug:candidate',
    candidate: {
      experienceId: '',
      title,
      pageUrl,
      textLength: 1200,
      host,
      likelyAppFrame: true,
    },
  }, { tab: { ...whopTab(), id: tabId }, frameId: 4 });
}

await registerCandidate();
let started = await dispatch({ type: 'sniperplug:start-traversal', tabId: 77, scope: 'experience' });
assert.equal(started.ok, true);
assert.equal(started.crawlEnabled, true);
assert.equal(started.crawlScope, 'experience');

const directory = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: directoryUrl,
    directoryLike: true,
    capture: capture(directoryUrl, 'Content'),
    diagnostics: { scrollSteps: 2, controlsClicked: 1, tabPanels: 0, imagesStillPending: 0 },
    targets: [
      { url: guide1Url, title: 'Guide One' },
      { url: 'https://evil.example.com/steal', title: 'Unsafe' },
      { url: `https://${host}/experiences/exp_other/pages/not-ours`, title: 'Other experience' },
      { url: `${guide2Url}?token=should-not-navigate`, title: 'Credential URL' },
      { url: guide2Url, title: 'Guide Two' },
    ],
  },
}, { tab: whopTab(), frameId: 4 });
assert.equal(directory.ok, true);
assert.deepEqual(navigationRequests, [guide1Url]);
assert.equal(directory.crawlCaptured, 0, 'Directory shell should not be captured.');

const retry = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: guide1Url,
    directoryLike: false,
    capture: null,
    targets: [],
    diagnostics: { scrollSteps: 1, controlsClicked: 0, tabPanels: 0, imagesStillPending: 0 },
  },
}, { tab: whopTab(), frameId: 4 });
assert.equal(retry.ok, true);
assert.equal(retry.crawlRetries, 1);
assert.deepEqual(navigationRequests, [guide1Url, guide1Url]);

const first = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: guide1Url,
    directoryLike: false,
    capture: capture(guide1Url, 'Guide One'),
    targets: [],
    diagnostics: { scrollSteps: 4, controlsClicked: 2, tabPanels: 1, imagesStillPending: 0 },
  },
}, { tab: whopTab(), frameId: 4 });
assert.equal(first.ok, true);
assert.equal(first.crawlNew, 1);
assert.deepEqual(navigationRequests, [guide1Url, guide1Url, guide2Url]);

await removedListener(77);
await new Promise((resolve) => setTimeout(resolve, 5));
activeTabId = 88;
await registerCandidate(88, guide2Url, 'Guide Two');
const resumed = await dispatch({ type: 'sniperplug:popup-state', tabId: 88 });
assert.equal(resumed.ok, true);
assert.equal(resumed.crawlEnabled, true, 'Interrupted traversal did not auto-resume on the same authorized experience.');

const second = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: guide2Url,
    directoryLike: false,
    capture: capture(guide2Url, 'Guide Two'),
    targets: [{ url: guide1Url, title: 'Guide One duplicate link' }],
    diagnostics: { scrollSteps: 3, controlsClicked: 1, tabPanels: 0, imagesStillPending: 0 },
  },
}, { tab: whopTab(), frameId: 4 });
assert.equal(second.ok, true);
assert.equal(second.complete, true);
assert.equal(second.crawlStatus, 'complete');
assert.equal(second.crawlNew, 2);

let popupState = await dispatch({ type: 'sniperplug:popup-state', tabId: 88 });
assert.equal(popupState.queueCount, 2);
assert.deepEqual(Array.from(popupState.queuedTitles), ['Guide One', 'Guide Two']);
assert.equal(navigationRequests.some((url) => url.includes('evil.example.com') || url.includes('exp_other') || url.includes('token=')), false);

const pending = await dispatch({ type: 'sniperplug:prepare-send', tabId: 88, rightsConfirmed: true });
assert.equal(pending.ok, true);
await dispatch({ type: 'sniperplug:clear-pending', pendingId: pending.pendingId, success: true });
popupState = await dispatch({ type: 'sniperplug:popup-state', tabId: 88 });
assert.equal(popupState.queueCount, 0);

navigationRequests.length = 0;
await registerCandidate(88, directoryUrl, 'Content');
started = await dispatch({ type: 'sniperplug:start-traversal', tabId: 88, scope: 'experience' });
assert.equal(started.ok, true);
await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d', pageUrl: directoryUrl, directoryLike: true,
    capture: capture(directoryUrl, 'Content'), targets: [{ url: guide1Url, title: 'Guide One' }, { url: guide2Url, title: 'Guide Two' }], diagnostics: {},
  },
}, { tab: whopTab(), frameId: 4 });
const unchanged1 = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: { experienceId: 'exp_rpaFYR2AD7Mb9d', pageUrl: guide1Url, directoryLike: false, capture: capture(guide1Url, 'Guide One'), targets: [], diagnostics: {} },
}, { tab: whopTab(), frameId: 4 });
assert.equal(unchanged1.crawlUnchanged, 1);
const unchanged2 = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: { experienceId: 'exp_rpaFYR2AD7Mb9d', pageUrl: guide2Url, directoryLike: false, capture: capture(guide2Url, 'Guide Two'), targets: [], diagnostics: {} },
}, { tab: whopTab(), frameId: 4 });
assert.equal(unchanged2.crawlUnchanged, 2);
popupState = await dispatch({ type: 'sniperplug:popup-state', tabId: 88 });
assert.equal(popupState.queueCount, 0, 'Unchanged sync pages should not be re-queued.');

const nestedDirectory = `${directoryUrl}/category-a`;
await registerCandidate(88, nestedDirectory, 'Category A');
started = await dispatch({ type: 'sniperplug:start-traversal', tabId: 88, scope: 'section' });
assert.equal(started.crawlScope, 'section');
navigationRequests.length = 0;
await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d', pageUrl: nestedDirectory, directoryLike: true, capture: null, diagnostics: {},
    targets: [
      { url: `${nestedDirectory}/inside`, title: 'Inside section' },
      { url: `${directoryUrl}/outside`, title: 'Outside section' },
    ],
  },
}, { tab: whopTab(), frameId: 4 });
assert.deepEqual(navigationRequests, [`${nestedDirectory}/inside`]);

console.log('\nBROWSER AUTHORIZED CONTENT SYNC REGRESSION PASSED\n');
console.log('✓ Recursive capture stays same-origin, same-experience, sensitive-route safe, and supports section scope.');
console.log('✓ Empty/slow pages receive bounded retries instead of silent loss.');
console.log('✓ Traversal/queue progress survives an interrupted Firefox Android tab and resumes on the replacement tab.');
console.log('✓ Successful imports commit content fingerprints so unchanged pages are skipped on later syncs.');
console.log('✓ True visible progress, lazy-render preparation, diagnostics, one-click handoff, and server-safe batching remain wired in.');
