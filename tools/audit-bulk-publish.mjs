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
const jobResetEndpoint = read('functions/api/bulk-job-reset.js');
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
assert.ok(/for 48 hours/i.test(page), 'The owner is not told how long bulk actions remain reversible.');

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
assert.ok(jobs.includes('publishReadyGuides'), 'Durable owner jobs do not continue into safe publishing.');
assert.ok(jobs.includes('failures.push'), 'One source failure can abort the entire job without a durable summary.');
assert.ok(jobs.includes('const JOB_VERSION = 5'), 'Bulk jobs are not using the tenant-safe lease worker version.');
assert.ok(jobs.includes('const sourceKey = current.readyKeys[current.cursor]') && jobs.includes('sourceKeys: [sourceKey]'), 'Bulk Worker steps are not bounded to one exact item.');
assert.ok(jobs.includes('leaseToken') && jobs.includes('lease_until = ?'), 'Bulk Worker persistence does not verify lease ownership.');
assert.ok(jobs.includes('jobOwnerKey(admin)') && jobs.includes('principalIdFrom(admin)') && !jobs.includes("const OWNER_KEY = 'sniperplug-owner'"), 'Bulk jobs are not scoped to the authenticated account principal.');
assert.ok(recent.includes('actionOwnerKey(admin)') && recent.includes('principalIdFrom(admin)') && !recent.includes("const OWNER_KEY = 'sniperplug-owner'"), 'Bulk/recovery history is still shared across authenticated importer accounts.');
assert.ok(recent.includes('WHERE principal_id = ?') && recent.includes("status = 'rejected'"), 'Manual reject history is not restricted to the current account workspace.');
assert.ok(jobResetEndpoint.includes('principalIdFrom(admin)') && !jobResetEndpoint.includes('String(admin.sid)') && !jobResetEndpoint.includes("OWNER_KEY = 'sniperplug-owner'"), 'Bulk reset is not scoped to the same account principal as the durable worker.');
assert.ok(jobs.includes('shouldPauseWorkflow(error)') && jobs.includes('releaseStepLease'), 'Transient Whop/concurrency failures can still advance and permanently skip a bulk source or item.');
assert.ok(!jobs.includes('IMPORT_CHUNK = 50'), 'The unsafe source-wide 50-item import batch returned.');
assert.ok(jobs.includes("item.decision !== 'blocked'"), 'Blocked content can be auto-approved.');
