import { sha256 } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';
import { prepareGuideBody } from './integrity.js';
import { listForumPosts } from './whop.js';
import { requireApprovedSource } from './source-policy.js';

function plainExcerpt(value, limit = 260) {
  return String(value || '')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function fallbackTitle(content) {
  const heading = String(content || '').match(/^ {0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return (heading || plainExcerpt(content, 110) || 'Untitled Whop post').slice(0, 140);
}

function normalizeAttachments(value) {
  return (Array.isArray(value) ? value : []).map((attachment) => ({
    id: String(attachment?.id || '').trim(),
    filename: String(attachment?.filename || 'attachment').slice(0, 180),
    contentType: String(attachment?.content_type || '').slice(0, 120),
  })).filter((attachment) => attachment.id);
}

async function normalizePost(post, experienceId) {
  const sourceKey = `forum-post:${String(post?.id || '').trim()}`;
  const body = String(post?.content || '');
  const base = {
    sourceKey,
    experienceId,
    postId: String(post?.id || ''),
    title: String(post?.title || fallbackTitle(body)).trim().slice(0, 140),
    excerpt: plainExcerpt(body),
    author: post?.user ? {
      id: post.user.id || null,
      name: post.user.name || null,
      username: post.user.username || null,
    } : null,
    attachments: normalizeAttachments(post?.attachments),
    sourceCreatedAt: post?.created_at || null,
    sourceUpdatedAt: post?.updated_at || post?.created_at || null,
    sourceMeta: {
      pinned: Boolean(post?.is_pinned),
      edited: Boolean(post?.is_edited),
      posterAdmin: Boolean(post?.is_poster_admin),
    },
  };

  try {
    const integrity = await prepareGuideBody(body, { source: `Whop forum post ${base.postId}` });
    const sourceFingerprint = await sha256(JSON.stringify({
      postId: base.postId,
      title: base.title,
      body: integrity.body,
      attachments: base.attachments,
      sourceUpdatedAt: base.sourceUpdatedAt,
    }));
    return {
      ...base,
      body: integrity.body,
      sourceFingerprint,
      integrity: { blocked: false, ...integrity },
      scanDecision: 'pending',
    };
  } catch (error) {
    return {
      ...base,
      body,
      sourceFingerprint: null,
      integrity: {
        blocked: true,
        error: error?.message || 'Formatting integrity validation failed.',
        code: error?.details?.code || 'invalid_content',
      },
      scanDecision: 'blocked',
    };
  }
}

export async function scanApprovedSource(env, whopSession, experience) {
  const db = requireDatabase(env);
  const experienceId = String(experience?.id || '');
  await requireApprovedSource(env, experienceId);
  const rawPosts = await listForumPosts(whopSession, experienceId);
  const posts = await Promise.all(rawPosts.map((post) => normalizePost(post, experienceId)));
  const now = new Date().toISOString();

  const statements = posts.map((post) => db.prepare(`
    INSERT INTO whop_posts (
      source_key, experience_id, post_id, title, excerpt, author_json, attachment_json,
      source_created_at, source_updated_at, source_fingerprint, integrity_json,
      decision, decision_updated_at, last_scanned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      experience_id = excluded.experience_id,
      post_id = excluded.post_id,
      title = excluded.title,
      excerpt = excluded.excerpt,
      author_json = excluded.author_json,
      attachment_json = excluded.attachment_json,
      source_created_at = excluded.source_created_at,
      source_updated_at = excluded.source_updated_at,
      source_fingerprint = excluded.source_fingerprint,
      integrity_json = excluded.integrity_json,
      decision = CASE
        WHEN excluded.decision = 'blocked' THEN 'blocked'
        WHEN whop_posts.source_fingerprint IS NOT excluded.source_fingerprint THEN 'pending'
        WHEN whop_posts.decision = 'blocked' THEN 'pending'
        ELSE whop_posts.decision
      END,
      decision_updated_at = CASE
        WHEN whop_posts.source_fingerprint IS NOT excluded.source_fingerprint THEN NULL
        ELSE whop_posts.decision_updated_at
      END,
      last_scanned_at = excluded.last_scanned_at
  `).bind(
    post.sourceKey,
    post.experienceId,
    post.postId,
    post.title,
    post.excerpt,
    JSON.stringify(post.author || {}),
    JSON.stringify(post.attachments),
    post.sourceCreatedAt,
    post.sourceUpdatedAt,
    post.sourceFingerprint,
    JSON.stringify(post.integrity),
    post.scanDecision,
    now,
  ));
  if (statements.length) await db.batch(statements);

  const saved = await db.prepare(`
    SELECT * FROM whop_posts
    WHERE experience_id = ?
    ORDER BY CASE decision WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 WHEN 'disapproved' THEN 2 ELSE 3 END,
             source_updated_at DESC, title ASC
  `).bind(experienceId).all();
  return (saved.results || []).map((row) => ({
    sourceKey: row.source_key,
    experienceId: row.experience_id,
    postId: row.post_id,
    title: row.title,
    excerpt: row.excerpt,
    author: JSON.parse(row.author_json || '{}'),
    attachments: JSON.parse(row.attachment_json || '[]'),
    sourceCreatedAt: row.source_created_at,
    sourceUpdatedAt: row.source_updated_at,
    sourceFingerprint: row.source_fingerprint,
    integrity: JSON.parse(row.integrity_json || '{}'),
    decision: row.decision,
  }));
}

export async function savePostDecision(env, sourceKeys, decision) {
  if (!['approved', 'disapproved', 'pending'].includes(decision)) throw new HttpError(422, 'Choose Approve, Disapprove, or Undo.');
  const keys = [...new Set((Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys]).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!keys.length) throw new HttpError(422, 'Choose at least one post.');
  if (keys.length > 2000) throw new HttpError(422, 'Too many post decisions were submitted at once.');
  const db = requireDatabase(env);
  const now = new Date().toISOString();
  const statements = keys.map((key) => db.prepare(`
    UPDATE whop_posts
    SET decision = ?, decision_updated_at = ?
    WHERE source_key = ? AND decision != 'blocked'
  `).bind(decision, decision === 'pending' ? null : now, key));
  const results = await db.batch(statements);
  return results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
}

export async function listSavedPosts(env, experienceId) {
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT * FROM whop_posts WHERE experience_id = ?
    ORDER BY source_updated_at DESC, title ASC
  `).bind(experienceId).all();
  return rows.results || [];
}
