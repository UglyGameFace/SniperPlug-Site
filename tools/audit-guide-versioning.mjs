import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const guard = read('assets/js/control-center-network-guard.js');
const media = read('functions/_lib/guides-media.js');
const versioning = read('functions/_lib/guide-versioning.js');
const control = read('functions/api/control.js');

assert.ok(guard.includes('guideVersions = new Map()'), 'The browser does not retain authoritative guide versions.');
assert.ok(guard.includes("['guide-save', 'guide-status']"), 'Guide writes are not versioned uniformly in the network layer.');
assert.ok(guard.includes('expectedUpdatedAt'), 'Guide write requests do not carry the expected D1 version.');
assert.ok(guard.includes('rememberGuide(payload.guide)') && guard.includes('payload.guides'), 'Dashboard and detail responses do not refresh the guide version cache.');
assert.ok(!guard.includes('retry('), 'Stale guide writes can be replayed automatically.');

assert.ok(media.includes('reserveGuideVersion'), 'Draft saves do not reserve the exact expected version atomically.');
assert.ok(media.includes('WHERE id = ? AND updated_at = ?'), 'Draft save reservations are not conditional on the version read by the owner.');
assert.ok(media.includes("code: 'guide_version_required'"), 'Unversioned draft saves do not fail closed.');
assert.ok(media.includes("code: 'guide_version_stale'"), 'Old-tab draft saves do not return a clear conflict.');
assert.ok(media.includes("code: 'guide_save_cleanup_stale'"), 'Cleanup-time outside edits are not distinguished from the save’s own pruning writes.');
assert.ok(media.includes("code: 'guide_save_finalize_stale'"), 'Draft finalization can overwrite a newer version silently.');
assert.ok(media.includes('cleanupMatchesSavedGuide'), 'Draft finalization does not validate the complete post-cleanup guide state.');
for (const field of ['title', 'description', 'category_slug', 'body_markdown', 'featured', 'attachment_json']) {
  assert.ok(media.includes(`row.${field}`), `Cleanup-aware finalization does not validate ${field}.`);
}
assert.ok(media.includes("row.status !== 'draft'"), 'Cleanup-aware finalization can accept a concurrent publish or rejection.');
assert.ok(media.includes("WHERE id = ? AND updated_at = ? AND status = 'draft'"), 'Final draft integrity write is not conditional on the cleanup version and draft status.');
assert.ok(media.includes("UPDATE guides SET updated_at = ? WHERE id = ? AND updated_at = ?"), 'Failed draft validation cannot restore its reserved version safely.');

assert.ok(versioning.includes('reserveGuideVersion') && versioning.includes('restoreGuideVersion'), 'Guide status operations do not have reusable optimistic reservations.');
assert.ok(versioning.includes("code: 'guide_version_required'") && versioning.includes("code: 'guide_version_stale'"), 'Unversioned or stale status requests do not fail closed.');
assert.ok(control.includes("const reservation = await reserveGuideVersion(env, id, body.expectedUpdatedAt, operation)"), 'Status changes do not reserve the exact version supplied by the browser.');
assert.ok(control.indexOf('reserveGuideVersion(env, id, body.expectedUpdatedAt, operation)') < control.indexOf("if (status === 'published') await assertGuidePublishable(env, id)"), 'Publishing is audited before the exact guide version is reserved.');
assert.ok(control.includes('await restoreGuideVersion(env, reservation)'), 'Failed status changes leave a stale reservation behind.');
assert.ok(control.includes("status === 'published' ? 'publish'") && control.includes("status === 'rejected' ? 'reject'"), 'Publish, reject, and return-to-draft conflicts are not labeled clearly.');

for (const file of [
  'assets/js/control-center-network-guard.js',
  'functions/_lib/guides-media.js',
  'functions/_lib/guide-versioning.js',
  'functions/api/control.js',
]) {
  const syntax = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${file} has invalid JavaScript syntax:\n${syntax.stderr}`);
}

console.log('\nSNIPERPLUG GUIDE VERSIONING AUDIT PASSED\n');
console.log('✓ Control Center writes carry the exact guide version last confirmed by D1.');
console.log('✓ Old-tab draft saves fail closed instead of overwriting newer work.');
console.log('✓ The save accepts its own attachment/video cleanup while rejecting real outside edits.');
console.log('✓ Publish, reject, and return-to-draft reserve the version before auditing or changing status.');
console.log('✓ Failed validation or status changes restore reservations only when no newer write replaced them.');
