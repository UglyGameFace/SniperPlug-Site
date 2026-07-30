import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findMuxStaticRendition,
  muxPlayerUrl,
} from '../functions/_lib/course-video.js';
import { mediaMarkdown } from '../functions/_lib/media.js';
import { renderMarkdown } from '../functions/_lib/markdown.js';
import { resolveWhopExperienceType } from '../functions/_lib/whop.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const originalFetch = globalThis.fetch;

const asset = {
  id: 'mux_asset_1',
  signed_playback_id: 'signed_playback_1',
  signed_video_playback_token: 'header.payload.signature',
  signed_thumbnail_playback_token: 'thumb.token',
  signed_storyboard_playback_token: 'story.token',
  status: 'ready',
  duration_seconds: 2314,
};

const probes = [];
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  probes.push({ url, options });
  if (url.includes('/capped-1080p.mp4')) {
    return new Response(new Uint8Array([0]), {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-range': 'bytes 0-0/123456789',
        'content-length': '1',
      },
    });
  }
  return new Response('', { status: 404 });
};

const rendition = await findMuxStaticRendition(asset);
assert.equal(rendition?.filename, 'capped-1080p.mp4');
assert.equal(rendition?.size, 123456789);
assert.ok(rendition?.url.includes('token=header.payload.signature'));
assert.ok(probes.length >= 2, 'Static rendition fallbacks were not checked.');
assert.ok(probes.every((probe) => probe.options.method === 'GET'), 'Static Mux renditions must be probed with GET, not HEAD.');
assert.ok(probes.every((probe) => probe.options.headers.range === 'bytes=0-0'), 'Static rendition probes must request only one byte.');

const player = muxPlayerUrl(asset, 'Finding award flights');
assert.ok(player.startsWith('https://player.mux.com/signed_playback_1?'));
assert.ok(player.includes('playback-token=header.payload.signature'));
assert.ok(player.includes('thumbnail-token=thumb.token'));
assert.ok(player.includes('storyboard-token=story.token'));
assert.ok(!player.includes('max-resolution'), 'Adaptive playback must not be capped below the source renditions.');

const marker = mediaMarkdown({
  filename: 'Finding award flights',
  role: 'hosted-video-player',
  contentType: 'video/x-mux',
  url: '/course-video/wcv-0123456789abcdef0123456789abcdef01234567',
});
assert.ok(marker.startsWith('![video-player:'));
const rendered = renderMarkdown(marker);
assert.ok(rendered.includes('<iframe'));
assert.ok(rendered.includes('src="/course-video/wcv-0123456789abcdef0123456789abcdef01234567"'));
assert.ok(!renderMarkdown('![video-player: Bad](https://evil.example/player)').includes('<iframe'), 'Only same-origin registered player routes may become iframes.');

const apiCalls = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  apiCalls.push(url.pathname);
  const data = url.pathname.endsWith('/forum_posts') ? [{ id: 'post_1' }] : [];
  return new Response(JSON.stringify({ data, page_info: { has_next_page: false } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
const detected = await resolveWhopExperienceType(
  { accessToken: 'oauth-token', tokenVersion: 99 },
  { id: 'exp_probe_forum_1', app: { id: 'app_unknown', name: 'Notes' } },
);
assert.equal(detected, 'forum', 'Renamed native content was not recovered through official endpoint probing.');
assert.deepEqual(apiCalls.slice(0, 2), ['/api/v1/courses', '/api/v1/forum_posts']);

const route = read('functions/course-video/[key].js');
const migration = read('migrations/0004_course_video_sources.sql');
const guideImport = read('functions/_lib/guides-import.js');
const guideMedia = read('functions/_lib/guides-media.js');
const whopItems = read('functions/_lib/whop-items.js');
assert.ok(route.includes('course_lessons/${encodeURIComponent(source.lesson_id)}'));
assert.ok(route.includes('findMuxStaticRendition(asset)'));
assert.ok(route.includes('playerPage(playerUrl, source.title)'));
assert.ok(!migration.includes('signed_video_playback_token'));
assert.ok(!migration.includes('playback_id TEXT'), 'Expiring or reusable playback credentials must not be persisted in D1.');
assert.ok(whopItems.includes('_mediaContext: mediaContext'), 'Exact course media must stay available in-memory for the media enhancer.');
assert.ok(whopItems.includes('detailedCourseLesson'), 'Course scan must fetch exact video lesson details before review.');
assert.ok(whopItems.includes('COURSE_DETAIL_CONCURRENCY = 4'), 'Exact course detail reads must remain bounded.');
assert.ok(whopItems.includes("fileInput(lesson?.thumbnail, 'course-thumbnail')"), 'Course review cards must receive lesson thumbnails when Whop exposes them.');
assert.ok(whopItems.includes('duration_seconds:'), 'Course review cards must receive hosted-video duration metadata.');
assert.ok(guideImport.includes('_mediaContext: item._mediaContext || null'), 'The exact course asset was not carried to media enhancement.');
assert.ok(guideMedia.includes("['created-draft', 'updated-draft', 'unchanged']"), 'Existing unchanged course drafts would not be repaired after rescanning.');
assert.ok(guideImport.includes("attachment?.role !== 'hosted-video'"), 'Hosted course videos must bypass generic R2 attachment copying.');
assert.ok(guideMedia.includes("['hosted-video-player', 'hosted-video-download', 'hosted-video-archive']"), 'Transient refreshes must not preserve obsolete raw hosted-video R2 warnings.');
assert.ok(guideMedia.includes('const { _mediaContext, ...publicResult }'), 'Signed playback context must be stripped before API results leave the server.');

globalThis.fetch = originalFetch;

console.log('\nSNIPERPLUG COURSE VIDEO AND CAPABILITY PROBE TESTS PASSED\n');
console.log('✓ Mux static renditions use one-byte GET probes instead of unreliable HEAD requests.');
console.log('✓ Adaptive signed playback keeps every source rendition available through Mux Player.');
console.log('✓ Stable SniperPlug player URLs never persist expiring Whop playback credentials.');
console.log('✓ Renamed native modules are recovered by probing official Whop read endpoints.');
