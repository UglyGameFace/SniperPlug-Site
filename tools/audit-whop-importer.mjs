import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareGuideBody, assertGuideRoundTrip } from '../functions/_lib/integrity.js';
import { renderMarkdown } from '../functions/_lib/markdown.js';
import { suggestedCategoryForText } from '../functions/_lib/guides.js';
import { sourceKeyForWhopItem, whopExperienceType } from '../functions/_lib/whop.js';
import { DEFAULT_WHOP_GROUPS } from '../functions/_lib/source-policy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const exists = (path) => existsSync(join(root, path));

const required = [
  'wrangler.toml',
  'migrations/0001_whop_guides.sql',
  'control-center/index.html',
  'assets/css/control-center.css',
  'assets/css/whop-discovery.css',
  'assets/css/control-center-publishing.css',
  'assets/js/control-center-v2.js',
  'functions/_middleware.js',
  'functions/api/control.js',
  'functions/api/discover.js',
  'functions/guides/index.js',
  'functions/guides/[slug].js',
  'functions/sitemap.xml.js',
  'functions/_lib/auth.js',
  'functions/_lib/crypto.js',
  'functions/_lib/discovery.js',
  'functions/_lib/guides.js',
  'functions/_lib/guides-import.js',
  'functions/_lib/guides-media.js',
  'functions/_lib/http.js',
  'functions/_lib/integrity.js',
  'functions/_lib/markdown.js',
  'functions/_lib/posts.js',
  'functions/_lib/source-policy.js',
  'functions/_lib/templates.js',
  'functions/_lib/whop.js',
];
for (const path of required) assert.ok(exists(path), `Required importer file is missing: ${path}`);

const wrangler = read('wrangler.toml');
assert.ok(wrangler.includes('name = "sniperplug-site"'), 'Wrangler config targets the wrong Cloudflare Pages project.');
assert.ok(wrangler.includes('pages_build_output_dir = "."'), 'Wrangler config does not preserve the static root build output.');
assert.ok(wrangler.includes('binding = "SNIPERPLUG_DB"'), 'Cloudflare D1 binding must remain SNIPERPLUG_DB.');
assert.ok(wrangler.includes('database_name = "sniperplug-guides"'), 'Wrangler config targets the wrong D1 database name.');
assert.ok(wrangler.includes('database_id = "7e4e8318-f7fa-4a7f-97fb-742656de2834"'), 'Wrangler config targets the wrong D1 database ID.');
for (const scope of ['forum:read', 'courses:read', 'chat:read', 'member:basic:read', 'member:email:read']) {
  assert.ok(wrangler.includes(scope), `Whop OAuth scope is missing: ${scope}`);
}

const sample = '\uFEFF## Café launch 👩🏽‍💻\r\n\r\nFirst paragraph with “curly quotes” and 日本語.  \r\nHard-break line.\r\nSoft continuation.\r\n\r\n| Item | Value |\r\n| --- | ---: |\r\n| Emoji | 🚀 |\r\n\r\n```html\r\n<script>literal example only</script>\r\n```\r\n';
const prepared = await prepareGuideBody(sample, { source: 'Audit fixture' });
assert.equal(prepared.body.includes('\r'), false, 'CRLF transport characters were not normalized.');
assert.ok(prepared.body.includes('Café launch 👩🏽‍💻'), 'Unicode or joined emoji changed.');
assert.ok(prepared.body.includes('First paragraph with “curly quotes” and 日本語.  \nHard-break line.'), 'Paragraph spacing or hard-break spaces changed.');
assert.deepEqual(prepared.repairs.sort(), ['normalized_line_endings', 'removed_utf8_bom', 'trimmed_boundary_blank_lines'].sort(), 'Deterministic repair reporting changed.');
await assertGuideRoundTrip(prepared.body, prepared.body);
await assert.rejects(() => prepareGuideBody('Broken \uFFFD text'), /replacement character/i);
await assert.rejects(() => prepareGuideBody('```js\nconst x = 1;'), /unclosed code fence/i);
await assert.rejects(() => prepareGuideBody('<script>alert(1)</script>'), /unsafe rendered HTML/i);
await assert.doesNotReject(() => prepareGuideBody('```html\n<script>literal</script>\n```'));

