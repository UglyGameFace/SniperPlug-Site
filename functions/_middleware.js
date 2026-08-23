import { clearAdminSession, readAdminSession } from './_lib/auth.js';
import { appendCookie } from './_lib/http.js';
import { privateGuidePageGate } from './_lib/private-guides.js';

const REQUIRED_CONTROL_CONFIGURATION = [
  'SNIPERPLUG_DB',
  'SNIPERPLUG_ADMIN_PASSWORD',
  'SNIPERPLUG_SESSION_SECRET',
  'WHOP_TOKEN_SECRET',
];

const CONTROL_CENTER_RUNTIME_SCRIPTS = Object.freeze([
  '/assets/js/control-center-source-access.js?v=20260731.1',
  '/assets/js/control-center-whop-flash.js?v=20260811.1',
]);

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

function isControlCenterPage(pathname) {
  return pathname === '/control-center' || pathname === '/control-center/';
}

function isPrivateGuidePage(pathname) {
  return pathname === '/guides' || pathname.startsWith('/guides/');
}

function isRetiredPublicDealPath(pathname) {
  return pathname === '/deal'
    || pathname.startsWith('/deal/')
    || pathname === '/go'
    || pathname.startsWith('/go/');
}

function retiredPublicDealRedirect(url, pathname) {
  if (!isRetiredPublicDealPath(pathname)) return null;

  const destination = new URL('/deals/', url);
  destination.searchParams.set('notice', pathname === '/deal' || pathname.startsWith('/deal/')
    ? 'retired-deal'
    : 'retired-link');

  return new Response(null, {
    status: 308,
    headers: {
      location: destination.toString(),
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
}

async function legacyCustomerSessionGate(request, env, pathname) {
  if (!pathname.startsWith('/api/')) return null;
  const session = await readAdminSession(request, env).catch(() => null);
  if (!session || session.kind === 'owner') return null;

  const url = new URL(request.url);
  const sessionAction = pathname === '/api/control' && url.searchParams.get('action') === 'session';
  if (sessionAction && ['POST', 'DELETE'].includes(request.method)) return null;

  const response = sessionAction && request.method === 'GET'
    ? new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store, max-age=0',
      },
    })
    : new Response(JSON.stringify({
      error: 'Unlock the SniperPlug Control Center with the owner password.',
      code: 'CONTROL_CENTER_PASSWORD_REQUIRED',
    }), {
      status: 401,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store, max-age=0',
      },
    });

  return appendCookie(response, clearAdminSession());
}

async function injectControlCenterRuntime(original, pathname) {
  const contentType = String(original.headers.get('content-type') || '').toLowerCase();
  if (!isControlCenterPage(pathname) || !contentType.includes('text/html')) return new Response(original.body, original);

  const html = await original.text();
  const missingScripts = CONTROL_CENTER_RUNTIME_SCRIPTS.filter((src) => !html.includes(src.split('?')[0]));
  const injected = missingScripts.length
    ? html.replace('</head>', `${missingScripts.map((src) => `  <script src="${src}" defer></script>`).join('\n')}\n</head>`)
    : html;
  const headers = new Headers(original.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(injected, {
    status: original.status,
    statusText: original.statusText,
    headers,
  });
}

function secureResponse(response, url, pathname) {
  const controlCenterPage = isControlCenterPage(pathname);
  const courseVideoFrame = pathname.startsWith('/course-video/');
  const privateGuidePage = isPrivateGuidePage(pathname);
  const privateGuideAsset = pathname.startsWith('/media/') || courseVideoFrame;
  const privateGuideContent = privateGuidePage || privateGuideAsset;
  const retiredPublicDealPath = isRetiredPublicDealPath(pathname);

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
  if (pathname.startsWith('/api/') || controlCenterPage || pathname.startsWith('/control-center/') || privateGuideContent || retiredPublicDealPath) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  } else if (controlAsset && url.searchParams.has('v')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (controlAsset) {
    response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  if (controlCenterPage || pathname.startsWith('/control-center/') || privateGuideContent || retiredPublicDealPath) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return response;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  if (url.pathname === '/api/control' || url.pathname === '/api/whop/oauth/callback') {
    const missing = missingControlConfiguration(context.env);
    if (missing.length) return secureResponse(configurationError(missing), url, pathname);
  }

  const legacyCustomer = await legacyCustomerSessionGate(context.request, context.env, pathname);
  if (legacyCustomer) return secureResponse(legacyCustomer, url, pathname);

  // Fail closed before Pages can resolve a stale static deal page, old click-out,
  // or nested function. No retired public route may expose a fake deal or a
  // generic retailer search destination, even during mixed deployments.
  const retiredDeal = retiredPublicDealRedirect(url, pathname);
  if (retiredDeal) return secureResponse(retiredDeal, url, pathname);

  // Fail closed before Pages can resolve a static asset or a nested function.
  // This protects every present and future /guides route, even if an old HTML
  // artifact is accidentally left in the build output.
  if (isPrivateGuidePage(pathname)) {
    const gate = await privateGuidePageGate(context.request, context.env);
    if (gate) return secureResponse(gate, url, pathname);
  }

  const original = await context.next();
  const response = await injectControlCenterRuntime(original, pathname);
  return secureResponse(response, url, pathname);
}
