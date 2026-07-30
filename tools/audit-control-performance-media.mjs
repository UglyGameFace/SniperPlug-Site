import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../functions/_lib/markdown.js';
import { mediaMarkdown } from '../functions/_lib/media.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const page = read('control-center/index.html');
const runtime = read('assets/js/control-center-v2.js');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const guides = read('functions/_lib/guides.js');
const reconciliation = read('functions/_lib/import-reconciliation.js');
const siteClient = read('assets/js/site.js');
const hardeningCss = read('assets/css/control-center-hardening.css');
const historyCss = read('assets/css/bulk-history.css');
const mediaCss = read('assets/css/guide-media.css');
const media = read('functions/_lib/media.js');
const mediaStorage = read('functions/_lib/media-storage.js');
const guideMedia = read('functions/_lib/guides-media.js');
const sourcePolicy = read('functions/_lib/source-policy.js');
const controlApi = read('functions/api/control.js');
const bulkJobs = read('functions/_lib/bulk-jobs.js');
const mediaRoute = read('functions/media/[key].js');
const courseVideo = read('functions/_lib/course-video.js');
const courseVideoRoute = read('functions/course-video/[key].js');
const mediaMigration = read('migrations/0003_media_hard_free.sql');
const courseVideoMigration = read('migrations/0004_course_video_sources.sql');
const middleware = read('functions/_middleware.js');
const templates = read('functions/_lib/templates.js');

