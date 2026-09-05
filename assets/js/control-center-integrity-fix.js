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
  const bodyField = editor instanceof HTMLFormElement ? editor.elements.namedItem('body') : null;
  const globalStatus = document.querySelector('[data-global-status]');
  if (!(root instanceof HTMLElement) || !(editor instanceof HTMLFormElement) || !(bodyField instanceof HTMLTextAreaElement)) return;

  const actions = editor.querySelector('.editor-actions');
  if (!(actions instanceof HTMLElement)) return;

  const inlineStatus = document.createElement('div');
  inlineStatus.className = 'control-status media-repair-status';
  inlineStatus.dataset.mediaRepairStatus = '';
  inlineStatus.setAttribute('role', 'status');
  inlineStatus.setAttribute('aria-live', 'polite');
  inlineStatus.hidden = true;
  actions.before(inlineStatus);

  const repair = document.createElement('button');
  repair.type = 'button';
  repair.className = 'btn ghost';
  repair.dataset.repairGuideMedia = '';
  repair.textContent = 'Repair media from Whop';
  repair.hidden = true;
  actions.prepend(repair);

  let busy = false;

  function staleMediaWarning() {
    return /(?:Media|Attachment) review required/i.test(String(bodyField.value || ''));
  }

  function sync() {
    const id = Number(editor.elements.namedItem('id')?.value || 0);
    repair.hidden = editor.hidden || !Number.isFinite(id) || id <= 0 || !staleMediaWarning();
    if (!busy) repair.disabled = false;
  }

  function setStatus(element, message, state) {
    if (!(element instanceof HTMLElement)) return;
    element.hidden = !message;
    element.textContent = message;
    element.dataset.type = state;
  }

  function show(message, state = 'ok') {
    setStatus(inlineStatus, message, state);
    setStatus(globalStatus, message, state);
  }

  function deploymentSuffix(details) {
    const deployment = details?.deployment || {};
    const commit = String(deployment.commit || '').trim().slice(0, 8);
    const branch = String(deployment.branch || '').trim();
    if (!commit && !branch) return '';
    return ` Active Pages deployment: ${branch ? `${branch} · ` : ''}${commit || 'commit unavailable'}.`;
  }

  function errorMessage(error) {
    const details = error?.details || {};
    const suffix = deploymentSuffix(details);
    if (details.code === 'media_storage_not_connected') {
      return `${error.message}${suffix}`;
    }
    if (details.code === 'media_repair_incomplete') {
      return `${error.message}${suffix}`;
    }
    return `${error?.message || 'Media repair failed.'}${suffix}`;
  }

  function applyGuide(guide) {
    if (!guide || typeof guide !== 'object') return false;
    const detail = { guide, handled: false };
    root.dispatchEvent(new CustomEvent('sniperplug:guide-media-repaired', { detail }));
    if (!detail.handled) {
      show('SniperPlug received the repaired guide but could not refresh the editor safely. Reload this page before making more changes.', 'error');
    }
    return detail.handled;
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
    if (!response.ok) {
      const error = new Error(data.error || `Media repair failed (${response.status}).`);
      error.status = response.status;
      error.details = data.details || null;
      throw error;
    }
    return data;
  }

  function finish() {
    busy = false;
    repair.disabled = false;
    repair.removeAttribute('aria-busy');
    repair.textContent = 'Repair media from Whop';
    sync();
  }

  repair.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    const id = Number(editor.elements.namedItem('id')?.value || 0);
    if (!Number.isFinite(id) || id <= 0) return show('Open a valid Whop guide before repairing its media.', 'error');
    if (!window.confirm('Confirm that you own this content or have permission to republish it, then re-fetch the current Whop item and rebuild its generated media section?')) return;

    busy = true;
    repair.disabled = true;
    repair.setAttribute('aria-busy', 'true');
    repair.textContent = 'Repairing media…';
    show('Checking this exact deployment, re-fetching Whop, and copying the current media into R2…', 'ok');
    try {
      const output = await request({ guideId: id, rightsConfirmed: true });
      if (!output?.guide) throw new Error('SniperPlug repaired the source but could not reload the guide.');
      const applied = applyGuide(output.guide);
      const suffix = deploymentSuffix({ deployment: output.deployment });
      if (applied) show(`Media repaired. The guide now contains the server-confirmed media copy.${suffix}`, 'ok');
      finish();
    } catch (error) {
      const newestGuide = error?.details?.guide;
      const applied = newestGuide ? applyGuide(newestGuide) : null;
      const reloadSuffix = applied === false
        ? ' The server returned a newer guide, but this page could not refresh it safely. Reload before making more changes.'
        : '';
      show(`${errorMessage(error)}${reloadSuffix}`, 'error');
      finish();
    }
  });

  bodyField.addEventListener('input', sync);
  root.addEventListener('sniperplug:guide-loaded', () => {
    inlineStatus.hidden = true;
    sync();
  });
  root.addEventListener('sniperplug:dashboard-refreshed', sync);
  new MutationObserver(sync).observe(editor, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