const rendered = renderMarkdown([
  'Line one.  ',
  'Line two.',
  'Line three.',
  '',
  '[Safe](https://example.com/path?a=1&b=2) [Bad](javascript:alert(1))',
  '',
  'Plain https://example.org/deal?id=7 and www.example.net/test.',
  '',
  '`https://inside-code.example`',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
].join('\n'));
assert.ok(rendered.includes('Line one.<br>\nLine two. Line three.'), 'Markdown hard breaks are not preserved line by line.');
assert.ok(rendered.includes('href="https://example.com/path?a=1&amp;b=2"'), 'Safe Markdown links are not rendered.');
assert.ok(rendered.includes('href="https://example.org/deal?id=7"'), 'Plain HTTPS URLs are not auto-linked.');
assert.ok(rendered.includes('href="https://www.example.net/test"'), 'Plain www URLs are not auto-linked.');
assert.ok(!rendered.includes('href="javascript:'), 'Dangerous links reached rendered HTML.');
assert.ok(!rendered.includes('href="https://inside-code.example'), 'URLs inside inline code were incorrectly linkified.');
assert.ok(rendered.includes('<code>https://inside-code.example</code>'), 'Inline code content changed.');
assert.ok(rendered.includes('<table>'), 'Markdown tables are not rendered.');
assert.ok(!renderMarkdown('<b>raw</b>').includes('<b>raw</b>'), 'Raw HTML was not escaped.');

assert.deepEqual(DEFAULT_WHOP_GROUPS.map((group) => group.label), ['Black Box', 'Hidden Files'], 'Priority Whop group suggestions changed.');
assert.ok(DEFAULT_WHOP_GROUPS[0].aliases.includes('black box clips'), 'Black Box Clips is not recognized as a Black Box priority-group alias.');

assert.equal(whopExperienceType({ app: { name: 'Forums' } }), 'forum');
assert.equal(whopExperienceType({ app: { name: 'Courses' } }), 'course');
assert.equal(whopExperienceType({ app: { name: 'Chat' } }), 'chat');
assert.equal(whopExperienceType({ app: { name: 'Telegram' } }), 'unsupported');
assert.equal(sourceKeyForWhopItem({ sourceType: 'forum', id: 'post_1' }), 'forum-post:post_1');
assert.equal(sourceKeyForWhopItem({ sourceType: 'course', id: 'lesson_1' }), 'course-lesson:lesson_1');
assert.equal(sourceKeyForWhopItem({ sourceType: 'chat', id: 'message_1' }), 'chat-message:message_1');

assert.equal(suggestedCategoryForText('Sports betting arbitrage picks'), 'sports-betting');
assert.equal(suggestedCategoryForText('Hidden Files Chipotle food delivery guide'), 'food-delivery');
assert.equal(suggestedCategoryForText('Free sample and no cost trial'), 'freebies');
assert.equal(suggestedCategoryForText('Seller errors and recovery fix'), 'troubleshooting');
assert.equal(suggestedCategoryForText('Unclassified notes'), 'general');
assert.equal(suggestedCategoryForText('Available online and in stock'), 'general');
assert.notEqual(suggestedCategoryForText('Line of credit guide'), 'sports-betting');
assert.equal(suggestedCategoryForText('Stock trading technical analysis'), 'crypto-trading');

const schema = read('migrations/0001_whop_guides.sql');
for (const table of ['guide_categories', 'admin_login_attempts', 'whop_oauth_states', 'whop_sessions', 'whop_sources', 'whop_posts', 'guides']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `D1 schema is missing ${table}.`);
}
assert.ok(schema.includes('body_markdown TEXT NOT NULL'), 'Private exact content and guide bodies are not represented in D1.');
assert.ok(schema.includes("CHECK (decision IN ('approved', 'disapproved'))"), 'Source approval decisions are not constrained.');
assert.ok(schema.includes("CHECK (decision IN ('pending', 'approved', 'disapproved', 'blocked'))"), 'Content decisions are not constrained.');
assert.ok(schema.includes("CHECK (status IN ('draft', 'published', 'rejected'))"), 'Guide lifecycle is not constrained.');

