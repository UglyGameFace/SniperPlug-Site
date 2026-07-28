import { sha256 } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import { renderMarkdown } from './markdown.js';
import { listForumPosts, retrieveWhopFile } from './whop.js';
import { requireApprovedSource } from './source-policy.js';

const MAX_IMPORT = 50;
const MAX_BODY_BYTES = 1_000_000;

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

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
  const verified = await Promise.all(values.map((attachment) => retrieveWhopFile(session, attachment.id)));
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
      lines.push(`> **Attachment review required — ${label}:** ${file.reviewReason || 'Re-upload this file before publishing.'}`);
    }
  }
  return {
    verified,
    reviewCount,
    markdown: lines.length ? `\n\n## Attachments\n\n${lines.join('\n\n')}` : '',
  };
}

async function category(env, slug) {
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guide_categories WHERE slug = ? AND active = 1').bind(slug).first();
  if (!row) throw new HttpError(422, 'Choose an active SniperPlug guide category.');
  return row;
}

export async function listCategories(env, { includeInactive = false } = {}) {
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT * FROM guide_categories
    ${includeInactive ? '' : 'WHERE active = 1'}
    ORDER BY sort_order, label
  `).all();
  return rows.results || [];
}

export async function saveCategory(env, input) {
  const db = requireDatabase(env);
  const label = String(input?.label || '').trim().slice(0, 60);
  const slug = slugify(input?.slug || label).slice(0, 48);
  const description = String(input?.description || '').trim().slice(0, 220);
  const active = input?.active === false ? 0 : 1;
  const sortOrder = Math.max(0, Math.min(9999, Number.parseInt(input?.sortOrder, 10) || 100));
  if (label.length < 2 || !slug) throw new HttpError(422, 'Category label must be at least two characters.');
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO guide_categories (slug, label, description, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).bind(slug, label, description, sortOrder, active, now, now).run();
  return db.prepare('SELECT * FROM guide_categories WHERE slug = ?').bind(slug).first();
}

async function uniqueSlug(db, title, sourceKey, existingSlug = null) {
  if (existingSlug) return existingSlug;
  const base = slugify(title) || 'imported-guide';
  const available = await db.prepare('SELECT 1 FROM guides WHERE slug = ?').bind(base).first();
  if (!available) return base;
  return `${base.slice(0, 62)}-${(await sha256(sourceKey)).slice(0, 8)}`;
}

function sourceKeyFor(post) {
  return `forum-post:${String(post?.id || '')}`;
}

export async function importApprovedPosts(env, whopSession, input) {
  if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm that you own these posts or have explicit permission to republish them.');
  const experienceId = String(input?.experienceId || '').trim();
  const sourceKeys = [...new Set((Array.isArray(input?.sourceKeys) ? input.sourceKeys : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!sourceKeys.length) throw new HttpError(422, 'Approve at least one post before importing.');
  if (sourceKeys.length > MAX_IMPORT) throw new HttpError(422, `Import at most ${MAX_IMPORT} posts at once.`);
  const selectedCategory = await category(env, String(input?.category || '').trim());
  const source = await requireApprovedSource(env, experienceId);
  const db = requireDatabase(env);

  const placeholders = sourceKeys.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT * FROM whop_posts
    WHERE experience_id = ? AND source_key IN (${placeholders})
  `).bind(experienceId, ...sourceKeys).all();
  const decisions = new Map((rows.results || []).map((row) => [row.source_key, row]));
  if (sourceKeys.some((key) => decisions.get(key)?.decision !== 'approved')) {
    throw new HttpError(409, 'One or more posts are no longer approved. Scan the group again.');
  }

  const livePosts = await listForumPosts(whopSession, experienceId);
  const liveByKey = new Map(livePosts.map((post) => [sourceKeyFor(post), post]));
  const results = [];

  for (const sourceKey of sourceKeys) {
    const post = liveByKey.get(sourceKey);
    if (!post) throw new HttpError(409, 'An approved Whop post is no longer available. Scan the group again.');
    const preparedOriginal = await prepareGuideBody(String(post.content || ''), { source: `Whop post ${post.id}` });
    const attachmentInfo = await verifyAttachments(whopSession, post.attachments || []);
    const prepared = await prepareGuideBody(`${preparedOriginal.body}${attachmentInfo.markdown}`, { source: `Whop post ${post.id}` });
    if (new TextEncoder().encode(prepared.body).byteLength > MAX_BODY_BYTES) throw new HttpError(422, `${post.title || post.id} is too large to import safely.`);
    const sourceFingerprint = await sha256(JSON.stringify({
      postId: post.id,
      title: post.title || '',
      body: prepared.body,
      attachments: attachmentInfo.verified,
      updatedAt: post.updated_at || post.created_at || null,
    }));

    const existing = await db.prepare('SELECT * FROM guides WHERE source_key = ?').bind(sourceKey).first();
    if (existing?.source_fingerprint === sourceFingerprint) {
      results.push({ sourceKey, guideId: existing.id, slug: existing.slug, action: 'unchanged', title: existing.title });
      continue;
    }

    const title = String(post.title || decisions.get(sourceKey)?.title || 'Imported Whop post').trim().slice(0, 140);
    const description = excerpt(preparedOriginal.body) || `Imported from ${source.label} for review.`;
    const slug = await uniqueSlug(db, title, sourceKey, existing?.slug || null);
    const now = new Date().toISOString();
    const integrity = await assertGuideRoundTrip(prepared.body, prepared.body);
    const author = post.user ? {
      id: post.user.id || null,
      name: post.user.name || null,
      username: post.user.username || null,
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
      selectedCategory.slug,
      prepared.body,
      sourceKey,
      source.label,
      experienceId,
      String(post.id || ''),
      sourceFingerprint,
      JSON.stringify({ files: attachmentInfo.verified, reviewCount: attachmentInfo.reviewCount }),
      JSON.stringify(integrity),
      JSON.stringify(author),
      post.created_at || null,
      post.updated_at || post.created_at || null,
      existing?.imported_at || now,
      now,
    ).run();
    const saved = await db.prepare('SELECT id, slug, title FROM guides WHERE source_key = ?').bind(sourceKey).first();
    results.push({
      sourceKey,
      guideId: saved.id,
      slug: saved.slug,
      title: saved.title,
      action: existing ? 'updated-draft' : 'created-draft',
      attachmentReviewCount: attachmentInfo.reviewCount,
    });
  }
  return {
    results,
    imported: results.filter((result) => result.action !== 'unchanged').length,
    unchanged: results.filter((result) => result.action === 'unchanged').length,
    attachmentReviews: results.reduce((sum, result) => sum + Number(result.attachmentReviewCount || 0), 0),
  };
}

function normalizeGuideRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category_slug,
    categoryLabel: row.category_label || row.category_slug,
    body: row.body_markdown,
    status: row.status,
    featured: Boolean(row.featured),
    sortOrder: row.sort_order,
    sourceKey: row.source_key,
    sourceGroup: row.source_group,
    sourceExperienceId: row.source_experience_id,
    sourcePostId: row.source_post_id,
    attachments: safeJson(row.attachment_json || '[]', []),
    integrity: safeJson(row.integrity_json || '{}', {}),
    author: safeJson(row.author_json || '{}', {}),
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function listAdminGuides(env) {
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    ORDER BY CASE guides.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
             guides.updated_at DESC
  `).all();
  return (rows.results || []).map(normalizeGuideRow);
}

export async function saveGuideDraft(env, id, input) {
  const db = requireDatabase(env);
  const current = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'Guide draft not found.');
  const title = String(input?.title || '').trim().slice(0, 140);
  const description = String(input?.description || '').trim().slice(0, 260);
  if (title.length < 3 || description.length < 8) throw new HttpError(422, 'Add a complete title and card description.');
  await category(env, String(input?.category || '').trim());
  const prepared = await prepareGuideBody(String(input?.body || ''), { source: 'Guide draft' });
  const attachments = safeJson(current.attachment_json || '{}', {});
  if (input?.attachmentsResolved === true) attachments.reviewCount = 0;
  await db.prepare(`
    UPDATE guides SET title = ?, description = ?, category_slug = ?, body_markdown = ?,
      attachment_json = ?, integrity_json = ?, status = 'draft', featured = ?, updated_at = ?, published_at = NULL
    WHERE id = ?
  `).bind(
    title,
    description,
    String(input.category),
    prepared.body,
    JSON.stringify(attachments),
    JSON.stringify(prepared),
    input?.featured === true ? 1 : 0,
    new Date().toISOString(),
    id,
  ).run();
  return normalizeGuideRow(await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first());
}

export async function setGuideStatus(env, id, status) {
  if (!['draft', 'published', 'rejected'].includes(status)) throw new HttpError(422, 'Choose Draft, Publish, or Reject.');
  const db = requireDatabase(env);
  const current = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'Guide not found.');
  const attachments = safeJson(current.attachment_json || '{}', {});
  if (status === 'published' && Number(attachments.reviewCount || 0) > 0) {
    throw new HttpError(422, 'Resolve or replace every flagged Whop attachment before publishing.');
  }
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE guides SET status = ?, updated_at = ?, published_at = ? WHERE id = ?
  `).bind(status, now, status === 'published' ? now : null, id).run();
  return normalizeGuideRow(await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first());
}

export async function publicGuides(env, { category: categorySlug = null } = {}) {
  const db = requireDatabase(env);
  const query = `
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE guides.status = 'published' ${categorySlug ? 'AND guides.category_slug = ?' : ''}
    ORDER BY guides.featured DESC, guides.sort_order ASC, guides.published_at DESC
  `;
  const rows = categorySlug ? await db.prepare(query).bind(categorySlug).all() : await db.prepare(query).all();
  return (rows.results || []).map(normalizeGuideRow);
}

export async function publicGuide(env, slug) {
  const db = requireDatabase(env);
  const row = await db.prepare(`
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE guides.slug = ? AND guides.status = 'published'
  `).bind(slug).first();
  return row ? { ...normalizeGuideRow(row), html: renderMarkdown(row.body_markdown) } : null;
}
