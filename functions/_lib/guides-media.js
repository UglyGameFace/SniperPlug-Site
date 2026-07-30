export {
  adminGuide,
  listAdminGuideSummaries,
  listAdminGuides,
  listCategories,
  saveCategory,
  setGuideStatus,
  slugify,
  suggestedCategoryForText,
} from './guides.js';

import {
  importApprovedPosts as importBase,
} from './guides-import.js';
import { saveGuideDraft as saveGuideDraftBase } from './guides.js';
import {
  findMuxStaticRendition,
  muxPlayback,
  pruneDetachedCourseVideos,
  registerCourseVideo,
  removeOtherCourseVideos,
} from './course-video.js';
import { requireDatabase } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import { mediaMarkdown, mirrorWhopMedia } from './media.js';
import { pruneDetachedGuideMedia } from './media-storage.js';
import { whopApi } from './whop.js';

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

export async function saveGuideDraft(env, id, input) {
  const db = requireDatabase(env);
  const before = await db.prepare('SELECT integrity_json FROM guides WHERE id = ?').bind(id).first();
  const previousIntegrity = safeJson(before?.integrity_json, {});
  const saved = await saveGuideDraftBase(env, id, input);
  const pruned = await pruneDetachedGuideMedia(env, id, saved.body);
  const attachments = await pruneDetachedCourseVideos(env, id, saved.body, pruned.attachments);
  const nextIntegrity = {
    ...previousIntegrity,
    ...(saved.integrity || {}),
    manualReviewCompleted: true,
    quarantined: false,
    quarantineReason: null,
    quarantinedAt: null,
    publishHoldReason: null,
    editedByOwnerAt: new Date().toISOString(),
  };
  await db.prepare('UPDATE guides SET integrity_json = ? WHERE id = ?')
    .bind(JSON.stringify(nextIntegrity), id).run();
  return { ...saved, attachments, integrity: nextIntegrity };
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

async function courseSupplementFiles(env, whopSession, row, mediaContext = null) {
  if (!String(row.source_key || '').startsWith('course-lesson:') || !row.source_post_id) {
    await removeOtherCourseVideos(env, row.id).catch(() => null);
    return { files: [], videoKey: null };
  }
  let lesson = null;
  if (String(mediaContext?.lessonId || '') === String(row.source_post_id || '')) {
    lesson = {
      id: mediaContext.lessonId,
      title: mediaContext.title || row.title,
      thumbnail: mediaContext.thumbnail || null,
      video_asset: mediaContext.videoAsset || null,
    };
  }
  if (!lesson) {
    try {
      lesson = await whopApi(whopSession, `course_lessons/${encodeURIComponent(row.source_post_id)}`);
    } catch {
      return { files: [], videoKey: null, preserveExistingVideo: true };
    }
  }
  const output = [];
  const thumbnailUrl = String(lesson?.thumbnail?.url || '').trim();
  if (/^https:\/\//i.test(thumbnailUrl)) {
    const title = normalizedFilename(lesson?.title || row.title, 'Course lesson');
    output.push({
      id: String(lesson?.thumbnail?.id || thumbnailUrl),
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

  const asset = lesson?.video_asset;
  if (!asset) {
    await removeOtherCourseVideos(env, row.id).catch(() => null);
    return { files: output, videoKey: null };
  }
  const playback = muxPlayback(asset);
  const label = normalizedFilename(lesson?.title || row.title, 'Course lesson');
  if (!playback || (playback.status && !['ready', 'prepared'].includes(playback.status))) {
    await removeOtherCourseVideos(env, row.id).catch(() => null);
    output.push({
      id: String(asset.id || ''),
      filename: `${label} hosted ${asset.audio_only ? 'audio' : 'video'}`,
      contentType: asset.audio_only ? 'audio/mp4' : 'video/mp4',
      url: null,
      durable: false,
      role: 'hosted-video',
      reviewReason: playback
        ? `Whop reports this upload as “${playback.status || 'not ready'}”. Rescan after the video finishes processing.`
        : 'Whop did not return a playback ID for this hosted course video. Rescan after the upload finishes.',
    });
    return { files: output, videoKey: null };
  }

  const registration = await registerCourseVideo(env, {
    guideId: row.id,
    lessonId: lesson.id || row.source_post_id,
    sourceKey: row.source_key,
    title: label,
    asset,
  });
  if (!registration) {
    output.push({
      id: String(asset.id || ''),
      filename: `${label} hosted video`,
      contentType: 'video/mp4',
      url: null,
      durable: false,
      role: 'hosted-video',
      reviewReason: 'SniperPlug could not register a safe playback route for this Whop course video.',
    });
    return { files: output, videoKey: null };
  }

  await removeOtherCourseVideos(env, row.id, registration.videoKey);
  output.push({
    id: String(asset.id || registration.videoKey),
    filename: `${label} · source-quality adaptive ${playback.audioOnly ? 'audio' : 'video'}`,
    contentType: playback.audioOnly ? 'audio/x-mux' : 'video/x-mux',
    url: registration.playerUrl,
    visibility: 'authorized-source',
    uploadStatus: 'ready',
    durable: true,
    sourceBacked: true,
    role: 'hosted-video-player',
    durationSeconds: playback.durationSeconds,
    reviewReason: null,
  });

  const staticRendition = await findMuxStaticRendition(asset);
  if (staticRendition) {
    output.push({
      id: `${String(asset.id || registration.videoKey)}-archive`,
      filename: `${label} · permanent copy ${staticRendition.filename}`,
      contentType: staticRendition.contentType,
      url: staticRendition.url,
      visibility: playback.signed ? 'private' : 'public',
      uploadStatus: 'ready',
      durable: false,
      optionalMirror: true,
      role: 'hosted-video-archive',
      size: staticRendition.size,
      reviewReason: null,
    });
    output.push({
      id: `${String(asset.id || registration.videoKey)}-download`,
      filename: `${label} · download ${staticRendition.filename}`,
      contentType: 'application/octet-stream',
      url: registration.downloadUrl,
      visibility: 'authorized-source',
      uploadStatus: 'ready',
      durable: true,
      sourceBacked: true,
      role: 'hosted-video-download',
      size: staticRendition.size,
      rendition: staticRendition.filename,
      reviewReason: null,
    });
  }
  return { files: output, videoKey: registration.videoKey };
}

function uniqueFiles(values) {
  const seen = new Set();
  const output = [];
  for (const file of values) {
    if (!file) continue;
    const key = `${String(file.role || 'attachment')}:${String(file.id || file.url || file.filename || '')}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(file);
  }
  return output;
}

async function enhanceGuideMedia(env, whopSession, result) {
  if (!result?.guideId || !['created-draft', 'updated-draft', 'unchanged'].includes(result.action)) return result;
  if (result.action === 'unchanged' && !String(result.sourceKey || '').startsWith('course-lesson:')) return result;
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guides WHERE source_key = ?').bind(result.sourceKey).first();
  if (!row) return result;
  const attachmentState = safeJson(row.attachment_json, {});
  const savedFiles = Array.isArray(attachmentState.files) ? attachmentState.files : [];
  const supplementResult = await courseSupplementFiles(env, whopSession, row, result._mediaContext);
  const supplements = supplementResult.files;
  const replacedRoles = new Set(['hosted-video', 'hosted-video-player', 'hosted-video-download', 'hosted-video-archive']);
  const preservedVideo = supplementResult.preserveExistingVideo
    ? savedFiles.filter((file) => replacedRoles.has(file.role))
    : [];
  const files = uniqueFiles([
    ...supplements.filter((file) => file.role === 'course-thumbnail'),
    ...savedFiles.filter((file) => !replacedRoles.has(file.role) && file.role !== 'course-thumbnail'),
    ...preservedVideo,
    ...supplements.filter((file) => file.role !== 'course-thumbnail'),
  ]);
  const preparedFiles = [];
  for (const file of files) {
    const preparedFile = file.sourceBacked ? file : await mirrorWhopMedia(env, file, result.sourceKey);
    if (file.optionalMirror && (!preparedFile.durable || !preparedFile.url)) continue;
    preparedFiles.push(preparedFile);
  }
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
  for (const result of output.results || []) {
    const enhanced = await enhanceGuideMedia(env, whopSession, result);
    const { _mediaContext, ...publicResult } = enhanced || {};
    results.push(publicResult);
  }
  return {
    ...output,
    results,
    mirroredMedia: results.reduce((sum, result) => sum + Number(result.mirroredMedia || 0), 0),
    attachmentReviews: results.reduce((sum, result) => sum + Number(result.attachmentReviewCount || 0), 0),
  };
}