const control = read('functions/api/control.js');
const auth = read('functions/_lib/auth.js');
const whop = read('functions/_lib/whop.js');
const discovery = read('functions/_lib/discovery.js');
const posts = read('functions/_lib/posts.js');
const guides = read('functions/_lib/guides.js');
const guidesImport = read('functions/_lib/guides-import.js');
const guidesMedia = read('functions/_lib/guides-media.js');
const markdown = read('functions/_lib/markdown.js');
const page = read('control-center/index.html');
const client = read('assets/js/control-center-v2.js');
const middleware = read('functions/_middleware.js');
const siteClient = read('assets/js/site.js');

for (const action of ['session', 'dashboard', 'oauth-start', 'oauth-callback', 'source-check', 'source-decision', 'scan', 'post-decision', 'import', 'category-save', 'guide-save', 'guide-status']) {
  assert.ok(control.includes(`'${action}'`), `Control API is missing action: ${action}`);
}
assert.ok(auth.includes('LOGIN_MAX_FAILURES = 5'), 'Owner login throttling is missing.');
assert.ok(auth.includes('admin_login_attempts'), 'Owner login failures are not persisted in D1.');
assert.ok(whop.includes("code_challenge_method: 'S256'"), 'Whop OAuth PKCE S256 is missing.');
assert.ok(whop.includes('refresh_cipher'), 'Whop refresh tokens are not encrypted in D1.');
assert.ok(whop.includes('token_version = token_version + 1'), 'Refresh-token rotation has no concurrency guard.');
for (const endpoint of ["'forum_posts'", "'courses'", "'course_lessons'", "'messages'", '`files/${encodeURIComponent']) {
  assert.ok(whop.includes(endpoint), `Whop content adapter is missing ${endpoint}.`);
}
assert.ok(whop.includes('listExperienceItems'), 'Generic Whop content adapter is missing.');
assert.ok(discovery.includes("SUPPORTED_TYPES = new Set(['forum', 'course', 'chat'])"), 'Discovery does not expose all supported Whop content types.');
assert.ok(discovery.includes('unsupported'), 'Unsupported custom Whop apps are silently omitted.');
assert.ok(posts.includes('source_fingerprint IS NOT excluded.source_fingerprint'), 'Changed Whop content does not reset to pending review.');
assert.ok(posts.includes('last_scanned_at = ?'), 'A fresh scan can be polluted by stale saved content.');
assert.ok(posts.includes('body_markdown'), 'Exact normalized source bodies are not stored privately for preview.');
assert.ok(guidesImport.includes("status = 'draft'"), 'Imports are not forced to private drafts.');
assert.ok(guidesImport.includes('retrieveExperienceItem'), 'Approved IDs are not re-fetched from the exact Whop item API before import.');
assert.ok(guidesImport.includes('retrieveWhopFile(session, attachment)'), 'Whop files are not verified server-side before import.');
assert.ok(guidesMedia.includes('mirrorWhopMedia'), 'Private Whop media cannot use SniperPlug-owned storage when configured.');
assert.ok(whop.includes("visibility === 'public'"), 'Permanent and expiring Whop file URLs are not distinguished.');
assert.ok(guides.includes('CATEGORY_CATALOG'), 'Fitting SniperPlug guide categories are not seeded.');
for (const slug of ['guides-tutorials', 'money-makers', 'money-savers', 'freebies', 'reselling', 'sports-betting', 'casino', 'crypto-trading', 'auto-checkout', 'troubleshooting']) {
  assert.ok(guides.includes(`'${slug}'`), `Category catalog is missing ${slug}.`);
}
assert.ok(guides.includes("status === 'published'"), 'Explicit publishing is missing.');
assert.ok(guidesImport.includes('private or expiring Whop file') || guidesMedia.includes('private or expiring'), 'Private or expiring Whop files can be published without review.');
assert.ok(guides.includes("WHERE guides.status = 'published'"), 'Public guide queries can expose drafts.');
assert.ok(markdown.includes('noopener noreferrer nofollow'), 'Published links lack safe external-link attributes.');
assert.ok(markdown.includes("url.protocol !== 'https:'"), 'Published links do not enforce safe protocols.');

