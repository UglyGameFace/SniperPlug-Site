import { sha256 } from './crypto.js';
import {
  MAX_MEDIA_OBJECT_BYTES,
  cancelMediaCopy,
  completeMediaCopy,
  prepareMediaCopy,
} from './media-storage.js';

const FETCH_TIMEOUT_MS = 45_000;

function safeFilename(value) {
  const filename = String(value || 'media-file')
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-120);
  return filename || 'media-file';
}

function blockedHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
  return false;
}

function safeRemoteMediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || blockedHostname(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function mediaKind(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function mediaMarkdown(file) {
  const label = String(file?.filename || 'Media').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Media';
  const url = String(file?.url || '').trim();
  if (!url) return '';
  if (file?.role === 'hosted-video-player') return `![video-player: ${label}](${url})`;
  if (file?.role === 'hosted-video-archive') return `- [${label}](${url})`;
  const kind = mediaKind(file?.contentType);
  if (kind === 'image') return `![${label}](${url})`;
  if (kind === 'video') return `![video: ${label}](${url})`;
  if (kind === 'audio') return `![audio: ${label}](${url})`;
  return `- [${label}](${url})`;
}

function boundedStream(body) {
  let bytes = 0;
  const stream = body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytes += Number(chunk?.byteLength || 0);
      if (bytes > MAX_MEDIA_OBJECT_BYTES) {
        controller.error(new Error('This media file is larger than the 50 MB automatic-copy limit.'));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  return { stream, bytes: () => bytes };
}

function heldForReview(file, reason) {
  return { ...file, mirrored: false, reviewReason: reason };
}

export async function mirrorWhopMedia(env, file, sourceKey) {
  if (file?.durable && file?.url) return { ...file, mirrored: false, reviewReason: null };
  if (!env?.SNIPERPLUG_MEDIA) {
    return heldForReview(file, 'SniperPlug media storage is not connected. Bind the SNIPERPLUG_MEDIA R2 bucket so private Whop images, videos, audio, and files can be copied permanently.');
  }

  const sourceUrl = safeRemoteMediaUrl(file?.url);
  if (!sourceUrl) {
    return heldForReview(file, file?.reviewReason || 'Whop did not provide a downloadable media URL that SniperPlug can copy safely.');
  }

  const declaredSize = Math.max(0, Number(file?.size || 0));
  const filename = safeFilename(file?.filename);
  const stableId = String(file?.id || sourceUrl.pathname || filename);
  const digest = await sha256(`${String(sourceKey || '')}:${stableId}:${filename}`);
  const key = `whop-${digest.slice(0, 32)}-${filename}`;
  let prepared;
  try {
    prepared = await prepareMediaCopy(env, key, {
      declaredSize,
      contentType: file?.contentType,
      sourceKey,
    });
  } catch (error) {
    return heldForReview(file, `SniperPlug could not verify its free media budget right now: ${String(error?.message || 'retry the import later.')}`);
  }

  if (prepared.status === 'existing') {
    return {
      ...file,
      filename,
      contentType: prepared.object?.content_type || file?.contentType,
      size: Number(prepared.object?.size_bytes || declaredSize || 0) || null,
      url: `/media/${encodeURIComponent(key)}`,
      durable: true,
      mirrored: true,
      storageKey: key,
      reviewReason: null,
    };
  }
  if (prepared.status !== 'reserved') {
    const reasons = {
      copying: 'SniperPlug is already copying this media file. Retry the import after the current copy finishes.',
      'storage-cap': 'SniperPlug reached its 8 GB hard-free media limit. This file stays in private draft review instead of creating billable storage.',
      'object-cap': 'SniperPlug reached its 25,000-object safety limit. This file stays in private draft review instead of creating billable operations.',
      'monthly-copy-cap': 'SniperPlug reached its 50,000-copy monthly safety limit. This file stays in private draft review until the next monthly reset.',
      'daily-copy-cap': 'SniperPlug reached its 2,000-copy daily safety limit. This file stays in private draft review until the next UTC day.',
      'daily-origin-read-cap': 'SniperPlug reached its 10,000 uncached R2-read daily safety limit. Cached media still works; retry after the UTC reset.',
      'file-too-large': 'This media file is larger than the 50 MB automatic-copy limit and will stay in private draft review.',
      'invalid-key': 'SniperPlug could not create a safe permanent filename for this media file.',
      'missing-storage': 'SniperPlug media storage is not connected.',
    };
    return heldForReview(file, prepared.reason || reasons[prepared.status] || 'SniperPlug could not reserve free media storage for this file.');
  }

  const reservation = prepared.reservation;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let stored = false;
  try {
    const response = await fetch(sourceUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: '*/*' },
    });
    if (!response.ok || !response.body) throw new Error(`Whop media download failed (${response.status}).`);
    if (!safeRemoteMediaUrl(response.url)) throw new Error('Whop media redirected to an unsafe destination.');
    const length = Math.max(0, Number(response.headers.get('content-length') || declaredSize || 0));
    if (length > MAX_MEDIA_OBJECT_BYTES) throw new Error('This media file is larger than the 50 MB automatic-copy limit.');
    const contentType = String(response.headers.get('content-type') || file?.contentType || 'application/octet-stream').split(';')[0].trim();
    const bounded = boundedStream(response.body);
    await env.SNIPERPLUG_MEDIA.put(key, bounded.stream, {
      storageClass: 'Standard',
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        contentDisposition: contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/')
          ? 'inline'
          : `attachment; filename="${filename.replace(/"/g, '')}"`,
      },
      customMetadata: {
        source: 'whop-authorized-import',
        sourceId: String(file?.id || '').slice(0, 120),
        sourceKey: String(sourceKey || '').slice(0, 180),
        hardFreeMode: '8GB-50MB-25Kobjects-2Kdaily-50Kmonthly-10Kreads',
      },
    });
    stored = true;
    const actualSize = Math.max(length, bounded.bytes());
    await completeMediaCopy(env, reservation, { sizeBytes: actualSize, contentType, sourceKey });
    return {
      ...file,
      filename,
      contentType,
      size: actualSize || null,
      url: `/media/${encodeURIComponent(key)}`,
      durable: true,
      mirrored: true,
      storageKey: key,
      reviewReason: null,
    };
  } catch (error) {
    if (stored) {
      const deleted = await env.SNIPERPLUG_MEDIA.delete(key).then(() => true).catch(() => false);
      if (deleted) await cancelMediaCopy(env, reservation).catch(() => null);
    } else {
      await cancelMediaCopy(env, reservation).catch(() => null);
    }
    return heldForReview(file, error?.name === 'AbortError'
      ? 'The Whop media download timed out. Retry the import or upload the file manually.'
      : String(error?.message || 'SniperPlug could not copy this Whop media file.'));
  } finally {
    clearTimeout(timer);
  }
}
