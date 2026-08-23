(() => {
  if (window.__sniperplugApiFetchGuardInstalled) return;
  window.__sniperplugApiFetchGuardInstalled = true;

  const whopConnect = document.querySelector('[data-whop-connect]');
  const whopDisconnect = document.querySelector('[data-whop-disconnect]');
  const whopState = document.querySelector('[data-whop-state]');

  function syncWhopAccountControls() {
    const state = whopState instanceof HTMLElement ? String(whopState.dataset.state || '') : '';
    if (whopConnect instanceof HTMLAnchorElement) {
      whopConnect.href = '/api/whop-switch';
      whopConnect.textContent = state === 'checking' ? 'Switch Whop account' : 'Connect Whop account';
      if (state === 'checking' || state === 'disconnected' || !state) whopConnect.hidden = false;
    }
    if (whopDisconnect instanceof HTMLButtonElement) {
      if (state === 'connected') {
        whopDisconnect.hidden = false;
        whopDisconnect.textContent = 'Switch Whop account';
      } else if (state === 'checking') {
        whopDisconnect.hidden = true;
      }
    }
  }

  syncWhopAccountControls();
  if (whopState instanceof HTMLElement) {
    new MutationObserver(syncWhopAccountControls).observe(whopState, {
      attributes: true,
      attributeFilter: ['data-state'],
      childList: true,
      subtree: true,
    });
  }
  document.addEventListener('sniperplug:dashboard-refreshed', syncWhopAccountControls);

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-whop-disconnect]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign('/api/whop-switch');
  }, true);

  const nativeFetch = window.fetch.bind(window);
  const READ_TIMEOUT_MS = 45_000;
  const WRITE_TIMEOUT_MS = 120_000;
  const guideVersions = new Map();
  window.SniperPlugGuideVersions = guideVersions;

  function requestDetails(input, options = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input), window.location.href);
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    const signal = options.signal || request?.signal || null;
    return { url, method, signal, request };
  }

  function controlAction(url) {
    return url.pathname === '/api/control' ? String(url.searchParams.get('action') || '') : '';
  }

  function routedInput(input, details) {
    if (controlAction(details.url) !== 'guide-save') return input;
    const safeUrl = new URL('/api/guide-save-safe', details.url.origin).toString();
    if (details.request) return new Request(safeUrl, details.request);
    return safeUrl;
  }

  function rememberGuide(guide) {
    const id = Number(guide?.id);
    const updatedAt = String(guide?.updatedAt || '').trim();
    if (Number.isFinite(id) && id > 0 && updatedAt) guideVersions.set(id, updatedAt);
  }

  function rememberPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    rememberGuide(payload.guide);
    for (const guide of Array.isArray(payload.guides) ? payload.guides : []) rememberGuide(guide);
  }

  function versionedOptions(details, options) {
    const action = controlAction(details.url);
    if (details.method !== 'POST' || !['guide-save', 'guide-status'].includes(action) || typeof options.body !== 'string') return options;
    try {
      const body = JSON.parse(options.body);
      const id = Number(body?.id);
      if (!Number.isFinite(id) || id <= 0 || body.expectedUpdatedAt) return options;
      const expectedUpdatedAt = guideVersions.get(id);
      if (!expectedUpdatedAt) return options;
      return { ...options, body: JSON.stringify({ ...body, expectedUpdatedAt }) };
    } catch {
      return options;
    }
  }

  async function rememberResponse(response) {
    if (!response?.ok || !String(response.headers.get('content-type') || '').includes('application/json')) return;
    try { rememberPayload(await response.clone().json()); } catch { /* malformed or streaming JSON stays owned by the caller */ }
  }

  function timeoutResponse(method, timeoutMs) {
    const readOnly = method === 'GET' || method === 'HEAD';
    const message = readOnly
      ? 'SniperPlug took too long to respond. This read-only request is safe to retry.'
      : 'SniperPlug took too long to confirm this change. Refresh the saved status before retrying so the action is not submitted twice.';
    return new Response(JSON.stringify({
      error: message,
      code: readOnly ? 'READ_TIMEOUT' : 'WRITE_CONFIRMATION_TIMEOUT',
      retryable: readOnly,
      confirmationRequired: !readOnly,
      timeoutMs,
    }), {
      status: 504,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store, max-age=0',
      },
    });
  }

  window.fetch = async function guardedFetch(input, options = {}) {
    const details = requestDetails(input, options);
    if (details.url.origin !== window.location.origin || !details.url.pathname.startsWith('/api/')) {
      return nativeFetch(input, options);
    }

    const guardedOptions = versionedOptions(details, options);
    const guardedInput = routedInput(input, details);
    const timeoutMs = details.method === 'GET' || details.method === 'HEAD' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    let callerAborted = Boolean(details.signal?.aborted);
    const forwardAbort = () => {
      callerAborted = true;
      controller.abort(details.signal?.reason);
    };
    if (details.signal && !details.signal.aborted) details.signal.addEventListener('abort', forwardAbort, { once: true });
    if (callerAborted) controller.abort(details.signal?.reason);

    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException('SniperPlug request timed out.', 'TimeoutError'));
    }, timeoutMs);

    try {
      const response = await nativeFetch(guardedInput, { ...guardedOptions, signal: controller.signal });
      await rememberResponse(response);
      return response;
    } catch (error) {
      if (timedOut && !callerAborted) return timeoutResponse(details.method, timeoutMs);
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (details.signal) details.signal.removeEventListener('abort', forwardAbort);
    }
  };
})();
