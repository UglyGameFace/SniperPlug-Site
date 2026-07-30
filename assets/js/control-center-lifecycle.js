(() => {
  const root = document.querySelector('[data-control-root]');
  const editor = document.querySelector('[data-draft-editor]');
  const status = document.querySelector('[data-editor-status]');
  if (!(root instanceof HTMLElement) || !(editor instanceof HTMLFormElement) || !(status instanceof HTMLElement)) return;

  const editableNames = ['title', 'description', 'category', 'body', 'featured', 'attachmentsResolved'];
  const saveButton = editor.querySelector('button[type="submit"]');
  const message = document.createElement('p');
  message.className = 'editor-lock-message';
  message.setAttribute('role', 'status');
  message.hidden = true;
  editor.querySelector('.editor-actions')?.before(message);

  let cleanSnapshot = '';
  let currentId = '';
  let dirty = false;
  let backupTimer = null;
  let loading = false;

  function fieldValue(name) {
    const field = editor.elements.namedItem(name);
    if (field instanceof HTMLInputElement && field.type === 'checkbox') return field.checked;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) return field.value;
    return '';
  }

  function values() {
    return Object.fromEntries(editableNames.map((name) => [name, fieldValue(name)]));
  }

  function snapshot() {
    return JSON.stringify(values());
  }

  function backupKey(id = currentId) {
    return id ? `sniperplug:draft-recovery:${id}` : '';
  }

  function setField(name, value) {
    const field = editor.elements.namedItem(name);
    if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = Boolean(value);
    else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) field.value = String(value ?? '');
  }

  function clearRecovery(id = currentId) {
    try { if (id) localStorage.removeItem(backupKey(id)); } catch { /* browser storage may be unavailable */ }
  }

  function syncLockState() {
    const current = status.textContent.trim().toLowerCase();
    const editable = current === 'draft';
    for (const name of editableNames) {
      const field = editor.elements.namedItem(name);
      if (field instanceof HTMLElement) field.toggleAttribute('disabled', !editable);
    }
    if (saveButton instanceof HTMLButtonElement) saveButton.disabled = !editable;
    if (dirty) return;
    message.hidden = editable || editor.hidden;
    message.textContent = current === 'published'
      ? 'This guide is live. Press Return to draft before changing its content.'
      : current === 'rejected'
        ? 'This guide is rejected and private. Press Return to draft before editing it.'
        : '';
  }

  function renderDirtyState() {
    editor.dataset.dirty = dirty ? 'true' : 'false';
    if (dirty) {
      message.hidden = false;
      message.textContent = 'Unsaved changes are protected locally. Save before switching guides, refreshing, publishing, rejecting, or locking.';
      message.dataset.state = 'warning';
    } else {
      delete message.dataset.state;
      syncLockState();
    }
  }

  function saveRecoveryCopy() {
    clearTimeout(backupTimer);
    if (!dirty || !currentId) return;
    backupTimer = setTimeout(() => {
      try {
        localStorage.setItem(backupKey(), JSON.stringify({ values: values(), savedAt: new Date().toISOString() }));
      } catch { /* browser storage may be unavailable */ }
    }, 250);
  }

  function updateDirty() {
    if (loading || editor.hidden || status.textContent.trim().toLowerCase() !== 'draft') return;
    dirty = snapshot() !== cleanSnapshot;
    renderDirtyState();
    saveRecoveryCopy();
  }

  function markClean({ clearBackup = true } = {}) {
    currentId = String(editor.elements.namedItem('id')?.value || '');
    cleanSnapshot = snapshot();
    dirty = false;
    if (clearBackup) clearRecovery();
    renderDirtyState();
  }

  function restoreRecoveryIfAvailable() {
    currentId = String(editor.elements.namedItem('id')?.value || '');
    if (!currentId) return markClean();
    let backup = null;
    try { backup = JSON.parse(localStorage.getItem(backupKey()) || 'null'); } catch { backup = null; }
    const base = snapshot();
    const recovered = backup?.values ? JSON.stringify(backup.values) : '';
    if (!recovered || recovered === base) return markClean();
    if (!window.confirm(`A locally recovered unsaved version of this guide exists from ${backup.savedAt ? new Date(backup.savedAt).toLocaleString() : 'an earlier session'}. Restore it?`)) {
      clearRecovery();
      return markClean();
    }
    loading = true;
    for (const [name, value] of Object.entries(backup.values)) setField(name, value);
    loading = false;
    cleanSnapshot = base;
    dirty = true;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    renderDirtyState();
  }

  function confirmDiscard() {
    return !dirty || window.confirm('This guide has unsaved changes. Continue without saving? A local recovery copy will remain available.');
  }

  editor.addEventListener('input', updateDirty);
  editor.addEventListener('change', updateDirty);
  editor.addEventListener('submit', () => {
    message.hidden = false;
    message.textContent = 'Saving draft…';
    message.dataset.state = 'working';
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const risky = target.closest('.draft-item, [data-refresh-dashboard], [data-logout], [data-whop-disconnect], [data-publish-guide], [data-reject-guide], [data-return-draft]');
    const navigation = target.closest('a[href]');
    if ((risky || (navigation && !navigation.closest('[data-open-public]'))) && !confirmDiscard()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  root.addEventListener('sniperplug:guide-loaded', (event) => {
    loading = true;
    syncLockState();
    const mode = event.detail?.mode || 'select';
    queueMicrotask(() => {
      loading = false;
      if (mode === 'saved') markClean();
      else if (mode === 'status') {
        dirty = false;
        clearRecovery();
        markClean({ clearBackup: false });
      } else restoreRecoveryIfAvailable();
    });
  });
  window.SniperPlugDraftSafety = { confirmDiscard, isDirty: () => dirty, markClean };
  syncLockState();
})();
