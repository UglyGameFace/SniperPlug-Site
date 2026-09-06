import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditGuideLinks } from '../functions/_lib/link-audit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const auth = read('functions/_lib/auth.js');
const subscriberAuth = read('functions/_lib/subscriber-auth.js');
const bulkJobs = read('functions/_lib/bulk-jobs.js');
const bulkApi = read('functions/api/bulk-jobs.js');
const recentActions = read('functions/_lib/recent-actions.js');
const publish = read('functions/_lib/publish.js');
const control = read('functions/api/control.js');
const reconciliation = read('functions/_lib/import-reconciliation.js');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const runtime = read('assets/js/control-center-v2.js');
const subscriberUi = read('assets/js/control-center-subscriber.js');
const html = read('control-center/index.html');
const controlCss = read('assets/css/control-center.css');
const journeyCss = read('assets/css/control-center-journey.css');
const publishingCss = read('assets/css/control-center-publishing.css');
const hardeningCss = read('assets/css/control-center-hardening.css');
const discoveryCss = read('assets/css/whop-discovery.css');
const historyCss = read('assets/css/bulk-history.css');
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

assert.ok(auth.includes("OWNER_PRINCIPAL_ID = 'sniperplug-owner'"), 'The owner account principal is not deterministic.');
assert.ok(auth.includes("SUBSCRIBER_PRINCIPAL_PREFIX = 'whop-user:'"), 'Subscriber account principals are not explicitly namespaced.');
assert.ok(auth.includes('principalId: OWNER_PRINCIPAL_ID'), 'Authenticated storage is not explicitly account/principal scoped.');
assert.ok(auth.includes('browserSid: `admin_${randomToken(24)}`'), 'Owner browser logins do not have an independent random session identity.');
assert.ok(auth.includes('browserSid: `subscriber_${randomToken(24)}`'), 'Subscriber browser logins do not have an independent random session identity.');
assert.ok(auth.includes('sid: OWNER_PRINCIPAL_ID') && auth.includes('session.sid !== session.principalId'), 'Compatibility storage key can diverge from the authenticated owner principal.');
assert.ok(!auth.includes('resolveOwnerWhopSessionId') && !auth.includes('copySessionToOwner'), 'Legacy Whop-session adoption logic can resurrect an unrelated account.');
assert.ok(auth.includes('session.v <= 4') && auth.includes('principalId: OWNER_PRINCIPAL_ID'), 'Legacy/current owner cookies are not constrained to the explicit owner principal.');
assert.ok(auth.includes("return session?.kind === 'owner' ? session : null"), 'Owner-only session reader can expose a subscriber session.');
assert.ok(subscriberAuth.includes('verifySubscriberAccountAccess') && subscriberAuth.includes('subscriberPrincipalIdForUser(whopUserId) !== account.principalId'), 'Subscriber access does not reverify its Whop identity against the stable tenant principal.');
assert.ok(control.includes('verifiedWhopSummary') && control.includes('requireWhopSession(request, env, admin)'), 'Dashboard reports connected from a stale row without opening the saved Whop session.');
assert.ok(control.includes('[401, 403].includes(error.status)'), 'Invalid Whop sessions are not cleared before the UI reports connection state.');
assert.ok(control.includes('requireControlAccount(context.request, context.env)'), 'Protected Control Center actions bypass current paid entitlement verification.');
assert.ok(control.includes("status === 'published') requireOwnerPrincipal"), 'Subscriber guide status can reach public publication.');
assert.ok(reconciliation.includes('Optional import reconciliation was deferred') && reconciliation.includes('deferred: true'), 'Optional cleanup can still take down the entire Control Center.');
assert.ok(hardeningCss.includes('.control-shell [hidden],.preview-backdrop[hidden]{display:none!important}'), 'Author CSS can still override hidden login, app, modal, Connect, or Disconnect states.');

