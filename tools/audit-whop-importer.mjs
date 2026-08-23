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
  'assets/js/private-guides-login.js',
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
  'functions/_lib/private-guides.js',
  'functions/_lib/source-policy.js',
  'functions/_lib/templates.js',
  'functions/_lib/whop.js',
];
for (const path of required) assert.ok(exists(path), `Required importer file is missing: ${path}`);

const wrangler = read('wrangler.toml');
assert.ok(wrangler.includes('name = "sniperplug-site"'), 'Wrangler targets the wrong Cloudflare Pages project.');
assert.ok(wrangler.includes('pages_build_output_dir = "."'), 'Static root build output changed.');
assert.ok(wrangler.includes('binding = "SNIPERPLUG_DB"'), 'D1 binding must remain SNIPERPLUG_DB.');
assert.ok(wrangler.includes('database_name = "sniperplug-guides"'), 'Wrong D1 database name.');
assert.ok(wrangler.includes('database_id = "7e4e8318-f7fa-4a7f-97fb-742656de2834"'), 'Wrong D1 database ID.');
for (const scope of ['forum:read', 'courses:read', 'chat:read', 'member:basic:read', 'member:email:read']) {
  assert.ok(wrangler.includes(scope), `Whop OAuth scope is missing: ${scope}`);
}

const sample = '\uFEFF## Café launch 👩🏽‍💻\r\n\r\nFirst paragraph with “curly quotes” and 日本語.  \r\nHard-break line.\r\nSoft continuation.\r\n\r\n| Item | Value |\r\n| --- | ---: |\r\n| Emoji | 🚀 |\r\n\r\n```html\r\n<script>literal example only</script>\r\n```\r\n';
const prepared = await prepareGuideBody(sample, { source: 'Audit fixture' });
assert.equal(prepared.body.includes('\r'), false, 'CRLF transport characters were not normalized.');
assert.ok(prepared.body.includes('Café launch 👩🏽‍💻'), 'Unicode or joined emoji changed.');
assert.ok(prepared.body.includes('First paragraph with “curly quotes” and 日本語.  \nHard-break line.'), 'Paragraph spacing or hard-break spaces changed.');
assert.deepEqual(prepared.repairs.sort(), ['normalized_line_endings', 'removed_utf8_bom', 'trimmed_boundary_blank_lines'].sort());
await assertGuideRoundTrip(prepared.body, prepared.body);
await assert.rejects(() => prepareGuideBody('Broken \uFFFD text'), /replacement character/i);
await assert.rejects(() => prepareGuideBody('```js\nconst x = 1;'), /unclosed code fence/i);
await assert.rejects(() => prepareGuideBody('<script>alert(1)</script>'), /unsafe rendered HTML/i);
await assert.doesNotReject(() => prepareGuideBody('```html\n<script>literal</script>\n```'));

const rendered = renderMarkdown([
  'Line one.  ', 'Line two.', 'Line three.', '',
  '[Safe](https://example.com/path?a=1&b=2) [Bad](javascript:alert(1))', '',
  'Plain https://example.org/deal?id=7 and www.example.net/test.', '',
  '`https://inside-code.example`', '',
  '| A | B |', '| --- | ---: |', '| 1 | 2 |',
].join('\n'));
assert.ok(rendered.includes('Line one.<br>\nLine two. Line three.'), 'Markdown hard breaks changed.');
assert.ok(rendered.includes('href="https://example.com/path?a=1&amp;b=2"'), 'Safe Markdown links are not rendered.');
assert.ok(rendered.includes('href="https://example.org/deal?id=7"'), 'Plain HTTPS URLs are not linked.');
assert.ok(rendered.includes('href="https://www.example.net/test"'), 'Plain www URLs are not linked.');
assert.ok(!rendered.includes('href="javascript:'), 'Dangerous links reached rendered HTML.');
assert.ok(!rendered.includes('href="https://inside-code.example'), 'Code URLs were incorrectly linked.');
assert.ok(rendered.includes('<table>'), 'Markdown tables are not rendered.');
assert.ok(!renderMarkdown('<b>raw</b>').includes('<b>raw</b>'), 'Raw HTML was not escaped.');

assert.deepEqual(DEFAULT_WHOP_GROUPS.map((group) => group.label), ['Black Box', 'Hidden Files']);
assert.ok(DEFAULT_WHOP_GROUPS[0].aliases.includes('black box clips'));
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
assert.ok(schema.includes('body_markdown TEXT NOT NULL'), 'Exact guide bodies are not stored in D1.');
assert.ok(schema.includes("CHECK (decision IN ('approved', 'disapproved'))"));
assert.ok(schema.includes("CHECK (decision IN ('pending', 'approved', 'disapproved', 'blocked'))"));
assert.ok(schema.includes("CHECK (status IN ('draft', 'published', 'rejected'))"));

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
const privateGuides = read('functions/_lib/private-guides.js');

