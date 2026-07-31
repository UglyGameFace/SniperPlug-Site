import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../functions/_lib/http.js';
import { guideSnapshotMatches } from '../functions/_lib/guide-snapshots.js';
import {
  permanentCourseArchive,
  recoveryMediaState,
  whopRecoveryError,
} from '../functions/_lib/recovery-media.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const missingCopy = recoveryMediaState({
  body_markdown: '> **Media review required — lesson hosted video:** storage missing',
  attachment_json: JSON.stringify({ reviewCount: 1, files: [{ role: 'hosted-video', durable: false, url: null }] }),
});
assert.equal(missingCopy.mediaState, 'missing-media-copy');
assert.equal(missingCopy.canRestoreSavedCopy, false);
assert.equal(missingCopy.requiresWhopReimport, true);

const liveOnly = recoveryMediaState({
  attachment_json: JSON.stringify({
    reviewCount: 0,
    files: [{ role: 'hosted-video-player', durable: true, sourceBacked: true, url: '/course-video/wcv-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
  }),
});
assert.equal(liveOnly.mediaState, 'live-source-video');
assert.equal(liveOnly.canRestoreSavedCopy, false, 'A Whop-backed player must not be mistaken for a permanent copy.');

const archiveFile = {
  role: 'hosted-video-archive',
  contentType: 'video/mp4',
  durable: true,
  mirrored: true,
  storageKey: 'whop-0123456789abcdef0123456789abcdef-lesson.mp4',
  url: '/media/whop-0123456789abcdef0123456789abcdef-lesson.mp4',
};
const permanent = recoveryMediaState({ attachment_json: JSON.stringify({ files: [archiveFile] }) });
assert.equal(permanent.mediaState, 'permanent-video');
assert.equal(permanent.canRestoreSavedCopy, true);
assert.equal(permanent.requiresWhopReimport, false);
assert.deepEqual(permanentCourseArchive(JSON.stringify({ files: [archiveFile] })), archiveFile);

const accessLost = whopRecoveryError(new HttpError(403, 'forbidden'), { experienceId: 'exp_test', operation: 're-import this guide' });
assert.equal(accessLost.status, 403);
assert.equal(accessLost.details.code, 'whop_recovery_source_access_lost');
assert.match(accessLost.message, /media that was never copied to R2 cannot be recovered/i);
const reconnect = whopRecoveryError(new HttpError(401, 'expired'), { operation: 'repair this guide’s media' });
assert.equal(reconnect.details.code, 'whop_recovery_reconnect_required');
const missing = whopRecoveryError(new HttpError(404, 'missing'), { operation: 'play this video' });
assert.equal(missing.details.code, 'whop_recovery_source_missing');

const snapshot = {
  id: 7,
  slug: 'guide', title: 'Guide', description: 'Description', category_slug: 'general', body_markdown: 'Body',
  status: 'rejected', featured: 0, sort_order: 10, source_key: 'course-lesson:lesson_1', source_group: 'Group',
  source_experience_id: 'exp_test', source_post_id: 'lesson_1', source_fingerprint: 'fingerprint', attachment_json: '{}',
  integrity_json: '{}', author_json: '{}', source_created_at: null, source_updated_at: null,
  imported_at: '2026-07-31T00:00:00.000Z', updated_at: '2026-07-31T01:00:00.000Z', published_at: null,
};
assert.equal(guideSnapshotMatches({ ...snapshot }, snapshot), true, 'An unchanged rejected guide must count as an already-complete rollback.');
assert.equal(guideSnapshotMatches({ ...snapshot, title: 'Changed' }, snapshot), false);

const route = read('functions/course-video/[key].js');
const repair = read('functions/api/guide-repair.js');
const mediaRepair = read('functions/api/guide-media-repair.js');
const client = read('assets/js/control-center-recovery.js');
const snapshots = read('functions/_lib/guide-snapshots.js');

assert.ok(route.includes('permanentArchiveForSource') && route.includes("x-sniperplug-media-source': 'permanent-r2-copy'"), 'Course video playback does not prefer permanent R2 media.');
assert.ok(route.indexOf('if (archive) return permanentArchiveResponse') < route.indexOf('retrieveLessonWithRefresh'), 'The route contacts Whop before checking its permanent copy.');
assert.ok(repair.includes('mediaTruth.canRestoreSavedCopy') && repair.includes("recoveryMode: 'saved-r2-copy'"), 'Removed imports with permanent media still require Whop.');
assert.ok(repair.includes('whopRecoveryError') && mediaRepair.includes('whopRecoveryError'), 'Recovery endpoints do not explain expired or lost Whop access consistently.');
assert.ok(snapshots.includes('guideSnapshotMatches(current, row)'), 'No-op recovery rollback can still become a false 500.');
assert.ok(client.includes('Permanent R2 copies can be restored directly') && client.includes('error.details = body.details'), 'Recovery UI does not expose media truth or server recovery codes.');
assert.ok(client.includes('Source access required'), 'Lost source access still leaves a misleading re-import button.');

for (const file of [
  'functions/_lib/recovery-media.js',
  'functions/_lib/guide-snapshots.js',
  'functions/api/guide-repair.js',
  'functions/api/guide-media-repair.js',
  'functions/course-video/[key].js',
  'assets/js/control-center-recovery.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nRECOVERY MEDIA TRUTH TEST PASSED\n');
console.log('✓ Saved Whop-backed players are never confused with permanent R2 video copies.');
console.log('✓ Permanent R2 media restores and plays without current Whop access.');
console.log('✓ Lost or missing Whop access returns the real recovery reason instead of a generic 500.');
console.log('✓ An unchanged rejected guide is a successful idempotent rollback, not a rollback failure.');
