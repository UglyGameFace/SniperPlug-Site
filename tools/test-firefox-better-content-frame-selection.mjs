import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { isWhopAppFrameUrl, requireWhopAppFrameCaptures } from '../functions/_lib/browser-capture-origin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('browser-extension/manifest.json'));
const background = read('browser-extension/background.js');
const captureScript = read('browser-extension/content-capture.js');
const captureApi = read('functions/api/browser-capture.js');

assert.equal(manifest.version, '0.1.5', 'Firefox hardening package version was not bumped.');
assert.deepEqual(
  manifest.content_scripts?.[0]?.matches,
  ['https://*.apps.whop.com/*'],
  'Rendered Better Content extraction must not be statically injected into the top-level whop.com shell.',
);
const appGuard = captureScript.indexOf('const APP_FRAME_HOST = effectiveAppHost();');
const idempotentGuard = captureScript.indexOf('globalThis.__sniperplugBetterContentCapture?.registerCandidate');
assert.ok(appGuard >= 0 && idempotentGuard > appGuard, 'App-frame validation must run before the reinjection/idempotence shortcut.');
assert.ok(captureScript.includes('if (!APP_FRAME_HOST) return;'), 'Non-app Whop frames are not rejected before DOM extraction.');
assert.ok(background.includes("candidate?.likelyAppFrame !== true || !isWhopAppHost(candidate?.host)"), 'Background candidate storage still accepts the Whop shell.');
assert.ok(background.includes('const tabExperienceId = experienceIdFromUrl(sender?.tab?.url);'), 'The current top-level Whop exp_ ID is not linked to the app frame.');
assert.ok(background.includes('await clearCandidatesForTab(tab.id);'), 'A fresh popup probe can still reuse stale frame candidates.');
assert.ok(background.includes('waitForAppCandidate'), 'Firefox recovery still returns before the Better Content app frame has time to register.');
assert.ok(captureApi.includes('requireWhopAppFrameCaptures(body)'), 'The server API does not independently reject shell-frame captures.');

const appUrl = 'https://mfk8y74zmein6tne8o5e.apps.whop.com/experiences/exp_rpaFYR2AD7Mb9d/pages/profit';
assert.equal(isWhopAppFrameUrl(appUrl), true);
assert.equal(isWhopAppFrameUrl('https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app'), false);
assert.equal(isWhopAppFrameUrl('javascript:alert(1)'), false);
assert.doesNotThrow(() => requireWhopAppFrameCaptures({ captures: [{ pageUrl: appUrl }] }));
assert.throws(
  () => requireWhopAppFrameCaptures({ captures: [{ pageUrl: 'https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app' }] }),
  /rendered Better Content app frame/i,
);

const storageState = Object.create(null);
const whopTab = {
  id: 77,
  url: 'https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app',
  lastAccessed: Date.now(),
  windowId: 1,
};
let runtimeListener = null;
let removedListener = null;
let captureFrameId = null;
let returnBadCapture = false;

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
      const asyncResponse = runtimeListener(message, sender, resolve);
      if (asyncResponse !== true) resolve(undefined);
    } catch (error) {
      reject(error);
    }
  });
}

