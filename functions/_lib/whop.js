import {
  base64urlEncode,
  openJson,
  randomToken,
  sealJson,
  sha256,
} from './crypto.js';
import { HttpError, requireDatabase } from './http.js';

const OAUTH_BASE = 'https://api.whop.com/oauth';
const API_BASE = 'https://api.whop.com/api/v1';
const DEFAULT_SCOPES = 'openid profile email forum:read courses:read chat:read member:basic:read member:email:read';
const REQUEST_TIMEOUT_MS = 20_000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_SOURCE_ITEMS = 2000;
const ITEM_CONCURRENCY = 6;
const EXPERIENCE_TYPE_CACHE_MS = 15 * 60_000;
const experienceTypeCache = new Map();

function config(request, env) {
  const clientId = String(env?.WHOP_CLIENT_ID || '').trim();
  const tokenSecret = String(env?.WHOP_TOKEN_SECRET || '').trim();
  if (!clientId) throw new HttpError(503, 'WHOP_CLIENT_ID is not configured.');
  if (!tokenSecret) throw new HttpError(503, 'WHOP_TOKEN_SECRET is not configured.');
  const origin = new URL(request.url).origin;
  const redirectUri = String(env?.WHOP_REDIRECT_URI || `${origin}/api/whop/oauth/callback`).trim();
  const scopes = String(env?.WHOP_OAUTH_SCOPES || DEFAULT_SCOPES).trim();
  return { clientId, tokenSecret, redirectUri, scopes };
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw new HttpError(504, 'Whop did not respond in time.');
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const message = payload?.error_description || payload?.error?.message || payload?.message || `Whop request failed (${response.status}).`;
    const status = response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 404 ? 404 : response.status === 429 ? 503 : response.status >= 500 ? 502 : 422;
    throw new HttpError(status, message, payload);
  }
  return payload;
}

function pkceChallenge(verifier) {
  return sha256(verifier).then((hex) => {
    const bytes = new Uint8Array(hex.match(/.{2}/g).map((value) => Number.parseInt(value, 16)));
    return base64urlEncode(bytes);
  });
}

function tokenShape(payload, previous = null) {
  const accessToken = String(payload?.access_token || '').trim();
  const refreshToken = String(payload?.refresh_token || previous?.refreshToken || '').trim();
  if (!accessToken || !refreshToken) throw new HttpError(502, 'Whop did not return a complete OAuth session.');
  const expiresIn = Math.max(60, Number(payload?.expires_in) || 3600);
  return {
    accessToken,
    refreshToken,
    tokenType: String(payload?.token_type || previous?.tokenType || 'Bearer'),
    scopes: String(payload?.scope || previous?.scopes || ''),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function userInfo(accessToken) {
  return timedFetch(`${OAUTH_BASE}/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function beginWhopOAuth(request, env, adminSession) {
  const cfg = config(request, env);
  const db = requireDatabase(env);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const nonce = randomToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await db.prepare(`
    INSERT INTO whop_oauth_states (state, admin_session_id, verifier, nonce, redirect_uri, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(state, adminSession.sid, verifier, nonce, cfg.redirectUri, expiresAt, now.toISOString()).run();
  await db.prepare('DELETE FROM whop_oauth_states WHERE expires_at <= ?').bind(now.toISOString()).run();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  return `${OAUTH_BASE}/authorize?${params}`;
}

export async function finishWhopOAuth(request, env) {
  const cfg = config(request, env);
  const db = requireDatabase(env);
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) throw new HttpError(422, url.searchParams.get('error_description') || `Whop OAuth failed: ${error}`);
  const code = String(url.searchParams.get('code') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  if (!code || !state) throw new HttpError(422, 'Whop did not return a valid authorization code.');

  const pending = await db.prepare('SELECT * FROM whop_oauth_states WHERE state = ?').bind(state).first();
  if (!pending || Date.parse(pending.expires_at) <= Date.now()) throw new HttpError(401, 'The Whop login request expired. Start again.');
  if (pending.redirect_uri !== cfg.redirectUri) throw new HttpError(403, 'Whop callback URL validation failed.');
  await db.prepare('DELETE FROM whop_oauth_states WHERE state = ?').bind(state).run();

  const payload = await timedFetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      code_verifier: pending.verifier,
    }),
  });
  const tokens = tokenShape(payload);
  const profile = await userInfo(tokens.accessToken);
  const now = new Date().toISOString();
  const accessCipher = await sealJson({ token: tokens.accessToken }, cfg.tokenSecret);
  const refreshCipher = await sealJson({ token: tokens.refreshToken }, cfg.tokenSecret);
  await db.prepare(`
    INSERT INTO whop_sessions (
      admin_session_id, access_cipher, refresh_cipher, token_type, scopes, expires_at,
      user_json, token_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(admin_session_id) DO UPDATE SET
      access_cipher = excluded.access_cipher,
      refresh_cipher = excluded.refresh_cipher,
      token_type = excluded.token_type,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      user_json = excluded.user_json,
      token_version = whop_sessions.token_version + 1,
      updated_at = excluded.updated_at
  `).bind(
    pending.admin_session_id,
    accessCipher,
    refreshCipher,
    tokens.tokenType,
    tokens.scopes,
    tokens.expiresAt,
    JSON.stringify(profile || {}),
    now,
    now,
  ).run();
  return { adminSessionId: pending.admin_session_id, profile };
}

