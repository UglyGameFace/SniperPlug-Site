(() => {
  const root = document.querySelector('[data-control-root]');
  const editor = document.querySelector('[data-draft-editor]');
  const status = document.querySelector('[data-editor-status]');
  if (!(root instanceof HTMLElement) || !(editor instanceof HTMLFormElement) || !(status instanceof HTMLElement)) return;

  const editableNames = ['title', 'description', 'category', 'body', 'featured', 'attachmentsResolved'];
  const saveButton = editor.querySelector('button[type="submit"]');
  const publishButton = editor.querySelector('[data-publish-guide]');
  const rejectButton = editor.querySelector('[data-reject-guide]');
  const returnButton = editor.querySelector('[data-return-draft]');
  const openPublished = editor.querySelector('[data-open-public]');
  const statusFilter = root.querySelector('[data-draft-status-filter]');
  const actions = editor.querySelector('.editor-actions');
  const heading = editor.querySelector('.editor-heading');

  const style = document.createElement('style');
  style.dataset.sniperplugPublishFeedback = '';
  style.textContent = `
    .editor-publish-state{display:flex;align-items:center;justify-content:space-between;gap:.9rem;padding:.9rem 1rem;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.035)}
    .editor-publish-state>div{display:grid;gap:.22rem;min-width:0}.editor-publish-state strong{font-size:1rem;color:var(--text)}.editor-publish-state span{color:var(--muted);line-height:1.45}
    .editor-publish-state[data-state="draft"]{border-color:rgba(255,209,102,.28);background:rgba(255,209,102,.055)}
    .editor-publish-state[data-state="published"]{border-color:rgba(104,227,132,.42);background:rgba(104,227,132,.08)}
    .editor-publish-state[data-state="published"] strong{color:var(--brand)}
    .editor-publish-state[data-state="rejected"]{border-color:rgba(255,105,97,.34);background:rgba(255,105,97,.065)}
    .editor-action-status{margin:.1rem 0 0}.editor-lock-message{margin:.1rem 0;padding:.78rem .9rem;border:1px solid rgba(255,209,102,.32);border-radius:14px;background:rgba(255,209,102,.07);color:#ffe39a}
    .editor-heading [data-editor-status]{display:inline-flex;align-items:center;min-height:1.8rem;padding:.3rem .58rem;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(255,255,255,.045);font-weight:900;letter-spacing:.02em}
    .draft-editor[data-guide-status="published"] input:disabled,.draft-editor[data-guide-status="published"] textarea:disabled,.draft-editor[data-guide-status="published"] select:disabled{opacity:.62;cursor:not-allowed;background:rgba(13,20,33,.6);border-color:rgba(104,227,132,.16)}
    .draft-editor[data-guide-status="rejected"] input:disabled,.draft-editor[data-guide-status="rejected"] textarea:disabled,.draft-editor[data-guide-status="rejected"] select:disabled{opacity:.56;cursor:not-allowed}
    .draft-editor[data-guide-status="published"] .exact-preview{opacity:.82}
    @media(max-width:620px){.editor-publish-state{display:grid}.editor-publish-state .btn{width:100%;text-align:center}}
  `;
  document.head.append(style);

  const statePanel = document.createElement('section');
  statePanel.className = 'editor-publish-state';
  statePanel.dataset.editorPublishState = '';
  statePanel.dataset.state = 'draft';
  statePanel.setAttribute('aria-live', 'polite');
  const stateCopyWrap = document.createElement('div');
  const stateTitle = document.createElement('strong');
  const stateCopy = document.createElement('span');
  stateCopyWrap.append(stateTitle, stateCopy);
  statePanel.append(stateCopyWrap);
  if (openPublished instanceof HTMLAnchorElement) statePanel.append(openPublished);
  heading?.after(statePanel);

  const actionStatus = document.createElement('p');
  actionStatus.className = 'control-status editor-action-status';
  actionStatus.dataset.editorActionStatus = '';
  actionStatus.setAttribute('role', 'status');
  actionStatus.setAttribute('aria-live', 'assertive');
  actionStatus.hidden = true;
  actions?.before(actionStatus);

  const message = document.createElement('p');
  message.className = 'editor-lock-message';
  message.setAttribute('role', 'status');
  message.hidden = true;
  actions?.before(message);

  let cleanSnapshot = '';
  let currentId = '';
  let dirty = false;
  let backupTimer = null;
  let loading = false;

  function currentStatus() {
    return status.textContent.trim().toLowerCase();
  }

  function setActionStatus(text, type = 'ok') {
    actionStatus.textContent = String(text || '');
    actionStatus.dataset.type = type;
    actionStatus.hidden = !text;
  }

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

  function syncStatusPanel() {
    const current = currentStatus();
    const normalized = ['draft', 'published', 'rejected'].includes(current) ? current : 'draft';
    editor.dataset.guideStatus = normalized;
    statePanel.dataset.state = normalized;
    status.textContent = normalized === 'published' ? 'Published' : normalized === 'rejected' ? 'Rejected' : 'Draft';

    if (normalized === 'published') {
      stateTitle.textContent = 'Published and confirmed';
      stateCopy.textContent = 'This guide is now available in Private Guides. Editing is locked so a live guide cannot be changed accidentally. Use Edit / unpublish before making changes.';
    } else if (normalized === 'rejected') {
      stateTitle.textContent = 'Rejected and private';
      stateCopy.textContent = 'This guide is not published. Return it to draft before editing or republishing it.';
    } else {
      stateTitle.textContent = 'Draft · not published';
      stateCopy.textContent = 'Changes here are private. Save the draft first, then publish when the content is ready.';
    }

    if (saveButton instanceof HTMLButtonElement) saveButton.hidden = normalized !== 'draft';
    if (publishButton instanceof HTMLButtonElement) publishButton.hidden = normalized !== 'draft';
    if (rejectButton instanceof HTMLButtonElement) rejectButton.hidden = normalized === 'published' || normalized === 'rejected';
    if (returnButton instanceof HTMLButtonElement) {
      returnButton.hidden = normalized === 'draft';
      returnButton.textContent = normalized === 'published' ? 'Edit / unpublish' : 'Return to draft';
    }
    if (openPublished instanceof HTMLAnchorElement) {
      openPublished.hidden = normalized !== 'published';
      openPublished.textContent = 'View published guide';
    }
  }

  function syncLockState() {
    const current = currentStatus();
    const editable = current === 'draft';
    for (const name of editableNames) {
      const field = editor.elements.namedItem(name);
      if (field instanceof HTMLElement) field.toggleAttribute('disabled', !editable);
    }
    if (saveButton instanceof HTMLButtonElement) saveButton.disabled = !editable;
    syncStatusPanel();
    if (!dirty) message.hidden = true;
  }

  function renderDirtyState() {
    editor.dataset.dirty = dirty ? 'true' : 'false';
    if (dirty) {
      message.hidden = false;
      message.textContent = 'Unsaved changes are protected locally. Save this draft before publishing, switching guides, rejecting, or locking.';
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
    if (loading || editor.hidden || currentStatus() !== 'draft') return;
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
    setActionStatus('Saving draft and validating the exact content…', 'ok');
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const publish = target.closest('[data-publish-guide]');
    if (publish) {
      if (dirty) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActionStatus('Not published. Save your current changes first so the version you reviewed is exactly the version that goes live.', 'warning');
        if (saveButton instanceof HTMLButtonElement) saveButton.focus({ preventScroll: true });
        return;
      }
      setActionStatus('Publishing and waiting for server confirmation…', 'ok');
      return;
    }

    const risky = target.closest('.draft-item, [data-refresh-dashboard], [data-logout], [data-whop-switch], [data-whop-disconnect], [data-reject-guide], [data-return-draft]');
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
      const current = currentStatus();
      if (mode === 'saved') {
        markClean();
        setActionStatus('Draft saved. It is still private and has not been published yet.', 'ok');
      } else if (mode === 'status') {
        dirty = false;
        clearRecovery();
        markClean({ clearBackup: false });
        if (current === 'published') {
          setActionStatus('Published successfully. SniperPlug confirmed the guide is now available in Private Guides.', 'ok');
          if (statusFilter instanceof HTMLSelectElement && statusFilter.value !== 'published') {
            statusFilter.value = 'published';
            statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else if (current === 'draft') {
          setActionStatus('Guide returned to draft. It is no longer published, and editing is unlocked.', 'warning');
          if (statusFilter instanceof HTMLSelectElement && statusFilter.value !== 'draft') {
            statusFilter.value = 'draft';
            statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          setActionStatus('Guide rejected and kept private.', 'warning');
        }
      } else {
        setActionStatus('', 'ok');
        restoreRecoveryIfAvailable();
      }
      syncLockState();
    });
  });

  window.SniperPlugDraftSafety = {
    confirmDiscard,
    isDirty: () => dirty,
    markClean,
    showEditorStatus: setActionStatus,
  };
  syncLockState();
})();

(() => {
  const version = '20260905.1';
  if (!document.querySelector('link[data-control-recovery]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `/assets/css/control-center-recovery.css?v=${version}`;
    style.dataset.controlRecovery = '';
    document.head.append(style);
  }
  for (const [name, src] of [
    ['controlNetworkGuard', `/assets/js/control-center-network-guard.js?v=${version}`],
    ['controlDecisionLock', `/assets/js/control-center-decision-lock.js?v=${version}`],
    ['controlRecovery', `/assets/js/control-center-recovery.js?v=${version}`],
    ['controlBulkStatus', `/assets/js/control-center-bulk-status.js?v=${version}`],
    ['controlBrowserCompat', `/assets/js/control-center-browser-compat.js?v=${version}`],
    ['controlPostHistoryFix', `/assets/js/control-center-post-history-fix.js?v=${version}`],
    ['controlBulkReset', `/assets/js/control-center-bulk-reset.js?v=${version}`],
  ]) {
    const selector = `script[data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
    if (document.querySelector(selector)) continue;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset[name] = '';
    document.body.append(script);
  }
})();