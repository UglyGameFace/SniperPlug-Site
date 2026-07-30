(() => {
  if (window.__sniperplugApiFetchGuardInstalled) return;
  window.__sniperplugApiFetchGuardInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const READ_TIMEOUT_MS = 45_000;
  const WRITE_TIMEOUT_MS = 120_000;

  function requestDetails(input, options = {}) {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input), window.location.href);
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    const signal = options.signal || request?.signal || null;
    return { url, method, signal };
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
      return await nativeFetch(input, { ...options, signal: controller.signal });
    } catch (error) {
      if (timedOut && !callerAborted) return timeoutResponse(details.method, timeoutMs);
      throw error;
    } finally {
      window.clearTimeout(timer);
      if (details.signal) details.signal.removeEventListener('abort', forwardAbort);
    }
  };
})();