async function decryptSession(row, cfg) {
  const access = await openJson(row.access_cipher, cfg.tokenSecret);
  const refresh = await openJson(row.refresh_cipher, cfg.tokenSecret);
  if (!access?.token || !refresh?.token) throw new HttpError(401, 'The saved Whop session could not be opened. Connect Whop again.');
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    tokenType: row.token_type || 'Bearer',
    scopes: row.scopes || '',
    expiresAt: row.expires_at,
    profile: JSON.parse(row.user_json || '{}'),
    tokenVersion: Number(row.token_version || 1),
  };
}

async function refreshWhopSession(request, env, adminSession, row, session) {
  const cfg = config(request, env);
  const db = requireDatabase(env);
  const payload = await timedFetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: cfg.clientId,
    }),
  });
  const refreshed = tokenShape(payload, session);
  const accessCipher = await sealJson({ token: refreshed.accessToken }, cfg.tokenSecret);
  const refreshCipher = await sealJson({ token: refreshed.refreshToken }, cfg.tokenSecret);
  const result = await db.prepare(`
    UPDATE whop_sessions SET
      access_cipher = ?, refresh_cipher = ?, token_type = ?, scopes = ?, expires_at = ?,
      token_version = token_version + 1, updated_at = ?
    WHERE admin_session_id = ? AND token_version = ?
  `).bind(
    accessCipher,
    refreshCipher,
    refreshed.tokenType,
    refreshed.scopes,
    refreshed.expiresAt,
    new Date().toISOString(),
    adminSession.sid,
    row.token_version,
  ).run();
  if (!result.meta?.changes) {
    const current = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?').bind(adminSession.sid).first();
    if (!current) throw new HttpError(401, 'Whop is no longer connected.');
    return decryptSession(current, cfg);
  }
  return { ...session, ...refreshed, tokenVersion: session.tokenVersion + 1 };
}

export async function requireWhopSession(request, env, adminSession) {
  const cfg = config(request, env);
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?').bind(adminSession.sid).first();
  if (!row) throw new HttpError(401, 'Connect your Whop account first.');
  const session = await decryptSession(row, cfg);
  if (Date.parse(session.expiresAt) - Date.now() > REFRESH_BUFFER_MS) return session;
  try {
    return await refreshWhopSession(request, env, adminSession, row, session);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await db.prepare('DELETE FROM whop_sessions WHERE admin_session_id = ?').bind(adminSession.sid).run();
    }
    throw error;
  }
}

