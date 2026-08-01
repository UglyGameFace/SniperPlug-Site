import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const publicPages = [
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
];

const retiredDealPages = [
  'deal/walmart-shark-navigator-vacuum/index.html',
  'deal/lowes-blackstone-36-griddle/index.html',
  'deal/bestbuy-samsung-odyssey-monitor/index.html',
  'deal/homedepot-dewalt-drill-kit/index.html',
  'deal/amazon-ninja-air-fryer/index.html',
  'deal/walmart-lg-55-4k-tv/index.html',
  'deal/amazon-ring-video-doorbell/index.html',
  'deal/lowes-kobalt-tool-storage/index.html',
];

const bannedPublicPatterns = [
  /launch[\s/-]*example/i,
  /seed example/i,
  /sample item/i,
  /starter policy/i,
  /replace (?:this|with|urls?|prices?|before public launch)/i,
  /good deal-page example/i,
  /use this structure/i,
  /fake deal/i,
];

for (const path of publicPages) {
  const content = read(path);
  assert.match(content, /<!doctype html>/i, `${path} is not a complete HTML page.`);
  assert.match(content, /support@sniperplug\.com|partners@sniperplug\.com|href="\/contact\/"/, `${path} has no clear contact path.`);
  for (const pattern of bannedPublicPatterns) {
    assert.doesNotMatch(content, pattern, `${path} contains unfinished or demo language: ${pattern}`);
  }
}

for (const path of retiredDealPages) {
  assert.equal(existsSync(join(root, path)), false, `${path} still exposes an unverified static deal.`);
}

const dealData = JSON.parse(read('data/deals.json'));
assert.deepEqual(dealData.deals, [], 'Unverified public deal seed records remain in data/deals.json.');
assert.equal(dealData.generated, null, 'Empty deal data should not claim a generation timestamp.');
assert.match(dealData.notes, /exact official product destination/i);

const deals = read('deals/index.html');
assert.match(deals, /No verified public deal cards are active/i);
assert.match(deals, /Exact destination or no card/i);
assert.doesNotMatch(deals, /class="deal-card"/i, 'The public board still renders an unverified deal card.');
assert.doesNotMatch(deals, /\$\d+[.,]\d{2}/, 'The empty public board still advertises a price.');

const storePages = [
  ['Walmart', 'deals/walmart/index.html'],
  ['Lowe', 'deals/lowes/index.html'],
  ['Best Buy', 'deals/best-buy/index.html'],
  ['Home Depot', 'deals/home-depot/index.html'],
  ['Amazon', 'deals/amazon/index.html'],
];
for (const [store, path] of storePages) {
  const content = read(path);
  assert.match(content, /No verified .* deal cards are (?:currently )?active|No verified .* deal cards are currently published/i, `${store} page does not disclose its empty verified state.`);
  assert.match(content, /exact .*product page|official product page|exact product destination/i, `${store} page does not require an exact destination.`);
  assert.match(content, /independent/i, `${store} page does not disclose independent status.`);
  assert.doesNotMatch(content, /class="deal-card"/i, `${store} page still renders an unverified card.`);
  assert.doesNotMatch(content, /\$\d+[.,]\d{2}/, `${store} page still advertises an unverified price.`);
}

const homepage = read('index.html');
assert.match(homepage, /No exact destination means no public deal card/i);
assert.match(homepage, /This interface example contains no live price or inventory claim/i);
assert.doesNotMatch(homepage, /\$\d+[.,]\d{2}/, 'Homepage preview still shows an unverified price.');

const clickout = read('functions/go/[id].js');
assert.match(clickout, /new URL\('\/deals\/'/);
assert.doesNotMatch(clickout, /walmart\.com|amazon\.com|bestbuy\.com|lowes\.com|homedepot\.com/i, 'Retired click-out route still contains generic retailer destinations.');
assert.doesNotMatch(clickout, /search\?|searchpage|\/s\//i, 'Retired click-out route still contains a search-result destination.');

const retiredRoute = read('functions/deal/[slug].js');
assert.match(retiredRoute, /Response\.redirect/);
assert.match(retiredRoute, /notice', 'retired-deal'/);

const sitemap = read('functions/sitemap.xml.js');
assert.doesNotMatch(sitemap, /'\/deal\//, 'Sitemap still advertises retired demo deal pages.');
for (const path of ['/privacy/', '/terms/', '/affiliate-disclosure/', '/partners/', '/contact/']) {
  assert.ok(sitemap.includes(`'${path}'`), `Sitemap is missing reviewer-critical page ${path}.`);
}

const privacy = read('privacy/index.html');
for (const requirement of [
  /Effective July 31, 2026/,
  /Website and device information/,
  /Sessions, cookies, and local storage/,
  /Connected services/,
  /Deal links and affiliate networks/,
  /Service providers and disclosures/,
  /Retention/,
  /Your choices/,
  /We do not sell personal information for money/i,
]) {
  assert.match(privacy, requirement, `Privacy policy is missing: ${requirement}`);
}

const disclosure = read('affiliate-disclosure/index.html');
assert.match(disclosure, /commission at no additional cost/i);
assert.match(disclosure, /Editorial and verification independence/i);
assert.match(disclosure, /We will not label a retailer relationship as approved until it is actually approved/i);
assert.match(disclosure, /rel=&quot;sponsored nofollow&quot;|rel="sponsored nofollow"|rel=\"sponsored nofollow\"/i);

const terms = read('terms/index.html');
for (const requirement of [/Informational service/, /Authorized private tools/, /Acceptable use/, /Intellectual property and trademarks/, /Limitation of liability/]) {
  assert.match(terms, requirement, `Terms are missing: ${requirement}`);
}

const partners = read('partners/index.html');
assert.match(partners, /Exact deep links/i);
assert.match(partners, /No verified destination means no public deal card/i);
assert.match(partners, /approval is never implied before it exists/i);

const contact = read('contact/index.html');
assert.match(contact, /support@sniperplug\.com/);
assert.match(contact, /partners@sniperplug\.com/);
assert.match(contact, /never ask you to email a password, OAuth token, credit-card number, or retailer account credential/i);

console.log('\nSNIPERPLUG AFFILIATE REVIEWER READINESS AUDIT PASSED\n');
console.log('✓ Public demo deals, invented prices, replacement notes, and broad retailer-search click-outs are absent.');
console.log('✓ Retailer pages disclose the current verified publishing state and exact-destination requirement.');
console.log('✓ Privacy, affiliate disclosure, terms, partner positioning, contact paths, and sitemap coverage are complete.');
console.log('✓ Retired deal URLs resolve through a controlled redirect instead of stale static content.');
