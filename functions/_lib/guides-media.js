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
import { acquireImportLeases, releaseImportLeases, renewImportLeases } from './import-leases.js';
import { HttpError } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import { ensureImporterWorkspaceSchema, principalIdFrom, upstreamSourceKey } from './importer-workspace.js';
import { mediaMarkdown, mirrorWhopMedia } from './media.js';
import { pruneDetachedGuideMedia } from './media-storage.js';
import { whopApi } from './whop.js';

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function nextVersion(previous = '') {
  const now = new Date();
  const prior = Date.parse(String(previous || ''));
  if (Number.isFinite(prior) && now.getTime() <= prior) now.setTime(prior + 1);
  return now.toISOString();
}

async function reserveGuideVersion(db, principalId, id, expectedUpdatedAt) {
  const expected = String(expectedUpdatedAt || '').trim();
  if (!expected) {
    throw new HttpError(409, 'Refresh this guide before saving so SniperPlug can confirm you are editing the newest version.', {
      code: 'guide_version_required',
      guideId: Number(id),
    });
  }
  const reservation = nextVersion(expected);
  const result = await db.prepare(`
    UPDATE guides SET updated_at = ?
    WHERE principal_id = ? AND id = ? AND updated_at = ?
  `).bind(reservation, principalId, id, expected).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    const current = await db.prepare(`
      SELECT updated_at, status FROM guides WHERE principal_id = ? AND id = ?
    `).bind(principalId, id).first();
    if (!current) throw new HttpError(404, 'Guide draft not found in this account workspace.');
    throw new HttpError(409, 'This guide changed in another tab or workflow. Your older copy was not saved; refresh to load the newest version.', {
      code: 'guide_version_stale',
      guideId: Number(id),
      expectedUpdatedAt: expected,
      currentUpdatedAt: current.updated_at || null,
      currentStatus: current.status || null,
    });
  }
  return reservation;
}

function cleanupMatchesSavedGuide(row, saved, attachments) {
  if (!row || row.status !== 'draft') return false;
  if (String(row.title || '') !== String(saved.title || '')) return false;
  if (String(row.description || '') !== String(saved.description || '')) return false;
  if (String(row.category_slug || '') !== String(saved.category || '')) return false;
  if (String(row.body_markdown || '') !== String(saved.body || '')) return false;
  if (Boolean(row.featured) !== Boolean(saved.featured)) return false;
  return JSON.stringify(safeJson(row.attachment_json, {})) === JSON.stringify(attachments || {});
}