export async function requireOwnerWhopSession(request, env) {
  const cfg = config(request, env);
  const db = requireDatabase(env);
  const row = await db.prepare(`
    SELECT * FROM whop_sessions
    ORDER BY CASE WHEN admin_session_id = 'sniperplug-owner' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).first();
  if (!row) throw new HttpError(401, 'Whop is not connected. Reconnect it from the SniperPlug Control Center.');
  const session = await decryptSession(row, cfg);
  if (Date.parse(session.expiresAt) - Date.now() > REFRESH_BUFFER_MS) return session;
  try {
    return await refreshWhopSession(request, env, { sid: row.admin_session_id }, row, session);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      await db.prepare('DELETE FROM whop_sessions WHERE admin_session_id = ?').bind(row.admin_session_id).run();
    }
    throw error;
  }
}

export async function whopSessionSummary(env, adminSession) {
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT scopes, expires_at, user_json FROM whop_sessions WHERE admin_session_id = ?').bind(adminSession.sid).first();
  if (!row) return null;
  return {
    scopes: String(row.scopes || '').split(/\s+/).filter(Boolean),
    expiresAt: row.expires_at,
    user: JSON.parse(row.user_json || '{}'),
  };
}

export async function disconnectWhop(request, env, adminSession) {
  const cfg = config(request, env);
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?').bind(adminSession.sid).first();
  if (row) {
    try {
      const session = await decryptSession(row, cfg);
      await timedFetch(`${OAUTH_BASE}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: session.refreshToken, client_id: cfg.clientId }),
      });
    } catch {
      // Local disconnect must still succeed when Whop is temporarily unavailable.
    }
  }
  await db.prepare('DELETE FROM whop_sessions WHERE admin_session_id = ?').bind(adminSession.sid).run();
}

