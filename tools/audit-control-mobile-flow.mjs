import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const control = readFileSync('assets/js/control-center-v2.js', 'utf8');
const backups = readFileSync('assets/js/control-center-whop-backups.js', 'utf8');
const css = readFileSync('assets/css/control-center-hardening.css', 'utf8');
const page = readFileSync('control-center/index.html', 'utf8');
const controlApi = readFileSync('functions/api/control.js', 'utf8');
const posts = readFileSync('functions/_lib/posts.js', 'utf8');

assert.ok(control.includes('const POST_PAGE_SIZE = MOBILE_QUERY.matches ? 4 : 10'));
assert.ok(control.includes('const SOURCE_PAGE_SIZE = MOBILE_QUERY.matches ? 6 : 12'));
assert.ok(control.includes('const GUIDE_PAGE_SIZE = MOBILE_QUERY.matches ? 8 : 24'));
assert.ok(control.includes('Press Load sources when you are ready'));
assert.ok(!control.includes('state.discoveryAutoPasses >= 8'));
assert.ok(!control.includes('idle(appendRemaining)'));
assert.ok(control.includes("dataset.action = 'post-load-more'"));
assert.ok(control.includes("dataset.action = 'source-load-more'"));
assert.ok(control.includes('const matchingEntries = entries.filter') && control.includes('list.dataset.filterKey = filterKey'));
assert.ok(control.includes('for (const entry of entries) state.sourceCards.delete(sourceId(entry))'));
assert.ok(control.includes('scanIfApproved: false'));
assert.ok(control.includes('async function replacePostsForReview') && control.includes('await nextRenderFrame()'));
assert.ok(control.includes('action=post-detail') && control.includes("typeof exact.body !== 'string'"));
assert.ok(controlApi.includes('posts: posts.map(summarizePostForClient)'));
assert.ok(controlApi.includes("currentAction === 'post-detail'"));
assert.ok(posts.includes('export function summarizePostForClient') && posts.includes('export async function savedPostDetail'));
assert.ok(!controlApi.includes('    posts,\n    counts: {'));
assert.ok(control.includes('const background = [];') && control.includes('deferredHistoryLoaded'));
assert.ok(control.includes("textContent = state.discovery ? 'Refresh sources' : 'Load sources'"));
assert.ok(backups.includes('structureRecoveryPanel'));
assert.ok(backups.includes('dataset.backupAction'));
assert.ok(backups.includes('elements.continue = continueButton') && backups.includes('elements.continue.disabled = state.busy || !valid'));
assert.ok(!backups.includes('new MutationObserver'));
assert.ok(css.includes('.whop-recovery-workflow'));
assert.ok(css.includes('@media(max-width:720px)'));
for (const asset of ['control-center-hardening.css', 'control-center-v2.js', 'control-center-whop-backups.js']) {
  assert.ok(page.includes(`/assets/${asset.endsWith('.css') ? 'css' : 'js'}/${asset}?v=20260803.3`), `${asset} cache version was not bumped with the mobile repair.`);
}
console.log('CONTROL CENTER MOBILE FLOW AUDIT PASSED');
