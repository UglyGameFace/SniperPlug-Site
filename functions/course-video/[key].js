import {
  courseVideoSource,
  findMuxStaticRendition,
  muxPlayerUrl,
} from '../_lib/course-video.js';
import { OWNER_SESSION_ID } from '../_lib/auth.js';
import { HttpError, requireDatabase } from '../_lib/http.js';
import { PrivateGuideAuthError, requirePrivateGuideOwner } from '../_lib/private-guides.js';
import { permanentCourseArchive, whopRecoveryError } from '../_lib/recovery-media.js';
import { requireOwnerWhopSession, whopApi } from '../_lib/whop.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function noStoreHeaders(extra = {}) {
  return {
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...extra,
  };
}

export function courseVideoRecoveryKind(error) {
  if (error instanceof PrivateGuideAuthError) return 'owner-unlock';
  const code = String(error?.details?.code || '');
  if (code === 'whop_recovery_source_access_lost' || code === 'whop_recovery_source_missing') return 'source-access';
  if (error instanceof HttpError && error.status === 401) return 'whop-reconnect';
  if (error instanceof HttpError && error.status === 403) return 'source-access';
  return 'retry';
}

function errorPage(message, recoveryKind = 'retry') {
  const safeMessage = escapeHtml(message);
  const action = recoveryKind === 'owner-unlock'
    ? '<p><a href="/control-center/">Open Owner access to unlock the private library</a></p>'
    : recoveryKind === 'whop-reconnect'
      ? '<p><a href="/control-center/">Open the Control Center and reconnect Whop</a></p>'
      : recoveryKind === 'source-access'
        ? '<p><a href="/control-center/">Open the Control Center to verify current source access or restore a permanent R2 copy</a></p>'
        : '<p><a href="">Try again</a></p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>Course video unavailable</title><style>html,body{height:100%;margin:0;background:#09090b;color:#fff;font-family:system-ui,sans-serif}.error{box-sizing:border-box;display:grid;place-content:center;min-height:100%;padding:1.5rem;text-align:center}.error p{max-width:42rem;line-height:1.55}.error a{color:#8ab4ff}</style></head><body><main class="error"><h1>Course video unavailable</h1><p>${safeMessage}</p>${action}</main></body></html>`;
}

function errorResponse(error, method = 'GET') {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : 'The course video could not be opened.';
  const body = method === 'HEAD' ? null : errorPage(message, courseVideoRecoveryKind(error));
  return new Response(body, {
    status,
    headers: noStoreHeaders({
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    }),
  });
}

