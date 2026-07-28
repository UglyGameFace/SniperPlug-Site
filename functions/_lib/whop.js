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
const DEFAULT_SCOPES = 'openid profile email forum:read';
const REQUEST_TIMEOUT_MS = 20_000;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_POSTS = 2000;

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

export async function listForumPosts(session, experienceId) {
  const posts = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await whopApi(session, 'forum_posts', {
      experience_id: experienceId,
      first: PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    const data = Array.isArray(payload?.data) ? payload.data : [];
    posts.push(...data.filter((post) => !post?.parent_id));
    if (posts.length > MAX_POSTS) throw new HttpError(422, `This Whop group contains more than ${MAX_POSTS} top-level posts. Narrow the source before importing.`);
    if (!payload?.page_info?.has_next_page) return posts;
    const next = String(payload?.page_info?.end_cursor || '');
    if (!next || next === after) throw new HttpError(502, 'Whop returned an invalid pagination cursor.');
    after = next;
  }
  throw new HttpError(502, 'Whop pagination exceeded the safe page limit.');
}

export async function retrieveWhopFile(session, fileId) {
  try {
    const file = await whopApi(session, `files/${encodeURIComponent(fileId)}`);
    const visibility = String(file?.visibility || '').toLowerCase();
    const ready = String(file?.upload_status || '').toLowerCase() === 'ready';
    const url = /^https:\/\//i.test(String(file?.url || '')) ? String(file.url) : null;
    return {
      id: String(file?.id || fileId),
      filename: String(file?.filename || 'attachment'),
      contentType: String(file?.content_type || ''),
      visibility: visibility || 'unknown',
      uploadStatus: String(file?.upload_status || 'unknown'),
      url,
      durable: visibility === 'public' && ready && Boolean(url),
      reviewReason: visibility === 'private'
        ? 'Private Whop file uses an expiring signed URL. Re-upload it before publishing.'
        : !ready
          ? 'Whop file is not ready yet.'
          : !url
            ? 'Whop did not return a usable file URL.'
            : visibility !== 'public'
              ? 'Whop did not confirm a permanent public URL.'
              : null,
    };
  } catch (error) {
    return {
      id: fileId,
      filename: 'attachment',
      contentType: '',
      visibility: 'unknown',
      uploadStatus: 'unknown',
      url: null,
      durable: false,
      reviewReason: error?.message || 'Attachment could not be verified.',
    };
  }
}
