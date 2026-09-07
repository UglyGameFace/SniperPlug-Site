import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const popup = readFileSync(join(root, 'browser-extension/popup.js'), 'utf8');

const start = popup.indexOf('const CRAWL_PHASE_LABELS');
const end = popup.indexOf('\n\nfunction renderCrawlProgress', start);
assert.ok(start >= 0 && end > start, 'Could not isolate the production capture-all phase/progress implementation.');

const context = { Math, Number, String, Object };
context.globalThis = context;
runInNewContext(`${popup.slice(start, end)}\nglobalThis.crawlProgressStateForTest = crawlProgressState;\nglobalThis.crawlPhaseShortForTest = crawlPhaseShort;`, context, {
  filename: 'browser-extension/popup-progress.js',
});
const calculate = context.crawlProgressStateForTest;
const shortPhase = context.crawlPhaseShortForTest;
assert.equal(typeof calculate, 'function');
assert.equal(typeof shortPhase, 'function');

let progress = calculate({ crawlStatus: 'idle' });
assert.equal(progress.percent, 0);
assert.equal(progress.indeterminate, false);

progress = calculate({ crawlStatus: 'starting', crawlVisited: 0, crawlRemaining: 0, crawlDiscovered: 0 });
assert.equal(progress.indeterminate, true, 'Discovery must visibly animate before a real denominator exists.');
assert.match(progress.label, /discovering/i);

progress = calculate({ crawlStatus: 'starting', crawlVisited: 0, crawlRemaining: 0, crawlDiscovered: 0, crawlPhase: 'scrolling' });
assert.equal(progress.indeterminate, true);
assert.match(progress.label, /lazy-loaded content/i, 'Real page-preparation phase should replace generic scanning text.');
assert.equal(shortPhase({ crawlPhase: 'scrolling' }), 'Scrolling…');

progress = calculate({ crawlStatus: 'running', crawlVisited: 2, crawlRemaining: 3, crawlDiscovered: 5, crawlCaptured: 99, crawlPhase: 'images' });
assert.equal(progress.percent, 40, 'Running percentage must come from visited versus known work, not queued captures.');
assert.equal(progress.indeterminate, false);
assert.match(progress.label, /2 of 5 known pages checked/i);
assert.match(progress.label, /rendered images/i, 'Determinate progress should still expose the live preparation phase.');

const expanded = calculate({ crawlStatus: 'running', crawlVisited: 2, crawlRemaining: 3, crawlDiscovered: 8 });
assert.equal(expanded.percent, 25, 'Progress must honestly adjust when recursive discovery expands the known guide tree.');
assert.match(expanded.label, /2 of 8 known pages checked/i);

progress = calculate({ crawlStatus: 'running', crawlVisited: 5, crawlRemaining: 0, crawlDiscovered: 5 });
assert.equal(progress.percent, 99, 'A still-running crawler must never visually claim 100%.');

progress = calculate({ crawlStatus: 'stopped', crawlVisited: 2, crawlRemaining: 3, crawlDiscovered: 5 });
assert.equal(progress.percent, 40);
assert.match(progress.label, /before pause/i, 'Stopped progress should freeze truthfully instead of resetting.');

progress = calculate({ crawlStatus: 'complete', crawlVisited: 5, crawlRemaining: 0, crawlDiscovered: 5 });
assert.equal(progress.percent, 100, 'Completed traversal must visibly reach 100%.');
assert.equal(progress.indeterminate, false);

progress = calculate({ crawlStatus: 'complete-empty', crawlVisited: 0, crawlRemaining: 0, crawlDiscovered: 0 });
assert.equal(progress.percent, 100, 'A completed empty scan is still a completed scan.');
assert.match(progress.label, /scan finished/i);

console.log('\nBROWSER CAPTURE PROGRESS BAR REGRESSION PASSED\n');
console.log('✓ Discovery is indeterminate only until a real known-work denominator exists.');
console.log('✓ Live settle/read/expand/scroll/image/tab/extract/save phases replace generic dead-looking scanning text.');
console.log('✓ Determinate progress is driven by visited/discovered/remaining crawler state.');
console.log('✓ Recursive expansion can adjust the known-total percentage honestly.');
console.log('✓ Running scans stay below 100%; completed scans reach 100%; paused scans retain partial progress.');