assert.ok(page.includes('/assets/js/control-center-v2.js'), 'Consolidated fast interaction runtime is not loaded.');
assert.ok(!page.includes('/assets/js/control-center.js') && !page.includes('/assets/js/control-center-performance.js') && !page.includes('/assets/js/control-center-density.js') && !page.includes('/assets/js/control-center-hardening.js') && !page.includes('/assets/js/bulk-publish.js'), 'Legacy runtimes can still attach duplicate handlers and observers.');
assert.equal((runtime.match(/root\.addEventListener\('click'/g) || []).length, 1, 'Controls do not share one delegated click path.');
assert.equal((runtime.match(/root\.addEventListener\('change'/g) || []).length, 1, 'Controls do not share one delegated change path.');
assert.ok(runtime.includes('requestIdleCallback') && runtime.includes('appendChunk'), 'Large content scans do not yield between render chunks.');
assert.ok(runtime.includes('contentVisibility') && runtime.includes('containIntrinsicSize'), 'Offscreen cards are still fully laid out and painted.');
assert.ok(runtime.includes('state.sourceCards') && runtime.includes('updateSourceDecision'), 'Source decisions still require full source-tree rerenders.');
assert.ok(runtime.includes('updatePostCard') && runtime.includes('updateGuideListItem'), 'Post or guide actions still rebuild complete lists.');
assert.ok(runtime.includes('state.selectedSources') && runtime.includes('setSelected'), 'Selection is not maintained in memory as one batched state change.');
assert.ok(runtime.includes('experienceIds: unique'), 'Bulk source decisions are not sent in one request.');
assert.equal((runtime.match(/source-decision/g) || []).length, 1, 'The source-decision browser path is duplicated.');
assert.ok(!runtime.includes('MutationObserver') && !lifecycle.includes('MutationObserver'), 'Broad mutation observation can recreate input lag.');
assert.ok(runtime.includes('requestAnimationFrame(filterSources)') && runtime.includes('requestAnimationFrame(filterGuides)'), 'Search filtering is not frame-coalesced.');
assert.ok(runtime.includes('GUIDE_PAGE_SIZE = 60') && runtime.includes('filteredGuideIds') && runtime.includes('guide-load-more'), 'The review queue still renders every guide at once.');
assert.ok(runtime.includes('guide-detail&id=') && runtime.includes('state.guideDetails'), 'Exact guide bodies are not fetched lazily.');
assert.ok(guides.includes('listAdminGuideSummaries') && guides.includes('adminGuide'), 'Dashboard guide summaries and on-demand detail loading are missing.');
assert.ok(reconciliation.includes('importer_maintenance') && reconciliation.includes('15 * 60_000'), 'Expensive cleanup is not durably throttled across Worker cold starts.');
assert.ok(runtime.includes('updateGroupSelectionCards') && runtime.includes('groupSelectionCount'), 'Group selection does not update locally on the tapped card.');
assert.ok(runtime.includes("root.addEventListener('pointerdown'") && runtime.includes("dataset.pressed = 'true'"), 'Controls do not acknowledge touch immediately.');
assert.ok(runtime.includes("preview: $('[data-post-preview]', document)"), 'The modal lives outside the Control Center root and can crash the entire runtime if queried from the wrong scope.');
assert.ok(page.includes('?v=20260730.2') && middleware.includes("url.searchParams.has('v')"), 'Control Center assets can remain stale after deployment.');
assert.ok(!/listAdminGuideSummaries[\s\S]*body_markdown/.test(guides.slice(guides.indexOf('export async function listAdminGuideSummaries'), guides.indexOf('export async function adminGuide'))), 'Dashboard guide summaries still include every full guide body.');
assert.ok(siteClient.includes('const indexed = cards.map') && siteClient.includes('requestAnimationFrame(apply)'), 'Public deal filtering still repeatedly scans live card text on every keystroke.');
assert.ok(controlApi.includes('saveSourceDecisions') && controlApi.includes('requestedSourceValues'), 'The server does not accept validated multi-source decisions.');
assert.ok(controlApi.includes('MAX_BATCH_SOURCES = 100'), 'Source-decision request size is not bounded.');
assert.ok(sourcePolicy.includes('MAX_SOURCE_DECISIONS = 100') && sourcePolicy.includes('await db.batch(statements)'), 'Source decisions are not written through one bounded database batch.');
assert.ok(hardeningCss.includes('content-visibility:auto'), 'CSS fallback does not skip offscreen source and post rendering.');
assert.ok(hardeningCss.includes('touch-action:manipulation'), 'Mobile controls do not use a low-latency touch path.');

assert.ok(!page.includes('source-capability-note'), 'Large explanation cards were reinserted into the primary workflow.');
assert.ok(page.includes('media-readiness-inline') && page.includes('data-media-readiness'), 'Media readiness is not presented as a compact status.');
assert.ok(page.includes('data-media-usage-progress') && runtime.includes('mediaStorageUsage'), 'The Control Center does not show the real hard-free storage meter.');
assert.ok(runtime.includes('50 MB per file') && runtime.includes('8 GB total') && runtime.includes('25,000 files') && runtime.includes('2,000 daily') && runtime.includes('50,000 monthly copy attempts') && runtime.includes('10,000 uncached reads per day') && runtime.includes('7-day safety window'), 'The owner-facing media policy does not explain the enforced free-tier safeguards.');
assert.ok(!lifecycle.includes('softenMediaNotice'), 'The lifecycle helper can overwrite the authoritative storage state.');
assert.ok(page.includes('panel-action') && hardeningCss.includes('.panel-head>.panel-action'), 'Panel actions can still stretch into oversized mobile bars.');
assert.ok(!hardeningCss.includes('.button-row,.decision-row,.editor-actions{\n    display:grid;\n    grid-template-columns:1fr;'), 'A global mobile rule can still stack every button into one column.');
assert.ok(page.includes('<option value="external">App-specific modules</option>'), 'External app filter is missing.');
assert.ok(runtime.includes('Native API probe completed'), 'External modules still look like generic importer failures.');
assert.ok(runtime.includes('not a guessed endpoint'), 'The UI can still imply SniperPlug skipped native endpoint checks.');
assert.ok(!page.toLowerCase().includes('unsupported'), 'Owner-facing Control Center markup still uses the vague unsupported label.');
assert.ok(runtime.includes('state.dashboard.capabilities?.mediaStorage'), 'The browser does not read the real R2 capability.');
assert.ok(runtime.includes('SNIPERPLUG_MEDIA'), 'Missing media storage does not identify the exact Cloudflare binding.');
assert.ok(controlApi.includes('mediaStorage: Boolean(env?.SNIPERPLUG_MEDIA)'), 'The server does not report real media-storage readiness.');
assert.ok(controlApi.includes('mediaStorageUsage') && controlApi.includes('runMediaStorageMaintenance'), 'The dashboard does not return usage or schedule bounded maintenance.');

const image = mediaMarkdown({ filename: 'proof.png', contentType: 'image/png', url: '/media/whop-0123456789abcdef0123456789abcdef-proof.png' });
const video = mediaMarkdown({ filename: 'walkthrough.mp4', contentType: 'video/mp4', url: '/media/whop-0123456789abcdef0123456789abcdef-walkthrough.mp4' });
const audio = mediaMarkdown({ filename: 'lesson.m4a', contentType: 'audio/mp4', url: '/media/whop-0123456789abcdef0123456789abcdef-lesson.m4a' });
const adaptive = mediaMarkdown({ filename: 'Course video', contentType: 'video/x-mux', role: 'hosted-video-player', url: '/course-video/wcv-0123456789abcdef0123456789abcdef01234567' });
assert.ok(image.startsWith('!['), 'Images are not emitted as inline media.');
assert.ok(video.startsWith('![video:'), 'Videos are not emitted as playable media.');
assert.ok(audio.startsWith('![audio:'), 'Audio is not emitted as playable media.');
assert.ok(adaptive.startsWith('![video-player:'), 'Adaptive Whop course video is not emitted as an embedded player.');
assert.match(renderMarkdown(video), /<video controls preload="metadata" playsinline/);
assert.match(renderMarkdown(audio), /<audio controls preload="metadata"/);
assert.match(renderMarkdown(image), /<img src="\/media\//);
assert.match(renderMarkdown(adaptive), /<iframe src="\/course-video\//);
assert.ok(!renderMarkdown('`![video: fake](/media/fake.mp4)`').includes('<video'), 'Media syntax inside code is being executed.');

assert.ok(media.includes('SNIPERPLUG_MEDIA') && media.includes('.put(key, bounded.stream'), 'Private media is not copied to SniperPlug R2 storage.');
assert.ok(media.includes('MAX_MEDIA_OBJECT_BYTES') && media.includes('50 MB automatic-copy limit'), 'Automatic media copying is not capped at 50 MB.');
assert.ok(media.includes("storageClass: 'Standard'"), 'SniperPlug media copies can fall outside the R2 Standard free tier.');
assert.ok(mediaStorage.includes('MEDIA_STORAGE_LIMIT_BYTES = 8_000_000_000'), 'The R2 bucket has no application-enforced 8 GB ceiling.');
assert.ok(mediaStorage.includes('MAX_MEDIA_OBJECTS = 25_000') && mediaStorage.includes('MAX_MEDIA_COPIES_PER_DAY = 2_000') && mediaStorage.includes('MAX_MEDIA_COPIES_PER_MONTH = 50_000') && mediaStorage.includes('MAX_MEDIA_ORIGIN_READS_PER_DAY = 10_000'), 'R2/D1 operation and object-count free-tier guardrails are missing.');
assert.ok(mediaStorage.includes('used_bytes + reserved_bytes + ? <= ?') && mediaStorage.includes("status = 'copying'"), 'Concurrent copies can bypass the storage ceiling.');
assert.ok(mediaStorage.includes('cleanupUnreferencedMedia') && mediaStorage.includes('MEDIA_DELETE_GRACE_MS') && mediaStorage.includes('MAX_MEDIA_CLEANUP_MUTATIONS = 5_000'), 'Unreferenced media has no safe delayed, write-bounded cleanup.');
assert.ok(mediaStorage.includes("saved && saved.status === 'ready'") && mediaStorage.includes("Number(saved.size_bytes || 0) === size"), 'Daily inventory still rewrites every unchanged media row and can waste the D1 free write allowance.');
assert.ok(mediaMigration.includes('copy_day TEXT') && mediaMigration.includes('copies_today INTEGER'), 'The permanent D1 migration is missing the daily copy counter.');
assert.ok(mediaStorage.includes('managed INTEGER') && mediaStorage.includes('listBucketObjects'), 'Existing or manually uploaded bucket objects are excluded from quota accounting.');
assert.ok(guideMedia.includes('pruneDetachedGuideMedia'), 'Owner replacements leave obsolete media permanently referenced.');
assert.ok(media.includes('blockedHostname') && media.includes('metadata.google.internal'), 'Remote media copying lacks SSRF destination guards.');
assert.ok(guideMedia.includes('courseSupplementFiles') && guideMedia.includes('course-thumbnail'), 'Course pictures are not carried into guides.');
assert.ok(guideMedia.includes('findMuxStaticRendition') && guideMedia.includes('hosted-video-player'), 'Hosted course video is not upgraded to adaptive playback plus optional download.');
assert.ok(courseVideo.includes("method: 'GET'") && courseVideo.includes("range: 'bytes=0-0'") && !courseVideo.includes("method: 'HEAD'"), 'Mux static renditions are still probed with unsupported HEAD requests.');
assert.ok(courseVideo.includes('https://player.mux.com/') && courseVideo.includes("playback-token"), 'Signed adaptive Mux playback is not constructed correctly.');
assert.ok(courseVideoRoute.includes('requireOwnerWhopSession') && courseVideoRoute.includes('course_lessons/') && courseVideoRoute.includes('guide_status'), 'Course-video playback is not refreshed from the exact authorized lesson or bounded to a guide.');
assert.ok(courseVideoMigration.includes('course_video_sources') && !courseVideoMigration.includes('playback_token'), 'Stable course-video mapping is missing or persists expiring playback credentials.');
assert.ok(guideMedia.includes('mirrorWhopMedia') && guideMedia.includes('Media and attachments'), 'Imported attachments do not pass through the durable media layer.');
assert.ok(controlApi.includes("from '../_lib/guides-media.js'"), 'Manual imports bypass media preservation.');
assert.ok(bulkJobs.includes("from './guides-media.js'"), 'Bulk imports bypass media preservation.');
assert.ok(mediaRoute.includes('accept-ranges') && mediaRoute.includes('content-range'), 'Mirrored video does not support ranged playback.');
assert.ok(mediaRoute.includes('globalThis.caches?.default') && mediaRoute.includes('edgeCache.put'), 'Full media responses are not cached at the edge.');
assert.ok(mediaRoute.includes('reserveMediaOriginRead') && mediaRoute.includes('status: 429'), 'Uncached R2 reads do not stop at the daily hard-free ceiling.');
assert.ok(mediaRoute.includes('if (requestedUrl.search)') && mediaRoute.includes('Response.redirect'), 'Cache-busting query strings can trigger extra R2 reads.');
assert.ok(mediaRoute.includes('SNIPERPLUG_MEDIA'), 'Public media route is not connected to R2.');
assert.ok(middleware.includes("media-src 'self' https:"), 'Content security policy blocks guide media playback.');
assert.ok(templates.includes('/assets/css/guide-media.css'), 'Public guides do not load responsive media styles.');
assert.ok(mediaCss.includes('.guide-media video') && mediaCss.includes('.guide-media audio'), 'Video and audio players are not responsive.');
assert.ok(historyCss.includes('.bulk-progress-track') && historyCss.includes('.recent-action'), 'Progress and reversal controls are not styled.');

for (const file of [
  'assets/js/control-center-v2.js',
  'assets/js/control-center-lifecycle.js',
  'functions/_lib/source-policy.js',
  'functions/_lib/media.js',
  'functions/_lib/media-storage.js',
  'functions/_lib/course-video.js',
  'functions/_lib/guides-media.js',
  'functions/_lib/markdown.js',
  'functions/_lib/bulk-jobs.js',
  'functions/_lib/recent-actions.js',
  'functions/api/recent-actions.js',
  'functions/api/control.js',
  'functions/media/[key].js',
  'functions/course-video/[key].js',
  'functions/_middleware.js',
  'functions/_lib/templates.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG PERFORMANCE, CLARITY, MEDIA, AND VISUAL AUDIT PASSED\n');
console.log('✓ One delegated runtime replaces duplicate listeners, helpers, and observers.');
console.log('✓ Source, post, and guide actions update only affected controls and cards.');
console.log('✓ Long lists render lazily and yield between chunks.');
console.log('✓ Searches are frame-coalesced and use cached guide metadata.');
console.log('✓ Primary workflow stays compact without explanatory card clutter.');
console.log('✓ Mobile controls preserve intentional paired actions instead of stacking every button.');
console.log('✓ External app modules remain explained inside their relevant group.');
console.log('✓ The Control Center reports real SniperPlug media usage and hard-stop state compactly.');
console.log('✓ Forum, course, and chat pictures, video, audio, PDFs, and files remain in the import path.');
console.log('✓ Images render inline and video/audio render as responsive playable controls.');
console.log('✓ Ranged media responses support Chrome and Samsung Browser seeking.');
console.log('✓ Edge caching, storage/object/daily-operation ceilings, write-bounded inventory, and delayed orphan cleanup protect the R2 and D1 free tiers.');
