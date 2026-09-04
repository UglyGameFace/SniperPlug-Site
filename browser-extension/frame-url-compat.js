(() => {
  'use strict';

  const NativeURL = globalThis.URL;
  if (typeof NativeURL !== 'function') return;

  function isWhopHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'whop.com' || host.endsWith('.whop.com') || host.endsWith('.apps.whop.com');
  }

  function currentFrameHttpsFallback(input) {
    const raw = String(input || '').trim();
    const current = String(location.href || '').trim();
    if (!raw || raw !== current) return '';
    if (location.protocol !== 'https:' || !location.hostname || !location.host || !isWhopHost(location.hostname)) return '';

    const pathname = String(location.pathname || '/');
    const safePath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `https://${location.host}${safePath}`;
  }

  function SniperPlugURL(input, base) {
    const fallback = currentFrameHttpsFallback(input);
    if (fallback) return new NativeURL(fallback);
    return new NativeURL(input, base);
  }

  SniperPlugURL.prototype = NativeURL.prototype;
  Object.setPrototypeOf(SniperPlugURL, NativeURL);
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    writable: true,
    value: SniperPlugURL,
  });
})();
