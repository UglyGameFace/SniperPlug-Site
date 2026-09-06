import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const staticShellPages = [
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
  'affiliate-disclosure/index.html',
  'privacy/index.html',
  'terms/index.html',
  '404.html',
];
const marketingPages = [
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

const baseStylesheetPattern = /<link rel="stylesheet" href="\/assets\/css\/styles\.css(?:\?[^"']*)?">/;
const marketingStylesheet = '<link rel="stylesheet" href="/assets/css/homepage.css">';
const requiredShellTokens = [
  '<meta name="viewport"',
  'class="site-header"',
  'class="container header-inner"',
  'class="brand-mark"',
  'class="nav"',
  'class="site-footer"',
  'class="container footer-grid"',
];

for (const path of staticShellPages) {
  const content = read(path);
  assert.match(content, baseStylesheetPattern, `${path} does not load the SniperPlug visual aggregator.`);
  for (const token of requiredShellTokens) {
    assert.ok(content.includes(token), `${path} is missing shared shell token: ${token}`);
  }
  assert.ok(content.includes('src="/assets/js/site.js"'), `${path} does not load the shared navigation/runtime enhancement.`);
  assert.doesNotMatch(content, /<style(?:\s|>)/i, `${path} contains page-specific inline CSS that can drift from the shared theme.`);
}

for (const path of marketingPages) {
  const content = read(path);
  const first = content.indexOf(marketingStylesheet);
  assert.notEqual(first, -1, `${path} uses marketing components without the marketing stylesheet.`);
  assert.equal(content.indexOf(marketingStylesheet, first + 1), -1, `${path} loads the marketing stylesheet more than once.`);
}

const aggregatorCss = read('assets/css/styles.css').trim();
const expectedAggregator = "@import url('/assets/css/site-base.css');\n@import url('/assets/css/site-shell.css');";
assert.equal(aggregatorCss, expectedAggregator, 'styles.css must load base first and the global shell second, with no duplicate rule set.');
assert.doesNotMatch(aggregatorCss, /homepage\.css/, 'The visual aggregator must not duplicate the page-specific marketing stylesheet.');

const baseCss = read('assets/css/site-base.css');
for (const requirement of [
  /--brand:#68e384/,
  /--brand2:#35c2ff/,
  /radial-gradient\(circle at top left/,
  /\.site-header/,
  /\.site-footer/,
  /\.legal-card/,
  /\.notice/,
  /@media \(max-width:620px\)/,
]) {
  assert.match(baseCss, requirement, `Foundational theme is missing ${requirement}.`);
}
assert.doesNotMatch(baseCss, /sniperplug-logo-exact\.png/, 'Exact global branding must not be duplicated in the foundational stylesheet.');

const shellCss = read('assets/css/site-shell.css');
for (const requirement of [
  /--surface:#111827/,
  /--success:#68e384/,
  /--info:#35c2ff/,
  /--warning:#ffd166/,
  /--error:#ff6b6b/,
  /--control-height:44px/,
  /\.brand-mark\{[^}]*sniperplug-logo-exact\.png/s,
  /center\/contain no-repeat!important/,
  /aspect-ratio:1\/1/,
  /body\{min-height:100vh;display:flex;flex-direction:column/,
  /main\{flex:1;width:100%\}/,
  /\.page-hero\{position:relative/,
  /\.legal-card\{max-width:980px/,
  /\.status-card,/,
  /\.status-card\[data-state="warning"\]/,
  /\.error-shell\{/,
  /:focus-visible/,
  /\.nav-toggle\{display:none;min-height:44px/,
  /@media\(max-width:760px\)/,
  /html\[data-site-nav-enhanced="true"\] \.nav\[data-open="true"\]\{display:grid\}/,
  /@media\(prefers-reduced-motion:reduce\)/,
]) {
  assert.match(shellCss, requirement, `Global visual shell is missing ${requirement}.`);
}
assert.doesNotMatch(shellCss, /\.brand-mark img/, 'Global shell still contains dead styling for the removed runtime logo image.');

const marketingCss = read('assets/css/homepage.css');
for (const requirement of [
  /\.section-soft\{/,
  /\.section-kicker\{/,
  /\.capability-grid\{/,
  /\.capability-card\{/,
  /@media\(max-width:700px\)/,
]) {
  assert.match(marketingCss, requirement, `Marketing visual layer is missing ${requirement}.`);
}
assert.doesNotMatch(marketingCss, /sniperplug-logo-exact\.png/, 'Exact global branding must not be duplicated in the marketing stylesheet.');

const exactLogo = readFileSync(join(root, 'assets/sniperplug-logo-exact.png'));
assert.equal(exactLogo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Exact shared logo is not a valid PNG.');
assert.equal(exactLogo.readUInt32BE(16), 96, 'Exact shared logo PNG width changed.');
assert.equal(exactLogo.readUInt32BE(20), 96, 'Exact shared logo PNG height changed.');
assert.equal(
  createHash('sha256').update(exactLogo).digest('hex'),
  '3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86',
  'Exact shared logo artwork changed.',
);

const generatedGuideShell = read('functions/_lib/templates.js');
for (const token of ['assets/css/styles.css', 'class="site-header"', 'class="site-footer"', 'class="brand-mark"']) {
  assert.ok(generatedGuideShell.includes(token), `Generated private-guide shell is missing ${token}.`);
}

const privateGuideGate = read('functions/_lib/private-guides.js');
for (const token of ['assets/css/styles.css', 'class="site-header"', 'class="site-footer"', 'class="brand-mark"', 'assets/js/site.js']) {
  assert.ok(privateGuideGate.includes(token), `Locked private-guide shell is missing ${token}.`);
}

const controlCenter = read('control-center/index.html');
for (const token of ['assets/css/styles.css', 'assets/css/control-center.css', 'class="site-header"', 'class="brand-mark"']) {
  assert.ok(controlCenter.includes(token), `Control Center shell is missing ${token}.`);
}
assert.ok(
  controlCenter.indexOf('assets/css/styles.css') < controlCenter.indexOf('assets/css/control-center.css'),
  'Control Center must load the shared shell before specialized owner-tool styles.',
);

const headers = read('_headers');
for (const token of ['/assets/css/*', '/assets/js/*', '/assets/sniperplug-logo-exact.png', 'max-age=0, must-revalidate']) {
  assert.ok(headers.includes(token), `Shared asset revalidation is missing ${token}.`);
}

const notFound = read('404.html');
for (const token of ['class="error-shell"', 'class="error-card"', 'src="/assets/js/site.js"']) {
  assert.ok(notFound.includes(token), `404 page is missing unified visual behavior: ${token}.`);
}

console.log('\nSNIPERPLUG FULL VISUAL CONSISTENCY AUDIT PASSED\n');
console.log(`✓ ${staticShellPages.length} static routes use the same header, footer, typography, logo, navigation enhancement, and global visual foundation.`);
console.log(`✓ ${marketingPages.length} marketing routes load their richer component layer exactly once.`);
console.log('✓ Shared state colors, touch-target sizing, focus behavior, and responsive navigation come from one global shell.');
console.log('✓ Ordered base, global shell, and page-specific layers cannot override one another accidentally.');
console.log('✓ Legal, error, Control Center, generated guide, and locked guide shells are covered.');
console.log('✓ Exact approved PNG bytes, CSS-only proportional rendering, and revalidation headers are enforced.');
