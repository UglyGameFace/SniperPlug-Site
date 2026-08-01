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
const runtime = read('assets/js/site.js');
const logoPath = 'assets/sniperplug-logo.svg';

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
];

for (const token of requiredHtml) {
  if (!html.includes(token)) fail(`missing required homepage token: ${token}`);
}

if (!html.includes('>Owner access</a>')) {
  fail('the public homepage does not provide a clear owner entry point');
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

if (!fs.existsSync(path.join(root, logoPath))) fail('the shared SniperPlug logo asset is missing');
else {
  const logo = read(logoPath);
  for (const token of ['<svg', 'SniperPlug logo', 'linearGradient', '>SP</text>', '<rect', '<path']) {
    if (!logo.includes(token)) fail(`the shared logo asset is incomplete: ${token}`);
  }
}

if (!/@media\s*\(max-width\s*:\s*9(?:40|39)px\)/i.test(css)) fail('tablet breakpoint is missing');
if (!/@media\s*\(max-width\s*:\s*(?:6\d{2}|700)px\)/i.test(css)) fail('mobile breakpoint is missing');
if (!css.includes('minmax(0,1fr)')) fail('responsive grid overflow protection is missing');
if (/min-width\s*:\s*[7-9]\d{2,}px/i.test(css)) fail('large fixed min-width may cause horizontal overflow');

const requiredBrandRuntime = [
  "const logoAsset = '/assets/sniperplug-logo.svg'",
  "document.querySelectorAll('.brand-mark')",
  "mark.replaceChildren(logo)",
  "mark.dataset.brandLogo = 'true'",
  "mark.setAttribute('aria-hidden', 'true')",
];
for (const token of requiredBrandRuntime) {
  if (!runtime.includes(token)) fail(`shared brand-logo rendering is missing: ${token}`);
}

const requiredMobileOwnerRuntime = [
  'querySelector(\'a[href="/control-center/"]\')',
  "matchMedia('(max-width: 620px)')",
  "ownerLink.style.position = 'sticky'",
  "ownerLink.style.left = '0'",
  "ownerLink.dataset.mobilePinned = 'true'",
];
for (const token of requiredMobileOwnerRuntime) {
  if (!runtime.includes(token)) fail(`mobile Owner access protection is missing: ${token}`);
}

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate IDs found: ${[...new Set(duplicateIds)].join(', ')}`);

if (!process.exitCode) console.log('Homepage audit passed.');
