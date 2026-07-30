import { reserveMediaOriginRead, validMediaStorageKey } from '../_lib/media-storage.js';

function validKey(value) {
  const key = decodeURIComponent(String(value || ''));
  return validMediaStorageKey(key);
}

function mediaHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');
  headers.set('cdn-cache-control', 'public, max-age=31536000, immutable');
  return headers;
}

function canonicalUrl(request, key) {
  const url = new URL(request.url);
  url.pathname = `/media/${encodeURIComponent(key)}`;
  url.search = '';
  url.hash = '';
  return url;
}

function cacheLookupRequest(request, key) {
  const headers = new Headers();
  for (const name of ['range', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(canonicalUrl(request, key).toString(), { method: 'GET', headers });
}

function headResponse(response) {
  const headers = new Headers(response.headers);
  return new Response(null, { status: response.status, statusText: response.statusText, headers });
}

function freeTierReadLimitResponse(read, method = 'GET') {
  const body = method === 'HEAD' ? null : 'SniperPlug media is temporarily serving cached files only. Uncached media retries after the UTC free-tier reset.';
  return new Response(body, {
    status: 429,
    headers: {
      'cache-control': 'no-store',
      'retry-after': String(read?.retryAfterSeconds || 3600),
      'x-content-type-options': 'nosniff',
      'x-sniperplug-media-mode': 'hard-free',
    },
  });
}

export async function onRequest(context) {
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!context.env?.SNIPERPLUG_MEDIA) return new Response('Media storage is not configured.', { status: 503 });
  const key = validKey(context.params?.key);
  if (!key) return new Response('Not found.', { status: 404 });

  const requestedUrl = new URL(context.request.url);
  if (requestedUrl.search) {
    return Response.redirect(canonicalUrl(context.request, key).toString(), 308);
  }

  const edgeCache = globalThis.caches?.default || null;
  const lookup = cacheLookupRequest(context.request, key);
  if (edgeCache) {
    const cached = await edgeCache.match(lookup);
    if (cached) return context.request.method === 'HEAD' ? headResponse(cached) : cached;
  }

  const originRead = await reserveMediaOriginRead(context.env);
  if (!originRead.allowed) return freeTierReadLimitResponse(originRead, context.request.method);

  if (context.request.method === 'HEAD') {
    const object = await context.env.SNIPERPLUG_MEDIA.head(key);
    if (!object) return new Response('Not found.', { status: 404 });
    const headers = mediaHeaders(object);
    headers.set('content-length', String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await context.env.SNIPERPLUG_MEDIA.get(key, {
    range: context.request.headers,
    onlyIf: context.request.headers,
  });
  if (!object) return new Response('Not found.', { status: 404 });
  if (!('body' in object)) return new Response(null, { status: 412, headers: mediaHeaders(object) });

  const headers = mediaHeaders(object);
  let status = 200;
  if (object.range && context.request.headers.has('range')) {
    const offset = Number(object.range.offset || 0);
    const length = Number(object.range.length || object.size);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    status = 206;
  } else {
    headers.set('content-length', String(object.size));
  }
  const response = new Response(object.body, { status, headers });
  if (edgeCache && status === 200 && !context.request.headers.has('range')) {
    const storeRequest = new Request(canonicalUrl(context.request, key).toString(), { method: 'GET' });
    context.waitUntil(edgeCache.put(storeRequest, response.clone()));
  }
  return response;
}
