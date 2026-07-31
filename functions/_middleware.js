const REQUIRED_CONTROL_CONFIGURATION = [
  'SNIPERPLUG_DB',
  'SNIPERPLUG_ADMIN_PASSWORD',
  'SNIPERPLUG_SESSION_SECRET',
  'WHOP_TOKEN_SECRET',
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
  if (url.pathname === '/api/control' || url.pathname === '/api/whop/oauth/callback') {
    const missing = missingControlConfiguration(context.env);
    if (missing.length) return configurationError(missing);
  }

  const original = await context.next();
  const response = new Response(original.body, original);
  const pathname = url.pathname;
  const courseVideoFrame = pathname.startsWith('/course-video/');
  const privateGuidePage = pathname === '/guides' || pathname.startsWith('/guides/');
  const privateGuideAsset = pathname.startsWith('/media/') || courseVideoFrame;
  const privateGuideContent = privateGuidePage || privateGuideAsset;

  response.headers.set('X-Frame-Options', courseVideoFrame ? 'SAMEORIGIN' : 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', courseVideoFrame
    ? "default-src 'none'; frame-src https://player.mux.com; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
    : "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; frame-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  const controlAsset = /^\/assets\/(?:js\/control-center|css\/(?:control-center|whop-discovery|bulk-history))/.test(pathname);
  if (pathname.startsWith('/api/') || pathname.startsWith('/control-center/') || privateGuideContent) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  } else if (controlAsset && url.searchParams.has('v')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (controlAsset) {
    response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  if (pathname.startsWith('/control-center/') || privateGuideContent) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return response;
}
