(() => {
  const preview = document.querySelector('[data-post-preview]');
  if (!(preview instanceof HTMLElement)) return;

  function closePreview(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    preview.hidden = true;
    preview.setAttribute('aria-hidden', 'true');
    const body = preview.querySelector('[data-preview-body]');
    if (body) body.replaceChildren();
    document.body.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow');
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-close-preview]')) return closePreview(event);
    if (target === preview) closePreview(event);
  }, true);

  document.addEventListener('pointerup', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-close-preview]')) closePreview(event);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !preview.hidden) closePreview(event);
  }, true);

  const observer = new MutationObserver(() => {
    if (preview.hidden) {
      preview.setAttribute('aria-hidden', 'true');
      document.body.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('overflow');
    } else {
      preview.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  });
  observer.observe(preview, { attributes: true, attributeFilter: ['hidden'] });
})();

(() => {
  const root = document.querySelector('[data-control-root]');
  const editor = document.querySelector('[data-draft-editor]');
  const button = document.querySelector('[data-return-draft]');
  const status = document.querySelector('[data-global-status]');
  if (!(root instanceof HTMLElement) || !(editor instanceof HTMLFormElement) || !(button instanceof HTMLButtonElement)) return;

  let busy = false;

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `SniperPlug request failed (${response.status}).`);
    return data;
  }

  function show(message, state = 'ok') {
    if (!(status instanceof HTMLElement)) return;
    status.hidden = !message;
    status.textContent = message;
    status.dataset.type = state;
  }

  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-return-draft]') : null;
    if (target !== button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy || button.disabled) return;

    const id = Number(editor.elements.namedItem('id')?.value || 0);
    if (!Number.isFinite(id) || id <= 0) return show('Open a valid guide before returning it to draft.', 'error');

    busy = true;
    const idleLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Returning to draft…';
    show('Confirming the newest saved guide version…', 'ok');

    try {
      const detail = await request(`/api/control?action=guide-detail&id=${encodeURIComponent(id)}`);
      const expectedUpdatedAt = String(detail?.guide?.updatedAt || '').trim();
      if (!expectedUpdatedAt) throw new Error('SniperPlug could not confirm the newest guide version. Refresh and try again.');
      await request('/api/control?action=guide-status', {
        method: 'POST',
        body: JSON.stringify({ id, status: 'draft', expectedUpdatedAt }),
      });
      show('Guide returned to draft. Reloading the confirmed server state…', 'ok');
      window.location.replace(`${window.location.pathname}?guide=${id}&fresh=${Date.now()}`);
    } catch (error) {
      show(error.message, 'error');
      busy = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = idleLabel;
    }
  }, true);
})();