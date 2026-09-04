(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;
  const sourceBrowser = root.querySelector('#source-browser');
  if (!(sourceBrowser instanceof HTMLElement)) return;
  if (sourceBrowser.querySelector('[data-browser-capture-helper]')) return;

  const helper = document.createElement('details');
  helper.className = 'manual-source browser-capture-helper';
  helper.dataset.browserCaptureHelper = 'true';
  helper.innerHTML = `
    <summary>Authorized browser capture for app-specific guides</summary>
    <div class="browser-capture-copy">
      <p>Use this only for a Whop app page you can already open normally. The helper reads the rendered guide on your device; it never copies Whop cookies, Better Content tokens, or hidden network responses.</p>
      <p><strong>Android:</strong> Firefox for Android + Tampermonkey can run the helper. Samsung Internet does not currently allow arbitrary user-installed scripts.</p>
      <label class="rights-check"><input type="checkbox" data-capture-rights><span>I own this content or have explicit permission to store and republish it on SniperPlug.</span></label>
      <div class="button-row">
        <button class="btn primary" type="button" data-create-capture-token>Generate 30-minute capture token</button>
        <a class="btn ghost" href="https://addons.mozilla.org/android/addon/tampermonkey/" target="_blank" rel="noopener">Get Tampermonkey</a>
      </div>
      <div class="browser-capture-token" data-capture-token-panel hidden>
        <strong>Private capture token</strong>
        <code data-capture-token></code>
        <div class="button-row">
          <button class="btn ghost" type="button" data-copy-capture-token>Copy token</button>
          <a class="btn primary" data-install-capture-helper target="_blank" rel="noopener">Install SniperPlug helper</a>
        </div>
        <small data-capture-expiry></small>
      </div>
      <p class="bulk-progress" data-capture-status role="status" aria-live="polite"></p>
    </div>
  `;

  const manual = sourceBrowser.querySelector('.manual-source');
  if (manual) manual.before(helper);
  else sourceBrowser.append(helper);

  const rights = helper.querySelector('[data-capture-rights]');
  const create = helper.querySelector('[data-create-capture-token]');
  const panel = helper.querySelector('[data-capture-token-panel]');
  const token = helper.querySelector('[data-capture-token]');
  const copy = helper.querySelector('[data-copy-capture-token]');
  const install = helper.querySelector('[data-install-capture-helper]');
  const expiry = helper.querySelector('[data-capture-expiry]');
  const status = helper.querySelector('[data-capture-status]');

  function setStatus(message, error = false) {
    status.textContent = String(message || '');
    status.dataset.type = error ? 'error' : 'ok';
  }

  async function requestToken() {
    if (!rights.checked) {
      setStatus('Confirm content rights before generating a capture token.', true);
      rights.focus();
      return;
    }
    const idle = create.textContent;
    create.disabled = true;
    create.textContent = 'Generating…';
    setStatus('');
    try {
      const response = await fetch('/api/capture-session', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ rightsConfirmed: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Capture token request failed (${response.status}).`);
      const capture = data.capture || {};
      token.textContent = String(capture.token || '');
      install.href = String(capture.helperUrl || '/sniperplug-capture.user.js');
      const when = Date.parse(String(capture.expiresAt || ''));
      expiry.textContent = Number.isFinite(when)
        ? `Expires ${new Date(when).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Keep this token private.`
        : 'Keep this token private.';
      panel.hidden = false;
      setStatus('Capture token ready. Install the helper in Firefox/Tampermonkey, open Make Money Here, then paste this token when the helper asks once.');
    } catch (error) {
      setStatus(error?.message || 'Could not create a capture token.', true);
    } finally {
      create.disabled = false;
      create.textContent = idle;
    }
  }

  async function copyToken() {
    const value = String(token.textContent || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Capture token copied.');
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(token);
      selection.removeAllRanges();
      selection.addRange(range);
      setStatus('Token selected. Use Copy from your browser menu.');
    }
  }

  create.addEventListener('click', requestToken);
  copy.addEventListener('click', copyToken);
})();
