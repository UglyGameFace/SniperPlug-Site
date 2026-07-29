function validKey(value) {
  const key = decodeURIComponent(String(value || ''));
  return /^whop-[a-f0-9]{32}-[a-zA-Z0-9._-]{1,120}$/.test(key) ? key : '';
}

function mediaHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');
  return headers;
}

export async function onRequest(context) {
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!context.env?.SNIPERPLUG_MEDIA) return new Response('Media storage is not configured.', { status: 503 });
  const key = validKey(context.params?.key);
  if (!key) return new Response('Not found.', { status: 404 });

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
  return new Response(object.body, { status, headers });
}
