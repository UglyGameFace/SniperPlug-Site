export {
  listAdminGuides,
  listCategories,
  saveCategory,
  saveGuideDraft,
  setGuideStatus,
  slugify,
  suggestedCategoryForText,
} from './guides.js';

import { importApprovedPosts as importBase } from './guides-import.js';
import { requireDatabase } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import { mediaMarkdown, mirrorWhopMedia } from './media.js';
import { whopApi } from './whop.js';

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function withoutGeneratedMediaSection(body) {
  const text = String(body || '');
  const markers = ['\n\n## Media and attachments\n\n', '\n\n## Files and attachments\n\n'];
  let index = -1;
  for (const marker of markers) {
    const found = text.lastIndexOf(marker);
    if (found > index) index = found;
  }
  return index >= 0 ? text.slice(0, index).replace(/\s+$/, '') : text;
}

function reviewMarkdown(file) {
  const label = String(file?.filename || 'Media').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Media';
  return `> **Media review required — ${label}:** ${file?.reviewReason || 'Upload this media to SniperPlug-owned storage before publishing.'}`;
}

function normalizedFilename(value, fallback) {
  return String(value || fallback || 'media-file').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 180);
}

function extensionForContentType(contentType, fallback = 'bin') {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('audio/mp4')) return 'm4a';
  return fallback;
}

async function muxDownloadableFile(lesson, row) {
  const asset = lesson?.video_asset;
  if (!asset) return null;
  const signedPlaybackId = String(asset.signed_playback_id || '').trim();
  const publicPlaybackId = String(asset.playback_id || '').trim();
  const playbackId = signedPlaybackId || publicPlaybackId;
  const token = String(asset.signed_video_playback_token || '').trim();
  const audioOnly = Boolean(asset.audio_only);
  const label = normalizedFilename(lesson?.title || row.title, 'Course lesson');
  if (!playbackId) {
    return {
      id: String(asset.id || ''),
      filename: `${label} hosted ${audioOnly ? 'audio' : 'video'}`,
      contentType: audioOnly ? 'audio/mp4' : 'video/mp4',
      url: null,
      durable: false,
      role: 'hosted-video',
      reviewReason: 'Whop did not provide a playback ID for this hosted course media.',
    };
  }

  const candidates = audioOnly
    ? ['audio.m4a']
    : ['highest.mp4', 'capped-1080p.mp4', 'high.mp4', 'medium.mp4'];
  for (const filename of candidates) {
    const url = new URL(`https://stream.mux.com/${encodeURIComponent(playbackId)}/${filename}`);
    if (token) url.searchParams.set('token', token);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
      if (!response.ok) continue;
      const contentType = String(response.headers.get('content-type') || (audioOnly ? 'audio/mp4' : 'video/mp4')).split(';')[0].trim();
      return {
        id: String(asset.id || playbackId),
        filename: `${label}.${extensionForContentType(contentType, audioOnly ? 'm4a' : 'mp4')}`,
        contentType,
        size: Number(response.headers.get('content-length') || 0) || null,
        url: url.toString(),
        visibility: token ? 'private' : 'public',
        uploadStatus: 'ready',
        durable: !token,
        role: 'hosted-video',
        reviewReason: token ? 'This signed Whop-hosted video must be copied into SniperPlug media storage before publishing.' : null,
      };
    } catch {
      // Try the next rendition name.
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: String(asset.id || playbackId),
    filename: `${label} hosted ${audioOnly ? 'audio' : 'video'}`,
    contentType: audioOnly ? 'audio/mp4' : 'video/mp4',
    url: null,
    durable: false,
    role: 'hosted-video',
    reviewReason: 'Whop exposes this course video for streaming, but no downloadable MP4/M4A rendition was available. Upload an authorized permanent copy before publishing.',
  };
}

