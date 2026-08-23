(() => {
  if (window.__sniperplugApiFetchGuardInstalled) return;
  window.__sniperplugApiFetchGuardInstalled = true;

  const controlRoot = document.querySelector('[data-control-root]');
  const loginPanel = document.querySelector('[data-login-panel]');
  const controlApp = document.querySelector('[data-control-app]');

  const authGateStyle = document.createElement('style');
  authGateStyle.dataset.sniperplugControlAuthGate = '';
  authGateStyle.textContent = `
    html[data-sniperplug-control-auth="locked"] [data-control-root] [data-control-app] { display: none !important; }
    html[data-sniperplug-control-auth="locked"] [data-control-root] [data-login-panel] { display: block !important; }
  `;
  document.head.append(authGateStyle);

  function setControlAuthState(authenticated) {
    const unlocked = authenticated === true;
    document.documentElement.dataset.sniperplugControlAuth = unlocked ? 'unlocked' : 'locked';
    if (controlRoot instanceof HTMLElement) controlRoot.dataset.authState = unlocked ? 'unlocked' : 'locked';
    if (loginPanel instanceof HTMLElement) loginPanel.hidden = unlocked;
    if (controlApp instanceof HTMLElement) controlApp.hidden = !unlocked;
  }

  // Fail closed before any asynchronous session or dashboard request can run.
  setControlAuthState(false);
  window.SniperPlugControlAuthGate = Object.freeze({
    lock: () => setControlAuthState(false),
    unlock: () => setControlAuthState(true),
    isUnlocked: () => document.documentElement.dataset.sniperplugControlAuth === 'unlocked',
  });

  // Lock is a local UI action first. Server logout still runs through the normal handler,
  // but a slow or failed request must never strand the password form behind the app shell.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-logout]') : null;
    if (target) setControlAuthState(false);
  }, true);

  // A BFCache restore can revive old DOM state without rerunning module initialization.
  // Force a normal reload so the password/session gate is evaluated again.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    setControlAuthState(false);
    window.location.reload();
  });

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

  async function syncControlAuth(details, response) {
    const action = controlAction(details.url);

    if (response.status === 401) {
      setControlAuthState(false);
      return;
    }

    if (action === 'session' && details.method === 'DELETE') {
      setControlAuthState(false);
      return;
    }

    if (action === 'session' && details.method === 'GET' && response.ok) {
      try {
        const session = await response.clone().json();
        if (session?.authenticated !== true) setControlAuthState(false);
      } catch {
        setControlAuthState(false);
      }
      return;
    }

    // A successful dashboard response proves both the owner session and protected API
    // path are valid. Only this point is allowed to reveal the application shell.
    if (action === 'dashboard' && response.ok) setControlAuthState(true);
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

    const action = controlAction(details.url);
    if (action === 'session' && details.method === 'DELETE') setControlAuthState(false);

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
      await syncControlAuth(details, response);
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