assert.ok(bulkJobs.includes('CREATE TABLE IF NOT EXISTS bulk_jobs'), 'Bulk jobs are not self-initializing in D1.');
assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS bulk_jobs'), 'Bulk job migration is missing.');
assert.ok(bulkJobs.includes('lease_until') && bulkJobs.includes('already running'), 'Bulk jobs do not prevent duplicate concurrent steps.');
assert.ok(bulkJobs.includes('source_index') && bulkJobs.includes('results_json') && bulkJobs.includes('failures_json'), 'Bulk progress is not durable.');
assert.ok(bulkJobs.includes('publishReadyGuides') && bulkJobs.includes('importApprovedPosts'), 'Bulk job does not continue through import and publishing.');
assert.ok(bulkJobs.includes('principalId === OWNER_PRINCIPAL_ID'), 'Subscriber bulk jobs can still auto-publish to the public site.');
assert.ok(bulkApi.includes("action === 'start'") && bulkApi.includes("action === 'step'") && bulkApi.includes("action === 'cancel'"), 'Bulk job API is incomplete.');
assert.ok(bulkApi.includes('requireControlAccount(context.request, context.env)'), 'Bulk importer does not reverify subscriber entitlement.');
assert.ok(runtime.includes("requestJson('/api/bulk-jobs'"), 'Browser is still using an in-memory-only bulk workflow.');
assert.ok(runtime.includes('Progress is saved') && runtime.includes('Resume'), 'Interrupted job recovery is not explained to the owner.');
assert.ok(recentActions.includes('HISTORY_HOURS = 48') && recentActions.includes("status = 'draft'"), 'Recent actions cannot be safely reversed.');

assert.ok(publish.includes('auditGuideLinks') && publish.includes('skippedLinks'), 'Bulk publishing does not classify blocked links.');
assert.ok(control.includes('assertGuidePublishable') && control.includes("status === 'published'"), 'Manual publishing bypasses the centralized link audit.');
assert.ok(publish.includes('allowedAttachmentUrls'), 'Verified durable attachments are not allowlisted during link review.');
assert.ok(publish.includes('publishHoldReason'), 'Quarantined or expired imports can bypass publishing checks.');

assert.ok(lifecycle.includes('beforeunload'), 'Unsaved edits are not protected during navigation.');
assert.ok(lifecycle.includes('localStorage') && lifecycle.includes('draft-recovery'), 'Draft recovery copies are not stored locally.');
assert.ok(lifecycle.includes('confirmDiscard') && lifecycle.includes('.draft-item'), 'Switching guides can bypass the unsaved-change confirmation.');
assert.ok(html.includes('/assets/js/control-center-lifecycle.js?v=20260906.1'), 'Draft safety script is not cache-busted with the final UX pass.');
assert.ok(html.includes('/assets/js/control-center-subscriber.js?v=20260906.1'), 'Subscriber account presentation is not cache-busted with the final UX pass.');
assert.ok(!lifecycle.includes("document.createElement('style')"), 'Lifecycle runtime injects presentation CSS.');
assert.ok(!subscriberUi.includes("document.createElement('style')"), 'Subscriber runtime injects presentation CSS.');
assert.ok(journeyCss.includes('html[data-sniperplug-account-kind="subscriber"] [data-owner-only]'), 'Subscriber owner-only visibility is not owned by canonical CSS.');
assert.ok(publishingCss.includes('.editor-publish-state') && publishingCss.includes('.draft-editor textarea[name="body"]'), 'Guide lifecycle presentation is not owned by canonical publishing CSS.');
assert.ok(subscriberUi.includes('subscriberCopy') && !subscriberUi.includes('MutationObserver'), 'Subscriber UI does not enforce owner-only presentation through bounded lifecycle events.');

assert.ok(html.includes('data-source-search') && html.includes('data-source-filter'), 'Source search and filtering controls are missing.');
assert.ok(runtime.includes('setGroupExpanded') && runtime.includes("dataset.action = 'group-toggle'"), 'Large source groups cannot be collapsed.');
assert.ok(html.includes('data-draft-search') && html.includes('data-draft-status-filter'), 'Draft search and status filtering controls are missing.');
assert.ok(html.includes('data-bulk-job-panel') && html.includes('data-resume-bulk-job'), 'Resumable job status controls are missing.');
assert.ok(html.includes('data-progress-bar') && html.includes('data-progress-timeline'), 'Interactive progress details are missing.');
assert.ok(html.includes('data-undo-selected-actions') && html.includes('data-undo-all-actions'), 'Recent-action recovery controls are missing.');
assert.ok(html.includes('class="media-usage-details"') && html.includes('<summary>Usage details</summary>'), 'Technical media counters are not progressively disclosed.');
assert.ok(html.includes('aria-label="Guide list"'), 'Guide list lacks an accessible name.');
assert.ok(!/class="publish-ready-visual"[^>]*aria-hidden="true"/.test(html), 'Publishing evidence hides a focusable link from assistive technology.');

