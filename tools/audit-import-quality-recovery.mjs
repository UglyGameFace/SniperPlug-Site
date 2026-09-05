import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyWhopItem, rejectionReasonForGuide } from '../functions/_lib/content-policy.js';
import { suggestedCategoryForText } from '../functions/_lib/guides.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const bulk = read('functions/_lib/bulk-jobs.js');
const posts = read('functions/_lib/posts.js');
const items = read('functions/_lib/whop-items.js');
const imports = read('functions/_lib/guides-import.js');
const media = read('functions/_lib/guides-media.js');
const courseVideo = read('functions/_lib/course-video.js');
const repair = read('functions/api/guide-repair.js');
const reconcile = read('functions/_lib/import-reconciliation.js');
const control = read('functions/api/control.js');
const bulkApi = read('functions/api/bulk-jobs.js');
const publicSearch = read('functions/_lib/guide-search.js');
const publicGuides = read('functions/_lib/guides-public.js');
const page = read('control-center/index.html');
const recent = read('functions/_lib/recent-actions.js');
const runtime = read('assets/js/control-center-v2.js');
const publishingCss = read('assets/css/control-center-publishing.css');

const longChat = classifyWhopItem({
  sourceType: 'chat',
  title: 'Pinned announcement',
  content: 'This is a long pinned community chat message with context, updates, reactions, and conversation. '.repeat(12),
  sourceMeta: { pinned: true, experienceTitle: 'General chat' },
});
assert.equal(longChat.autoPublishEligible, false, 'Even long or pinned Chat messages must remain manual-only.');
assert.equal(longChat.code, 'chat_manual_only');

const forumReply = classifyWhopItem({
  sourceType: 'forum',
  title: 'Reply from another member',
  content: 'This reply is long enough to look useful but belongs under the original discussion. '.repeat(8),
  sourceMeta: { parentId: 'post_parent', experienceTitle: 'Community forum' },
});
assert.equal(forumReply.blocked, true, 'Forum replies must never become standalone guides.');
assert.equal(forumReply.code, 'forum_reply');

const rawReference = classifyWhopItem({
  sourceType: 'forum',
  title: 'Reference',
  content: 'https://example.com/some/raw/reference',
  sourceMeta: { experienceTitle: 'Community forum' },
});
assert.equal(rawReference.blocked, true, 'Raw links must not become standalone public guides.');
assert.equal(rawReference.code, 'raw_reference');

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

const productWall = classifyWhopItem({
  sourceType: 'forum',
  title: 'ASUS Gaming Laptop 16GB RAM 1TB SSD',
  content: 'Available online. Product listing, specifications, price, seller, shipping and stock details. '.repeat(15),
  sourceMeta: { experienceTitle: 'Finds' },
});
assert.equal(productWall.autoPublishEligible, false, 'A long product listing without instructional structure must not become a guide.');

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
  source_key: 'chat-message:message_1',
  body_markdown: 'hello there',
  integrity_json: '{}',
  attachment_json: '{}',
}), /Chat content requires explicit manual review/);
assert.match(rejectionReasonForGuide({
  title: 'Community reply',
  source_key: 'forum-post:reply_1',
  body_markdown: 'A member reply that should stay with the original post.',
  integrity_json: JSON.stringify({ sourceMeta: { parentId: 'parent_1' } }),
  attachment_json: '{}',
}), /Forum replies stay with their parent discussion/);

assert.equal(suggestedCategoryForText('Available online and in stock'), 'general', 'The suffix of online must not trigger Sports Betting.');
assert.notEqual(suggestedCategoryForText('Line of credit guide'), 'sports-betting', 'A normal use of line must not trigger Sports Betting.');
assert.equal(suggestedCategoryForText('Stock trading technical analysis guide'), 'crypto-trading');
assert.equal(suggestedCategoryForText('Walmart marketplace selling guide'), 'reselling');