export async function saveGuideDraft(env, principalValue, id, input) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const before = await db.prepare(`
    SELECT integrity_json, updated_at FROM guides WHERE principal_id = ? AND id = ?
  `).bind(principalId, id).first();
  if (!before) throw new HttpError(404, 'Guide draft not found in this account workspace.');
  const previousIntegrity = safeJson(before.integrity_json, {});
  const expectedUpdatedAt = String(input?.expectedUpdatedAt || '').trim();
  const reservation = await reserveGuideVersion(db, principalId, id, expectedUpdatedAt);
  let saved;
  try {
    saved = await saveGuideDraftBase(env, principalId, id, input);
  } catch (error) {
    await db.prepare(`
      UPDATE guides SET updated_at = ?
      WHERE principal_id = ? AND id = ? AND updated_at = ?
    `).bind(expectedUpdatedAt, principalId, id, reservation).run().catch(() => null);
    throw error;
  }
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
    editedByPrincipalId: principalId,
  };
  const cleaned = await db.prepare(`
    SELECT title, description, category_slug, body_markdown, status, featured, attachment_json, updated_at
    FROM guides WHERE principal_id = ? AND id = ?
  `).bind(principalId, id).first();
  if (!cleanupMatchesSavedGuide(cleaned, saved, attachments)) {
    throw new HttpError(409, 'The guide changed while SniperPlug was cleaning up detached media. The newer version was preserved; refresh before editing again.', {
      code: 'guide_save_cleanup_stale',
      guideId: Number(id),
      currentUpdatedAt: cleaned?.updated_at || null,
      currentStatus: cleaned?.status || null,
    });
  }
  const finalizedAt = nextVersion(cleaned.updated_at);
  const finalized = await db.prepare(`
    UPDATE guides SET integrity_json = ?, updated_at = ?
    WHERE principal_id = ? AND id = ? AND updated_at = ? AND status = 'draft'
  `).bind(JSON.stringify(nextIntegrity), finalizedAt, principalId, id, cleaned.updated_at).run();
  if (Number(finalized.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'The guide changed while SniperPlug was finishing its save. The newer version was preserved; refresh before editing again.', {
      code: 'guide_save_finalize_stale',
      guideId: Number(id),
    });
  }
  return { ...saved, updatedAt: finalizedAt, attachments, integrity: nextIntegrity };
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
  const logicalSourceKey = upstreamSourceKey(row);
  if (!logicalSourceKey.startsWith('course-lesson:') || !row.source_post_id) {
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
    sourceKey: logicalSourceKey,
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

async function enhanceGuideMedia(env, principalValue, whopSession, result) {
  if (!result?.guideId || !['created-draft', 'updated-draft', 'unchanged'].includes(result.action)) return result;
  if (result.action === 'unchanged' && !String(result.sourceKey || '').startsWith('course-lesson:')) return result;
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const row = await db.prepare(`
    SELECT * FROM guides WHERE principal_id = ? AND upstream_source_key = ?
  `).bind(principalId, result.sourceKey).first();
  if (!row) return result;
  const expectedUpdatedAt = String(row.updated_at || '');
  const expectedFingerprint = row.source_fingerprint == null ? null : String(row.source_fingerprint);
  const attachmentState = safeJson(row.attachment_json, {});
  const savedFiles = Array.isArray(attachmentState.files) ? attachmentState.files : [];
  const supplementResult = await courseSupplementFiles(env, whopSession, row, result._mediaContext);
  const supplements = supplementResult.files;
  const replacedRoles = new Set(['hosted-video', 'hosted-video-player', 'hosted-video-download', 'hosted-video-archive']);
  const preservedVideo = supplementResult.preserveExistingVideo
    ? savedFiles.filter((file) => ['hosted-video-player', 'hosted-video-download', 'hosted-video-archive'].includes(file.role))
    : [];
  const files = uniqueFiles([
    ...supplements.filter((file) => file.role === 'course-thumbnail'),
    ...savedFiles.filter((file) => !replacedRoles.has(file.role) && file.role !== 'course-thumbnail'),
    ...preservedVideo,
    ...supplements.filter((file) => file.role !== 'course-thumbnail'),
  ]);
  const preparedFiles = [];
  for (const file of files) {
    const preparedFile = file.sourceBacked ? file : await mirrorWhopMedia(env, file, row.source_key);
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
  const write = await db.prepare(`
    UPDATE guides SET body_markdown = ?, attachment_json = ?, integrity_json = ?, updated_at = ?
    WHERE principal_id = ? AND id = ? AND updated_at = ? AND source_fingerprint IS ?
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
    principalId,
    row.id,
    expectedUpdatedAt,
    expectedFingerprint,
  ).run();
  if (Number(write.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This guide changed while SniperPlug was preparing its media. The newer saved version was preserved; refresh before retrying.', {
      code: 'guide_media_stale',
      guideId: Number(row.id),
      sourceKey: result.sourceKey,
    });
  }

  return { ...result, mirroredMedia, attachmentReviewCount: reviewCount };
}

export async function importApprovedPosts(env, principalValue, whopSession, input) {
  const principalId = principalIdFrom(principalValue);
  const lease = await acquireImportLeases(env, principalId, input?.sourceKeys);
  try {
    const output = await importBase(env, principalId, whopSession, input);
    const results = [];
    for (const result of output.results || []) {
      await renewImportLeases(env, lease);
      const enhanced = await enhanceGuideMedia(env, principalId, whopSession, result);
      const { _mediaContext, ...publicResult } = enhanced || {};
      results.push(publicResult);
    }
    return {
      ...output,
      results,
      mirroredMedia: results.reduce((sum, result) => sum + Number(result.mirroredMedia || 0), 0),
      attachmentReviews: results.reduce((sum, result) => sum + Number(result.attachmentReviewCount || 0), 0),
    };
  } finally {
    await releaseImportLeases(env, lease).catch(() => null);
  }
}
