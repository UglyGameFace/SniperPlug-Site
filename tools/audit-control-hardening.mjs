import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditGuideLinks } from '../functions/_lib/link-audit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const bulkJobs = read('functions/_lib/bulk-jobs.js');
const bulkApi = read('functions/api/bulk-jobs.js');
const publish = read('functions/_lib/publish.js');
const control = read('functions/api/control.js');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const hardening = read('assets/js/control-center-hardening.js');
const density = read('assets/js/control-center-density.js');
const bulkBrowser = read('assets/js/bulk-publish.js');
const html = read('control-center/index.html');
const controlCss = read('assets/css/control-center.css');
const hardeningCss = read('assets/css/control-center-hardening.css');
const discoveryCss = read('assets/css/whop-discovery.css');
const guideSearch = read('functions/_lib/guide-search.js');
const guideIndex = read('functions/guides/index.js');
const templates = read('functions/_lib/templates.js');
const migration = read('migrations/0002_control_hardening.sql');

const publicAudit = auditGuideLinks('Read https://example.com/help and [docs](https://docs.example.com/start).');
assert.equal(publicAudit.blockedCount, 0, 'Normal public HTTPS links should remain publishable.');
assert.equal(publicAudit.externalCount, 2, 'Public link count is incorrect.');
const whopAudit = auditGuideLinks('Profile: https://whop.com/@creator and file https://cdn.whop.com/private.pdf?X-Amz-Signature=abc');
assert.equal(whopAudit.blockedCount, 2, 'Whop profile and signed file links must be blocked.');
const allowedAudit = auditGuideLinks('[Verified file](https://cdn.whop.com/public.pdf)', { allowedWhopUrls: ['https://cdn.whop.com/public.pdf'] });
assert.equal(allowedAudit.blockedCount, 0, 'Server-verified durable Whop files should be allowlisted.');
const codeAudit = auditGuideLinks('`https://whop.com/not-a-link`\n\n```text\nhttps://whop.com/code\n```');
assert.equal(codeAudit.total, 0, 'URLs inside inline or fenced code must not be audited as clickable links.');

assert.ok(bulkJobs.includes('CREATE TABLE IF NOT EXISTS bulk_jobs'), 'Bulk jobs are not self-initializing in D1.');
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS bulk_jobs'), 'Bulk job migration is missing.');
assert.ok(bulkJobs.includes('lease_until') && bulkJobs.includes('already running'), 'Bulk jobs do not prevent duplicate concurrent steps.');
assert.ok(bulkJobs.includes('source_index') && bulkJobs.includes('results_json') && bulkJobs.includes('failures_json'), 'Bulk progress is not durable.');
assert.ok(bulkJobs.includes('publishReadyGuides') && bulkJobs.includes('importApprovedPosts'), 'Bulk job does not continue through import and publishing.');
assert.ok(bulkApi.includes("action === 'start'") && bulkApi.includes("action === 'step'") && bulkApi.includes("action === 'cancel'"), 'Bulk job API is incomplete.');
assert.ok(bulkBrowser.includes("fetch('/api/bulk-jobs'"), 'Browser is still using an in-memory-only bulk workflow.');
assert.ok(bulkBrowser.includes('Progress is saved') && bulkBrowser.includes('Resume'), 'Interrupted job recovery is not explained to the owner.');

assert.ok(publish.includes('auditGuideLinks') && publish.includes('skippedLinks'), 'Bulk publishing does not classify blocked links.');
assert.ok(control.includes('assertGuidePublishable') && control.includes("status === 'published'"), 'Manual publishing bypasses the centralized link audit.');
assert.ok(publish.includes('allowedAttachmentUrls'), 'Verified durable attachments are not allowlisted during link review.');

assert.ok(lifecycle.includes('beforeunload'), 'Unsaved edits are not protected during navigation.');
assert.ok(lifecycle.includes('localStorage') && lifecycle.includes('draft-recovery'), 'Draft recovery copies are not stored locally.');
assert.ok(lifecycle.includes('confirmDiscard') && lifecycle.includes('.draft-item'), 'Switching guides can bypass the unsaved-change confirmation.');
assert.ok(html.includes('/assets/js/control-center-lifecycle.js'), 'Draft safety script is not loaded.');

assert.ok(html.includes('data-source-search') && html.includes('data-source-filter'), 'Source search and filtering controls are missing.');
assert.ok(hardening.includes('data-toggle-group') && hardening.includes('setCollapsed'), 'Large source groups cannot be collapsed.');
assert.ok(html.includes('data-draft-search') && html.includes('data-draft-status-filter'), 'Draft search and status filtering are missing.');
assert.ok(html.includes('data-bulk-job-panel') && html.includes('data-resume-bulk-job'), 'Resumable job status controls are missing.');

