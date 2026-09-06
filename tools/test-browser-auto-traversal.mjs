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

assert.ok(captureScript.includes('function discoverTraversalTargets') && captureScript.includes('function safeTraversalUrl'), 'The DOM reader does not discover bounded safe traversal targets.');
assert.ok(captureScript.includes("url.origin !== location.origin") && captureScript.includes('targetExperience !== experienceId'), 'Traversal lost same-origin or same-experience confinement.');
assert.ok(captureScript.includes("type: `${MESSAGE_PREFIX}traversal-page`") && captureScript.includes('location.assign(target)'), 'Rendered traversal snapshots or app-frame navigation are missing.');
assert.ok(!/\bfetch\s*\(/.test(captureScript), 'Capture-all must remain DOM/navigation driven and must not probe Better Content private APIs.');
assert.ok(background.includes("TRAVERSAL_KEY = 'sniperplugTraversalTabs'") && background.includes('MAX_TRAVERSAL_VISITS = 240'), 'Traversal state is not bounded and persisted across iframe reloads.');
assert.ok(background.includes('MAX_QUEUE = 120') && background.includes('MAX_QUEUE_BODY_CHARS = 4_000_000'), 'Capture-all queue is not large enough for real directories or is unbounded.');
assert.ok(background.includes("message?.type === 'sniperplug:start-traversal'") && background.includes("message?.type === 'sniperplug:traversal-page'"), 'Background traversal orchestration messages are missing.');
assert.ok(popupHtml.includes('id="crawl"') && popup.includes("type: 'sniperplug:start-traversal'"), 'Firefox popup does not expose Capture all guides.');
assert.ok(relay.includes('MAX_CAPTURE_BATCH_COUNT = 25') && relay.includes('captureBatches') && relay.includes('for (let index = 0; index < batches.length; index += 1)'), 'Large queues are not split into server-safe browser-capture batches.');

const storageState = Object.create(null);
const whopTab = {
  id: 77,
  url: 'https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app',
  lastAccessed: Date.now(),
  windowId: 1,
};
const host = 'mfk8y74zmein6tne8o5e.apps.whop.com';
const directoryUrl = `https://${host}/experiences/exp_rpaFYR2AD7Mb9d/pages`;
const guide1Url = `${directoryUrl}/guide-1`;
const guide2Url = `${directoryUrl}/guide-2`;
let runtimeListener = null;
const navigationRequests = [];

function storageGet(key) {
  if (typeof key === 'string') return { [key]: storageState[key] };
  const output = {};
  for (const item of Array.isArray(key) ? key : Object.keys(key || {})) output[item] = storageState[item];
  return output;
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

function capture(url, title) {
  return {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    title,
    pageUrl: url,
    frameUrl: url,
    pageIdentity: `${url}|${title}`,
    bodyMarkdown: `# ${title}\n\nThis is a complete rendered Better Content guide body with enough text to be safely captured.`,
    textLength: 300,
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
  setTimeout,
  clearTimeout,
  crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
  chrome: {
    storage: {
      session: {
        get: async (key) => storageGet(key),
        set: async (value) => Object.assign(storageState, value),
      },
    },
    runtime: { onMessage: { addListener: (listener) => { runtimeListener = listener; } } },
    tabs: {
      query: async ({ url } = {}) => {
        const patterns = Array.isArray(url) ? url : [url];
        return patterns.some((item) => String(item || '').includes('whop.com')) ? [whopTab] : [];
      },
      sendMessage: async (_tabId, message, options = {}) => {
        assert.equal(options.frameId, 4);
        if (message.type === 'sniperplug:probe-now') return { ok: true };
        if (message.type === 'sniperplug:set-traversal') return { ok: true, enabled: message.enabled };
        if (message.type === 'sniperplug:traverse-navigate') {
          navigationRequests.push(message.url);
          return { ok: true };
        }
        return { ok: true };
      },
      update: async () => whopTab,
      create: async () => whopTab,
      onRemoved: { addListener: () => {} },
    },
    windows: { update: async () => ({}) },
    webNavigation: {
      getAllFrames: async () => [{ frameId: 0, url: whopTab.url }, { frameId: 4, url: directoryUrl }],
      onCommitted: { addListener: () => {} },
    },
    scripting: { executeScript: async () => [] },
  },
};
context.globalThis = context;
runInNewContext(background, context, { filename: 'browser-extension/background.js' });

await dispatch({
  type: 'sniperplug:candidate',
  candidate: {
    experienceId: '',
    title: 'Content',
    pageUrl: directoryUrl,
    textLength: 1200,
    host,
    likelyAppFrame: true,
  },
}, { tab: whopTab, frameId: 4 });

const started = await dispatch({ type: 'sniperplug:start-traversal', tabId: 77 });
assert.equal(started.ok, true);
assert.equal(started.crawlEnabled, true);

const directory = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: directoryUrl,
    directoryLike: true,
    capture: capture(directoryUrl, 'Content'),
    targets: [
      { url: guide1Url, title: 'Guide One' },
      { url: 'https://evil.example.com/steal', title: 'Unsafe' },
      { url: `https://${host}/experiences/exp_other/pages/not-ours`, title: 'Other experience' },
      { url: guide2Url, title: 'Guide Two' },
    ],
  },
}, { tab: whopTab, frameId: 4 });
assert.equal(directory.ok, true);
assert.deepEqual(navigationRequests, [guide1Url]);
assert.equal(directory.crawlCaptured, 0, 'Directory shell should not be captured.');

const first = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: guide1Url,
    directoryLike: false,
    capture: capture(guide1Url, 'Guide One'),
    targets: [],
  },
}, { tab: whopTab, frameId: 4 });
assert.equal(first.ok, true);
assert.deepEqual(navigationRequests, [guide1Url, guide2Url]);
assert.equal(first.crawlCaptured, 1);

const second = await dispatch({
  type: 'sniperplug:traversal-page',
  snapshot: {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: guide2Url,
    directoryLike: false,
    capture: capture(guide2Url, 'Guide Two'),
    targets: [{ url: guide1Url, title: 'Guide One duplicate' }],
  },
}, { tab: whopTab, frameId: 4 });
assert.equal(second.ok, true);
assert.equal(second.complete, true);
assert.equal(second.crawlStatus, 'complete');
assert.equal(second.crawlCaptured, 2);

const popupState = await dispatch({ type: 'sniperplug:popup-state', tabId: 77 });
assert.equal(popupState.ok, true);
assert.equal(popupState.queueCount, 2);
assert.deepEqual(Array.from(popupState.queuedTitles), ['Guide One', 'Guide Two']);
assert.equal(popupState.crawlEnabled, false);
assert.equal(popupState.crawlCaptured, 2);
assert.equal(navigationRequests.some((url) => url.includes('evil.example.com') || url.includes('exp_other')), false);

console.log('\nBROWSER AUTO TRAVERSAL REGRESSION PASSED\n');
console.log('✓ Capture all guides starts from the verified Better Content app frame.');
console.log('✓ Directory shells are skipped while discovered guide links are traversed automatically.');
console.log('✓ Cross-origin and cross-experience targets are rejected before navigation.');
console.log('✓ Guide captures are deduplicated, queued, and traversal completes without manual page opening.');
console.log('✓ Large browser queues are handed to the unchanged server limit in safe chunks.');