for (const action of ['session', 'dashboard', 'source-check', 'source-decision', 'scan', 'post-decision', 'import', 'category-save', 'guide-save', 'guide-status']) {
  assert.ok(control.includes(`'${action}'`), `Control API is missing action: ${action}`);
}
assert.ok(auth.includes('LOGIN_MAX_FAILURES = 5') && auth.includes('admin_login_attempts'), 'Owner login throttling is incomplete.');
assert.ok(whop.includes("code_challenge_method: 'S256'"), 'Whop OAuth PKCE S256 is missing.');
assert.ok(whop.includes('refresh_cipher') && whop.includes('token_version = token_version + 1'), 'Encrypted refresh-token rotation is incomplete.');
for (const endpoint of ["'forum_posts'", "'courses'", "'course_lessons'", "'messages'", '`files/${encodeURIComponent']) {
  assert.ok(whop.includes(endpoint), `Whop content adapter is missing ${endpoint}.`);
}
assert.ok(discovery.includes("SUPPORTED_TYPES = new Set(['forum', 'course', 'chat'])"));
assert.ok(discovery.includes('unsupported'), 'External app modules are silently omitted.');
assert.ok(posts.includes('source_fingerprint IS NOT excluded.source_fingerprint'), 'Changed content does not reset review.');
assert.ok(posts.includes('last_scanned_at = ?') && posts.includes('body_markdown'), 'Fresh exact source storage is incomplete.');
assert.ok(guidesImport.includes("status = 'draft'"), 'Imports are not forced to drafts.');
assert.ok(guidesImport.includes('retrieveExperienceItem'), 'Exact IDs are not re-fetched before import.');
assert.ok(guidesImport.includes('retrieveWhopFile(session, attachment)'), 'Whop files are not verified server-side.');
assert.ok(guidesImport.includes('private or expiring Whop file'), 'Private media review holds are unclear.');
assert.ok(guidesMedia.includes('mirrorWhopMedia'), 'Private media cannot use SniperPlug storage.');
assert.ok(whop.includes("visibility === 'public'"), 'Permanent and expiring URLs are not distinguished.');
assert.ok(guides.includes('CATEGORY_CATALOG'), 'Guide category catalog is missing.');
for (const slug of ['guides-tutorials', 'money-makers', 'money-savers', 'freebies', 'reselling', 'sports-betting', 'casino', 'crypto-trading', 'auto-checkout', 'troubleshooting']) {
  assert.ok(guides.includes(`'${slug}'`), `Category catalog is missing ${slug}.`);
}
assert.ok(guides.includes("status === 'published'"), 'Explicit publishing is missing.');
assert.ok(guides.includes("WHERE guides.status = 'published'"), 'Library queries can expose drafts.');
assert.ok(markdown.includes('noopener noreferrer nofollow') && markdown.includes("url.protocol !== 'https:'"), 'Published link safety is incomplete.');

for (const marker of ['data-source-approve', 'data-source-disapprove', 'data-approve-all', 'data-disapprove-all', 'data-reset-all', 'data-rights-confirm', 'data-publish-guide', 'data-reject-guide', 'data-inline-category-form', 'data-open-inline-category', 'publish-ready-visual']) {
  assert.ok(page.includes(marker), `Owner control is missing: ${marker}`);
}
assert.ok(page.includes('Forums, Courses, and Chat') && page.includes('data-scope-warning'));
assert.ok(page.includes('/assets/js/control-center-v2.js'), 'Active Control Center runtime is not loaded.');
assert.ok(client.includes("action === 'post-approve' ? 'approved'") && client.includes("action === 'post-disapprove' ? 'disapproved'"), 'Individual post decisions are not delegated.');
assert.ok(client.includes('return decidePosts([key], decision, button)'), 'Individual post decisions do not reach the API path.');
assert.ok(client.includes('sourceKeys') && !client.includes('body: post.body'), 'Browser import trust boundary regressed.');
assert.ok(client.includes('autoCategorize: auto'), 'Auto-fit category selection is not submitted.');
assert.ok(client.includes('linkifyPreview'), 'Safe owner preview links are missing.');
assert.ok(middleware.includes('Content-Security-Policy') && middleware.includes("pathname.startsWith('/control-center/')"));
assert.ok(middleware.includes("pathname.startsWith('/guides/')") && middleware.includes("pathname.startsWith('/media/')"), 'Private guide routes are not protected by middleware.');
assert.ok(privateGuides.includes("session.kind !== 'owner'"), 'Customer importer sessions can reach owner-only guides.');
assert.ok(!siteClient.includes("guideLink.href = '/guides/'"), 'Public JavaScript still injects the private guide library into navigation.');
assert.ok(!exists('src/content'), 'Private imported drafts must not be committed publicly.');

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
console.log('✓ Official Forum, Course, Chat, and file paths remain active.');
console.log('✓ Exact approved IDs are re-fetched and browser bodies are never trusted.');
console.log('✓ Formatting, safe links, categories, private drafts, and explicit owner-library publishing remain intact.');
console.log('✓ Guide pages and media reuse the owner Control Center session instead of public navigation.');
console.log('✓ The consolidated Control Center runtime wires individual, bulk, and auto-fit actions.');
console.log('✓ JavaScript syntax validation passed for all Functions, browser scripts, and audits.');
