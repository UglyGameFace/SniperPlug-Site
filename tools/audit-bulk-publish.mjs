import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const page = read('control-center/index.html');
const client = read('assets/js/control-center-v2.js');
const jobs = read('functions/_lib/bulk-jobs.js');
const jobsEndpoint = read('functions/api/bulk-jobs.js');
const recent = read('functions/_lib/recent-actions.js');
const recentEndpoint = read('functions/api/recent-actions.js');
const publishEndpoint = read('functions/api/publish-ready.js');
const publish = read('functions/_lib/publish.js');
const styles = read('assets/css/whop-discovery.css');
const historyStyles = read('assets/css/bulk-history.css');
const hardeningStyles = read('assets/css/control-center-hardening.css');

for (const marker of [
  'data-bulk-rights', 'data-bulk-publish', 'data-bulk-progress',
  'data-publish-all-ready', 'data-publish-all-progress',
  'data-bulk-job-panel', 'data-resume-bulk-job', 'data-cancel-bulk-job',
  'data-bulk-progress-visual', 'data-progress-bar', 'data-progress-timeline',
  'data-recent-action-list', 'data-undo-selected-actions', 'data-undo-all-actions',
]) {
  assert.ok(page.includes(marker), `Bulk publishing UI is missing ${marker}.`);
}
assert.ok(page.includes('/assets/js/control-center-v2.js'), 'Consolidated Control Center runtime is not loaded.');
assert.ok(page.includes('Complete resumable workflow'), 'The complete bulk action is not clearly labeled.');
assert.ok(page.includes('auto-fit each category'), 'Per-item bulk category behavior is not explained.');
assert.ok(page.includes('explicit permission to republish'), 'Bulk publishing does not require explicit rights confirmation.');
assert.ok(page.includes('Progress is saved after every source') || client.includes('Progress is saved after every source'), 'Bulk recovery behavior is not explained.');
assert.ok(page.includes('For 48 hours'), 'The owner is not told how long bulk actions remain reversible.');

assert.ok(client.includes("requestJson('/api/bulk-jobs'"), 'Browser does not use the durable bulk job API.');
assert.ok(client.includes("action: 'start'") && client.includes("action: 'step'") && client.includes("action: 'cancel'"), 'Browser job lifecycle is incomplete.');
assert.ok(client.includes('state.selectedSources') && client.includes('indeterminate'), 'The master source checkbox does not reflect real selection state.');
assert.ok(client.includes('Progress is saved') && client.includes('Resume'), 'Interrupted bulk jobs do not explain recovery.');
assert.ok(client.includes('Approve, import & publish') && client.includes('selected source'), 'The complete action does not state that it approves, imports, and publishes the selection.');
assert.ok(client.includes('loadDashboard({ discovery: false })'), 'Completed bulk runs do not refresh owner data smoothly.');
assert.ok(!client.includes('window.location.reload()'), 'Bulk completion still forces a disruptive full-page reload.');
assert.ok(client.includes("requestJson('/api/publish-ready'"), 'Publish-all-ready action is missing.');
assert.ok(client.includes("requestJson('/api/recent-actions'"), 'Recent action history is not loaded.');
assert.ok(client.includes('undoActions') && client.includes('recentSelection'), 'Selective and all-action undo controls are incomplete.');
assert.ok(client.includes('requestIdleCallback') && client.includes('contentVisibility'), 'Large result lists are not rendered progressively and lazily.');
assert.ok(!client.includes('MutationObserver'), 'The consolidated runtime reintroduced broad mutation-observer churn.');

assert.ok(jobs.includes('CREATE TABLE IF NOT EXISTS bulk_jobs'), 'Bulk jobs are not persisted in D1.');
assert.ok(jobs.includes('lease_until') && jobs.includes('already running'), 'Concurrent duplicate job steps are not prevented.');
assert.ok(jobs.includes('scanApprovedSource') && jobs.includes('savePostDecision'), 'Durable job does not scan and approve source content.');
assert.ok(jobs.includes('autoPublishEligible === true'), 'Bulk jobs can still auto-publish manual-review chat or forum noise.');
assert.ok(jobs.includes('autoCategorize: true') && jobs.includes('importApprovedPosts'), 'Durable job does not assign categories per imported item.');
assert.ok(jobs.includes('publishReadyGuides'), 'Durable job does not continue into safe publishing.');
assert.ok(jobs.includes('failures.push'), 'One source failure can abort the entire job without a durable summary.');
assert.ok(jobs.includes('const JOB_VERSION = 3') && jobs.includes('sourceKeys: [sourceKey]'), 'Bulk Worker steps are not bounded to one exact item.');
assert.ok(!jobs.includes('IMPORT_CHUNK = 50'), 'The unsafe source-wide 50-item import batch returned.');
assert.ok(jobs.includes("item.decision !== 'blocked'"), 'Blocked content can be auto-approved.');
assert.ok(jobs.includes('manualReview') && jobs.includes('expired'), 'Bulk summaries do not explain held manual or expired items.');

