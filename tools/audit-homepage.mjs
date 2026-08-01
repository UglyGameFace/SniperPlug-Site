import crypto from 'node:crypto';
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

if (fs.existsSync(path.join(root, 'assets/sniperplug-logo.svg'))) {
  fail('obsolete substitute SVG remains in the repository');
}

const dataUriMatch = runtime.match(/data:image\/png;base64,([A-Za-z0-9+/=\s]+?)',\s*\]/s);
if (!dataUriMatch) {
  fail('the exact embedded PNG logo is missing from the shared runtime');
} else {
  const encoded = dataUriMatch[1].replace(/['",\s]/g, '');
  const logo = Buffer.from(encoded, 'base64');
  const pngSignature = '89504e470d0a1a0a';
  if (logo.subarray(0, 8).toString('hex') !== pngSignature) fail('embedded logo is not a valid PNG');
  if (logo.length < 24) fail('embedded logo is truncated');
  else {
    const width = logo.readUInt32BE(16);
    const height = logo.readUInt32BE(20);
    if (width !== 96 || height !== 96) fail(`embedded logo must be 96×96, received ${width}×${height}`);
  }
  const digest = crypto.createHash('sha256').update(logo).digest('hex');
  if (digest !== '3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86') {
    fail(`embedded logo checksum changed: ${digest}`);
  }
}

if (!/@media\s*\(max-width\s*:\s*9(?:40|39)px\)/i.test(css)) fail('tablet breakpoint is missing');
if (!/@media\s*\(max-width\s*:\s*(?:6\d{2}|700)px\)/i.test(css)) fail('mobile breakpoint is missing');
if (!css.includes('minmax(0,1fr)')) fail('responsive grid overflow protection is missing');
if (/min-width\s*:\s*[7-9]\d{2,}px/i.test(css)) fail('large fixed min-width may cause horizontal overflow');

const requiredBrandRuntime = [
  'data:image/png;base64,',
  "document.querySelectorAll('.brand-mark')",
  "logo.style.objectFit = 'contain'",
  "logo.style.aspectRatio = '1 / 1'",
  "mark.style.overflow = 'hidden'",
  "mark.replaceChildren(logo)",
  "mark.dataset.brandLogo = 'true'",
  "mark.dataset.brandArtwork = 'owner-approved-exact'",
  "mark.setAttribute('aria-hidden', 'true')",
];
for (const token of requiredBrandRuntime) {
  if (!runtime.includes(token)) fail(`exact brand-logo rendering is missing: ${token}`);
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
