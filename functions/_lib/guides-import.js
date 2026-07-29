import { whopContentToMarkdown } from './content-policy.js';
import { sha256 } from './crypto.js';
import { listCategories, slugify, suggestedCategoryForText } from './guides.js';
import { HttpError, requireDatabase } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import {
  listExperienceItems,
  retrieveExperience,
  retrieveWhopFile,
  sourceKeyForWhopItem,
  whopExperienceType,
} from './whop.js';
import { requireApprovedSource } from './source-policy.js';

const MAX_IMPORT = 50;
const MAX_BODY_BYTES = 1_000_000;

function excerpt(value, limit = 260) {
  return String(value || '')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function safeAttachmentLabel(value) {
  return String(value || 'Attachment').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Attachment';
}

async function verifyAttachments(session, attachments) {
  const values = Array.isArray(attachments) ? attachments : [];
  const verified = await Promise.all(values.map((attachment) => retrieveWhopFile(session, attachment)));
  const lines = [];
  let reviewCount = 0;
  for (const file of verified) {
    const label = safeAttachmentLabel(file.filename);
    if (file.durable && file.url) {
      lines.push(String(file.contentType || '').toLowerCase().startsWith('image/')
        ? `![${label}](${file.url})`
        : `- [${label}](${file.url})`);
    } else {
      reviewCount += 1;
      lines.push(`> **Attachment review required — ${label}:** ${file.reviewReason || 'Copy this file to SniperPlug-owned storage before publishing.'}`);
    }
  }
  return {
    verified,
    reviewCount,
    markdown: lines.length ? `\n\n## Files and attachments\n\n${lines.join('\n\n')}` : '',
  };
}

async function uniqueSlug(db, title, sourceKey, existingSlug = null) {
  if (existingSlug) return existingSlug;
  const base = slugify(title) || 'imported-guide';
  const available = await db.prepare('SELECT 1 FROM guides WHERE slug = ?').bind(base).first();
  if (!available) return base;
  return `${base.slice(0, 62)}-${(await sha256(sourceKey)).slice(0, 8)}`;
}

function categoryMap(input) {
  const source = input?.categoryBySourceKey && typeof input.categoryBySourceKey === 'object'
    ? input.categoryBySourceKey
    : {};
  return new Map(Object.entries(source).map(([key, value]) => [String(key), String(value || '').trim()]));
}

async function categoryResolver(env, input) {
  const active = await listCategories(env);
  const allowed = new Set(active.map((item) => item.slug));
  const mapped = categoryMap(input);
  const fallback = String(input?.category || '').trim();
  if (fallback && !allowed.has(fallback)) throw new HttpError(422, 'Choose an active SniperPlug guide category.');
  for (const slug of mapped.values()) {
    if (!allowed.has(slug)) throw new HttpError(422, `Category “${slug}” is not active.`);
  }
  return (sourceKey, item, renderedBody) => {
    const explicit = mapped.get(sourceKey);
    if (explicit) return explicit;
    if (input?.autoCategorize === true) {
      const suggested = suggestedCategoryForText(`${item?.title || ''}\n${renderedBody}`);
      if (allowed.has(suggested)) return suggested;
    }
    if (fallback) return fallback;
    return allowed.has('general') ? 'general' : active[0]?.slug;
  };
}

function itemBySourceKey(items) {
  return new Map(items.map((item) => [sourceKeyForWhopItem(item), item]));
}

export async function importApprovedPosts(env, whopSession, input) {
  if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm that you own this content or have explicit permission to republish it.');
  const experienceId = String(input?.experienceId || '').trim();
  const sourceKeys = [...new Set((Array.isArray(input?.sourceKeys) ? input.sourceKeys : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!sourceKeys.length) throw new HttpError(422, 'Approve at least one content item before importing.');
  if (sourceKeys.length > MAX_IMPORT) throw new HttpError(422, `Import at most ${MAX_IMPORT} content items at once.`);
  const resolveCategory = await categoryResolver(env, input);
  const source = await requireApprovedSource(env, experienceId);
  const db = requireDatabase(env);

  const placeholders = sourceKeys.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT * FROM whop_posts
    WHERE experience_id = ? AND source_key IN (${placeholders})
  `).bind(experienceId, ...sourceKeys).all();
  const decisions = new Map((rows.results || []).map((row) => [row.source_key, row]));
  if (sourceKeys.some((key) => decisions.get(key)?.decision !== 'approved')) {
    throw new HttpError(409, 'One or more content items are no longer approved. Scan the source again.');
  }

  const experience = await retrieveExperience(whopSession, experienceId);
  const sourceType = whopExperienceType(experience);
  const liveItems = await listExperienceItems(whopSession, experience);
  const liveByKey = itemBySourceKey(liveItems);
  const results = [];

  for (const sourceKey of sourceKeys) {
    const item = liveByKey.get(sourceKey);
    if (!item) throw new HttpError(409, 'An approved Whop content item is no longer available. Scan the source again.');
    const renderedOriginal = whopContentToMarkdown(item.content || '');
    const preparedOriginal = await prepareGuideBody(renderedOriginal, { source: `Whop ${sourceType} item ${item.id}` });
    const attachmentInfo = await verifyAttachments(whopSession, item.attachments || []);
    const prepared = await prepareGuideBody(`${preparedOriginal.body}${attachmentInfo.markdown}`, { source: `Whop ${sourceType} item ${item.id}` });
    if (new TextEncoder().encode(prepared.body).byteLength > MAX_BODY_BYTES) throw new HttpError(422, `${item.title || item.id} is too large to import safely.`);
    const selectedCategory = resolveCategory(sourceKey, item, preparedOriginal.body);
    const sourceFingerprint = await sha256(JSON.stringify({
      sourceKey,
      title: item.title || '',
      body: prepared.body,
      attachments: attachmentInfo.verified,
      updatedAt: item.updated_at || item.created_at || null,
      sourceType,
      category: selectedCategory,
    }));

    const existing = await db.prepare('SELECT * FROM guides WHERE source_key = ?').bind(sourceKey).first();
    if (existing?.source_fingerprint === sourceFingerprint) {
      results.push({ sourceKey, guideId: existing.id, slug: existing.slug, action: 'unchanged', title: existing.title, category: existing.category_slug });
      continue;
    }

    const savedDecision = decisions.get(sourceKey);
    const title = String(item.title || savedDecision?.title || 'Imported Whop content').trim().slice(0, 140);
    const description = excerpt(preparedOriginal.body) || `Imported from ${source.label} for review.`;
    const slug = await uniqueSlug(db, title, sourceKey, existing?.slug || null);
    const now = new Date().toISOString();
    const integrity = await assertGuideRoundTrip(prepared.body, prepared.body);
    const postIntegrity = (() => { try { return JSON.parse(savedDecision?.integrity_json || '{}'); } catch { return {}; } })();
    const author = item.user ? {
      id: item.user.id || null,
      name: item.user.name || null,
      username: item.user.username || null,
    } : {};

    await db.prepare(`
      INSERT INTO guides (
        slug, title, description, category_slug, body_markdown, status, featured, sort_order,
        source_key, source_group, source_experience_id, source_post_id, source_fingerprint,
        attachment_json, integrity_json, author_json, source_created_at, source_updated_at,
        imported_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', 0, 999, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(source_key) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        category_slug = excluded.category_slug,
        body_markdown = excluded.body_markdown,
        status = 'draft',
        featured = 0,
        source_group = excluded.source_group,
        source_experience_id = excluded.source_experience_id,
        source_post_id = excluded.source_post_id,
        source_fingerprint = excluded.source_fingerprint,
        attachment_json = excluded.attachment_json,
        integrity_json = excluded.integrity_json,
        author_json = excluded.author_json,
        source_created_at = excluded.source_created_at,
        source_updated_at = excluded.source_updated_at,
        updated_at = excluded.updated_at,
        published_at = NULL
    `).bind(
      slug,
      title,
      description,
      selectedCategory,
      prepared.body,
      sourceKey,
      source.label,
      experienceId,
      String(item.id || ''),
      sourceFingerprint,
      JSON.stringify({ files: attachmentInfo.verified, reviewCount: attachmentInfo.reviewCount, sourceType }),
      JSON.stringify({ ...integrity, sourceType, sourceMeta: item.sourceMeta || postIntegrity.sourceMeta || {}, importPolicy: postIntegrity.policy || null }),
      JSON.stringify(author),
      item.created_at || null,
      item.updated_at || item.created_at || null,
      existing?.imported_at || now,
      now,
    ).run();
    const saved = await db.prepare('SELECT id, slug, title, category_slug FROM guides WHERE source_key = ?').bind(sourceKey).first();
    results.push({
      sourceKey,
      guideId: saved.id,
      slug: saved.slug,
      title: saved.title,
      category: saved.category_slug,
      action: existing ? 'updated-draft' : 'created-draft',
      attachmentReviewCount: attachmentInfo.reviewCount,
      sourceType,
    });
  }
  return {
    results,
    imported: results.filter((result) => result.action !== 'unchanged').length,
    unchanged: results.filter((result) => result.action === 'unchanged').length,
    attachmentReviews: results.reduce((sum, result) => sum + Number(result.attachmentReviewCount || 0), 0),
  };
}
