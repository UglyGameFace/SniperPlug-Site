const REQUIRED_CONTROL_CONFIGURATION = [
  'SNIPERPLUG_DB',
  'SNIPERPLUG_ADMIN_PASSWORD',
  'SNIPERPLUG_SESSION_SECRET',
  'WHOP_CLIENT_ID',
  'WHOP_TOKEN_SECRET',
  'WHOP_REDIRECT_URI',
  'WHOP_OAUTH_SCOPES',
];

function missingControlConfiguration(env) {
  return REQUIRED_CONTROL_CONFIGURATION.filter((name) => {
    if (name === 'SNIPERPLUG_DB') return !env?.SNIPERPLUG_DB;
    return !String(env?.[name] || '').trim();
  });
}

function configurationError(missing) {
  return new Response(JSON.stringify({
    error: `Cloudflare setup incomplete. Missing: ${missing.join(', ')}. Add every item to both Preview and Production, then redeploy.`,
    missing,
  }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === '/api/control') {
    const missing = missingControlConfiguration(context.env);
    if (missing.length) return configurationError(missing);
  }

  const original = await context.next();
  const response = new Response(original.body, original);
  const pathname = url.pathname;
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/control-center/')) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  if (pathname.startsWith('/control-center/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return response;
}