const goodCapture = {
  experienceId: 'exp_rpaFYR2AD7Mb9d',
  title: '$2000+ PROFIT WITH NO RISK',
  pageUrl: appUrl,
  frameUrl: appUrl,
  pageIdentity: `${appUrl}|$2000+ PROFIT WITH NO RISK`,
  bodyMarkdown: '# $2000+ PROFIT WITH NO RISK\n\nThis is the rendered Better Content guide body and it is intentionally long enough for capture.',
  textLength: 3428,
};

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
    runtime: {
      onMessage: {
        addListener: (listener) => { runtimeListener = listener; },
      },
    },
    tabs: {
      query: async ({ url } = {}) => {
        const patterns = Array.isArray(url) ? url : [url];
        if (patterns.some((item) => String(item || '').includes('whop.com'))) return [whopTab];
        return [];
      },
      sendMessage: async (_tabId, message, options = {}) => {
        if (message?.type === 'sniperplug:capture-now') {
          captureFrameId = options.frameId;
          if (!returnBadCapture) return { ok: true, capture: goodCapture };
          return {
            ok: true,
            capture: {
              ...goodCapture,
              pageUrl: whopTab.url,
              frameUrl: whopTab.url,
              pageIdentity: `${whopTab.url}|SniperPlug Better Content Capture`,
              title: 'SniperPlug Better Content Capture',
              bodyMarkdown: 'SniperPlug Better Content Capture reads only rendered pages inside Firefox and should never be imported as a guide.',
              textLength: 112,
            },
          };
        }
        return { ok: true };
      },
      update: async () => whopTab,
      create: async () => whopTab,
      onRemoved: {
        addListener: (listener) => { removedListener = listener; },
      },
    },
    windows: {
      update: async () => ({}),
    },
    scripting: {
      executeScript: async ({ target, files }) => {
        assert.equal(target?.tabId, whopTab.id);
        assert.equal(target?.allFrames, true);
        assert.deepEqual(Array.from(files || []), ['content-capture.js']);

        await dispatch({
          type: 'sniperplug:candidate',
          candidate: {
            experienceId: 'exp_rpaFYR2AD7Mb9d',
            title: 'SniperPlug Better Content Capture',
            pageUrl: whopTab.url,
            textLength: 112,
            host: 'whop.com',
            likelyAppFrame: false,
          },
        }, { tab: whopTab, frameId: 0 });

        await dispatch({
          type: 'sniperplug:candidate',
          candidate: {
            experienceId: '',
            title: '$2000+ PROFIT WITH NO RISK',
            pageUrl: appUrl,
            textLength: 3428,
            host: 'mfk8y74zmein6tne8o5e.apps.whop.com',
            likelyAppFrame: true,
          },
        }, { tab: whopTab, frameId: 4 });
        return [];
      },
    },
  },
};
context.globalThis = context;
runInNewContext(background, context, { filename: 'browser-extension/background.js' });
assert.equal(typeof removedListener, 'function', 'Tab cleanup listener was not registered.');

const popupState = await dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id });
assert.equal(popupState.ok, true);
assert.equal(popupState.candidate?.host, 'mfk8y74zmein6tne8o5e.apps.whop.com', 'The Whop shell outranked the actual Better Content iframe.');
assert.equal(popupState.candidate?.title, '$2000+ PROFIT WITH NO RISK');
assert.equal(popupState.candidate?.experienceId, 'exp_rpaFYR2AD7Mb9d', 'Current top-level experience ID was not attached to the app frame.');
assert.equal(popupState.candidateCount, 1, 'Shell candidates should never enter the usable capture candidate set.');

const captureResult = await dispatch({ type: 'sniperplug:capture-current', tabId: whopTab.id });
assert.equal(captureResult.ok, true);
assert.equal(captureResult.queueCount, 1);
assert.equal(captureFrameId, 4, 'Capture was sent to the Whop shell instead of the Better Content iframe.');

returnBadCapture = true;
const rejectedShellCapture = await dispatch({ type: 'sniperplug:capture-current', tabId: whopTab.id });
assert.equal(rejectedShellCapture.ok, false);
assert.match(rejectedShellCapture.error, /did not come from the rendered Better Content app frame/i);

console.log('\nFIREFOX BETTER CONTENT FRAME SELECTION REGRESSION PASSED\n');
console.log('✓ Top-level whop.com shell candidate is ignored even when it carries the exp_ ID.');
console.log('✓ Current Whop tab exp_ identity is attached to the real *.apps.whop.com frame.');
console.log('✓ Fresh all-frame recovery selects frame 4 rather than frame 0.');
console.log('✓ Shell-frame capture payloads are rejected by both extension queue and server preflight.');