export async function whopApi(session, path, query = {}) {
  const url = new URL(`${API_BASE}/${String(path || '').replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return timedFetch(url, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
}

export function experienceIdFrom(value) {
  return String(value || '').match(/\bexp_[A-Za-z0-9_-]+\b/)?.[0] || '';
}

export async function retrieveExperience(session, value) {
  const id = experienceIdFrom(value);
  if (!id) throw new HttpError(422, 'Paste a Whop experience ID beginning with exp_ or a link containing one.');
  return whopApi(session, `experiences/${encodeURIComponent(id)}`);
}

function normalizedAppName(experience) {
  return String(experience?.app?.name || '').normalize('NFKC').trim().toLowerCase();
}

export function whopExperienceType(experience) {
  const resolved = String(experience?.resolved_source_type || experience?.source_type || '').trim().toLowerCase();
  if (['forum', 'course', 'chat'].includes(resolved)) return resolved;
  const app = normalizedAppName(experience);
  if (app.includes('forum')) return 'forum';
  if (app.includes('course')) return 'course';
  if (app === 'chat' || app.includes('chat')) return 'chat';
  return 'unsupported';
}

export function requiredScopeForType(type) {
  if (type === 'forum') return 'forum:read';
  if (type === 'course') return 'courses:read';
  if (type === 'chat') return 'chat:read';
  return null;
}

export function requiredScopeForExperience(experience) {
  return requiredScopeForType(whopExperienceType(experience));
}

function probeDenied(error) {
  return error instanceof HttpError && [401, 403, 404, 422].includes(Number(error.status));
}

async function sourceProbe(session, type, experienceId) {
  const request = type === 'course'
    ? ['courses', { experience_id: experienceId }]
    : type === 'forum'
      ? ['forum_posts', { experience_id: experienceId }]
      : ['messages', { channel_id: experienceId, direction: 'asc' }];
  try {
    const payload = await whopApi(session, request[0], { ...request[1], first: 1 });
    return Array.isArray(payload?.data) && payload.data.length > 0;
  } catch (error) {
    if (probeDenied(error)) return false;
    throw error;
  }
}

export async function resolveWhopExperienceType(session, experience) {
  const known = whopExperienceType(experience);
  if (known !== 'unsupported') return known;
  const experienceId = String(experience?.id || '').trim();
  if (!experienceId) return 'unsupported';
  const cacheKey = `${experienceId}:${String(session?.tokenVersion || session?.scopes || '')}`;
  const cached = experienceTypeCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < EXPERIENCE_TYPE_CACHE_MS) return cached.type;

  for (const type of ['course', 'forum', 'chat']) {
    if (await sourceProbe(session, type, experienceId)) {
      experienceTypeCache.set(cacheKey, { type, checkedAt: Date.now() });
      return type;
    }
  }
  experienceTypeCache.set(cacheKey, { type: 'unsupported', checkedAt: Date.now() });
  return 'unsupported';
}

function safeAppUrl(origin, path, experienceId) {
  try {
    if (!origin || !path) return null;
    const route = String(path).replace(/\[experienceId\]/g, encodeURIComponent(experienceId));
    const url = new URL(route, origin);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function inspectWhopApp(session, experience) {
  const appId = String(experience?.app?.id || '').trim();
  if (!appId) return null;
  try {
    const app = await whopApi(session, `apps/${encodeURIComponent(appId)}`);
    const origin = String(app?.origin || app?.base_url || '').trim() || null;
    return {
      id: String(app?.id || appId),
      name: String(app?.name || experience?.app?.name || 'Whop app').trim(),
      verified: Boolean(app?.verified),
      appType: String(app?.app_type || '').trim() || null,
      origin,
      experienceUrl: safeAppUrl(origin, app?.experience_path, experience?.id),
      openapiUrl: safeAppUrl(origin, app?.openapi_path, experience?.id),
      hasOpenapiView: Boolean(app?.openapi_path),
    };
  } catch {
    return null;
  }
}

async function allPages(session, path, query, maxItems = MAX_SOURCE_ITEMS) {
  const values = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await whopApi(session, path, {
      ...query,
      first: PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    const data = Array.isArray(payload?.data) ? payload.data : [];
    values.push(...data);
    if (values.length > maxItems) throw new HttpError(422, `Whop returned more than ${maxItems} content items for one source.`);
    if (!payload?.page_info?.has_next_page) return values;
    const next = String(payload?.page_info?.end_cursor || '');
    if (!next || next === after) throw new HttpError(502, 'Whop returned an invalid pagination cursor.');
    after = next;
  }
  throw new HttpError(502, 'Whop pagination exceeded the safe page limit.');
}

async function mapConcurrent(values, mapper, concurrency = ITEM_CONCURRENCY) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, values.length)) }, () => worker()));
  return output;
}

function cleanTitle(value, fallback) {
  return String(value || fallback || 'Untitled Whop content').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 140);
}

function firstLine(value, fallback) {
  const text = String(value || '').replace(/^\s+|\s+$/g, '').split(/\n+/)[0]?.replace(/\s+/g, ' ') || '';
  return cleanTitle(text.slice(0, 110), fallback);
}

function fileInput(file, role = 'attachment') {
  if (!file || typeof file !== 'object') return null;
  const id = String(file.id || '').trim();
  const url = /^https:\/\//i.test(String(file.url || file.source_url || file.optimized_url || ''))
    ? String(file.url || file.source_url || file.optimized_url)
    : null;
  if (!id && !url) return null;
  return {
    id,
    filename: String(file.filename || `${role.replace(/-/g, ' ')} file`).trim().slice(0, 180),
    content_type: String(file.content_type || '').trim().slice(0, 120),
    url,
    visibility: String(file.visibility || '').trim().toLowerCase() || null,
    upload_status: String(file.upload_status || '').trim().toLowerCase() || null,
    role,
  };
}

function courseLessonContent(lesson, course) {
  const parts = [];
  const content = String(lesson?.content || '').trim();
  if (content) parts.push(content);
  if (lesson?.embed_type === 'youtube' && lesson?.embed_id) {
    parts.push(`## Video\n\n[Watch on YouTube](https://www.youtube.com/watch?v=${encodeURIComponent(String(lesson.embed_id))})`);
  } else if (lesson?.embed_type === 'loom' && lesson?.embed_id) {
    parts.push(`## Video\n\n[Watch on Loom](https://www.loom.com/share/${encodeURIComponent(String(lesson.embed_id))})`);
  }
  if (Array.isArray(lesson?.assessment_questions) && lesson.assessment_questions.length) {
    const questions = lesson.assessment_questions.map((question, index) => {
      const options = Array.isArray(question?.options) && question.options.length
        ? `\n${question.options.map((option) => `- ${String(option?.option_text || '').trim()}`).join('\n')}`
        : '';
      return `### ${index + 1}. ${String(question?.question_text || 'Question').trim()}${options}`;
    });
    parts.push(`## Knowledge check\n\n${questions.join('\n\n')}`);
  }
  if (!parts.length) parts.push(`Course lesson from ${cleanTitle(course?.title, 'Whop course')}.`);
  return parts.join('\n\n');
}

