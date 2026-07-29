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
const control = read('assets/js/control-center.js');
const hardening = read('assets/js/control-center-hardening.js');
const density = read('assets/js/control-center-density.js');
const performance = read('assets/js/control-center-performance.js');
const hardeningCss = read('assets/css/control-center-hardening.css');
const mediaCss = read('assets/css/guide-media.css');
const media = read('functions/_lib/media.js');
const guideMedia = read('functions/_lib/guides-media.js');
const controlApi = read('functions/api/control.js');
const bulkJobs = read('functions/_lib/bulk-jobs.js');
const mediaRoute = read('functions/media/[key].js');
const middleware = read('functions/_middleware.js');
const templates = read('functions/_lib/templates.js');

assert.ok(page.includes('/assets/js/control-center-performance.js'), 'Fast interaction runtime is not loaded.');
assert.ok(performance.includes("addEventListener('click'") && performance.includes('true);'), 'Group selection is not intercepted before the old full-rerender handlers.');
assert.ok(performance.includes('stopImmediatePropagation'), 'Slow legacy selection handlers can still run after the fast path.');
assert.ok(performance.includes('requestAnimationFrame'), 'Selection summaries are not frame-coalesced.');
assert.ok(hardening.includes('requestAnimationFrame') && hardening.includes('groupRecords'), 'Source filtering still rescans live DOM on every keystroke.');
assert.ok(hardening.includes('dataset.filterText') && hardening.includes('dataset.filterStatus'), 'Draft filtering does not cache searchable text.');
assert.ok(!hardening.includes("{ childList: true, subtree: true }"), 'Broad subtree mutation observation can recreate button lag.');
assert.ok(density.includes('selectionFrame') && density.includes('compactFrame'), 'Summary updates are not coalesced.');
assert.ok(hardeningCss.includes('content-visibility:auto'), 'Offscreen source and post cards are still fully rendered.');
assert.ok(hardeningCss.includes('touch-action:manipulation'), 'Mobile controls do not use a low-latency touch path.');

assert.ok(page.includes('Imported automatically') && page.includes('External app module'), 'Source capability explanation is missing.');
assert.ok(page.includes('It is not a missing Whop permission'), 'External app limitations are not explained plainly.');
assert.ok(page.includes('<option value="external">External app modules</option>'), 'External app filter is missing.');
assert.ok(hardening.includes('Separate connection required'), 'External modules still look like generic importer failures.');
assert.ok(hardening.includes('Your membership access is valid'), 'The UI can still imply the owner lacks access.');
assert.ok(!page.toLowerCase().includes('unsupported'), 'Owner-facing Control Center markup still uses the vague unsupported label.');

const image = mediaMarkdown({ filename: 'proof.png', contentType: 'image/png', url: '/media/whop-0123456789abcdef0123456789abcdef-proof.png' });
const video = mediaMarkdown({ filename: 'walkthrough.mp4', contentType: 'video/mp4', url: '/media/whop-0123456789abcdef0123456789abcdef-walkthrough.mp4' });
const audio = mediaMarkdown({ filename: 'lesson.m4a', contentType: 'audio/mp4', url: '/media/whop-0123456789abcdef0123456789abcdef-lesson.m4a' });
assert.ok(image.startsWith('!['), 'Images are not emitted as inline media.');
assert.ok(video.startsWith('![video:'), 'Videos are not emitted as playable media.');
assert.ok(audio.startsWith('![audio:'), 'Audio is not emitted as playable media.');
assert.match(renderMarkdown(video), /<video controls preload="metadata" playsinline/);
assert.match(renderMarkdown(audio), /<audio controls preload="metadata"/);
assert.match(renderMarkdown(image), /<img src="\/media\//);
assert.ok(!renderMarkdown('`![video: fake](/media/fake.mp4)`').includes('<video'), 'Media syntax inside code is being executed.');

assert.ok(media.includes('SNIPERPLUG_MEDIA') && media.includes('.put(key, boundedStream'), 'Private media is not copied to SniperPlug R2 storage.');
assert.ok(media.includes('MAX_MEDIA_BYTES') && media.includes('500 MB'), 'Automatic media copying has no bounded size.');
assert.ok(media.includes('blockedHostname') && media.includes('metadata.google.internal'), 'Remote media copying lacks SSRF destination guards.');
assert.ok(guideMedia.includes('courseSupplementFiles') && guideMedia.includes('course-thumbnail'), 'Course pictures are not carried into guides.');
assert.ok(guideMedia.includes('muxDownloadableFile') && guideMedia.includes('highest.mp4'), 'Downloadable hosted course video is not detected.');
assert.ok(guideMedia.includes('mirrorWhopMedia') && guideMedia.includes('Media and attachments'), 'Imported attachments do not pass through the durable media layer.');
assert.ok(controlApi.includes("from '../_lib/guides-media.js'"), 'Manual imports bypass media preservation.');
assert.ok(bulkJobs.includes("from './guides-media.js'"), 'Bulk imports bypass media preservation.');
assert.ok(mediaRoute.includes('accept-ranges') && mediaRoute.includes('content-range'), 'Mirrored video does not support ranged playback.');
assert.ok(mediaRoute.includes('SNIPERPLUG_MEDIA'), 'Public media route is not connected to R2.');
assert.ok(middleware.includes("media-src 'self' https:"), 'Content security policy blocks guide media playback.');
assert.ok(templates.includes('/assets/css/guide-media.css'), 'Public guides do not load responsive media styles.');
assert.ok(mediaCss.includes('.guide-media video') && mediaCss.includes('.guide-media audio'), 'Video and audio players are not responsive.');

for (const file of [
  'assets/js/control-center-hardening.js',
  'assets/js/control-center-density.js',
  'assets/js/control-center-performance.js',
  'functions/_lib/media.js',
  'functions/_lib/guides-media.js',
  'functions/_lib/markdown.js',
  'functions/_lib/bulk-jobs.js',
  'functions/api/control.js',
  'functions/media/[key].js',
  'functions/_middleware.js',
  'functions/_lib/templates.js',
]) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG PERFORMANCE, CLARITY, AND MEDIA AUDIT PASSED\n');
console.log('✓ Long source lists filter and summarize at most once per animation frame.');
console.log('✓ Group and master selection bypass full source-tree rerenders.');
console.log('✓ Offscreen source and post cards skip unnecessary rendering work.');
console.log('✓ External app modules are explained as separate integrations, not missing access.');
console.log('✓ Forum, course, and chat pictures, video, audio, PDFs, and files remain in the import path.');
console.log('✓ Private signed media can be copied to SniperPlug-owned R2 storage.');
console.log('✓ Images render inline and video/audio render as responsive playable controls.');
console.log('✓ Ranged media responses support Chrome and Samsung Browser seeking.');
