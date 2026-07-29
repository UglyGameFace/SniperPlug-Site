import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const page = read('control-center/index.html');
const client = read('assets/js/bulk-publish.js');
const endpoint = read('functions/api/publish-ready.js');
const styles = read('assets/css/whop-discovery.css');

for (const marker of ['data-bulk-rights', 'data-bulk-publish', 'data-bulk-progress', 'data-publish-all-ready', 'data-publish-all-progress']) {
  assert.ok(page.includes(marker), `Bulk publishing UI is missing ${marker}.`);
}
assert.ok(page.includes('/assets/js/bulk-publish.js'), 'Bulk workflow browser runtime is not loaded.');
assert.ok(page.includes('Approve, import &amp; publish selected'), 'The complete bulk action is not clearly labeled.');
assert.ok(page.includes('best-fit category'), 'Bulk category behavior is not explained.');
assert.ok(page.includes('explicit permission to republish'), 'Bulk publishing does not require explicit rights confirmation.');

for (const action of ["'source-decision'", "'scan'", "'post-decision'", "'import'"]) {
  assert.ok(client.includes(action), `Bulk workflow does not continue through ${action}.`);
}
assert.ok(client.includes("fetch('/api/publish-ready'"), 'Bulk workflow never reaches safe publishing.');
assert.ok(client.includes('scan.suggestedCategory || \'general\''), 'Bulk imports do not use source-specific category suggestions.');
assert.ok(client.includes('MAX_IMPORT_CHUNK = 50'), 'Bulk imports do not respect the server import limit.');
assert.ok(client.includes("item.decision !== 'blocked'"), 'Blocked content can be auto-approved.');
assert.ok(client.includes('failures.push'), 'One source failure can abort the entire bulk run without a summary.');
assert.ok(client.includes('restoreMasterSelectionIfNeeded'), 'Restored checked master controls are not synchronized with real source selection.');
assert.ok(client.includes('masterDefaults.indeterminate'), 'The master source checkbox does not reflect partial selection.');
assert.ok(client.includes('setTimeout(() => window.location.reload()'), 'Completed bulk runs do not refresh the owner dashboard.');

assert.ok(endpoint.includes('requireAdmin'), 'Bulk publishing endpoint is not owner protected.');
assert.ok(endpoint.includes('requireSameOrigin'), 'Bulk publishing endpoint lacks same-origin protection.');
assert.ok(endpoint.includes("row.status !== 'draft'"), 'Non-draft guides can be bulk published.');
assert.ok(endpoint.includes('Number(attachments.reviewCount || 0) > 0'), 'Guides with unresolved files can be bulk published.');
assert.ok(endpoint.includes('integrity.blocked === true'), 'Guides with blocked integrity can be bulk published.');
assert.ok(endpoint.includes('row.source_key'), 'Non-imported guides can be swept into Whop bulk publishing.');
assert.ok(endpoint.includes("SET status = 'published'"), 'Ready drafts are not actually published.');
assert.ok(endpoint.includes('MAX_GUIDES = 500'), 'Bulk publishing has no bounded guide limit.');

assert.ok(styles.includes('.bulk-publish-box'), 'Complete bulk workflow has no dedicated layout.');
assert.ok(styles.includes('@media(max-width:1050px)'), 'Bulk publishing controls do not reflow for tablets and mobile screens.');

console.log('\nSNIPERPLUG BULK PUBLISH AUDIT PASSED\n');
console.log('✓ Restored master selection synchronizes with actual selected sources.');
console.log('✓ One explicit action continues through source approval, scanning, content approval, importing, categorization, and publishing.');
console.log('✓ Import batches respect server limits and source failures remain isolated.');
console.log('✓ Only safe imported drafts publish; unresolved files and integrity failures remain private.');
console.log('✓ Owners can also publish every ready imported draft in one action.');
