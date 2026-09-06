import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const home = read('index.html');
const deals = read('deals/index.html');

assert.ok(home.includes('<h1>See the deal. See what makes it real.</h1>'), 'Homepage does not lead with a shopper-understandable value proposition.');
assert.ok(home.includes('href="/deals/">Browse verified deals</a>'), 'Homepage primary action does not lead to the deal board.');
assert.ok(home.includes('href="#how-it-works">How verification works</a>'), 'Homepage does not offer a direct explanation path.');
assert.ok(home.includes('id="how-it-works"'), 'Homepage explanation CTA has no stable destination.');
assert.ok(home.includes('Exact product or SKU context') && home.includes('Official retailer destination') && home.includes('Clear offer conditions'), 'Homepage does not summarize the three shopper-facing verification requirements.');
assert.ok(home.includes('This interface example contains no live price or inventory claim'), 'Homepage preview can still be mistaken for a live offer.');
assert.ok(home.includes('No exact destination means no public deal card.'), 'Homepage no-card publication rule is missing.');
assert.ok(!home.includes('>Owner access</a>'), 'Homepage still labels the shared owner/subscriber entry as Owner access.');

assert.ok(deals.includes('<h1>If the offer cannot be verified, it does not get a card.</h1>'), 'Deal board does not explain its publication threshold immediately.');
assert.ok(deals.includes('No verified public deal cards are active.'), 'Deal board does not state its current empty verified state.');
assert.ok(deals.includes('Exact destination or no card.'), 'Deal board does not state its exact-destination rule.');
assert.ok(deals.includes('See how verification works'), 'Empty deal board strands shoppers without a useful next action.');
assert.ok(!deals.includes('class="deal-card"'), 'Unverified deal cards appeared on the public board.');
assert.ok(!deals.includes('>Owner access</a>'), 'Deal board still labels the shared owner/subscriber entry as Owner access.');

for (const content of [home, deals]) {
  assert.ok(content.includes('href="/control-center/">Control Center</a>'), 'Public navigation does not name the shared authenticated entry consistently.');
  assert.ok(content.includes('src="/assets/js/site.js" defer'), 'Public journey is missing the shared responsive navigation runtime.');
}

console.log('\nPUBLIC SHOPPER JOURNEY AUDIT PASSED\n');
console.log('✓ Homepage leads with the shopper value, verification requirements, and a direct deal-board action.');
console.log('✓ Empty deal-board state explains why it is empty and gives shoppers a useful next path.');
console.log('✓ Public entry language uses Control Center instead of implying the route is owner-only.');
console.log('✓ Verification and no-live-offer disclosures remain explicit.');
