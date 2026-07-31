import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const gate = read('functions/_lib/private-guides.js');
const guideIndex = read('functions/guides/index.js');
const guideDetail = read('functions/guides/[slug].js');
const mediaRoute = read('functions/media/[key].js');
const videoRoute = read('functions/course-video/[key].js');
const middleware = read('functions/_middleware.js');
const sitemap = read('functions/sitemap.xml.js');
const homepage = read('index.html');
const siteClient = read('assets/js/site.js');
const templates = read('functions/_lib/templates.js');
const loginClient = read('assets/js/private-guides-login.js');
const robots = read('robots.txt');
const staticHeaders = read('_headers');

assert.ok(gate.includes("import { readAdminSession } from './auth.js'"), 'Private guide access does not reuse the signed Control Center session.');
assert.ok(gate.includes("session.kind !== 'owner'"), 'Customer importer sessions can reach the owner-only guide library.');
assert.ok(gate.includes('privateGuidePageGate'), 'Private guide lock-page gate is missing.');
assert.ok(gate.includes('same password you already use for the SniperPlug Control Center'), 'The guide lock page does not explain shared password access.');

for (const [name, route] of [['guide index', guideIndex], ['guide detail', guideDetail]]) {
  const gatePosition = route.indexOf('privateGuidePageGate(context.request, context.env)');
  assert.ok(gatePosition >= 0, `${name} does not enforce the owner gate.`);
  const firstDataRead = Math.min(
    ...['searchPublicGuides(', 'publicGuide(', 'listCategories(']
      .map((token) => route.indexOf(token))
      .filter((position) => position >= 0),
  );
  assert.ok(gatePosition < firstDataRead, `${name} reads guide data before authentication.`);
  assert.ok(route.includes("'cache-control': 'private, no-store, max-age=0'"), `${name} can be cached publicly.`);
  assert.ok(route.includes("'x-robots-tag': 'noindex, nofollow, noarchive'"), `${name} is not explicitly excluded from indexing.`);
}

assert.ok(loginClient.includes("fetch('/api/control?action=session'"), 'Private guides use a separate login endpoint instead of the Control Center login.');
assert.ok(loginClient.includes("credentials: 'same-origin'"), 'The shared Control Center session cookie is not retained.');
assert.ok(loginClient.includes('window.location.reload()'), 'Successful guide unlock does not return to the requested private page.');

for (const [name, route] of [['copied media', mediaRoute], ['course video', videoRoute]]) {
  assert.ok(route.includes('requirePrivateGuideOwner(context.request, context.env)'), `${name} remains publicly accessible.`);
  assert.ok(route.includes("'cache-control': 'private, no-store, max-age=0'"), `${name} can be shared through public caches.`);
  assert.ok(route.includes("'x-robots-tag': 'noindex, nofollow, noarchive'"), `${name} is not excluded from indexing.`);
}
assert.ok(!mediaRoute.includes('caches?.default'), 'Private guide media still uses the public edge cache.');
assert.ok(!mediaRoute.includes('public, max-age=31536000, immutable'), 'Private guide media still advertises immutable public caching.');
assert.ok(!videoRoute.includes('javascript:location.reload()'), 'Course-video retry still conflicts with the strict CSP.');

for (const prefix of ["pathname === '/guides'", "pathname.startsWith('/guides/')", "pathname.startsWith('/media/')", "pathname.startsWith('/course-video/')"]) {
  assert.ok(middleware.includes(prefix), `Middleware does not classify private content: ${prefix}`);
}
assert.ok(middleware.includes('privateGuideContent'), 'Middleware does not share one guide privacy classification.');
assert.ok(middleware.includes("response.headers.set('Cache-Control', 'private, no-store, max-age=0')"), 'Middleware does not override private guide caching.');
assert.ok(middleware.includes("response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')"), 'Middleware does not exclude private guide routes from indexing.');

for (const route of ['/guides/', '/media/', '/course-video/']) {
  assert.ok(robots.includes(`Disallow: ${route}`), `robots.txt does not exclude ${route}.`);
  assert.ok(staticHeaders.includes(route), `_headers does not include a defense-in-depth rule for ${route}.`);
}
assert.ok(staticHeaders.includes('Cache-Control: private, no-store, max-age=0'), 'Static private routes do not enforce no-store caching.');
assert.ok(staticHeaders.includes('X-Robots-Tag: noindex, nofollow, noarchive'), 'Static private routes do not enforce noindex headers.');

assert.ok(!sitemap.includes("'/guides/'"), 'Private guide index remains in the public sitemap.');
assert.ok(!sitemap.includes('publicGuides'), 'Private guide slugs are still queried for the public sitemap.');
assert.ok(!homepage.includes('href="/guides/"'), 'The public homepage still links to the owner-only guide library.');
assert.ok(!siteClient.includes("document.createElement('a')"), 'Public JavaScript still injects a private Guides navigation link.');
assert.ok(!siteClient.includes("nav.insertBefore"), 'Public JavaScript still mutates navigation to expose private guides.');
assert.ok(templates.includes('<meta name="robots" content="noindex,nofollow,noarchive">'), 'Rendered guide pages advertise public indexing.');
assert.ok(!templates.includes('<link rel="canonical" href="https://sniperplug.com/guides/'), 'Private guide pages still publish public canonical metadata.');

console.log('\nSNIPERPLUG PRIVATE GUIDE ISOLATION AUDIT PASSED\n');
console.log('✓ Guide list, details, copied media, and course videos require the owner Control Center session.');
console.log('✓ The same password/login endpoint is reused; customer importer sessions are denied.');
console.log('✓ Public navigation, sitemap entries, crawler rules, indexing, and shared caching no longer expose guide content.');
