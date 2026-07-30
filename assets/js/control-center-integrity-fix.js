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

(() => {
  const root = document.querySelector('[data-control-root]');
  const editor = document.querySelector('[data-draft-editor]');
  const bodyField = editor instanceof HTMLFormElement ? editor.elements.namedItem('body') : null;
  const rights = document.querySelector('[data-rights-confirm]');
  const status = document.querySelector('[data-global-status]');
  if (!(root instanceof HTMLElement) || !(editor instanceof HTMLFormElement) || !(bodyField instanceof HTMLTextAreaElement)) return;

  const actions = editor.querySelector('.editor-actions');
  const repair = document.createElement('button');
  repair.type = 'button';
  repair.className = 'btn ghost';
  repair.dataset.repairGuideMedia = '';
  repair.textContent = 'Repair media from Whop';
  repair.hidden = true;
  actions?.prepend(repair);

  let busy = false;

  function staleMediaWarning() {
    const body = String(bodyField.value || '');
    return /Media review required[\s\S]{0,500}(media storage is not connected|SNIPERPLUG_MEDIA|could not verify its free media budget)/i.test(body);
  }

  function sync() {
    const id = Number(editor.elements.namedItem('id')?.value || 0);
    repair.hidden = editor.hidden || !Number.isFinite(id) || id <= 0 || !staleMediaWarning();
    if (!busy) repair.disabled = false;
  }

  function show(message, state = 'ok') {
    if (!(status instanceof HTMLElement)) return;
    status.hidden = !message;
    status.textContent = message;
    status.dataset.type = state;
  }

  async function request(body) {
    const response = await fetch('/api/guide-media-repair', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Media repair failed (${response.status}).`);
    return data;
  }

  repair.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    const id = Number(editor.elements.namedItem('id')?.value || 0);
    if (!Number.isFinite(id) || id <= 0) return show('Open a valid Whop guide before repairing its media.', 'error');
    if (rights instanceof HTMLInputElement && !rights.checked) {
      return show('Confirm your republication rights before repairing imported media.', 'warning');
    }
    if (!window.confirm('Re-fetch this guide from its current Whop source and rebuild the generated media section? Your manually edited title, description, category, and featured setting stay preserved.')) return;

    busy = true;
    repair.disabled = true;
    repair.setAttribute('aria-busy', 'true');
    repair.textContent = 'Repairing media…';
    show('Re-fetching the current Whop lesson and rebuilding its media section…', 'ok');
    try {
      const output = await request({ guideId: id, rightsConfirmed: true });
      if (!output?.guide) throw new Error('SniperPlug repaired the source but could not reload the guide.');
      show('Media repaired from the current Whop source. Reloading the server-confirmed guide…', 'ok');
      window.location.replace(`${window.location.pathname}?guide=${id}&mediaRepaired=${Date.now()}`);
    } catch (error) {
      show(error.message, 'error');
      busy = false;
      repair.disabled = false;
      repair.removeAttribute('aria-busy');
      repair.textContent = 'Repair media from Whop';
    }
  });

  bodyField.addEventListener('input', sync);
  root.addEventListener('sniperplug:guide-loaded', sync);
  root.addEventListener('sniperplug:dashboard-refreshed', sync);
  new MutationObserver(sync).observe(editor, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