function playerPage(playerUrl, title) {
  const safeTitle = escapeHtml(title || 'Course video');
  const safeUrl = escapeHtml(playerUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>${safeTitle}</title>
<style>html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif}iframe{display:block;width:100%;height:100%;border:0;background:#000}.error{display:grid;place-items:center;height:100%;padding:1rem;text-align:center}</style></head>
<body><iframe src="${safeUrl}" title="${safeTitle}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`;
}

function archivedPlayerPage(mediaUrl, title, contentType) {
  const safeTitle = escapeHtml(title || 'Course video');
  const safeUrl = escapeHtml(mediaUrl);
  const audio = String(contentType || '').toLowerCase().startsWith('audio/');
  const player = audio
    ? `<audio controls preload="metadata" src="${safeUrl}"></audio>`
    : `<video controls playsinline preload="metadata" src="${safeUrl}"></video>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>${safeTitle}</title>
<style>html,body{height:100%;margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif}body{display:grid;place-items:center}video{display:block;width:100%;height:100%;object-fit:contain;background:#000}audio{width:min(94%,52rem)}</style></head>
<body>${player}</body></html>`;
}

async function expireSelectedOwnerSession(env) {
  const db = requireDatabase(env);
  await db.prepare(`
    UPDATE whop_sessions SET expires_at = ?, updated_at = ?
    WHERE admin_session_id = ?
  `).bind('1970-01-01T00:00:00.000Z', new Date().toISOString(), OWNER_SESSION_ID).run();
}

async function retrieveLessonWithRefresh(request, env, lessonId) {
  let session = await requireOwnerWhopSession(request, env);
  try {
    return await whopApi(session, `course_lessons/${encodeURIComponent(lessonId)}`);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    await expireSelectedOwnerSession(env);
    session = await requireOwnerWhopSession(request, env);
    return whopApi(session, `course_lessons/${encodeURIComponent(lessonId)}`);
  }
}

async function permanentArchiveForSource(env, source) {
  const db = requireDatabase(env);
  const guide = await db.prepare('SELECT attachment_json FROM guides WHERE id = ?').bind(source.guide_id).first();
  return permanentCourseArchive(guide?.attachment_json);
}

function permanentArchiveResponse(request, archive, title) {
  const url = new URL(request.url);
  const mediaUrl = new URL(String(archive.url || ''), url.origin).toString();
  if (url.searchParams.get('download') === '1') {
    return new Response(null, {
      status: 307,
      headers: noStoreHeaders({ location: mediaUrl }),
    });
  }
  const body = request.method === 'HEAD' ? null : archivedPlayerPage(mediaUrl, title, archive.contentType);
  return new Response(body, {
    status: 200,
    headers: noStoreHeaders({
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      'x-sniperplug-media-source': 'permanent-r2-copy',
    }),
  });
}

export async function onRequest(context) {
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: noStoreHeaders({ allow: 'GET, HEAD' }) });
  }
  try {
    await requirePrivateGuideOwner(context.request, context.env);
    const source = await courseVideoSource(context.env, context.params?.key);
    const archive = await permanentArchiveForSource(context.env, source);
    if (archive) return permanentArchiveResponse(context.request, archive, source.title);

    let lesson;
    try {
      lesson = await retrieveLessonWithRefresh(context.request, context.env, source.lesson_id);
    } catch (error) {
      throw whopRecoveryError(error, {
        sourceKey: source.source_key,
        operation: 'play this course video because no permanent R2 copy exists',
      });
    }
    if (String(source.source_key || '') !== `course-lesson:${String(lesson?.id || '')}`) {
      throw new HttpError(409, 'The saved course video no longer matches its Whop lesson. Re-import this lesson.');
    }
    const asset = lesson?.video_asset;
    if (!asset || String(asset.status || '').toLowerCase() === 'errored') {
      throw new HttpError(409, 'Whop has not made this course video available for playback.');
    }

    const url = new URL(context.request.url);
    if (url.searchParams.get('download') === '1') {
      const rendition = await findMuxStaticRendition(asset);
      if (!rendition?.url) throw new HttpError(404, 'Whop exposes this lesson as adaptive streaming only; no downloadable MP4/M4A rendition is available.');
      const extension = String(rendition.filename || '').toLowerCase().endsWith('.m4a') ? 'm4a' : 'mp4';
      return new Response(null, {
        status: 307,
        headers: noStoreHeaders({
          location: rendition.url,
          'content-disposition': `attachment; filename="${String(source.title || 'course-video').replace(/["\r\n]/g, '')}.${extension}"`,
          'x-sniperplug-media-source': 'live-whop-source',
        }),
      });
    }

    const playerUrl = muxPlayerUrl(asset, source.title);
    if (!playerUrl) throw new HttpError(409, 'Whop did not return a playable video ID. Re-import this lesson after the upload finishes.');
    const body = context.request.method === 'HEAD' ? null : playerPage(playerUrl, source.title);
    return new Response(body, {
      status: 200,
      headers: noStoreHeaders({
        'content-type': 'text/html; charset=utf-8',
        'x-frame-options': 'SAMEORIGIN',
        'content-security-policy': "default-src 'none'; frame-src https://player.mux.com; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        'x-sniperplug-media-source': 'live-whop-source',
      }),
    });
  } catch (error) {
    return errorResponse(error, context.request.method);
  }
}
