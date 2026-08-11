(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;

  const url = new URL(window.location.href);
  const callbackState = String(url.searchParams.get('whop') || '').trim();
  if (!['connected', 'error'].includes(callbackState)) return;
  const callbackMessage = String(url.searchParams.get('message') || '').trim().slice(0, 180);

  url.searchParams.delete('whop');
  url.searchParams.delete('message');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);

  const globalStatus = root.querySelector('[data-global-status]');
  const loginMessage = root.querySelector('[data-login-message]');
  let settled = false;

  function setMessage(element, message, type = 'error') {
    if (!(element instanceof HTMLElement)) return;
    element.textContent = String(message || '');
    element.dataset.type = type;
    element.hidden = !message;
  }

  function clearCallbackMessages() {
    setMessage(loginMessage, '');
    if (globalStatus instanceof HTMLElement && globalStatus.dataset.callbackFlash === 'true') setMessage(globalStatus, '');
  }

  if (callbackState === 'error') {
    setMessage(loginMessage, callbackMessage || 'Whop login failed.', 'error');
  }

  root.addEventListener('sniperplug:dashboard-refreshed', () => {
    if (settled) return;
    const whopState = root.querySelector('[data-whop-state]')?.dataset?.state || '';

    if (whopState === 'connected') {
      clearCallbackMessages();
      if (callbackState === 'connected' && globalStatus instanceof HTMLElement) {
        globalStatus.dataset.callbackFlash = 'true';
        setMessage(globalStatus, 'Whop connected and verified successfully.', 'ok');
      }
      settled = true;
      return;
    }

    if (callbackState === 'error' && whopState === 'disconnected') {
      setMessage(loginMessage, '');
      if (globalStatus instanceof HTMLElement) {
        globalStatus.dataset.callbackFlash = 'true';
        setMessage(globalStatus, callbackMessage || 'Whop login failed.', 'error');
      }
      settled = true;
    }
  });
})();
