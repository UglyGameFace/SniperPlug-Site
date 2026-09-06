import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const architecture = read('docs/UX_ARCHITECTURE.md');
const homepage = read('index.html');
const deals = read('deals/index.html');
const shell = read('assets/css/site-shell.css');
const control = read('control-center/index.html');
const journeyCss = read('assets/css/control-center-journey.css');
const publishingCss = read('assets/css/control-center-publishing.css');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const subscriber = read('assets/js/control-center-subscriber.js');
const siteRuntime = read('assets/js/site.js');

assert.ok(existsSync('docs/UX_ARCHITECTURE.md'), 'Final UX architecture map is missing.');
for (const heading of [
  '## Route groups',
  '## Primary user journeys',
  '## Control Center hierarchy',
  '## Shared UI language',
  '## Responsive acceptance',
  '## Accessibility baseline',
]) {
  assert.ok(architecture.includes(heading), `UX architecture is missing ${heading}.`);
}
for (const route of ['/deals/', '/control-center/', '/guides/', '/media/*', '/course-video/*']) {
  assert.ok(architecture.includes(route), `UX architecture does not account for ${route}.`);
}
for (const runtime of ['control-center-v2.js', 'control-center-network-guard.js', 'control-center-lifecycle.js', 'control-center-subscriber.js', 'control-center-whop-backups.js', 'control-center-integrity-fix.js']) {
  assert.ok(architecture.includes(runtime), `Canonical runtime ownership is undocumented: ${runtime}.`);
}

for (const [name, html] of [['homepage', homepage], ['deals', deals]]) {
  assert.ok(html.includes('class="status-card" data-state="warning"'), `${name} does not expose the truthful no-live-deals state consistently.`);
  assert.ok(html.includes('>Control Center</a>'), `${name} still labels the shared account destination as owner-only.`);
  assert.ok(!html.toLowerCase().includes('guaranteed deals'), `${name} contains unsupported urgency/guarantee language.`);
}
assert.ok(homepage.includes('No public deal cards are live right now.'), 'Homepage hides the current deal-board state.');
assert.ok(deals.includes('No verified public deal cards are active.'), 'Deal board lacks its authoritative empty state.');
assert.ok(deals.includes('aria-label="Retailer coverage"'), 'Retailer coverage navigation is not named.');

for (const token of ['--control-height:44px', '--success:#68e384', '--info:#35c2ff', '--warning:#ffd166', '--error:#ff6b6b', '.status-card', ':focus-visible', '@media(max-width:760px)', '@media(prefers-reduced-motion:reduce)']) {
  assert.ok(shell.includes(token), `Shared design foundation is missing ${token}.`);
}
assert.ok(siteRuntime.includes("toggle.setAttribute('aria-expanded', 'false')") && siteRuntime.includes("event.key === 'Escape'"), 'Mobile navigation lost its accessible progressive behavior.');

assert.equal((control.match(/data-control-journey/g) || []).length, 1, 'Control Center must have one primary workflow navigator.');
for (const id of ['whop-importer', 'source-browser', 'content-review', 'guide-review', 'whop-backups']) {
  assert.ok(control.includes(`id="${id}"`), `Control Center workflow destination is missing: ${id}.`);
}
assert.ok(control.includes('class="media-usage-details"') && control.includes('<summary>Usage details</summary>'), 'Technical media diagnostics are not progressively disclosed.');
assert.ok(control.includes('aria-label="Guide list"'), 'Guide list has no accessible name.');
assert.ok(!/class="publish-ready-visual"[^>]*aria-hidden="true"/.test(control), 'Focusable publishing evidence is hidden from assistive technology.');
assert.ok(control.includes('class="publish-ready-track" aria-hidden="true"'), 'Decorative publish progress is not isolated from meaningful content.');

assert.ok(control.includes('/assets/css/control-center-journey.css?v=20260906.1'));
assert.ok(control.includes('/assets/css/control-center-publishing.css?v=20260906.1'));
assert.ok(control.includes('/assets/js/control-center-subscriber.js?v=20260906.1'));
assert.ok(control.includes('/assets/js/control-center-lifecycle.js?v=20260906.1'));
assert.ok(!lifecycle.includes("document.createElement('style')"), 'Lifecycle runtime still injects CSS.');
assert.ok(!subscriber.includes("document.createElement('style')"), 'Subscriber runtime still injects CSS.');
assert.ok(journeyCss.includes('html[data-sniperplug-account-kind="subscriber"] [data-owner-only]'), 'Subscriber visibility is not owned by static CSS.');
assert.ok(publishingCss.includes('.editor-publish-state'), 'Guide lifecycle presentation is not owned by static CSS.');
assert.ok(publishingCss.includes('height:min(28vh,320px)'), 'Phone guide editor is not bounded.');
assert.ok(publishingCss.includes('bottom:max(.55rem,env(safe-area-inset-bottom))'), 'Coarse-pointer guide actions are not safe-area aware.');

for (const banned of ['control-center-editor-clarity.js', 'control-center-bulk-status.js']) {
  assert.ok(!control.includes(banned), `Retired duplicate runtime returned: ${banned}.`);
}
assert.ok(!lifecycle.includes('MutationObserver') && !subscriber.includes('MutationObserver'), 'Broad DOM observation returned to presentation runtimes.');

console.log('\nFULL-SITE UX COMPLETION AUDIT PASSED\n');
console.log('✓ Public routes expose one truthful deal state and one shared account destination.');
console.log('✓ Route groups, journeys, runtime ownership, status language, responsive rules, and accessibility baseline are documented.');
console.log('✓ Shared tokens, focus/touch behavior, and responsive navigation are authoritative.');
console.log('✓ Control Center keeps one workflow hierarchy with progressive diagnostics and accessible guide/publish surfaces.');
console.log('✓ Lifecycle and subscriber presentation CSS is static and canonical; duplicate runtimes remain retired.');
