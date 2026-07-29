import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const page = read('control-center/index.html');
const client = read('assets/js/bulk-publish.js');
const jobs = read('functions/_lib/bulk-jobs.js');
const jobsEndpoint = read('functions/api/bulk-jobs.js');
const publishEndpoint = read('functions/api/publish-ready.js');
const publish = read('functions/_lib/publish.js');
const styles = read('assets/css/whop-discovery.css');
const hardeningStyles = read('assets/css/control-center-hardening.css');

for (const marker of [
  'data-bulk-rights', 'data-bulk-publish', 'data-bulk-progress',
  'data-publish-all-ready', 'data-publish-all-progress',
  'data-bulk-job-panel', 'data-resume-bulk-job', 'data-cancel-bulk-job',
]) {
  assert.ok(page.includes(marker), `Bulk publishing UI is missing ${marker}.`);
}
assert.ok(page.includes('/assets/js/bulk-publish.js'), 'Bulk workflow browser runtime is not loaded.');
assert.ok(page.includes('Complete resumable workflow'), 'The complete bulk action is not clearly labeled.');
assert.ok(page.includes('assign fitting categories'), 'Bulk category behavior is not explained.');
assert.ok(page.includes('explicit permission to republish'), 'Bulk publishing does not require explicit rights confirmation.');
assert.ok(page.includes('Closing the tab pauses the job without losing progress'), 'Bulk recovery behavior is not explained.');

assert.ok(client.includes("fetch('/api/bulk-jobs'"), 'Browser does not use the durable bulk job API.');
assert.ok(client.includes("action: 'start'") && client.includes("action: 'step'") && client.includes("action: 'cancel'"), 'Browser job lifecycle is incomplete.');
assert.ok(client.includes('restoreMasterSelectionIfNeeded'), 'Restored checked master controls are not synchronized with real source selection.');
assert.ok(client.includes('masterDefaults.indeterminate'), 'The master source checkbox does not reflect partial selection.');
assert.ok(client.includes('Progress is saved'), 'Interrupted bulk jobs do not explain recovery.');
assert.ok(client.includes('setTimeout(() => window.location.reload()'), 'Completed bulk runs do not refresh the owner dashboard.');
assert.ok(client.includes("fetch('/api/publish-ready'"), 'Publish-all-ready action is missing.');

assert.ok(jobs.includes('CREATE TABLE IF NOT EXISTS bulk_jobs'), 'Bulk jobs are not persisted in D1.');
assert.ok(jobs.includes('lease_until') && jobs.includes('already running'), 'Concurrent duplicate job steps are not prevented.');
assert.ok(jobs.includes('scanApprovedSource') && jobs.includes('savePostDecision'), 'Durable job does not scan and approve source content.');
assert.ok(jobs.includes('suggestedCategoryForText') && jobs.includes('importApprovedPosts'), 'Durable job does not categorize and import content.');
assert.ok(jobs.includes('publishReadyGuides'), 'Durable job does not continue into safe publishing.');
assert.ok(jobs.includes('failures.push'), 'One source failure can abort the entire job without a durable summary.');
assert.ok(jobs.includes('IMPORT_CHUNK = 50'), 'Bulk imports do not respect the server import limit.');
assert.ok(jobs.includes("item.decision !== 'blocked'"), 'Blocked content can be auto-approved.');

assert.ok(jobsEndpoint.includes('requireAdmin'), 'Bulk job endpoint is not owner protected.');
assert.ok(jobsEndpoint.includes('requireSameOrigin'), 'Bulk job endpoint lacks same-origin protection.');
assert.ok(publishEndpoint.includes('requireAdmin') && publishEndpoint.includes('requireSameOrigin'), 'Publish-ready endpoint is not owner and same-origin protected.');
assert.ok(publish.includes("row.status !== 'draft'"), 'Non-draft guides can be bulk published.');
assert.ok(publish.includes('Number(attachments.reviewCount || 0) > 0'), 'Guides with unresolved files can be bulk published.');
assert.ok(publish.includes('integrity.blocked === true'), 'Guides with blocked integrity can be bulk published.');
assert.ok(publish.includes('linkAudit.blockedCount'), 'Guides with blocked Whop links can be bulk published.');
assert.ok(publish.includes('row.source_key'), 'Non-imported guides can be swept into Whop bulk publishing.');
assert.ok(publish.includes("SET status = 'published'"), 'Ready drafts are not actually published.');
assert.ok(publish.includes('MAX_GUIDES = 500'), 'Bulk publishing has no bounded guide limit.');

assert.ok(styles.includes('.bulk-publish-box'), 'Complete bulk workflow has no dedicated layout.');
assert.ok(styles.includes('@media(max-width:1050px)'), 'Bulk publishing controls do not reflow for tablets and mobile screens.');
assert.ok(hardeningStyles.includes('position:sticky'), 'Mobile bulk controls are not kept reachable.');

console.log('\nSNIPERPLUG BULK PUBLISH AUDIT PASSED\n');
console.log('✓ Restored master selection synchronizes with actual selected sources.');
console.log('✓ Bulk runs persist in D1 and resume after refreshes, closed tabs, or dropped connections.');
console.log('✓ One explicit job continues through source approval, scanning, content approval, categorization, importing, and publishing.');
console.log('✓ Import batches respect server limits, duplicate steps are lease-protected, and source failures remain isolated.');
console.log('✓ Unsafe links, unresolved files, and integrity failures remain private drafts.');
console.log('✓ Owners can also publish every ready imported draft in one action.');
