import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const control = readFileSync('assets/js/control-center-v2.js', 'utf8');
const backups = readFileSync('assets/js/control-center-whop-backups.js', 'utf8');
const css = readFileSync('assets/css/control-center-hardening.css', 'utf8');

assert.ok(control.includes('const POST_PAGE_SIZE = 10'));
assert.ok(control.includes('const SOURCE_PAGE_SIZE = 12'));
assert.ok(control.includes('Press Load sources when you are ready'));
assert.ok(!control.includes('state.discoveryAutoPasses >= 8'));
assert.ok(!control.includes('idle(appendRemaining)'));
assert.ok(control.includes("dataset.action = 'post-load-more'"));
assert.ok(control.includes("dataset.action = 'source-load-more'"));
assert.ok(control.includes('scanIfApproved: false'));
assert.ok(backups.includes('structureRecoveryPanel'));
assert.ok(backups.includes('dataset.backupAction'));
assert.ok(!backups.includes('new MutationObserver'));
assert.ok(css.includes('.whop-recovery-workflow'));
assert.ok(css.includes('@media(max-width:720px)'));
console.log('CONTROL CENTER MOBILE FLOW AUDIT PASSED');
