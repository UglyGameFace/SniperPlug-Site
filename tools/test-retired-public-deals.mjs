import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../functions/_middleware.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const retiredCases = [
  ['/deal/walmart-shark-navigator-vacuum/', 'retired-deal'],
  ['/deal/anything-left-behind/', 'retired-deal'],
  ['/go/walmart-shark-navigator-vacuum/', 'retired-link'],
  ['/go/anything-left-behind/', 'retired-link'],
];

for (const [pathname, notice] of retiredCases) {
  let nextCalled = false;
  const response = await onRequest({
    request: new Request(`https://sniperplug.com${pathname}`),
    env: {},
    next: async () => {
      nextCalled = true;
      return new Response('stale fake deal', { status: 200 });
    },
  });

  assert.equal(nextCalled, false, `${pathname} reached Pages resolution instead of failing closed.`);
  assert.equal(response.status, 308, `${pathname} did not permanently redirect.`);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.pathname, '/deals/');
  assert.equal(location.searchParams.get('notice'), notice);
  assert.match(response.headers.get('cache-control') || '', /no-store/i);
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/i);
  assert.equal(await response.text(), '');
}

let ordinaryNextCalls = 0;
const ordinary = await onRequest({
  request: new Request('https://sniperplug.com/deals/'),
  env: {},
  next: async () => {
    ordinaryNextCalls += 1;
    return new Response('<!doctype html><title>Deals</title>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
});
assert.equal(ordinaryNextCalls, 1, 'Normal public routes no longer reach Pages resolution.');
assert.equal(ordinary.status, 200);

const redirects = read('_redirects');
assert.match(redirects, /^\/deal\/\* \/deals\/\?notice=retired-deal 308$/m);
assert.match(redirects, /^\/go\/\* \/deals\/\?notice=retired-link 308$/m);
assert.ok(
  redirects.indexOf('/deal/*') < redirects.indexOf('/legal '),
  'Retired deal redirects must run before ordinary convenience redirects.',
);

const headers = read('_headers');
for (const path of ['/deal/*', '/go/*']) {
  const start = headers.indexOf(`\n${path}\n`);
  assert.notEqual(start, -1, `${path} is missing explicit response headers.`);
  const block = headers.slice(start, headers.indexOf('\n\n', start + 2));
  assert.match(block, /Cache-Control: private, no-store, max-age=0/);
  assert.match(block, /X-Robots-Tag: noindex, nofollow, noarchive/);
}

for (const file of [
  'deal/walmart-shark-navigator-vacuum/index.html',
  'deal/lowes-blackstone-36-griddle/index.html',
  'deal/bestbuy-samsung-odyssey-monitor/index.html',
  'deal/homedepot-dewalt-drill-kit/index.html',
  'deal/amazon-ninja-air-fryer/index.html',
  'deal/walmart-lg-55-4k-tv/index.html',
  'deal/amazon-ring-video-doorbell/index.html',
  'deal/lowes-kobalt-tool-storage/index.html',
]) {
  assert.equal(existsSync(join(root, file)), false, `${file} still exists in the deployable tree.`);
}

const publicHtml = [];
const skipDirectories = new Set([
  '.git',
  '.github',
  'control-center',
  'guides',
  'node_modules',
  'tools',
]);
function collectHtml(directory) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const path = relative(root, absolute).replaceAll('\\', '/');
    const info = statSync(absolute);
    if (info.isDirectory()) {
      if (!skipDirectories.has(entry)) collectHtml(absolute);
      continue;
    }
    if (entry.endsWith('.html')) publicHtml.push(path);
  }
}
collectHtml(root);

const forbiddenPatterns = [
  /class=["'][^"']*deal-card/i,
  /walmart\.com\/(?:search|search-results)/i,
  /bestbuy\.com\/site\/searchpage/i,
  /amazon\.com\/(?:s\?|s\/)/i,
  /lowes\.com\/search/i,
  /homedepot\.com\/s\//i,
  /Shark Navigator/i,
  /Blackstone 36/i,
  /Samsung Odyssey/i,
  /DEWALT drill kit/i,
  /Ninja air fryer/i,
  /Launch example/i,
  /sample item/i,
];
for (const path of publicHtml) {
  const content = read(path);
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(content, pattern, `${path} still exposes retired deal content: ${pattern}`);
  }
}

const dealData = JSON.parse(read('data/deals.json'));
assert.deepEqual(dealData.deals, [], 'The public deal feed is not empty.');
assert.equal(dealData.generated, null, 'The empty public deal feed claims a generation time.');

const nestedDealRoute = read('functions/deal/[slug].js');
const nestedClickoutRoute = read('functions/go/[id].js');
for (const [path, source] of [
  ['functions/deal/[slug].js', nestedDealRoute],
  ['functions/go/[id].js', nestedClickoutRoute],
]) {
  assert.match(source, /new URL\('\/deals\/'/);
  assert.match(source, /Response\.redirect/);
  assert.doesNotMatch(source, /walmart\.com|amazon\.com|bestbuy\.com|lowes\.com|homedepot\.com/i, `${path} contains a retailer destination.`);
  assert.doesNotMatch(source, /search\?|searchpage|\/s\//i, `${path} contains a broad search destination.`);
}

console.log('Retired public deal fail-closed audit passed.');
