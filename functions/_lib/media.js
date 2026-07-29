import { sha256 } from './crypto.js';

const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;

function safeFilename(value) {
  const filename = String(value || 'media-file').normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120);
  return filename || 'media-file';
}

function whopMediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host !== 'whop.com' && !host.endsWith('.whop.com')) return null;
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
  const kind = mediaKind(file?.contentType);
  if (kind === 'image') return `![${label}](${url})`;
  if (kind === 'video') return `[Video: ${label}](${url})`;
  if (kind === 'audio') return `[Audio: ${label}](${url})`;
  return `- [${label}](${url})`;
}

export async function mirrorWhopMedia(env, file, sourceKey) {
  if (!env?.SNIPERPLUG_MEDIA) {
    return {
      ...file,
      mirrored: false,
      reviewReason: file?.durable
        ? null
        : 'SniperPlug media storage is not connected. Bind the SNIPERPLUG_MEDIA R2 bucket so private Whop images, videos, audio, and files can be copied permanently.',
    };
  }

  const sourceUrl = whopMediaUrl(file?.url);
  if (!sourceUrl) {
    return {
      ...file,
      mirrored: false,
      reviewReason: file?.reviewReason || 'Whop did not provide a downloadable media URL that SniperPlug can copy safely.',
    };
  }

  const filename = safeFilename(file?.filename);
  const stableId = String(file?.id || sourceUrl.pathname || filename);
  const digest = await sha256(`${String(sourceKey || '')}:${stableId}:${filename}`);
  const key = `whop-${digest.slice(0, 32)}-${filename}`;
  const existing = await env.SNIPERPLUG_MEDIA.head(key);
  if (existing) {
    return {
      ...file,
      url: `/media/${encodeURIComponent(key)}`,
      durable: true,
      mirrored: true,
      storageKey: key,
      reviewReason: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl.toString(), {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: '*/*' },
    });
    if (!response.ok || !response.body) throw new Error(`Whop media download failed (${response.status}).`);
    const length = Number(response.headers.get('content-length') || file?.size || 0);
    if (length > MAX_MEDIA_BYTES) throw new Error('This media file is larger than the 500 MB automatic-copy limit.');
    const contentType = String(response.headers.get('content-type') || file?.contentType || 'application/octet-stream').split(';')[0].trim();
    await env.SNIPERPLUG_MEDIA.put(key, response.body, {
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
      },
    });
    return {
      ...file,
      filename,
      contentType,
      url: `/media/${encodeURIComponent(key)}`,
      durable: true,
      mirrored: true,
      storageKey: key,
      reviewReason: null,
    };
  } catch (error) {
    return {
      ...file,
      mirrored: false,
      reviewReason: error?.name === 'AbortError'
        ? 'The Whop media download timed out. Retry the import or upload the file manually.'
        : String(error?.message || 'SniperPlug could not copy this Whop media file.'),
    };
  } finally {
    clearTimeout(timer);
  }
}