function courseLessonAttachments(lesson) {
  const values = [];
  const mainPdf = fileInput(lesson?.main_pdf, 'main-pdf');
  if (mainPdf) values.push(mainPdf);
  for (const attachment of Array.isArray(lesson?.attachments) ? lesson.attachments : []) {
    const normalized = fileInput(attachment, 'attachment');
    if (normalized) values.push(normalized);
  }
  if (lesson?.video_asset) {
    values.push({
      id: String(lesson.video_asset.id || ''),
      filename: `${cleanTitle(lesson.title, 'Course lesson')} hosted video`,
      content_type: lesson.video_asset.audio_only ? 'audio/mpeg' : 'video/mp4',
      url: null,
      visibility: 'private',
      upload_status: String(lesson.video_asset.status || 'unknown'),
      role: 'hosted-video',
      reviewReason: 'Whop-hosted course video uses signed playback credentials. Replace it with a SniperPlug-owned public file or an authorized external embed before publishing.',
    });
  }
  return values;
}

function chatMessageContent(message) {
  const parts = [];
  const content = String(message?.content || '').trim();
  if (content) parts.push(content);
  if (message?.poll?.options?.length) {
    parts.push(`## Poll\n\n${message.poll.options.map((option) => `- ${String(option?.text || '').trim()}`).join('\n')}`);
  }
  return parts.join('\n\n') || `[${String(message?.message_type || 'Chat message').replace(/_/g, ' ')}]`;
}

export function sourceKeyForWhopItem(item) {
  const type = String(item?.sourceType || 'forum');
  const id = String(item?.id || '').trim();
  if (type === 'course') return `course-lesson:${id}`;
  if (type === 'chat') return `chat-message:${id}`;
  return `forum-post:${id}`;
}

export async function listForumPosts(session, experienceId) {
  const posts = await allPages(session, 'forum_posts', { experience_id: experienceId });
  return posts.filter((post) => !post?.parent_id);
}

async function listCourseItems(session, experience) {
  const courses = await allPages(session, 'courses', { experience_id: experience.id }, 250);
  const output = [];
  for (const course of courses) {
    const lessons = await allPages(session, 'course_lessons', { course_id: course.id });
    const detailed = await mapConcurrent(lessons, async (lesson) => {
      try { return await whopApi(session, `course_lessons/${encodeURIComponent(lesson.id)}`); }
      catch { return lesson; }
    });
    for (const lesson of detailed) {
      output.push({
        sourceType: 'course',
        id: String(lesson?.id || ''),
        title: cleanTitle(lesson?.title, course?.title || 'Course lesson'),
        content: courseLessonContent(lesson, course),
        user: null,
        attachments: courseLessonAttachments(lesson),
        created_at: lesson?.created_at || course?.created_at || null,
        updated_at: lesson?.updated_at || lesson?.created_at || course?.updated_at || null,
        sourceMeta: {
          courseId: course?.id || null,
          courseTitle: course?.title || null,
          chapterId: lesson?.chapter?.id || null,
          lessonType: lesson?.lesson_type || null,
          visibility: lesson?.visibility || null,
          order: lesson?.order ?? null,
        },
      });
      if (output.length > MAX_SOURCE_ITEMS) throw new HttpError(422, `This course source contains more than ${MAX_SOURCE_ITEMS} lessons.`);
    }
  }
  return output;
}

