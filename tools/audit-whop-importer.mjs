import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareGuideBody, assertGuideRoundTrip } from '../functions/_lib/integrity.js';
import { renderMarkdown } from '../functions/_lib/markdown.js';
import { DEFAULT_WHOP_GROUPS } from '../functions/_lib/source-policy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const exists = (path) => existsSync(join(root, path));

const required = [
  'wrangler.toml',
  'migrations/0001_whop_guides.sql',
  'control-center/index.html',
  'assets/css/control-center.css',
  'assets/css/guides.css',
  'assets/js/control-center.js',
  'functions/_middleware.js',
  'functions/api/control.js',
  'functions/guides/index.js',
  'functions/guides/[slug].js',
  'functions/sitemap.xml.js',
  'functions/_lib/auth.js',
  'functions/_lib/crypto.js',
  'functions/_lib/guides.js',
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

const rendered = renderMarkdown('Line one.  \nLine two.\nLine three.\n\n[Safe](https://example.com) [Bad](javascript:alert(1))\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
assert.ok(rendered.includes('Line one.<br>\nLine two. Line three.'), 'Markdown hard breaks are not preserved line by line.');
assert.ok(rendered.includes('href="https://example.com/"'), 'Safe HTTPS links are not rendered.');
assert.ok(!rendered.includes('href="javascript:'), 'Dangerous links reached rendered HTML.');
assert.ok(rendered.includes('<table>'), 'Markdown tables are not rendered.');
assert.ok(!renderMarkdown('<b>raw</b>').includes('<b>raw</b>'), 'Raw HTML was not escaped.');

assert.deepEqual(DEFAULT_WHOP_GROUPS.map((group) => group.label), ['Black Box', 'Hidden Files'], 'Default Whop group suggestions changed.');

const schema = read('migrations/0001_whop_guides.sql');
for (const table of ['guide_categories', 'admin_login_attempts', 'whop_oauth_states', 'whop_sessions', 'whop_sources', 'whop_posts', 'guides']) {
  assert.ok(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `D1 schema is missing ${table}.`);
}
assert.ok(schema.includes('body_markdown TEXT NOT NULL'), 'Private exact post and guide bodies are not represented in D1.');
assert.ok(schema.includes("CHECK (decision IN ('approved', 'disapproved'))"), 'Source approval decisions are not constrained.');
assert.ok(schema.includes("CHECK (decision IN ('pending', 'approved', 'disapproved', 'blocked'))"), 'Post decisions are not constrained.');
assert.ok(schema.includes("CHECK (status IN ('draft', 'published', 'rejected'))"), 'Guide lifecycle is not constrained.');

const control = read('functions/api/control.js');
const auth = read('functions/_lib/auth.js');
const whop = read('functions/_lib/whop.js');
const posts = read('functions/_lib/posts.js');
const guides = read('functions/_lib/guides.js');
const page = read('control-center/index.html');
const client = read('assets/js/control-center.js');
const middleware = read('functions/_middleware.js');
const siteClient = read('assets/js/site.js');

for (const action of ['session', 'dashboard', 'oauth-start', 'oauth-callback', 'source-check', 'source-decision', 'scan', 'post-decision', 'import', 'category-save', 'guide-save', 'guide-status']) {
  assert.ok(control.includes(`'${action}'`), `Control API is missing action: ${action}`);
}
assert.ok(auth.includes('LOGIN_MAX_FAILURES = 5'), 'Owner login throttling is missing.');
assert.ok(auth.includes('admin_login_attempts'), 'Owner login failures are not persisted in D1.');
assert.ok(whop.includes("DEFAULT_SCOPES = 'openid profile email forum:read'"), 'Whop OAuth requests more than forum-read and identity scopes.');
assert.ok(!whop.includes('courses:read'), 'Forum-only importer still requests course access.');
assert.ok(whop.includes('code_challenge_method: \'S256\''), 'Whop OAuth PKCE S256 is missing.');
assert.ok(whop.includes('refresh_cipher'), 'Whop refresh tokens are not encrypted in D1.');
assert.ok(whop.includes('token_version = token_version + 1'), 'Refresh-token rotation has no concurrency guard.');
assert.ok(posts.includes('source_fingerprint IS NOT excluded.source_fingerprint'), 'Changed Whop posts do not reset to pending review.');
assert.ok(posts.includes('body_markdown'), 'Exact normalized post bodies are not stored privately for preview.');
assert.ok(guides.includes("status = 'draft'"), 'Imports are not forced to private drafts.');
assert.ok(guides.includes('listForumPosts(whopSession, experienceId)'), 'Approved post IDs are not re-fetched from Whop before import.');
assert.ok(guides.includes("status === 'published'"), 'Explicit publishing is missing.');
assert.ok(guides.includes('Resolve or replace every flagged Whop attachment'), 'Private or expiring Whop files can be published without review.');
assert.ok(guides.includes("WHERE guides.status = 'published'"), 'Public guide queries can expose drafts.');

for (const marker of ['data-source-approve', 'data-source-disapprove', 'data-approve-all', 'data-disapprove-all', 'data-reset-all', 'data-rights-confirm', 'data-publish-guide', 'data-reject-guide']) {
  assert.ok(page.includes(marker), `Easy approval control is missing: ${marker}`);
}
assert.ok(client.includes("decidePosts([post.sourceKey], 'approved')"), 'Individual Approve button is not wired.');
assert.ok(client.includes("decidePosts([post.sourceKey], 'disapproved')"), 'Individual Disapprove button is not wired.');
assert.ok(client.includes("'pending'"), 'Undo decision is not wired.');
assert.ok(client.includes('sourceKeys'), 'The browser does not submit approved IDs.');
assert.ok(!client.includes('body: post.body'), 'The browser is trusted to submit source post bodies.');
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
for (const directory of ['functions', 'assets/js']) {
  for (const path of javascriptFiles(join(root, directory))) {
    const check = spawnSync(process.execPath, ['--check', path], { cwd: root, encoding: 'utf8' });
    assert.equal(check.status, 0, `${relative(root, path)} failed syntax validation:\n${check.stderr}`);
  }
}

console.log('\nSNIPERPLUG WHOP IMPORTER AUDIT PASSED\n');
console.log('✓ Cloudflare Pages binds SNIPERPLUG_DB to the exact SniperPlug D1 database.');
console.log('✓ Black Box and Hidden Files are built-in suggestions, with reversible approval for any exact group ID.');
console.log('✓ Source and post Approve, Disapprove, bulk actions, and Undo are visible and wired.');
console.log('✓ Approved IDs are re-fetched from Whop; browser-submitted post bodies are never trusted.');
console.log('✓ Drafts and OAuth data stay in private D1 storage, not this public repository.');
console.log('✓ Unicode, emoji, paragraphs, hard breaks, tables, links, and code fences retain formatting.');
console.log('✓ Private or expiring attachments block publishing until the owner resolves them.');
console.log('✓ Public guide routes query published records only.');
console.log('✓ JavaScript syntax validation passed for all Functions and browser scripts.');