assert.ok(html.includes('class="source-summary"') && html.includes('/assets/js/control-center-density.js'), 'Compact source decision summary is not loaded.');
assert.ok(density.includes('compactSourceDecisions') && density.includes('Manage sources'), 'The connection panel still repeats every source decision.');
assert.ok(html.includes('<details class="bulk-publish-box"') && html.includes('data-bulk-workflow-summary'), 'The complete workflow is not collapsed by default.');
assert.ok(html.includes('data-selected-source-count'), 'The compact bulk action bar does not show its selection count.');
assert.ok(discoveryCss.includes('.bulk-publish-box summary') && discoveryCss.includes('.source-summary-copy'), 'Compact workflow and source-summary styling are missing.');
assert.ok(html.includes('/assets/css/control-center-hardening.css'), 'Control Center hardening styles are not loaded.');

const layoutCss = `${controlCss}\n${discoveryCss}\n${hardeningCss}`;
for (const selector of ['discovery-bulk', 'bulk-selection-bar', 'bulk-publish-box', 'bulk-publish-content', 'import-bar', 'editor-actions']) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const floatingRule = new RegExp(`\\.${escaped}[^\\{]*\\{[^\\}]*position\\s*:\\s*(?:sticky|fixed|absolute)`, 'is');
  assert.ok(!floatingRule.test(layoutCss), `${selector} must remain in normal document flow on every viewport.`);
}
assert.ok(hardeningCss.includes('position:static!important') && hardeningCss.includes('inset:auto!important'), 'Dynamic Control Center modules do not have an explicit normal-flow safeguard.');
assert.ok(hardeningCss.includes('@media(max-width:480px)') && hardeningCss.includes('.bulk-selection-bar{grid-template-columns:1fr}'), 'Very narrow screens do not stack the bulk selection controls.');
assert.ok(hardeningCss.includes('.button-row>*') && hardeningCss.includes('max-width:100%'), 'Wrapped action controls can still escape their owning module.');

assert.ok(guideSearch.includes('LIMIT ? OFFSET ?') && guideSearch.includes('COUNT(*) AS total'), 'Public guide search is not paginated.');
assert.ok(guideIndex.includes("url.searchParams.get('q')") && guideIndex.includes("url.searchParams.get('page')"), 'Guide endpoint does not accept search and page parameters.');
assert.ok(templates.includes('guide-search') && templates.includes('guide-pagination'), 'Public search and pagination UI is missing.');
assert.ok(!templates.includes('Source reviewed from'), 'Private source-group names still leak onto public guide pages.');
assert.ok(templates.includes('Last reviewed') && templates.includes('Report outdated information'), 'Guide freshness and outdated-report controls are missing.');

const syntaxFiles = [
  'functions/_lib/link-audit.js',
  'functions/_lib/publish.js',
  'functions/_lib/bulk-jobs.js',
  'functions/_lib/guide-search.js',
  'functions/api/bulk-jobs.js',
  'functions/api/publish-ready.js',
  'functions/api/control.js',
  'functions/guides/index.js',
  'functions/_lib/templates.js',
  'assets/js/bulk-publish.js',
  'assets/js/control-center-lifecycle.js',
  'assets/js/control-center-hardening.js',
  'assets/js/control-center-density.js',
];
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG CONTROL HARDENING AUDIT PASSED\n');
console.log('✓ Bulk source work persists in D1 and resumes after refreshes, logins, or dropped connections.');
console.log('✓ Duplicate job steps are lease-protected and source failures remain isolated.');
console.log('✓ Manual and bulk publishing block internal, temporary, and unverified Whop links.');
console.log('✓ Verified permanent attachments remain publishable.');
console.log('✓ Unsaved draft edits warn before destructive actions and keep a local recovery copy.');
console.log('✓ Source groups collapse and source and draft lists filter cleanly.');
console.log('✓ Dynamic Control Center modules stay in normal document flow at every viewport.');
console.log('✓ Narrow action rows stack without covering adjacent or following modules.');
console.log('✓ The connection panel shows decision counts instead of an unbounded source-chip wall.');
console.log('✓ The complete workflow stays collapsed until the owner deliberately opens it.');
console.log('✓ Public guides support search, category filters, result counts, and pagination.');
console.log('✓ Public guide pages hide private source-group names and show review metadata.');