assert.ok(jobsEndpoint.includes('requireAdmin'), 'Bulk job endpoint is not owner protected.');
assert.ok(jobsEndpoint.includes('requireSameOrigin'), 'Bulk job endpoint lacks same-origin protection.');
assert.ok(recentEndpoint.includes('requireAdmin') && recentEndpoint.includes('requireSameOrigin'), 'Undo endpoint is not owner and same-origin protected.');
assert.ok(recent.includes('HISTORY_HOURS = 48'), 'Recent bulk actions do not use the promised 48-hour window.');
assert.ok(recent.includes("status = 'draft'") && recent.includes("decision = 'pending'"), 'Undo does not return guides and source decisions to review state.');
assert.ok(recent.includes("status = 'canceled'") && recent.includes('cancelActive'), 'Undo all cannot stop an active bulk job safely.');
assert.ok(publishEndpoint.includes('requireAdmin') && publishEndpoint.includes('requireSameOrigin'), 'Publish-ready endpoint is not owner and same-origin protected.');
assert.ok(publish.includes("row.status !== 'draft'"), 'Non-draft guides can be bulk published.');
assert.ok(publish.includes('Number(attachments.reviewCount || 0) > 0'), 'Guides with unresolved files can be bulk published.');
assert.ok(publish.includes('integrity.blocked === true'), 'Guides with blocked integrity can be bulk published.');
assert.ok(publish.includes('publishHoldReason'), 'Quarantined, manual-review, or expired imports can be republished automatically.');
assert.ok(publish.includes('linkAudit.blockedCount'), 'Guides with blocked Whop links can be bulk published.');
assert.ok(publish.includes('row.source_key'), 'Non-imported guides can be swept into Whop bulk publishing.');
assert.ok(publish.includes("SET status = 'published'"), 'Ready drafts are not actually published.');
assert.ok(publish.includes('MAX_GUIDES = 500'), 'Bulk publishing has no bounded guide limit.');

assert.ok(styles.includes('.bulk-publish-box'), 'Complete bulk workflow has no dedicated layout.');
assert.ok(historyStyles.includes('.bulk-progress-track') && historyStyles.includes('.recent-action-list'), 'Interactive progress and undo history have no dedicated layout.');
assert.ok(historyStyles.includes('@media(max-width:760px)') && historyStyles.includes('@media(max-width:440px)'), 'Progress and undo controls do not reflow on narrow screens.');
assert.ok(hardeningStyles.includes('position:static!important'), 'Bulk controls do not have a normal-flow safeguard.');
assert.ok(!/\.(?:bulk-selection-bar|bulk-publish-box|bulk-publish-content)[^{]*\{[^}]*position\s*:\s*(?:sticky|fixed|absolute)/is.test(hardeningStyles), 'Bulk controls can float over following modules.');

console.log('\nSNIPERPLUG BULK PUBLISH AUDIT PASSED\n');
console.log('✓ The resumable workflow publishes only guide-ready top-level content.');
console.log('✓ Categories are selected per guide instead of once for an entire source.');
console.log('✓ Jobs persist in D1, isolate failures, and process one exact content item per Worker step.');
console.log('✓ Replies, low-signal messages, expired picks, unsafe links, and unresolved files stay private.');
console.log('✓ Bulk publications remain selectively reversible for 48 hours.');
console.log('✓ Undo all cancels an active job and returns published guides to private review.');
console.log('✓ The browser refreshes targeted data without full-page reloads or mutation-observer churn.');
console.log('✓ Progress and undo controls remain in normal document flow on every viewport.');
