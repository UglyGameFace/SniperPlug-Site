import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const normalize = (path) => String(path || '').split(/[?#]/, 1)[0];

function walk(directory = root) {
  const files = [];
  for (const name of readdirSync(directory)) {
    if (['.git', 'node_modules'].includes(name)) continue;
    const full = join(directory, name);
    const info = statSync(full);
    if (info.isDirectory()) files.push(...walk(full));
    else files.push(relative(root, full).replaceAll('\\', '/'));
  }
  return files;
}

const files = walk();
const siteHtml = files.filter((path) => path.endsWith('.html') && !path.startsWith('browser-extension/'));
const assetFiles = new Set(files.filter((path) => path.startsWith('assets/')));

for (const path of siteHtml) {
  const html = read(path);
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicateIds, [], `${path} contains duplicate DOM ids: ${duplicateIds.join(', ')}`);

  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => normalize(match[1]));
  const duplicateScripts = [...new Set(scripts.filter((src, index) => scripts.indexOf(src) !== index))];
  assert.deepEqual(duplicateScripts, [], `${path} loads the same script more than once: ${duplicateScripts.join(', ')}`);

  const styles = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => normalize(match[1]));
  const duplicateStyles = [...new Set(styles.filter((href, index) => styles.indexOf(href) !== index))];
  assert.deepEqual(duplicateStyles, [], `${path} loads the same stylesheet more than once: ${duplicateStyles.join(', ')}`);

  const canonicalCount = (html.match(/<link\b[^>]*\brel=["']canonical["']/gi) || []).length;
  assert.ok(canonicalCount <= 1, `${path} contains more than one canonical URL.`);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${path} contains an inline event handler instead of the shared runtime.`);

  for (const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/gi)) {
    const assetPath = normalize(match[1]).replace(/^\//, '');
    assert.ok(assetFiles.has(assetPath), `${path} references missing local asset /${assetPath}.`);
  }
}

const redirects = read('_redirects');
const redirectLines = redirects
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const redirectSources = redirectLines.map((line) => line.split(/\s+/)[0]);
const duplicateRedirects = [...new Set(redirectSources.filter((source, index) => redirectSources.indexOf(source) !== index))];
assert.deepEqual(duplicateRedirects, [], `_redirects contains duplicate source routes: ${duplicateRedirects.join(', ')}`);

const legacyStaticAliases = new Map([
  ['contact.html', '/contact/'],
  ['privacy.html', '/privacy/'],
  ['affiliate-disclosure.html', '/affiliate-disclosure/'],
  ['legal-disclaimer.html', '/terms/'],
]);
for (const [legacyFile, destination] of legacyStaticAliases) {
  assert.ok(redirects.includes(`/${legacyFile} ${destination} 301`), `Legacy route /${legacyFile} is not owned by _redirects.`);
  assert.ok(!existsSync(join(root, legacyFile)), `${legacyFile} duplicates the authoritative _redirects route.`);
}

const controlPage = read('control-center/index.html');
const middleware = read('functions/_middleware.js');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const integrityFix = read('assets/js/control-center-integrity-fix.js');
const canonicalRuntime = read('assets/js/control-center-v2.js');

function runtimePaths(source) {
  return [...source.matchAll(/\/assets\/js\/(control-center-[a-z0-9-]+\.js)(?:\?[^`"'\s<]*)?/gi)]
    .map((match) => `/assets/js/${match[1]}`);
}

const owners = new Map();
for (const [owner, source] of [
  ['page', controlPage],
  ['middleware', middleware],
  ['lifecycle', lifecycle],
]) {
  for (const path of new Set(runtimePaths(source))) {
    if (!owners.has(path)) owners.set(path, []);
    owners.get(path).push(owner);
  }
}
for (const [path, pathOwners] of owners) {
  if (pathOwners.length <= 1) continue;
  const allowedNetworkFallback = path === '/assets/js/control-center-network-guard.js'
    && pathOwners.length === 2
    && pathOwners.includes('page')
    && pathOwners.includes('lifecycle')
    && lifecycle.includes("window.__sniperplugApiFetchGuardInstalled === true");
  assert.ok(allowedNetworkFallback, `${path} has competing runtime owners: ${pathOwners.join(', ')}`);
}

assert.ok(canonicalRuntime.includes("requestJson('/api/bulk-jobs'"), 'Canonical Control Center no longer owns bulk-job reads.');
assert.ok(canonicalRuntime.includes('function renderJob(job)'), 'Canonical Control Center no longer owns bulk-job rendering.');
assert.ok(!existsSync(join(root, 'assets/js/control-center-bulk-status.js')), 'Legacy bulk-status polling still duplicates canonical bulk-job rendering.');
assert.ok(!lifecycle.includes('control-center-bulk-status.js'), 'Lifecycle still loads duplicate bulk-status polling.');
assert.ok(!integrityFix.includes('[data-return-draft]'), 'Integrity compatibility layer again owns the guide return-to-draft control.');
assert.ok(!integrityFix.includes('action=guide-status'), 'Integrity compatibility layer again writes guide status.');
assert.ok(!integrityFix.includes('window.location.replace'), 'Integrity compatibility layer again forces lifecycle reloads.');

const publicMiddlewareCsp = middleware.match(/const publicContentSecurityPolicy = ([\s\S]*?);\n/)?.[1] || '';
assert.ok(publicMiddlewareCsp, 'Middleware does not define a distinct public CSP.');
assert.ok(!publicMiddlewareCsp.includes("'unsafe-inline'"), 'Public pages unnecessarily allow inline styles.');
assert.ok(publicMiddlewareCsp.includes("frame-src 'none'"), 'Public pages still allow frames they do not use.');
assert.ok(middleware.includes('const privateContentSecurityPolicy'), 'Private/control pages lost their separate CSP compatibility policy.');

const jsFiles = files.filter((path) => path.startsWith('assets/js/') && path.endsWith('.js'));
const hashes = new Map();
for (const path of jsFiles) {
  const digest = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  if (!hashes.has(digest)) hashes.set(digest, []);
  hashes.get(digest).push(path);
}
const exactDuplicateScripts = [...hashes.values()].filter((paths) => paths.length > 1);
assert.deepEqual(exactDuplicateScripts, [], `Exact duplicate browser scripts remain: ${JSON.stringify(exactDuplicateScripts)}`);

console.log('\nSNIPERPLUG SITE-WIDE INTEGRITY AUDIT PASSED\n');
console.log(`✓ ${siteHtml.length} site HTML surfaces have unique IDs, scripts, styles, canonicals, and valid local assets.`);
console.log('✓ Legacy .html aliases have one authoritative redirect owner instead of duplicate static pages.');
console.log('✓ Control Center runtime ownership has no competing normal loaders or duplicate bulk-status poller.');
console.log('✓ Public CSP is stricter than the private/control compatibility policy.');
console.log(`✓ ${jsFiles.length} shared browser scripts contain no exact duplicate implementations.`);
