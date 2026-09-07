import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const background = readFileSync(join(root, 'browser-extension/background.js'), 'utf8');

const whopTab = {
  id: 77,
  url: 'https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app',
  lastAccessed: Date.now(),
  windowId: 1,
};
const appUrl = 'https://mfk8y74zmein6tne8o5e.apps.whop.com/experiences/exp_rpaFYR2AD7Mb9d/pages/profit';

function makeHarness({ initialCandidate = false, exposeFrames = true } = {}) {
  const now = Date.now();
  const storageState = Object.create(null);
  if (initialCandidate) {
    storageState.sniperplugCandidates = {
      '77:4': {
        tabId: 77,
        frameId: 4,
        seenAt: now,
        experienceId: 'exp_rpaFYR2AD7Mb9d',
        title: '$2000+ PROFIT WITH NO RISK',
        pageUrl: appUrl,
        textLength: 3428,
        host: 'mfk8y74zmein6tne8o5e.apps.whop.com',
        likelyAppFrame: true,
      },
    };
  }

  let runtimeListener = null;
  let targetedFrameIds = [];
  let allFramesCount = 0;
  let frameInventoryCount = 0;
  let captureFrameId = null;
  let probeCount = 0;

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

  const goodCapture = {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    title: '$2000+ PROFIT WITH NO RISK',
    pageUrl: appUrl,
    frameUrl: appUrl,
    pageIdentity: `${appUrl}|$2000+ PROFIT WITH NO RISK`,
    bodyMarkdown: '# $2000+ PROFIT WITH NO RISK\n\nThis is a complete rendered Better Content guide body for regression testing.',
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
          if (message?.type === 'sniperplug:probe-now') {
            probeCount += 1;
            return { ok: true };
          }
          if (message?.type === 'sniperplug:capture-now') {
            captureFrameId = options.frameId;
            return { ok: true, capture: goodCapture };
          }
          return { ok: true };
        },
        update: async () => whopTab,
        create: async () => whopTab,
        onRemoved: { addListener: () => {} },
      },
      windows: { update: async () => ({}) },
      webNavigation: {
        getAllFrames: async ({ tabId }) => {
          assert.equal(tabId, whopTab.id);
          frameInventoryCount += 1;
          if (!exposeFrames) return [];
          return [
            { frameId: 0, url: whopTab.url },
            { frameId: 4, url: appUrl },
          ];
        },
        onCommitted: { addListener: () => {} },
      },
      scripting: {
        executeScript: async ({ target, files }) => {
          assert.deepEqual(Array.from(files || []), ['content-capture.js']);
          if (Array.isArray(target?.frameIds)) {
            targetedFrameIds.push(...target.frameIds);
            if (target.frameIds.includes(4)) {
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
            }
          } else if (target?.allFrames === true) {
            allFramesCount += 1;
          }
          return [];
        },
      },
    },
  };
  context.globalThis = context;
  runInNewContext(background, context, { filename: 'browser-extension/background.js' });
  return {
    dispatch,
    get targetedFrameIds() { return targetedFrameIds; },
    get allFramesCount() { return allFramesCount; },
    get frameInventoryCount() { return frameInventoryCount; },
    get captureFrameId() { return captureFrameId; },
    get probeCount() { return probeCount; },
  };
}

{
  const harness = makeHarness({ initialCandidate: true, exposeFrames: false });
  const popup = await harness.dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id });
  assert.equal(popup.ok, true);
  assert.equal(popup.candidate?.frameId, 4, 'A cached app-frame candidate was lost while opening the popup.');
  assert.equal(popup.candidate?.title, '$2000+ PROFIT WITH NO RISK');
  assert.equal(harness.probeCount, 0, 'Popup opening should not synchronously probe a cached candidate.');
  assert.equal(harness.frameInventoryCount, 0, 'A cached candidate should not trigger frame inventory during popup opening.');
  assert.equal(harness.allFramesCount, 0, 'A cached candidate should not trigger broad all-frame reinjection.');

  const captured = await harness.dispatch({ type: 'sniperplug:capture-current', tabId: whopTab.id });
  assert.equal(captured.ok, true);
  assert.ok(harness.probeCount >= 1, 'Capture action must still verify the cached candidate before use.');
  assert.equal(harness.captureFrameId, 4, 'Capture did not target the cached Better Content frame.');
}

{
  const harness = makeHarness({ initialCandidate: false, exposeFrames: true });
  const initial = await harness.dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id });
  assert.equal(initial.ok, true);
  assert.equal(initial.candidate, null, 'Cold popup should return before Firefox frame recovery finishes.');
  assert.equal(initial.candidateRecoveryPending, true, 'Cold popup did not expose pending frame recovery.');

  await new Promise((resolve) => setTimeout(resolve, 10));
  const popup = await harness.dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id });
  assert.equal(popup.ok, true);
  assert.equal(popup.candidate?.frameId, 4, 'Firefox frame inventory did not recover the real Better Content iframe asynchronously.');
  assert.deepEqual(harness.targetedFrameIds, [4], 'Recovery should inject directly into the discovered app frame, not the Whop shell.');
  assert.equal(harness.allFramesCount, 0, 'Broad all-frame injection ran even though Firefox exposed the exact app frame.');

  const captured = await harness.dispatch({ type: 'sniperplug:capture-current', tabId: whopTab.id });
  assert.equal(captured.ok, true);
  assert.equal(captured.queueCount, 1);
  assert.equal(harness.captureFrameId, 4, 'Capture did not target the verified Better Content frame.');
}

console.log('\nFIREFOX STABLE CANDIDATE RECOVERY REGRESSION PASSED\n');
console.log('✓ Opening the popup reuses cached candidate metadata without synchronous probe or frame inventory.');
console.log('✓ Capture actions still verify a cached candidate before using it.');
console.log('✓ Cold Firefox frame recovery runs asynchronously and targets the exact *.apps.whop.com frame.');
console.log('✓ Capture page targets the verified frame ID and queues the rendered guide.');
