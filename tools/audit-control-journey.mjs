import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const page = read('control-center/index.html');
const css = read('assets/css/control-center-journey.css');
const publishingCss = read('assets/css/control-center-publishing.css');
const backups = read('assets/js/control-center-whop-backups.js');
const runtime = read('assets/js/control-center-v2.js');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const subscriber = read('assets/js/control-center-subscriber.js');

assert.equal((page.match(/data-control-journey/g) || []).length, 1, 'Control Center has more than one primary workflow navigator.');
assert.ok(page.includes('<h1>Control Center</h1>'), 'Authenticated Control Center still presents itself as a guide-only tool.');
assert.ok(page.includes('Import · review · publish'), 'The primary Control Center job is not summarized clearly.');
assert.ok(page.includes('Owners can publish approved guides; paid subscribers keep an isolated importer workspace.'), 'Login copy does not distinguish owner publishing from subscriber import access.');

const journey = [
  ['#whop-importer', 'Connect Whop'],
  ['#source-browser', 'Choose sources'],
  ['#content-review', 'Review content'],
  ['#guide-review', 'Review guides'],
  ['#whop-backups', 'Safety & recovery'],
];
for (const [href, label] of journey) {
  assert.ok(page.includes(`href="${href}"`), `Workflow navigator is missing ${href}.`);
  assert.ok(page.includes(`id="${href.slice(1)}"`), `Workflow destination ${href} does not exist.`);
  assert.ok(page.includes(`<strong>${label}</strong>`), `Workflow navigator is missing clear label: ${label}.`);
}
assert.equal((page.match(/data-journey-safety/g) || []).length, 1, 'Safety/recovery should be one separate secondary workflow destination.');

assert.ok(page.includes('id="content-review" data-post-panel hidden'), 'Content review is not a stable navigable stage.');
assert.ok(page.includes('id="guide-review"'), 'Guide review is not a stable navigable stage.');
assert.ok(page.includes('control-secondary-panel" id="category-registry"'), 'Optional category setup still competes visually with the primary workflow.');
assert.ok(page.includes('<span class="eyebrow">Optional setup</span>'), 'Category setup is not labeled as optional.');
assert.ok(page.includes('subscriber workspace drafts remain private'), 'Guide review copy can still imply subscribers may publish into the owner library.');
assert.ok(page.includes('Open when ready to process selected sources'), 'Bulk workflow still presents publishing as the universal next step.');
assert.ok(page.includes('Owner workspaces publish only content that passes every safety check.'), 'Bulk flow does not keep owner publication separate from subscriber import work.');

assert.equal((page.match(/control-center-journey\.css/g) || []).length, 1, 'Journey CSS is missing or loaded more than once.');
assert.ok(page.includes('/assets/css/control-center-journey.css?v=20260906.1'), 'Final journey CSS is not cache-busted.');
assert.ok(page.includes('/assets/css/control-center-publishing.css?v=20260906.1'), 'Final guide presentation CSS is not cache-busted.');
for (const token of [
  '.control-journey{',
  'grid-template-columns:repeat(5,minmax(0,1fr))',
  'min-height:68px',
  'a:focus-visible',
  '@media(max-width:980px)',
  '@media(max-width:620px)',
  '@media(max-width:430px)',
  '@media(prefers-reduced-motion:reduce)',
  'scroll-margin-top:88px',
  'html[data-sniperplug-account-kind="subscriber"] [data-owner-only]',
  '.media-usage-details',
]) {
  assert.ok(css.includes(token), `Journey CSS is missing responsive/accessibility protection: ${token}`);
}
assert.ok(!css.includes('position:sticky'), 'Workflow navigator should not consume the mobile viewport as a sticky toolbar.');
assert.ok(publishingCss.includes('height:min(28vh,320px)'), 'Phone guide editing can again dominate the viewport.');

assert.ok(backups.includes('function structureRecoveryPanel()'), 'Recovery lost its canonical progressive-disclosure owner.');
assert.ok(backups.includes('if (app instanceof HTMLElement) app.append(panel);'), 'Recovery is no longer moved after the primary importer workflow.');
assert.ok(backups.includes("workflow.className = 'whop-recovery-workflow'"), 'Recovery is no longer collapsed behind one canonical safety surface.');
assert.ok(backups.includes("workflow.dataset.recoveryWorkflow = 'true'"), 'Recovery workflow identity is missing.');
assert.ok(backups.includes("if (workflow.open && !state.loaded) loadOverview();"), 'Recovery history can load eagerly again.');

assert.ok(page.includes('class="media-usage-details"') && page.includes('<summary>Usage details</summary>'), 'Technical media usage is dumped into the primary workflow instead of progressive details.');
assert.ok(page.includes('aria-label="Guide list"'), 'Guide list is not named for assistive technology.');
assert.ok(!/class="publish-ready-visual"[^>]*aria-hidden="true"/.test(page), 'A focusable publishing action is inside an aria-hidden container.');
assert.ok(page.includes('class="publish-ready-track" aria-hidden="true"'), 'Decorative publishing progress is not hidden independently.');

assert.equal((page.match(/control-center-v2\.js/g) || []).length, 1, 'Canonical Control Center runtime is loaded more than once.');
assert.equal((page.match(/control-center-lifecycle\.js/g) || []).length, 1, 'Guide lifecycle runtime is loaded more than once.');
assert.ok(!runtime.includes('data-control-journey') && !lifecycle.includes('data-control-journey'), 'Presentation-only journey navigation leaked into a second runtime state machine.');
assert.ok(!lifecycle.includes("document.createElement('style')"), 'Guide lifecycle injects competing CSS.');
assert.ok(!subscriber.includes("document.createElement('style')"), 'Subscriber presentation injects competing CSS.');

console.log('\nCONTROL CENTER JOURNEY AUDIT PASSED\n');
console.log('✓ One four-stage importer journey separates connection, sources, content, and guide review.');
console.log('✓ Safety/recovery and optional category setup no longer compete with the primary task hierarchy.');
console.log('✓ Owner publication language is separated from paid-subscriber private import work.');
console.log('✓ Technical diagnostics are progressive while guide and publishing controls stay accessible.');
console.log('✓ Runtime ownership remains singular and presentation CSS is static/canonical.');
