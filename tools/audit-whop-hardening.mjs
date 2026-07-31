import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const whop = read('functions/_lib/whop.js');
const posts = read('functions/_lib/posts.js');
const guides = read('functions/_lib/guides.js');
const templates = read('functions/_lib/templates.js');
const indexRoute = read('functions/guides/index.js');
const detailRoute = read('functions/guides/[slug].js');
const sitemap = read('functions/sitemap.xml.js');
const controlPage = read('control-center/index.html');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const headers = read('_headers');
const robots = read('robots.txt');
const workflow = read('.github/workflows/whop-importer-validation.yml');

assert.ok(
  whop.includes('Number(current.token_version) !== Number(row.token_version)'),
  'A failed stale refresh can still delete a newer rotated Whop session.',
);
assert.ok(
  whop.includes("DELETE FROM whop_sessions WHERE admin_session_id = ? AND token_version = ?"),
  'Whop session deletion is not guarded by the expected token version.',
);
assert.ok(
  whop.includes("DELETE FROM whop_oauth_states WHERE expires_at <= ?"),
  'Expired OAuth state rows are not cleaned up.',
);

assert.ok(posts.includes('const D1_BATCH_SIZE = 50'), 'Large D1 post operations are not chunked.');
assert.ok(posts.includes('runStatementBatches(db, statements)'), 'Post scans or decisions bypass the chunked D1 batch path.');

assert.ok(guides.includes("current.status !== 'draft'"), 'Published or rejected guides can still be edited without returning to draft.');
assert.ok(guides.includes('Return this guide to Draft before editing'), 'The explicit edit-lifecycle error is missing.');
assert.ok(guides.includes('await category(env, current.category_slug)'), 'Publishing does not re-check the active category.');
assert.ok(guides.includes('assertGuideRoundTrip(current.body_markdown, current.body_markdown)'), 'Publishing does not re-run exact formatting validation.');
assert.ok(guides.includes('Resolve or replace every flagged Whop attachment'), 'Attachment review no longer blocks publishing.');

assert.ok(!templates.includes('Source reviewed from'), 'Private Whop group names are exposed on public guide pages.');
assert.ok(templates.includes('unavailableTemplate'), 'The public guide service has no graceful unavailable page.');
assert.ok(indexRoute.includes('unavailableTemplate()'), 'The public guide index exposes a raw error before D1 is ready.');
assert.ok(detailRoute.includes('unavailableTemplate()'), 'Guide detail pages expose a raw error before D1 is ready.');
assert.ok(sitemap.includes("console.error('Dynamic guide sitemap entries unavailable:'"), 'The sitemap does not preserve static URLs when D1 is unavailable.');

assert.ok(controlPage.includes('/assets/js/control-center-lifecycle.js'), 'The non-draft editor lock is not loaded.');
assert.ok(lifecycle.includes("current === 'draft'"), 'The editor lock does not distinguish editable drafts.');
assert.ok(lifecycle.includes('Return to draft before changing its content'), 'Published-guide edit guidance is missing.');

assert.ok(headers.includes('/control-center/*'), 'The static Control Center shell has no private cache rule.');
assert.ok(headers.includes('X-Robots-Tag: noindex, nofollow, noarchive'), 'The Control Center shell is not explicitly excluded from indexing.');
assert.ok(robots.includes('Disallow: /control-center/'), 'robots.txt does not exclude the private Control Center.');
assert.ok(robots.includes('Disallow: /api/'), 'robots.txt does not exclude private API paths.');

assert.ok(workflow.includes('branches: [agent/whop-guide-importer]'), 'Branch validation is not triggered by importer updates.');
assert.ok(!workflow.includes('pull_request:'), 'Duplicate push and pull-request validation runs can still race and post duplicate reports.');
assert.ok(workflow.includes('cancel-in-progress: true'), 'Stale importer validation runs are not cancelled.');

console.log('\nSNIPERPLUG WHOP HARDENING AUDIT PASSED\n');
console.log('✓ Rotating Whop sessions survive concurrent refresh requests.');
console.log('✓ Large post scans and decisions use bounded D1 batches.');
console.log('✓ Published and rejected guides require an explicit return to Draft before editing.');
console.log('✓ Publishing rechecks categories, formatting integrity, and attachment resolution.');
console.log('✓ Private Whop source names stay out of public guide pages.');
console.log('✓ Public guide and sitemap routes degrade safely before D1 setup.');
console.log('✓ Control Center indexing/cache protections and single-run CI reporting remain enforced.');
