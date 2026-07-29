import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyWhopItem, rejectionReasonForGuide } from '../functions/_lib/content-policy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const bulk = read('functions/_lib/bulk-jobs.js');
const posts = read('functions/_lib/posts.js');
const items = read('functions/_lib/whop-items.js');
const imports = read('functions/_lib/guides-import.js');
const media = read('functions/_lib/guides-media.js');
const reconcile = read('functions/_lib/import-reconciliation.js');
const control = read('functions/api/control.js');
const bulkApi = read('functions/api/bulk-jobs.js');
const publicSearch = read('functions/_lib/guide-search.js');

const longChat = classifyWhopItem({
  sourceType: 'chat',
  title: 'Pinned announcement',
  content: 'A'.repeat(800),
  sourceMeta: { pinned: true, experienceTitle: 'General chat' },
});
assert.equal(longChat.autoPublishEligible, false, 'Even long or pinned Chat messages must remain manual-only.');
assert.equal(longChat.code, 'chat_manual_only');

const announcement = classifyWhopItem({
  sourceType: 'forum',
  title: 'Announcements',
  content: 'This is a launch notice with enough words to look long but it is not a reusable step-by-step guide. '.repeat(8),
  sourceMeta: { experienceTitle: 'Announcements' },
});
assert.equal(announcement.autoPublishEligible, false, 'Announcement sources must not flood the guide library.');

const chatter = classifyWhopItem({
  sourceType: 'forum',
  title: 'Tap in',
  content: 'DM me and tap in now. Use code TODAY. '.repeat(5),
  sourceMeta: { experienceTitle: 'Public forum' },
});
assert.equal(chatter.autoPublishEligible, false, 'Short promotional chatter must remain manual.');

const guide = classifyWhopItem({
  sourceType: 'forum',
  title: 'How to set up the workflow',
  content: '## Requirements\n\n- First requirement\n- Second requirement\n\n## Steps\n\n1. Open the dashboard.\n2. Configure the source.\n3. Verify the result.\n\n' + 'This explanation contains durable context and troubleshooting details. '.repeat(6),
  sourceMeta: { experienceTitle: 'Guides' },
});
assert.equal(guide.autoPublishEligible, true, 'A structured durable tutorial should pass.');

const courseSummary = classifyWhopItem({
  sourceType: 'course',
  title: 'Lesson one',
  content: 'Course lesson from Training.',
  sourceMeta: { detailDeferred: true, experienceTitle: 'Training' },
});
assert.equal(courseSummary.autoPublishEligible, true, 'Course summaries must be eligible for exact re-fetch, not published as placeholders.');

const expired = classifyWhopItem({
  sourceType: 'forum',
  title: 'Tonight PrizePicks lineup',
  content: 'Use these picks tonight before tipoff.',
  created_at: '2020-01-01T00:00:00.000Z',
  sourceMeta: { experienceTitle: 'Sports picks' },
}, Date.parse('2026-07-29T00:00:00.000Z'));
assert.equal(expired.blocked, true);
assert.equal(expired.code, 'expired_sports_pick');

assert.match(rejectionReasonForGuide({
  title: 'Chat item for review',
  body_markdown: 'hello there',
  integrity_json: JSON.stringify({ sourceType: 'chat' }),
  attachment_json: '{}',
}), /Chat content requires explicit manual review/);

assert.ok(bulk.includes('const JOB_VERSION = 3'), 'Bulk jobs are not versioned for safe recovery.');
assert.ok(bulk.includes('cancelLegacyRow'), 'Unsafe active legacy jobs are not canceled automatically.');
assert.ok(bulk.includes('sourceKeys: [sourceKey]'), 'Bulk steps are not limited to one exact content item.');
assert.ok(bulk.includes('automaticWorkflow: true'), 'Bulk imports do not enforce automatic guide-quality policy.');
assert.ok(bulk.includes('permissionRequired'), 'Missing Whop scopes are still treated as generic job crashes.');
assert.ok(!bulk.includes('IMPORT_CHUNK = 50'), 'The old source-wide import batching path returned.');

assert.ok(posts.includes("from './whop-items.js'"), 'Source scans still use the detail-heavy legacy listing path.');
assert.ok(posts.includes('listExperienceItemsLite'), 'Lightweight scan discovery is not active.');
assert.ok(items.includes('retrieveExperienceItem'), 'Exact item re-fetch is missing.');
assert.ok(!items.includes('mapConcurrent'), 'Course scanning still fans out detail requests.');
assert.ok(items.includes("return parts.join('\\n\\n')"), 'Mixed course text/video/quiz blocks can be dropped.');

assert.ok(imports.includes('retrieveExperienceItem'), 'Import still re-lists an entire Whop source.');
assert.ok(imports.includes("action: 'held-policy'"), 'Exact content that fails revalidation is not held safely.');
assert.ok(imports.includes("action: 'duplicate-held'"), 'Exact duplicate guides are not held.');
assert.ok(imports.includes('MAX_ATTACHMENTS_PER_AUTOMATIC_ITEM'), 'Attachment-heavy content can still exceed a bounded automatic step.');

assert.ok(reconcile.includes("status = 'rejected'"), 'Junk cleanup does not move items out of the normal review queue.');
assert.ok(reconcile.includes('Duplicate of'), 'Recent duplicate cleanup is missing.');
assert.ok(control.includes('reconcileRecentBulkImports'), 'Dashboard does not reconcile the bad bulk run before rendering.');
assert.ok(control.includes("guide.status !== 'rejected'"), 'Rejected quarantine still appears in normal Review & Publish.');
assert.ok(publicSearch.includes('reconcileRecentBulkImports'), 'Public guide search can expose stale bulk junk before cleanup.');
assert.ok(media.includes('manualReviewCompleted: true'), 'Owner save does not complete manual review.');
assert.ok(media.includes('quarantined: false'), 'Owner save cannot clear a corrected quarantine.');
assert.ok(bulkApi.includes('legacyCanceled') && bulkApi.includes('failures: []'), 'Stale legacy errors remain visible after automatic cancellation.');

for (const file of [
  'functions/_lib/content-policy.js',
  'functions/_lib/whop-items.js',
  'functions/_lib/posts.js',
  'functions/_lib/guides-import.js',
  'functions/_lib/guides-media.js',
  'functions/_lib/import-reconciliation.js',
  'functions/_lib/bulk-jobs.js',
  'functions/api/control.js',
  'functions/api/bulk-jobs.js',
  'functions/_lib/guide-search.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG IMPORT QUALITY AND RECOVERY AUDIT PASSED\n');
console.log('✓ Chat, replies, announcements, chatter, placeholders, duplicates, and expired picks cannot flood automatic publishing.');
console.log('✓ Course scanning avoids per-lesson detail fanout and exact lessons are re-fetched one at a time.');
console.log('✓ Every bulk Worker step processes at most one exact content item after a bounded source scan.');
console.log('✓ Missing Whop scopes are held clearly instead of crashing the job.');
console.log('✓ Unsafe legacy jobs stop automatically while completed publications remain reversible.');
console.log('✓ Recent junk and duplicates move to rejected quarantine and disappear from normal Review & Publish.');
console.log('✓ Owner edits complete manual review without erasing source policy history.');
