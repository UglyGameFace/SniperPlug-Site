import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const capture = read('browser-extension/content-capture.js');
const background = read('browser-extension/background.js');
const manifest = JSON.parse(read('browser-extension/manifest.json'));

assert.equal(manifest.version, '0.2.7');
assert.ok(capture.includes('function traversalActivationElements') && capture.includes("style.cursor === 'pointer'"), 'Rendered click-only guide cards are not discoverable.');
assert.ok(capture.includes('function activationIdentityUrl') && capture.includes("url.searchParams.set('sp_guide'"), 'Click-only cards do not receive stable bounded traversal identities.');
assert.ok(capture.includes('activation: true') && capture.includes('activationLabel') && capture.includes('activationOrdinal'), 'Click-only card descriptors are incomplete.');
assert.ok(capture.includes('function activateTraversalTarget') && capture.includes('element.click();') && capture.includes('traverse-activate'), 'Capture-all cannot safely activate a discovered rendered guide card.');
assert.ok(background.includes('async function sendTraversalActivation') && background.includes("stage: 'activating'") && background.includes("stage: target.activation === true ? (shouldActivate ? 'activating' : 'returning')"), 'Background traversal does not preserve click-card return/activation state.');
assert.ok(background.includes("activationTarget?.stage === 'returning'") && background.includes("activationTarget?.stage === 'activating'"), 'Returned directory pages and activated guide pages are not distinguished.');
assert.ok(capture.includes('data-sp-minimize') && capture.includes('data-sp-stop') && capture.includes('data-sp-close'), 'In-page Capture-all HUD is still missing window controls.');
assert.ok(capture.includes("pointerEvents: 'auto'") && capture.includes('setTraversalOverlayMinimized') && capture.includes('dismissTraversalOverlay'), 'In-page HUD controls cannot actually be used.');
assert.ok(capture.includes('overlay-stop-traversal') && background.includes("message?.type === 'sniperplug:overlay-stop-traversal'"), 'In-page Stop control is not connected to authoritative traversal stop.');
assert.ok(capture.includes('traversalOverlayTerminalTimer') && capture.includes('setTimeout(() => dismissTraversalOverlay(), 4200)'), 'Completed/error HUDs can remain stuck on the Whop page forever.');
assert.ok(capture.includes("control.getAttribute('aria-expanded') === 'false'"), 'Collapsed rendered Better Content sections are not expanded before guide discovery.');

assert.ok(capture.includes('[role=\"link\"]'), 'Role-link click cards are not recognized.');
assert.ok(background.includes('state.lastPageDirectoryLike === true'), 'Same-URL SPA details can be mistaken for their parent directory.');
assert.ok(background.includes('stableKeyOverride') && background.includes('activationStableKey') && background.includes('captureToQueue'), 'Same-URL click guides can collapse into one queue identity.');
assert.ok(background.includes('waitingForActivation') && background.includes('scheduleTraversalTimeout(state);'), 'An unchanged card activation can lose its bounded retry timer.');

assert.ok(background.includes("capture?._sniperplugStableKey"), 'Activation stable keys are lost when queued pages are deduplicated or migrated between Firefox tabs.');

console.log('BROWSER CLICK-CARD TRAVERSAL + HUD REGRESSION: PASS');
