import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`Homepage audit failed: ${message}`);
  process.exitCode = 1;
};

const html = read('index.html');
const css = read('assets/css/homepage.css');
const shellCss = read('assets/css/site-shell.css');
const runtime = read('assets/js/site.js');

const requiredHtml = [
  '<meta name="viewport"',
  '<link rel="canonical" href="https://sniperplug.com/">',
  'property="og:title"',
  'name="twitter:card"',
  'application/ld+json',
  'href="/control-center/"',
  'href="/deals/"',
  'href="/partners/"',
  'href="/about/"',
  'href="/contact/"',
  'href="/affiliate-disclosure/"',
  'href="/privacy/"',
  'href="/terms/"',
  'assets/css/homepage.css',
  '>Control Center</a>',
  'No public deal cards are live right now.',
  'class="status-card" data-state="warning"',
  'Know exactly what the deal is before you click.',
];

for (const token of requiredHtml) {
  if (!html.includes(token)) fail(`missing required homepage token: ${token}`);
}

if (html.includes('href="/guides/"')) {
  fail('private guides are exposed in the public homepage navigation or footer');
}

const bannedCopy = [
  'launch board preview',
  'replace sample items',
  'cloudflare-ready',
  'fastest deal monitor',
  'guaranteed deals',
];

for (const phrase of bannedCopy) {
  if (html.toLowerCase().includes(phrase)) fail(`unfinished or unsupported copy remains: ${phrase}`);
}

const requiredRoutes = [
  'control-center/index.html',
  'deals/index.html',
  'partners/index.html',
  'about/index.html',
  'contact/index.html',
  'affiliate-disclosure/index.html',
  'privacy/index.html',
  'terms/index.html',
];

for (const route of requiredRoutes) {
  if (!fs.existsSync(path.join(root, route))) fail(`linked route does not exist: ${route}`);
}

if (fs.existsSync(path.join(root, 'assets/sniperplug-logo.svg'))) {
  fail('obsolete substitute SVG remains in the repository');
}

if (!fs.existsSync(path.join(root, 'assets/sniperplug-logo-exact.png'))) {
  fail('the approved static SniperPlug PNG is missing');
}

const requiredBrandShell = [
  '.brand-mark{',
  "url('/assets/sniperplug-logo-exact.png')",
  'center/contain no-repeat!important',
  'color:transparent!important',
  'font-size:0!important',
];
for (const token of requiredBrandShell) {
  if (!shellCss.includes(token)) fail(`single-source brand rendering is missing from the shared shell: ${token}`);
}

const bannedBrandRuntime = [
  'data:image/png;base64,',
  'logoAsset',
  "document.querySelectorAll('.brand-mark')",
  "document.createElement('img')",
  'mark.replaceChildren(logo)',
  'mark.dataset.brandLogo',
  'mark.dataset.brandArtwork',
];
for (const token of bannedBrandRuntime) {
  if (runtime.includes(token)) fail(`duplicate runtime logo rendering was reintroduced: ${token}`);
}
if (shellCss.includes('.brand-mark img')) fail('dead runtime-logo image styling remains in the shared shell');

if (!/@media\s*\(max-width\s*:\s*9(?:40|39)px\)/i.test(css)) fail('tablet breakpoint is missing');
if (!/@media\s*\(max-width\s*:\s*(?:6\d{2}|700)px\)/i.test(css)) fail('mobile breakpoint is missing');
if (!css.includes('minmax(0,1fr)')) fail('responsive grid overflow protection is missing');
if (/min-width\s*:\s*[7-9]\d{2,}px/i.test(css)) fail('large fixed min-width may cause horizontal overflow');

const requiredNavigationRuntime = [
  "querySelector('a[href=\"/control-center/\"]')",
  "matchMedia('(max-width: 760px)')",
  "toggle.setAttribute('aria-controls', nav.id)",
  "toggle.setAttribute('aria-expanded', 'false')",
  "event.key === 'Escape'",
  "document.documentElement.dataset.siteNavEnhanced = 'true'",
];
for (const token of requiredNavigationRuntime) {
  if (!runtime.includes(token)) fail(`accessible mobile navigation is missing: ${token}`);
}
for (const obsolete of ['mobilePinned', "ownerLink.style.position = 'sticky'", "ownerLink.style.left = '0'"]) {
  if (runtime.includes(obsolete)) fail(`obsolete pinned Owner access mobile hack remains: ${obsolete}`);
}
for (const token of ['.nav-toggle{', '--control-height:44px', ':focus-visible', '.status-card', 'html[data-site-nav-enhanced="true"] .nav[data-open="true"]']) {
  if (!shellCss.includes(token)) fail(`shared accessible navigation/state styling is missing: ${token}`);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate IDs found: ${[...new Set(duplicateIds)].join(', ')}`);

if (!process.exitCode) console.log('Homepage audit passed.');
