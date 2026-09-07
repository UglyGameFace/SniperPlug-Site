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

assert.equal(manifest.version, '0.2.4', 'Firefox authorized-sync package version was not bumped.');
assert.ok(manifest.permissions.includes('webNavigation'), 'Firefox frame inventory permission is missing.');
assert.deepEqual(
  manifest.content_scripts?.[0]?.matches,
  ['https://*.apps.whop.com/*'],
  'Rendered Better Content extraction must not be statically injected into the top-level whop.com shell.',
);
const appGuard = captureScript.indexOf('const APP_FRAME_HOST = isWhopAppHost(location.hostname)');
const idempotentGuard = captureScript.indexOf('globalThis.__sniperplugBetterContentCapture?.registerCandidate');
assert.ok(appGuard >= 0 && idempotentGuard > appGuard, 'App-frame validation must run before the reinjection/idempotence shortcut.');
assert.ok(captureScript.includes("if (!APP_FRAME_HOST || location.protocol !== 'https:') return;"), 'Non-HTTPS or non-app Whop frames are not rejected before DOM extraction.');
assert.ok(background.includes("candidate?.likelyAppFrame !== true || !isWhopAppHost(candidate?.host)"), 'Background candidate storage still accepts the Whop shell.');
assert.ok(background.includes('const tabExperienceId = experienceIdFromUrl(sender?.tab?.url);'), 'The current top-level Whop exp_ ID is not linked to the app frame.');
assert.ok(background.includes('verifyCandidate') && !background.includes('await clearCandidatesForTab(tab.id);'), 'Candidate recovery can still erase a known-good app-frame candidate before verifying it.');
assert.ok(background.includes('chrome.webNavigation?.getAllFrames') && background.includes('frameIds: [frameId]'), 'Firefox recovery does not target the exact app frame discovered by browser frame inventory.');
assert.ok(background.includes('APP_FRAME_SETTLE_MS = 4000'), 'Mobile app-frame recovery window is too short for a loaded Firefox Android tab.');
assert.ok(background.includes('scheduleCandidateRecovery') && background.includes('candidateRecoveryPending'), 'Popup candidate recovery is not asynchronous anymore.');
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
let committedListener = null;
let captureFrameId = null;
let returnBadCapture = false;
let broadInjectionCount = 0;
let targetedInjectionCount = 0;

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
      getManifest: () => ({ version: '0.2.4' }),
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
        if (message?.type === 'sniperplug:probe-now') return { ok: true };
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
    webNavigation: {
      getAllFrames: async ({ tabId }) => {
        assert.equal(tabId, whopTab.id);
        return [
          { frameId: 0, url: whopTab.url },
          { frameId: 4, url: appUrl },
        ];
      },
      onCommitted: {
        addListener: (listener) => { committedListener = listener; },
      },
    },
    scripting: {
      executeScript: async ({ target, files }) => {
        assert.deepEqual(Array.from(files || []), ['content-capture.js']);
        if (Array.isArray(target?.frameIds)) {
          targetedInjectionCount += 1;
          assert.deepEqual(Array.from(target.frameIds), [4]);
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
        }
        if (target?.allFrames === true) broadInjectionCount += 1;
        return [];
      },
    },
  },
};
context.globalThis = context;
runInNewContext(background, context, { filename: 'browser-extension/background.js' });
assert.equal(typeof removedListener, 'function', 'Tab cleanup listener was not registered.');
assert.equal(typeof committedListener, 'function', 'Frame-navigation cleanup listener was not registered.');

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

const initialPopupState = await dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id });
assert.equal(initialPopupState.ok, true);
assert.equal(initialPopupState.candidate, null, 'A cold popup should not block until frame recovery completes.');
assert.equal(initialPopupState.candidateRecoveryPending, true, 'Cold popup did not report asynchronous frame recovery.');

await new Promise((resolve) => setTimeout(resolve, 10));
const popupState = await dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id });
assert.equal(popupState.ok, true);
assert.equal(popupState.candidate?.host, 'mfk8y74zmein6tne8o5e.apps.whop.com', 'The Whop shell outranked the actual Better Content iframe.');
assert.equal(popupState.candidate?.title, '$2000+ PROFIT WITH NO RISK');
assert.equal(popupState.candidate?.experienceId, 'exp_rpaFYR2AD7Mb9d', 'Current top-level experience ID was not attached to the app frame.');
assert.equal(popupState.candidateCount, 1, 'Shell candidates should never enter the usable capture candidate set.');
assert.equal(targetedInjectionCount, 1, 'Recovery did not target the exact app frame once.');
assert.equal(broadInjectionCount, 0, 'Broad all-frame injection ran despite a known app frame.');

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
console.log('✓ Cold popup state returns before frame recovery and reports that recovery is pending.');
console.log('✓ Firefox frame inventory still targets frame 4 and the recovered candidate appears on the next popup poll.');
console.log('✓ Capture page re-verifies and targets the recovered frame ID.');
console.log('✓ Shell-frame capture payloads are rejected by both extension queue and server preflight.');