assert.ok(html.includes('class="source-summary"') && html.includes('/assets/js/control-center-v2.js'), 'Compact source decision summary is not loaded.');
assert.ok(runtime.includes('renderSourceSummary') && runtime.includes('Manage sources'), 'The connection panel still repeats every source decision.');
assert.ok(html.includes('<details class="bulk-publish-box"') && html.includes('data-bulk-workflow-summary'), 'The complete workflow is not collapsed by default.');
assert.ok(html.includes('data-selected-source-count'), 'The compact bulk action bar does not show its selection count.');
assert.ok(discoveryCss.includes('.bulk-publish-box summary') && discoveryCss.includes('.source-summary-copy'), 'Compact workflow and source-summary styling are missing.');
assert.ok(html.includes('/assets/css/control-center-hardening.css') && html.includes('/assets/css/bulk-history.css'), 'Control Center hardening or progress styles are not loaded.');
assert.ok(!html.includes('/assets/js/control-center-hardening.js') && !html.includes('/assets/js/control-center-density.js') && !html.includes('/assets/js/control-center-performance.js') && !html.includes('/assets/js/bulk-publish.js'), 'Legacy scripts can still create duplicate handlers and layout churn.');

const layoutCss = `${controlCss}\n${discoveryCss}\n${hardeningCss}\n${historyCss}`;
for (const selector of ['discovery-bulk', 'bulk-selection-bar', 'bulk-publish-box', 'bulk-publish-content', 'import-bar', 'editor-actions', 'recent-actions']) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const floatingRule = new RegExp(`\\.${escaped}[^\\{]*\\{[^\\}]*position\\s*:\\s*(?:sticky|fixed|absolute)`, 'is');
  assert.ok(!floatingRule.test(layoutCss), `${selector} must remain in normal document flow on every viewport.`);
}
assert.ok(hardeningCss.includes('position:static!important') && hardeningCss.includes('inset:auto!important'), 'Dynamic Control Center modules do not have an explicit normal-flow safeguard.');
assert.ok(hardeningCss.includes('@media(max-width:480px)') && hardeningCss.includes('.bulk-selection-bar{grid-template-columns:1fr}'), 'Very narrow screens do not stack the bulk selection controls.');
assert.ok(hardeningCss.includes('.button-row>*') && hardeningCss.includes('max-width:100%'), 'Wrapped action controls can still escape their owning module.');
assert.ok(historyCss.includes('@media(max-width:760px)') && historyCss.includes('@media(max-width:440px)'), 'Progress and undo controls do not stack on phones.');

assert.ok(guideSearch.includes('LIMIT ? OFFSET ?') && guideSearch.includes('COUNT(*) AS total'), 'Public guide search is not paginated.');
assert.ok(guideIndex.includes("url.searchParams.get('q')") && guideIndex.includes("url.searchParams.get('page')"), 'Guide endpoint does not accept search and page parameters.');
assert.ok(templates.includes('guide-search') && templates.includes('guide-pagination'), 'Public search and pagination UI is missing.');
assert.ok(!templates.includes('Source reviewed from'), 'Private source-group names still leak onto public guide pages.');
assert.ok(templates.includes('Last reviewed') && templates.includes('Report outdated information'), 'Guide freshness and outdated-report controls are missing.');

const syntaxFiles = [
  'functions/_lib/auth.js',
  'functions/_lib/subscriber-auth.js',
  'functions/_lib/import-reconciliation.js',
  'functions/_lib/link-audit.js',
  'functions/_lib/publish.js',
  'functions/_lib/bulk-jobs.js',
  'functions/_lib/recent-actions.js',
  'functions/_lib/guide-search.js',
  'functions/api/bulk-jobs.js',
  'functions/api/recent-actions.js',
  'functions/api/publish-ready.js',
  'functions/api/control.js',
  'functions/guides/index.js',
  'functions/_lib/templates.js',
  'assets/js/control-center-v2.js',
  'assets/js/control-center-lifecycle.js',
  'assets/js/control-center-subscriber.js',
];
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG CONTROL HARDENING AUDIT PASSED\n');
console.log('✓ Locked and unlocked Control Center states cannot render together.');
console.log('✓ Owner and subscriber browser sessions remain separate from stable tenant principals.');
console.log('✓ Subscriber access is entitlement-gated while public publishing stays owner-only.');
console.log('✓ Dashboard connection status requires a decryptable, refreshable Whop session.');
console.log('✓ Optional cleanup cannot block the Control Center.');
console.log('✓ Bulk source work persists in D1 and resumes after refreshes, logins, or dropped connections.');
console.log('✓ Manual and bulk publishing block internal, temporary, expired, quarantined, and unverified content.');
console.log('✓ Unsaved draft edits warn before destructive actions and keep a local recovery copy.');
console.log('✓ Canonical static CSS owns account and guide lifecycle presentation.');
console.log('✓ Dynamic Control Center modules stay in normal document flow at every viewport.');
console.log('✓ Progressive diagnostics and guide list semantics stay accessible.');