async function courseSupplementFiles(whopSession, row) {
  if (!String(row.source_key || '').startsWith('course-lesson:') || !row.source_post_id) return [];
  let lesson;
  try {
    lesson = await whopApi(whopSession, `course_lessons/${encodeURIComponent(row.source_post_id)}`);
  } catch {
    return [];
  }
  const output = [];
  const thumbnailUrl = String(lesson?.thumbnail?.url || '').trim();
  if (/^https:\/\//i.test(thumbnailUrl)) {
    const title = normalizedFilename(lesson?.title || row.title, 'Course lesson');
    output.push({
      id: String(lesson?.thumbnail?.id || ''),
      filename: `${title} thumbnail.jpg`,
      contentType: String(lesson?.thumbnail?.content_type || 'image/jpeg'),
      url: thumbnailUrl,
      visibility: 'public',
      uploadStatus: 'ready',
      durable: true,
      role: 'course-thumbnail',
      reviewReason: null,
    });
  }
  const hosted = await muxDownloadableFile(lesson, row);
  if (hosted) output.push(hosted);
  return output;
}

function uniqueFiles(values) {
  const seen = new Set();
  const output = [];
  for (const file of values) {
    if (!file) continue;
    const key = String(file.id || file.url || `${file.role}:${file.filename}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(file);
  }
  return output;
}

async function enhanceGuideMedia(env, whopSession, result) {
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guides WHERE source_key = ?').bind(result.sourceKey).first();
  if (!row) return result;
  const attachmentState = safeJson(row.attachment_json, {});
  const savedFiles = Array.isArray(attachmentState.files) ? attachmentState.files : [];
  const supplements = await courseSupplementFiles(whopSession, row);
  const files = uniqueFiles([
    ...supplements.filter((file) => file.role === 'course-thumbnail'),
    ...savedFiles.filter((file) => file.role !== 'hosted-video'),
    ...supplements.filter((file) => file.role !== 'course-thumbnail'),
    ...savedFiles.filter((file) => file.role === 'hosted-video' && !supplements.some((item) => item.role === 'hosted-video')),
  ]);
  if (!files.length) return { ...result, mirroredMedia: 0, attachmentReviewCount: 0 };

  const preparedFiles = [];
  for (const file of files) preparedFiles.push(await mirrorWhopMedia(env, file, result.sourceKey));
  const lines = [];
  let reviewCount = 0;
  let mirroredMedia = 0;
  for (const file of preparedFiles) {
    if (file.durable && file.url) {
      lines.push(mediaMarkdown(file));
      if (file.mirrored) mirroredMedia += 1;
    } else {
      reviewCount += 1;
      lines.push(reviewMarkdown(file));
    }
  }

  const baseBody = withoutGeneratedMediaSection(row.body_markdown);
  const mediaSection = lines.filter(Boolean).length ? `\n\n## Media and attachments\n\n${lines.filter(Boolean).join('\n\n')}` : '';
  const prepared = await prepareGuideBody(`${baseBody}${mediaSection}`, { source: `SniperPlug media import ${result.sourceKey}` });
  const integrity = await assertGuideRoundTrip(prepared.body, prepared.body);
  const currentIntegrity = safeJson(row.integrity_json, {});
  const updatedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE guides SET body_markdown = ?, attachment_json = ?, integrity_json = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    prepared.body,
    JSON.stringify({
      ...attachmentState,
      files: preparedFiles,
      reviewCount,
      mirroredMedia,
    }),
    JSON.stringify({ ...currentIntegrity, ...integrity, mediaMirrored: mirroredMedia, mediaReviewCount: reviewCount }),
    updatedAt,
    row.id,
  ).run();

  return { ...result, mirroredMedia, attachmentReviewCount: reviewCount };
}

export async function importApprovedPosts(env, whopSession, input) {
  const output = await importBase(env, whopSession, input);
  const results = [];
  for (const result of output.results || []) results.push(await enhanceGuideMedia(env, whopSession, result));
  return {
    ...output,
    results,
    mirroredMedia: results.reduce((sum, result) => sum + Number(result.mirroredMedia || 0), 0),
    attachmentReviews: results.reduce((sum, result) => sum + Number(result.attachmentReviewCount || 0), 0),
  };
}