assert.ok(bulk.includes('const JOB_VERSION = 5'), 'Bulk jobs are not versioned for tenant-safe recovery.');
assert.ok(bulk.includes('cancelLegacyRow'), 'Unsafe active legacy jobs are not canceled automatically.');
assert.ok(bulk.includes("AND lease_until = ?"), 'A stale bulk worker can overwrite a newer worker after losing its lease.');
assert.ok(bulk.includes('completed-with-issues') && bulk.includes('completed-successfully'), 'Bulk completion does not distinguish clean success from held or failed items.');
assert.ok(bulk.includes('sourceKeys: [sourceKey]'), 'Bulk steps are not limited to one exact content item.');
assert.ok(bulk.includes('automaticWorkflow: true'), 'Bulk imports do not enforce automatic guide-quality policy.');
assert.ok(bulk.includes('permissionRequired'), 'Missing Whop scopes are still treated as generic job crashes.');
assert.ok(!bulk.includes('IMPORT_CHUNK = 50'), 'The old source-wide import batching path returned.');

assert.ok(posts.includes("from './whop-items.js'"), 'Source scans still use the detail-heavy legacy listing path.');
assert.ok(posts.includes('listExperienceItemsLite'), 'Lightweight scan discovery is not active.');
assert.ok(items.includes('retrieveExperienceItem'), 'Exact item re-fetch is missing.');
assert.ok(items.includes('COURSE_DETAIL_CONCURRENCY = 4') && items.includes('mapConcurrent'), 'Course media detail reads are not strictly bounded.');
assert.ok(items.includes("return parts.join('\\n\\n')"), 'Mixed course text/video/quiz blocks can be dropped.');

assert.ok(imports.includes('retrieveExperienceItem'), 'Import still re-lists an entire Whop source.');
assert.ok(imports.includes("action: 'held-policy'"), 'Exact content that fails revalidation is not held safely.');
assert.ok(imports.includes("action: 'duplicate-held'"), 'Exact duplicate guides are not held.');
assert.ok(imports.includes('MAX_ATTACHMENTS_PER_AUTOMATIC_ITEM'), 'Attachment-heavy content can still exceed a bounded automatic step.');
assert.ok(imports.includes("existing.status !== 'rejected'"), 'Rejected imported guides are still mistaken for unchanged and cannot be re-imported.');
assert.ok(imports.includes('exactRecoveryContext') && imports.includes('recoveryGuideId'), 'Recovery does not validate one exact rejected guide inside the importer.');
assert.ok(imports.includes("row.status !== 'rejected'") && imports.includes('Recovery context does not match'), 'Recovery can bypass normal approval checks without matching the rejected guide, source key, and Experience.');
assert.ok(repair.includes('recoveryGuideId: id'), 'The recovery endpoint does not use the exact rejected-guide import context.');
assert.ok(!repair.includes('saveSourceDecision') && !repair.includes('savePostDecision'), 'Recovery still mutates account source or item approval decisions.');
assert.ok(repair.includes('restoreGuideSnapshot') && repair.includes('snapshotCourseVideos') && repair.includes('restoreCourseVideos'), 'Failed recovery does not restore both the guide row and course-video routes.');
assert.ok(courseVideo.includes('snapshotCourseVideos') && courseVideo.includes('restoreCourseVideos'), 'Course-video rollback helpers are missing.');
assert.ok(recent.includes("status = 'rejected'") && recent.includes("status IN ('published', 'rejected')"), 'Rejected imported guides are missing from 48-hour restore or cannot return to draft.');
assert.ok(runtime.includes('Rejected · can restore') && runtime.includes('published or rejected imported guides'), 'The Undo panel still mislabels rejected-guide restoration as publication-only.');
assert.ok(/Removed Whop imports/i.test(page) && /restore/i.test(page), 'The Control Center does not explain that rejected imports can be restored.');

