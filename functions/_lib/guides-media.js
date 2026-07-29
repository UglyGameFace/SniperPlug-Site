export {
  listAdminGuides,
  listCategories,
  saveCategory,
  saveGuideDraft,
  setGuideStatus,
  slugify,
  suggestedCategoryForText,
} from './guides.js';

import { importApprovedPosts as importBase } from './guides.js';
import { requireDatabase } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import { mediaMarkdown, mirrorWhopMedia } from './media.js';

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

async function enhanceGuideMedia(env, result) {
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guides WHERE source_key = ?').bind(result.sourceKey).first();
  if (!row) return result;
  const attachmentState = safeJson(row.attachment_json, {});
  const files = Array.isArray(attachmentState.files) ? attachmentState.files : [];
  if (!files.length) return { ...result, mirroredMedia: 0, attachmentReviewCount: 0 };

  const preparedFiles = await Promise.all(files.map((file) => mirrorWhopMedia(env, file, result.sourceKey)));
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
  for (const result of output.results || []) results.push(await enhanceGuideMedia(env, result));
  return {
    ...output,
    results,
    mirroredMedia: results.reduce((sum, result) => sum + Number(result.mirroredMedia || 0), 0),
    attachmentReviews: results.reduce((sum, result) => sum + Number(result.attachmentReviewCount || 0), 0),
  };
}
