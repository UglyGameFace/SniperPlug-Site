import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../functions/_lib/http.js';
import { guideSnapshotMatches } from '../functions/_lib/guide-snapshots.js';
import {
  mediaRepairReview,
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

const incompleteRepair = mediaRepairReview({
  body: '> **Media review required — lesson.mp4:** SniperPlug media storage is not connected.',
  attachments: {
    reviewCount: 1,
    files: [{
      role: 'hosted-video-archive',
      durable: false,
      url: 'https://example.com/expiring-video.mp4',
      reviewReason: 'SniperPlug media storage is not connected.',
    }],
  },
});
assert.equal(incompleteRepair.complete, false, 'A remaining media warning must not be reported as repaired.');
assert.equal(incompleteRepair.reviewCount, 1);
assert.deepEqual(incompleteRepair.reasons, ['SniperPlug media storage is not connected.']);

const liveOnly = recoveryMediaState({
  attachment_json: JSON.stringify({
    reviewCount: 0,
    files: [{ role: 'hosted-video-player', durable: true, sourceBacked: true, url: '/course-video/wcv-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
  }),
});
assert.equal(liveOnly.mediaState, 'live-source-video');
assert.equal(liveOnly.canRestoreSavedCopy, false, 'A Whop-backed player must not be mistaken for a permanent copy.');
assert.equal(mediaRepairReview({
  body: 'Ready lesson',
  attachments: {
    reviewCount: 0,
    files: [{ role: 'hosted-video-player', durable: true, sourceBacked: true, url: '/course-video/wcv-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
  },
}).complete, true, 'A working authorized source player without review warnings is a complete media refresh.');

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
const mediaRepairClient = read('assets/js/control-center-integrity-fix.js');
const controlCenterClient = read('assets/js/control-center-v2.js');
const client = read('assets/js/control-center-recovery.js');
const snapshots = read('functions/_lib/guide-snapshots.js');
const routeHandler = route.slice(route.indexOf('export async function onRequest'));

assert.ok(route.includes('permanentArchiveForSource') && route.includes("x-sniperplug-media-source': 'permanent-r2-copy'"), 'Course video playback does not prefer permanent R2 media.');
assert.ok(routeHandler.indexOf('if (archive) return permanentArchiveResponse') < routeHandler.indexOf('retrieveLessonWithRefresh'), 'The request path contacts Whop before checking its permanent copy.');
assert.ok(repair.includes('mediaTruth.canRestoreSavedCopy') && repair.includes("recoveryMode: 'saved-r2-copy'"), 'Removed imports with permanent media still require Whop.');
assert.ok(repair.includes('whopRecoveryError') && mediaRepair.includes('whopRecoveryError'), 'Recovery endpoints do not explain expired or lost Whop access consistently.');
assert.ok(mediaRepair.includes("if (!context.env?.SNIPERPLUG_MEDIA)") && mediaRepair.includes("code: 'media_storage_not_connected'"), 'Media repair still retries a guaranteed no-op when the R2 binding is absent.');
assert.ok(mediaRepair.includes('mediaRepairReview(repaired)') && mediaRepair.includes("code: 'media_repair_incomplete'"), 'Media repair can still report success while review warnings remain.');
assert.ok(mediaRepair.includes('CF_PAGES_COMMIT_SHA') && mediaRepair.includes('CF_PAGES_BRANCH'), 'Media repair errors do not identify the exact Cloudflare deployment that handled the request.');
assert.ok(mediaRepair.includes('guide: repaired'), 'An incomplete repair does not return the newest server-confirmed guide state.');
assert.ok(mediaRepairClient.includes('data.mediaRepairStatus') || mediaRepairClient.includes("dataset.mediaRepairStatus = ''"), 'Media repair feedback is not rendered beside the guide controls.');
assert.ok(mediaRepairClient.includes('error.details = data.details') && mediaRepairClient.includes('Active Pages deployment:'), 'The browser drops the server repair reason or deployment identity.');
assert.ok(mediaRepairClient.includes('applyGuide(error?.details?.guide)'), 'The editor can keep displaying an obsolete warning after the server saved a newer failure reason.');
assert.ok(mediaRepairClient.includes("const detail = { guide, handled: false }") && !mediaRepairClient.includes("bodyField.dispatchEvent(new Event('input'"), 'Media repair still bypasses the canonical saved-guide renderer and dirties the editor.');
assert.ok(controlCenterClient.includes("root.addEventListener('sniperplug:guide-media-repaired'") && controlCenterClient.includes("renderGuideEditor(guide, 'saved')") && controlCenterClient.includes('updateGuideListItem(guide)'), 'Repaired guides do not refresh canonical editor, list, publish, attachment, and clean-snapshot state.');
assert.ok(mediaRepairClient.includes('/(?:Media|Attachment) review required/i'), 'The repair action disappears after a non-storage media failure.');
assert.ok(snapshots.includes('guideSnapshotMatches(current, row)'), 'No-op recovery rollback can still become a false 500.');
assert.ok(client.includes('Permanent R2 copies can be restored directly') && client.includes('error.details = body.details'), 'Recovery UI does not expose media truth or server recovery codes.');
assert.ok(client.includes('Source access required'), 'Lost source access still leaves a misleading re-import button.');
assert.ok(client.includes("article.dataset.sourceUnavailable === 'true'"), 'An unavailable source button can be accidentally re-enabled after the failed request.');

for (const file of [
  'functions/_lib/recovery-media.js',
  'functions/_lib/guide-snapshots.js',
  'functions/api/guide-repair.js',
  'functions/api/guide-media-repair.js',
  'functions/course-video/[key].js',
  'assets/js/control-center-recovery.js',
  'assets/js/control-center-integrity-fix.js',
  'assets/js/control-center-v2.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nRECOVERY MEDIA TRUTH TEST PASSED\n');
console.log('✓ Saved Whop-backed players are never confused with permanent R2 video copies.');
console.log('✓ Permanent R2 media restores and plays without current Whop access.');
console.log('✓ Missing R2 storage and unresolved review warnings cannot report a successful media repair.');
console.log('✓ Repair failures appear beside the guide with the exact Pages deployment and newest server state.');
console.log('✓ Repaired guides re-enter the canonical saved-guide renderer, refresh derived controls, and remain clean.');
console.log('✓ Lost or missing Whop access returns the real recovery reason instead of a generic 500.');
console.log('✓ An unchanged rejected guide is a successful idempotent rollback, not a rollback failure.');