async function listChatItems(session, experience) {
  const messages = await allPages(session, 'messages', { channel_id: experience.id, direction: 'asc' });
  return messages.map((message) => ({
    sourceType: 'chat',
    id: String(message?.id || ''),
    title: message?.is_pinned
      ? `Pinned · ${firstLine(message?.content, 'Chat message')}`
      : firstLine(message?.content, `Chat message ${String(message?.id || '').slice(-8)}`),
    content: chatMessageContent(message),
    user: message?.user || null,
    attachments: (Array.isArray(message?.attachments) ? message.attachments : []).map((attachment) => fileInput(attachment, 'chat-attachment')).filter(Boolean),
    created_at: message?.created_at || null,
    updated_at: message?.updated_at || message?.created_at || null,
    sourceMeta: {
      pinned: Boolean(message?.is_pinned),
      edited: Boolean(message?.is_edited),
      messageType: message?.message_type || null,
      replyingTo: message?.replying_to_message_id || null,
      viewCount: Number(message?.view_count || 0),
    },
  })).filter((item) => item.id);
}

export async function listExperienceItems(session, experience) {
  const type = await resolveWhopExperienceType(session, experience);
  if (type === 'forum') {
    const posts = await listForumPosts(session, experience.id);
    return posts.map((post) => ({
      sourceType: 'forum',
      id: String(post?.id || ''),
      title: cleanTitle(post?.title, firstLine(post?.content, 'Whop forum post')),
      content: String(post?.content || ''),
      user: post?.user || null,
      attachments: (Array.isArray(post?.attachments) ? post.attachments : []).map((attachment) => fileInput(attachment, 'forum-attachment')).filter(Boolean),
      created_at: post?.created_at || null,
      updated_at: post?.updated_at || post?.created_at || null,
      sourceMeta: {
        pinned: Boolean(post?.is_pinned),
        edited: Boolean(post?.is_edited),
        posterAdmin: Boolean(post?.is_poster_admin),
      },
    })).filter((item) => item.id);
  }
  if (type === 'course') return listCourseItems(session, experience);
  if (type === 'chat') return listChatItems(session, experience);
  throw new HttpError(422, `Whop’s official Course, Forum, and Chat endpoints returned no readable content for “${String(experience?.app?.name || 'Unknown')}”. This app requires its own documented read API.`);
}

export async function retrieveWhopFile(session, input) {
  const original = input && typeof input === 'object' ? input : { id: input };
  if (original.role === 'hosted-video') {
    return {
      id: String(original.id || ''),
      filename: String(original.filename || 'hosted video'),
      contentType: String(original.content_type || 'video/mp4'),
      visibility: 'private',
      uploadStatus: String(original.upload_status || 'unknown'),
      url: null,
      durable: false,
      role: original.role,
      reviewReason: original.reviewReason || 'Replace this signed Whop-hosted video before publishing.',
    };
  }

  try {
    const id = String(original.id || '').trim();
    const file = id ? await whopApi(session, `files/${encodeURIComponent(id)}`) : original;
    const visibility = String(file?.visibility || original.visibility || '').toLowerCase();
    const uploadStatus = String(file?.upload_status || original.upload_status || (file?.url || original.url ? 'ready' : 'unknown')).toLowerCase();
    const ready = uploadStatus === 'ready';
    const url = /^https:\/\//i.test(String(file?.url || original.url || '')) ? String(file?.url || original.url) : null;
    return {
      id: String(file?.id || id),
      filename: String(file?.filename || original.filename || 'attachment'),
      contentType: String(file?.content_type || original.content_type || ''),
      visibility: visibility || 'unknown',
      uploadStatus: uploadStatus || 'unknown',
      url,
      role: original.role || 'attachment',
      durable: visibility === 'public' && ready && Boolean(url),
      reviewReason: visibility === 'private'
        ? 'Private Whop file uses an expiring signed URL. Copy it to SniperPlug-owned storage before publishing.'
        : !ready
          ? 'Whop file is not ready yet.'
          : !url
            ? 'Whop did not return a usable file URL.'
            : visibility !== 'public'
              ? 'Whop did not confirm a permanent public URL. Copy it to SniperPlug-owned storage before publishing.'
              : null,
    };
  } catch (error) {
    return {
      id: String(original.id || ''),
      filename: String(original.filename || 'attachment'),
      contentType: String(original.content_type || ''),
      visibility: 'unknown',
      uploadStatus: 'unknown',
      url: null,
      role: original.role || 'attachment',
      durable: false,
      reviewReason: error?.message || 'Attachment could not be verified.',
    };
  }
}
