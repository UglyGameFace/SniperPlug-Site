import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const themedPages = [
  'index.html',
  'deals/index.html',
  'deals/walmart/index.html',
  'deals/lowes/index.html',
  'deals/best-buy/index.html',
  'deals/home-depot/index.html',
  'deals/amazon/index.html',
  'about/index.html',
  'partners/index.html',
  'contact/index.html',
];

const baseStylesheet = '<link rel="stylesheet" href="/assets/css/styles.css">';
const sharedThemeStylesheet = '<link rel="stylesheet" href="/assets/css/homepage.css">';

for (const path of themedPages) {
  const content = read(path);
  const baseIndex = content.indexOf(baseStylesheet);
  const themeIndex = content.indexOf(sharedThemeStylesheet);

  assert.notEqual(baseIndex, -1, `${path} does not load the base SniperPlug stylesheet.`);
  assert.notEqual(themeIndex, -1, `${path} uses shared cards/gradients without loading the shared visual theme.`);
  assert.ok(baseIndex < themeIndex, `${path} loads the shared theme before its base variables and layout.`);
  assert.equal(content.indexOf(sharedThemeStylesheet, themeIndex + 1), -1, `${path} loads the shared theme more than once.`);
}

const baseCss = read('assets/css/styles.css');
for (const requirement of [
  /--brand:#68e384/,
  /--brand2:#35c2ff/,
  /radial-gradient\(circle at top left/,
  /\.info-card/,
  /\.notice/,
]) {
  assert.match(baseCss, requirement, `Base theme is missing ${requirement}.`);
}

const sharedCss = read('assets/css/homepage.css');
for (const requirement of [
  /\.section-soft\{/,
  /\.section-kicker\{/,
  /\.capability-grid\{/,
  /\.capability-card\{/,
  /\.capability-card>span\{/,
  /@media\(max-width:700px\)/,
]) {
  assert.match(sharedCss, requirement, `Shared visual theme is missing ${requirement}.`);
}

console.log('\nSNIPERPLUG PUBLIC THEME CONSISTENCY AUDIT PASSED\n');
console.log('✓ Deal, retailer, About, Partners, and Contact pages load the same green/blue visual layer as the homepage.');
console.log('✓ Base variables load before the shared card, gradient, section, and responsive rules.');
console.log('✓ Shared theme links are present exactly once on every affected public page.');
