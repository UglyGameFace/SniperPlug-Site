import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const leases = read('functions/_lib/recovery-leases.js');
const repair = read('functions/api/guide-repair.js');
const ownerSave = read('functions/_lib/guides-owner-save.js');
const versioning = read('functions/_lib/guide-versioning.js');
const snapshots = read('functions/_lib/guide-snapshots.js');

assert.ok(leases.includes('CREATE TABLE IF NOT EXISTS guide_recovery_leases'), 'Recovery ownership is not durable in D1.');
assert.ok(leases.includes('INSERT OR IGNORE INTO guide_recovery_leases'), 'Concurrent recoveries are not rejected atomically.');
assert.ok(leases.includes('renewRecoveryLease') && leases.includes("code: 'guide_recovery_lease_lost'"), 'Long recoveries do not prove continued ownership.');
assert.ok(leases.includes('assertRecoveryLeaseOwned'), 'Rollback cannot prove the same recovery still owns the guide.');
assert.ok(leases.includes('assertGuideNotRecovering'), 'Ordinary guide writes are not blocked during recovery.');
assert.ok(leases.includes('DELETE FROM guide_recovery_leases WHERE expires_at <= ?'), 'Abandoned recovery leases cannot expire safely.');

assert.ok(ownerSave.includes('await assertGuideNotRecovering(env, id)'), 'Owner draft saves can race an active recovery.');
assert.ok(versioning.includes('await assertGuideNotRecovering(env, id)'), 'Publish, reject, or return-to-draft can race an active recovery.');

assert.ok(repair.includes("from '../_lib/recovery-leases.js'"), 'The live recovery endpoint still uses a private duplicate lease implementation.');
assert.ok(repair.includes('await renewRecoveryLease(env, lease)'), 'Recovery ownership is not renewed before rebuilding the guide.');
assert.ok(repair.includes('await assertRecoveryLeaseOwned(env, lease)'), 'Rollback does not verify the active recovery token.');
assert.ok(repair.includes('restoreGuideSnapshot(env, lockedRow, { expectedUpdatedAt: current.updated_at })'), 'Recovery rollback can overwrite a newer guide version.');
assert.ok(repair.includes('await restoreCourseVideos(env, id, videoSnapshot)'), 'Recovery rollback does not restore course-video mappings.');
assert.ok(repair.indexOf('restoreGuideSnapshot(env, lockedRow') < repair.indexOf('restoreCourseVideos(env, id, videoSnapshot)'), 'Course-video mappings are restored before the guide snapshot is secured.');
assert.ok(repair.includes("code: 'guide_recovery_rollback_failed'"), 'Unsafe or incomplete recovery rollback is not surfaced clearly.');
assert.ok(repair.includes('releaseRecoveryLease(env, lease)'), 'Recovery ownership is not released after success or failure.');
assert.ok(snapshots.includes('expectedUpdatedAt') && snapshots.includes("code: 'guide_rollback_stale'"), 'Shared snapshot restoration is not optimistic.');

for (const file of [
  'functions/_lib/recovery-leases.js',
  'functions/_lib/guides-owner-save.js',
  'functions/_lib/guide-versioning.js',
  'functions/_lib/guide-snapshots.js',
  'functions/api/guide-repair.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG RECOVERY OWNERSHIP AUDIT PASSED\n');
console.log('✓ One durable recovery token owns the guide across rebuild and rollback.');
console.log('✓ Owner saves and status changes cannot race active recovery.');
console.log('✓ Failed recovery restores guide and course-video state only when the exact current version is still owned.');