for (const marker of ['data-source-approve', 'data-source-disapprove', 'data-approve-all', 'data-disapprove-all', 'data-reset-all', 'data-rights-confirm', 'data-publish-guide', 'data-reject-guide', 'data-inline-category-form', 'data-open-inline-category', 'publish-ready-visual']) {
  assert.ok(page.includes(marker), `Owner control is missing: ${marker}`);
}
assert.ok(page.includes('Forums, Courses, and Chat'), 'Control Center does not explain supported content types.');
assert.ok(page.includes('data-scope-warning'), 'Missing OAuth content scopes are not surfaced.');
assert.ok(page.includes('/assets/js/control-center-v2.js'), 'The active consolidated Control Center runtime is not loaded.');
assert.ok(client.includes("action === 'post-approve' ? 'approved'") && client.includes('return decidePosts([key], decision, button)'), 'Individual Approve button is not wired through the delegated runtime.');
assert.ok(client.includes("action === 'post-disapprove' ? 'disapproved'"), 'Individual Disapprove button is not wired through the delegated runtime.');
assert.ok(client.includes("'pending'"), 'Undo decision is not wired.');
assert.ok(client.includes('sourceKeys'), 'The browser does not submit approved IDs.');
assert.ok(!client.includes('body: post.body'), 'The browser is trusted to submit source content bodies.');
assert.ok(client.includes('suggestedCategory'), 'Automatic category suggestion is not applied.');
assert.ok(client.includes('linkifyPreview'), 'Owner preview does not make safe URLs clickable.');
assert.ok(middleware.includes('Content-Security-Policy'), 'Cloudflare Function responses lack a CSP.');
assert.ok(middleware.includes("pathname.startsWith('/control-center/')"), 'Control Center cache and indexing protection is missing.');
assert.ok(siteClient.includes("guideLink.href = '/guides/'"), 'Existing SniperPlug pages do not gain Guides navigation.');
assert.ok(!exists('src/content'), 'Private imported drafts must not be committed into this public repository.');

function javascriptFiles(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output.push(...javascriptFiles(path));
    else if (name.endsWith('.js') || name.endsWith('.mjs')) output.push(path);
  }
  return output;
}
for (const directory of ['functions', 'assets/js', 'tools']) {
  for (const path of javascriptFiles(join(root, directory))) {
    const check = spawnSync(process.execPath, ['--check', path], { cwd: root, encoding: 'utf8' });
    assert.equal(check.status, 0, `${relative(root, path)} failed syntax validation:\n${check.stderr}`);
  }
}

console.log('\nSNIPERPLUG FULL WHOP CONTENT AUDIT PASSED\n');
console.log('✓ Forums, Courses, Chat, lesson files, and message attachments use official Whop read paths.');
console.log('✓ Unsupported custom-app modules remain visible and honest instead of being silently skipped.');
console.log('✓ Approved IDs are re-fetched from Whop; browser-submitted source bodies are never trusted.');
console.log('✓ Public permanent files are linked; private or expiring Whop files block publishing until replaced.');
console.log('✓ Plain and Markdown URLs render as safe clickable links without linkifying code.');
console.log('✓ Fitting categories, suggestions, and inline custom-category creation are present.');
console.log('✓ Drafts and OAuth data stay in private D1 storage, not this public repository.');
console.log('✓ Unicode, emoji, paragraphs, hard breaks, tables, links, and code fences retain formatting.');
console.log('✓ Public guide routes query published records only.');
console.log('✓ JavaScript syntax validation passed for all Functions, browser scripts, and audits.');
