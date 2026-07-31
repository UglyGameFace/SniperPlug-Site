import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../assets/js/control-center-source-access.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const middleware = readFileSync(join(root, 'functions/_middleware.js'), 'utf8');
const runtime = readFileSync(join(root, 'assets/js/control-center-source-access.js'), 'utf8');
const truth = globalThis.SniperPlugSourceAccessTruth;
assert.ok(truth?.summarize, 'The source-access truth helper was not exposed for executable validation.');
assert.ok(middleware.includes('control-center-source-access.js?v=20260731.1'), 'The cache-safe source-access runtime is not injected into the production Control Center HTML.');
assert.ok(middleware.includes("html.replace('</head>'"), 'The source-access runtime is not inserted before the existing deferred Control Center scripts.');
assert.ok(middleware.includes("pathname === '/control-center' || pathname === '/control-center/'"), 'Both canonical Control Center paths are not covered by the runtime injection.');
assert.ok(runtime.includes("url.pathname === '/api/discover'"), 'The browser does not capture the real live Whop discovery response.');
assert.ok(runtime.includes("action === 'dashboard'"), 'The browser does not capture the saved source-decision dashboard response.');
assert.ok(runtime.includes('MutationObserver(scheduleRender)'), 'Later legacy summary renders can still overwrite the current-access truth.');
assert.ok(runtime.includes('inaccessible sources cannot be scanned or imported'), 'The UI does not explain the security meaning of inactive source history.');

const previousApprovals = Array.from({ length: 34 }, (_, index) => ({
  experienceId: `exp_old_${index}`,
  decision: 'approved',
}));
const noCurrentAccess = truth.summarize(previousApprovals, {
  accessVerifiedAt: '2026-07-31T21:22:00.000Z',
  groups: [],
});
assert.deepEqual(noCurrentAccess.saved, { total: 34, approved: 34, disapproved: 0, pending: 0 });
assert.deepEqual(noCurrentAccess.current, { total: 0, approved: 0, disapproved: 0, pending: 0 });
assert.deepEqual(noCurrentAccess.inactive, { total: 34, approved: 34, disapproved: 0, pending: 0 });
assert.equal(noCurrentAccess.verified, true, 'A completed live access check must remain distinguishable from a missing discovery response.');

const mixed = truth.summarize([
  { experienceId: 'exp_live_approved', decision: 'approved' },
  { experienceId: 'exp_old_disapproved', decision: 'disapproved' },
  { experienceId: null, decision: 'pending', builtIn: true },
  { experienceId: 'not-an-experience', decision: 'approved' },
  { experienceId: 'exp_live_approved', decision: 'approved' },
], {
  accessVerifiedAt: '2026-07-31T21:23:00.000Z',
  groups: [{
    sources: [
      { experience: { id: 'exp_live_approved' }, source: { decision: 'approved' } },
      { experience: { id: 'exp_live_pending' }, source: { decision: 'pending' } },
    ],
  }],
});
assert.deepEqual(mixed.saved, { total: 2, approved: 1, disapproved: 1, pending: 0 }, 'Built-in placeholders, malformed IDs, and duplicate saved rows must not inflate saved-decision counts.');
assert.deepEqual(mixed.current, { total: 2, approved: 1, disapproved: 0, pending: 1 }, 'Current counts must come only from live readable discovery results.');
assert.deepEqual(mixed.inactive, { total: 1, approved: 0, disapproved: 1, pending: 0 }, 'Saved decisions outside current Whop access must be retained only as inactive history.');

const unverified = truth.summarize(previousApprovals, null);
assert.equal(unverified.verified, false);
assert.equal(unverified.current.total, 0);
assert.equal(unverified.inactive.total, 34, 'Saved approvals must never be treated as current when live discovery has not completed.');

console.log('\nSOURCE ACCESS TRUTH TEST PASSED\n');
console.log('✓ Saved approval history is separate from current readable Whop access.');
console.log('✓ Lost memberships produce zero currently accessible approvals without deleting history.');
console.log('✓ Built-in placeholders and duplicate rows cannot inflate saved-source totals.');
console.log('✓ The production Control Center injects the cache-safe truth runtime before legacy scripts.');
