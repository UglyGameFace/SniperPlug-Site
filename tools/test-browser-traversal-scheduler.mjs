import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const captureScript = readFileSync(join(root, 'browser-extension/content-capture.js'), 'utf8');

const start = captureScript.indexOf('function resetTraversalSnapshotSchedule');
const end = captureScript.indexOf('\n\n  function resumeTraversal', start);
assert.ok(start >= 0 && end > start, 'Could not isolate the production traversal snapshot scheduler.');
const schedulerSource = captureScript.slice(start, end);

assert.ok(schedulerSource.includes('if (traversalTimer) return;'), 'Repeated DOM mutations can reset the settle timer again.');
assert.ok(schedulerSource.includes('traversalDirty = true;'), 'Mutations during an active snapshot are not coalesced for a follow-up pass.');
assert.ok(schedulerSource.includes('if (traversalEnabled && traversalDirty) scheduleTraversalSnapshot();'), 'Dirty work is not guaranteed a follow-up snapshot.');
assert.ok(!/function scheduleTraversalSnapshot\(\)[\s\S]*?clearTimeout\(traversalTimer\)/.test(schedulerSource), 'The normal traversal scheduler still clears its own settle timer and can starve forever.');

const scheduled = [];
const phases = [];
const sent = [];
let nextTimerId = 1;
let blockSnapshot = null;
let releaseSnapshot = null;
let snapshotNumber = 0;

function makeSnapshot(number) {
  return {
    experienceId: 'exp_rpaFYR2AD7Mb9d',
    pageUrl: `https://example.apps.whop.com/experiences/exp_rpaFYR2AD7Mb9d/pages/${number}`,
    targets: [],
    capture: { bodyMarkdown: `# Page ${number}\n\nRendered guide body.` },
    diagnostics: { controlsClicked: 0 },
  };
}

const context = {
  Promise,
  String,
  Error,
  traversalEnabled: true,
  traversalBusy: false,
  traversalTimer: 0,
  traversalDirty: false,
  lastTraversalIdentity: '',
  MESSAGE_PREFIX: 'sniperplug:',
  setTimeout: (fn, ms) => {
    const id = nextTimerId++;
    scheduled.push({ id, fn, ms });
    return id;
  },
  clearTimeout: () => {},
  reportTraversalProgress: (phase) => phases.push(phase),
  traversalSnapshot: async () => {
    snapshotNumber += 1;
    if (blockSnapshot) await blockSnapshot;
    return makeSnapshot(snapshotNumber);
  },
  chrome: {
    runtime: {
      sendMessage: (message) => {
        sent.push(message);
        return Promise.resolve({ ok: true });
      },
    },
  },
};
context.globalThis = context;
runInNewContext(`${schedulerSource}\nglobalThis.scheduleForTest = scheduleTraversalSnapshot;\nglobalThis.resetForTest = resetTraversalSnapshotSchedule;`, context, {
  filename: 'browser-extension/content-capture-scheduler.js',
});

for (let index = 0; index < 100; index += 1) context.scheduleForTest();
assert.equal(scheduled.length, 1, 'A 100-mutation burst scheduled more than one settle timer.');
assert.equal(scheduled[0].ms, 900, 'The scheduler no longer uses the production traversal settle window.');
assert.equal(phases.filter((phase) => phase === 'settling').length, 1, 'Repeated mutations should not restart the visible settling phase.');

const firstTimer = scheduled.shift();
await firstTimer.fn();
assert.equal(snapshotNumber, 1, 'The first traversal snapshot never ran after a mutation storm.');
assert.equal(sent.length, 1, 'The first prepared snapshot was not sent to the crawler.');
assert.ok(phases.includes('sending'), 'The live phase stream never reached sending.');

blockSnapshot = new Promise((resolve) => { releaseSnapshot = resolve; });
context.scheduleForTest();
assert.equal(scheduled.length, 1);
const busyTimer = scheduled.shift();
const busyRun = busyTimer.fn();
await Promise.resolve();
for (let index = 0; index < 50; index += 1) context.scheduleForTest();
assert.equal(scheduled.length, 0, 'Mutations during extraction should be coalesced, not create competing timers.');
releaseSnapshot();
await busyRun;
assert.equal(scheduled.length, 1, 'A mutation during extraction did not guarantee one follow-up snapshot.');

blockSnapshot = null;
const followUp = scheduled.shift();
await followUp.fn();
assert.equal(snapshotNumber, 3, 'The coalesced follow-up snapshot did not run exactly once.');
assert.equal(sent.length, 3, 'Prepared snapshots were lost while coalescing mutations.');

context.resetForTest();
assert.equal(context.traversalTimer, 0, 'Explicit traversal reset did not clear the scheduled timer state.');
assert.equal(context.traversalDirty, false, 'Explicit traversal reset left stale dirty work behind.');

console.log('\nBROWSER CAPTURE-ALL SCHEDULER REGRESSION PASSED\n');
console.log('✓ A continuous DOM-mutation burst cannot postpone the first traversal snapshot indefinitely.');
console.log('✓ Mutations during extraction coalesce into exactly one guaranteed follow-up pass.');
console.log('✓ Live settling/sending phases still fire while the crawler makes real forward progress.');