assert.ok(reconcile.includes("status IN ('draft', 'published')"), 'Cleanup does not inspect the full active imported guide queue.');
assert.ok(reconcile.includes('reconcileImportedGuides'), 'Unified imported-guide cleanup is missing.');
assert.ok(reconcile.includes('cleanupVersion: 5'), 'Current tenant-aware cleanup version is not recorded.');
assert.ok(reconcile.includes("status = 'rejected'"), 'Junk cleanup does not move items out of the normal review queue.');
assert.ok(reconcile.includes('Duplicate of'), 'Imported duplicate cleanup is missing.');
assert.ok(!reconcile.includes('LOOKBACK_HOURS'), 'Cleanup is still limited to a recent time window.');
assert.ok(control.includes('reconcileRecentBulkImports'), 'Dashboard does not reconcile imported junk before rendering.');
assert.ok(control.includes("guide.status !== 'rejected'"), 'Rejected quarantine still appears in normal Review & Publish.');
assert.ok(publicSearch.includes('reconcileRecentBulkImports'), 'Public guide search can expose importer junk before cleanup.');
assert.ok(publicGuides.includes('reconcileImportedGuides'), 'Public guide detail pages do not use unified cleanup.');
assert.ok(media.includes('manualReviewCompleted: true'), 'Owner save does not complete manual review.');
assert.ok(media.includes('quarantined: false'), 'Owner save cannot clear a corrected quarantine.');
assert.ok(bulkApi.includes('legacyCanceled') && bulkApi.includes('failures: []'), 'Stale legacy errors remain visible after automatic cancellation.');

assert.ok(page.includes('data-publish-all-progress'), 'Publish-ready status text is missing.');
assert.ok(page.includes('publish-ready-visual'), 'Publish-ready visual progress is missing.');
assert.ok(page.includes('Audit & publish ready drafts'), 'Publish-ready action is unclear.');
assert.ok(page.includes('<option value="draft" selected>Needs review</option>'), 'Review queue does not default to drafts.');
assert.ok(publishingCss.includes('publish-ready-scan'), 'Publish-ready progress has no working animation.');
assert.ok(publishingCss.includes('max-height:min(70vh,48rem)!important'), 'Draft queue can expand into an unbounded wall.');
assert.ok(publishingCss.includes('grid-template-columns:1fr!important'), 'Draft queue can return to a confusing two-column wall.');

for (const file of [
  'functions/_lib/content-policy.js',
  'functions/_lib/whop-items.js',
  'functions/_lib/posts.js',
  'functions/_lib/guides.js',
  'functions/_lib/guides-import.js',
  'functions/_lib/guides-media.js',
  'functions/_lib/course-video.js',
  'functions/_lib/guides-public.js',
  'functions/_lib/import-reconciliation.js',
  'functions/_lib/bulk-jobs.js',
  'functions/api/control.js',
  'functions/api/guide-repair.js',
  'functions/api/bulk-jobs.js',
  'functions/_lib/guide-search.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG IMPORT QUALITY AND RECOVERY AUDIT PASSED\n');
console.log('✓ Replies, Chat, chatter, raw references, unstructured product listings, duplicates, and expired picks cannot flood publishing.');
console.log('✓ Category matching no longer mistakes online products or ordinary uses of line for Sports Betting.');
console.log('✓ Course scanning avoids per-lesson detail fanout and exact lessons are re-fetched one at a time.');
console.log('✓ Every bulk Worker step processes at most one exact content item and stale workers cannot overwrite newer progress.');
console.log('✓ Missing Whop scopes and item failures remain visible as completed-with-issues instead of false success.');
console.log('✓ Exact rejected-guide recovery does not mutate approval policy and rolls back guide/video state on failure.');
console.log('✓ Full imported-guide cleanup removes old bad drafts and public junk, not only recent bulk output.');
console.log('✓ Review and publish keeps visible progress evidence and a bounded one-column queue.');
console.log('✓ Owner edits complete manual review without erasing source policy history.');
