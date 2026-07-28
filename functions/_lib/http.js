export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

export function html(value, status = 200, headers = {}) {
  return new Response(value, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, {
    status,
    headers: {
      location,
      'cache-control': 'no-store, max-age=0',
      ...headers,
    },
  });
}

export function methodNotAllowed(methods) {
  return json({ error: 'Method not allowed.' }, 405, { allow: methods.join(', ') });
}

export async function readJson(request, { maxBytes = 1_000_000 } = {}) {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > maxBytes) throw new HttpError(413, 'Request body is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, 'Request body is too large.');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin request blocked.');
}

export function cookieValue(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export function secureCookie(name, value, maxAge, { sameSite = 'Strict', path = '/' } = {}) {
  return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${Math.max(0, Math.trunc(maxAge))}`;
}

export function clearCookie(name, options = {}) {
  return secureCookie(name, '', 0, options);
}

export function appendCookie(response, cookie) {
  if (cookie) response.headers.append('set-cookie', cookie);
  return response;
}

export function handleError(error) {
  if (error instanceof HttpError) {
    return json({
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    }, error.status);
  }
  console.error(error);
  return json({ error: 'Unexpected SniperPlug importer error.' }, 500);
}

export function requireDatabase(env) {
  if (!env?.SNIPERPLUG_DB) {
    throw new HttpError(503, 'SNIPERPLUG_DB is not bound to this Cloudflare Pages project.');
  }
  return env.SNIPERPLUG_DB;
}

export function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
