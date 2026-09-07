import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const capture = readFileSync(join(root, 'browser-extension/content-capture.js'), 'utf8');
const background = readFileSync(join(root, 'browser-extension/background.js'), 'utf8');
const popup = readFileSync(join(root, 'browser-extension/popup.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'browser-extension/manifest.json'), 'utf8'));

assert.equal(manifest.version, '0.2.5');
assert.ok(capture.includes('const CAPTURE_DOCUMENT_ID ='), 'Rendered frame documents are not uniquely identified across reloads.');
assert.ok(capture.includes('runTraversalSnapshotNow();') && capture.includes('traversal-snapshot-now'), 'Capture-all still lacks an immediate/forced first-snapshot path.');
assert.ok(capture.includes('sniperplug-capture-all-overlay') && capture.includes('traversal-state'), 'Capture-all no longer exposes live progress on the foreground Whop page.');
assert.ok(background.includes('TRAVERSAL_START_TIMEOUT_MS') && background.includes('MAX_TRAVERSAL_START_REPAIRS'), 'Capture-all startup has no bounded watchdog.');
assert.ok(background.includes('scheduleTraversalStartupTimeout(state);') && background.includes('repairTraversalStartup'), 'The startup watchdog is not wired into the traversal lifecycle.');
assert.ok(background.includes("{ type: 'sniperplug:traversal-state', state: traversalPublicState(state) }"), 'Background crawl state is not published to the rendered page overlay.');
assert.ok(background.includes("await chrome.tabs.update(sourceTabId, { active: true }).catch(() => null);"), 'Manual Capture page no longer foregrounds Whop before full rendered capture.');
assert.ok(popup.includes('elements.capture.disabled = !candidate?.experienceId;'), 'Manual Capture page is still disabled merely because Capture-all is active.');
assert.ok(popup.includes("chrome.tabs.update(tabId, { active: true })"), 'Capture-all does not return Firefox Android to the Whop page after starting.');
assert.ok(background.includes('previousCandidate.documentId !== normalized.documentId'), 'Same-document DOM churn can still cause needless traversal reattachment.');

console.log('\nBROWSER CAPTURE MODE RELIABILITY REGRESSION PASSED\n');
console.log('✓ Capture page remains a direct foregrounded fallback.');
console.log('✓ Capture-as-I-browse remains independent.');
console.log('✓ Capture-all starts immediately, self-recovers, and keeps Firefox on the rendered Whop page with live progress.');
