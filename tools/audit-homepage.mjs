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

const requiredHtml = [
  '<meta name="viewport"',
  '<link rel="canonical" href="https://sniperplug.com/">',
  'property="og:title"',
  'name="twitter:card"',
  'application/ld+json',
  'href="/deals/"',
  'href="/guides/"',
  'href="/partners/"',
  'href="/about/"',
  'href="/contact/"',
  'href="/affiliate-disclosure/"',
  'href="/privacy/"',
  'href="/terms/"',
  'rel="sponsored nofollow"',
  'assets/css/homepage.css',
];

for (const token of requiredHtml) {
  if (!html.includes(token)) fail(`missing required homepage token: ${token}`);
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
  'deals/index.html',
  'guides/index.html',
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

if (!css.includes('@media (max-width:940px)')) fail('tablet breakpoint is missing');
if (!css.includes('@media (max-width:620px)')) fail('mobile breakpoint is missing');
if (!css.includes('minmax(0,1fr)')) fail('responsive grid overflow protection is missing');
if (/min-width\s*:\s*[7-9]\d{2,}px/i.test(css)) fail('large fixed min-width may cause horizontal overflow');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate IDs found: ${[...new Set(duplicateIds)].join(', ')}`);

if (!process.exitCode) console.log('Homepage audit passed.');
