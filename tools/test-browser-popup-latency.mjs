import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const background = readFileSync(join(root, 'browser-extension/background.js'), 'utf8');
const popup = readFileSync(join(root, 'browser-extension/popup.js'), 'utf8');

assert.ok(background.includes('cachedExtensionVersionState'), 'Popup state no longer has a cache-only extension version path.');
assert.ok(background.includes('scheduleExtensionVersionRefresh'), 'Extension version refresh is not scheduled out of band.');
assert.ok(background.includes('scheduleCandidateRecovery'), 'Candidate recovery is not scheduled out of band.');
assert.ok(background.includes('scheduleStaleTraversalRepair'), 'Stale traversal repair can block popup opening again.');
assert.ok(popup.includes('candidateRecoveryPending') && popup.includes('Finding Better Content'), 'Popup does not expose immediate background-recovery feedback.');

const whopTab = {
  id: 77,
  url: 'https://whop.com/hidden-files/exp_rpaFYR2AD7Mb9d/app',
  lastAccessed: Date.now(),
  windowId: 1,
};
const storageState = Object.create(null);
let runtimeListener = null;
let frameInventoryStarted = 0;
let versionFetchStarted = 0;

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

const never = () => new Promise(() => {});
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
  fetch: () => {
    versionFetchStarted += 1;
    return never();
  },
  chrome: {
    storage: {
      session: {
        get: async (key) => storageGet(key),
        set: async (value) => Object.assign(storageState, value),
      },
    },
    runtime: {
      getManifest: () => ({ version: '0.2.2' }),
      onMessage: { addListener: (listener) => { runtimeListener = listener; } },
    },
    tabs: {
      query: async ({ url } = {}) => {
        const patterns = Array.isArray(url) ? url : [url];
        return patterns.some((item) => String(item || '').includes('whop.com')) ? [whopTab] : [];
      },
      sendMessage: async () => ({ ok: true }),
      update: async () => whopTab,
      create: async () => whopTab,
      onRemoved: { addListener: () => {} },
    },
    windows: { update: async () => ({}) },
    webNavigation: {
      getAllFrames: async () => {
        frameInventoryStarted += 1;
        return never();
      },
      onCommitted: { addListener: () => {} },
    },
    scripting: { executeScript: async () => [] },
  },
};
context.globalThis = context;
runInNewContext(background, context, { filename: 'browser-extension/background.js' });

const startedAt = Date.now();
const popupState = await Promise.race([
  dispatch({ type: 'sniperplug:popup-state', tabId: whopTab.id }),
  new Promise((_, reject) => setTimeout(() => reject(new Error('popup-state blocked on background recovery')), 250)),
]);
const elapsedMs = Date.now() - startedAt;

assert.equal(popupState.ok, true);
assert.equal(popupState.candidate, null);
assert.equal(popupState.candidateRecoveryPending, true, 'Cold popup did not report background recovery in progress.');
assert.equal(popupState.extensionVersion?.installed, '0.2.2');
assert.ok(elapsedMs < 250, `Popup-state took ${elapsedMs}ms even though only cached/local data was required.`);

await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(frameInventoryStarted >= 1, 'Candidate recovery was not actually started in the background.');
assert.ok(versionFetchStarted >= 1, 'Version refresh was not actually started in the background.');

console.log('\nBROWSER POPUP LATENCY REGRESSION PASSED\n');
console.log(`✓ Cold popup-state returned in ${elapsedMs}ms while frame inventory and version fetch were intentionally hung.`);
console.log('✓ Slow Firefox frame recovery starts asynchronously instead of blocking the popup.');
console.log('✓ Slow extension-version network refresh starts asynchronously instead of blocking the popup.');
console.log('✓ The popup reports recovery-in-progress so fast opening does not become silent uncertainty.');
