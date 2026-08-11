(() => {
  const root = document.querySelector('[data-control-root]');
  const panel = document.querySelector('[data-whop-backup-panel]');
  if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
  if (root.dataset.whopBackupMounted === 'true') return;
  root.dataset.whopBackupMounted = 'true';

  const $ = (selector, parent = panel) => parent.querySelector(selector);
  const elements = {
    app: root.querySelector('[data-control-app]'),
    status: $('[data-backup-status]'),
    scope: $('[data-backup-scope]'),
    sourceField: $('[data-backup-source-field]'),
    source: $('[data-backup-source]'),
    groupField: $('[data-backup-group-field]'),
    group: $('[data-backup-group]'),
    create: $('[data-create-whop-backup]'),
    reset: $('[data-reset-whop-importer]'),
    resetOptions: $('.whop-reset-options'),
    refresh: $('[data-refresh-backups]'),
    history: $('[data-backup-history]'),
    empty: $('[data-backup-empty]'),
    includePublished: $('[data-reset-published]'),
    resync: $('[data-reset-resync]'),
    disconnect: $('[data-reset-disconnect]'),
    dialog: $('[data-backup-dialog]'),
    dialogTitle: $('[data-backup-dialog-title]'),
    dialogCopy: $('[data-backup-dialog-copy]'),
    dialogCounts: $('[data-backup-dialog-counts]'),
    phrase: $('[data-backup-phrase]'),
    confirmation: $('[data-backup-confirmation]'),
    confirm: $('[data-backup-confirm]'),
    cancel: $('[data-backup-cancel]'),
  };

  const state = {
    overview: null,
    busy: false,
    pending: null,
    loaded: false,
  };

  function syncActionPresentation() {
    if (!(elements.action instanceof HTMLSelectElement) || !(elements.continue instanceof HTMLButtonElement)) return;
    const groupSelected = selectedScope().scope === 'group';
    const resetOption = elements.action.querySelector('option[value="reset"]');
    if (resetOption) resetOption.disabled = groupSelected;
    if (groupSelected && elements.action.value === 'reset') elements.action.value = 'backup';
    if (elements.resetOptions instanceof HTMLElement) {
      elements.resetOptions.hidden = groupSelected || elements.action.value !== 'reset';
    }
    elements.continue.textContent = elements.action.value === 'reset'
      ? 'Review safe clear & resync'
      : groupSelected
        ? 'Back up whole group'
        : 'Create backup';
  }

  function structureRecoveryPanel() {
    if (panel.dataset.structured === 'true') return;
    panel.dataset.structured = 'true';
    const app = elements.app;
    if (app instanceof HTMLElement) app.append(panel);

    const dialog = elements.dialog;
    const content = [...panel.children].filter((child) => child !== dialog);
    const workflow = document.createElement('details');
    workflow.className = 'whop-recovery-workflow';
    workflow.dataset.recoveryWorkflow = 'true';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span><strong>Backup & recovery</strong><small>Open only when you need a backup, restore, or safe clear-and-resync.</small></span><b>Open safety tools</b>';
    const body = document.createElement('div');
    body.className = 'whop-recovery-body';
    for (const child of content) body.append(child);
    workflow.append(summary, body);
    panel.replaceChildren(workflow);
    if (dialog) panel.append(dialog);

    const heading = panel.querySelector('.panel-head h2');
    const intro = panel.querySelector('.panel-head p');
    const eyebrow = panel.querySelector('.panel-head .eyebrow');
    if (heading) heading.textContent = 'One safety center';
    if (intro) intro.textContent = 'Choose one source, a whole saved group, or the entire importer, then choose the recovery action.';
    if (eyebrow) eyebrow.textContent = 'Safety · Backup & recovery';
    if (elements.refresh) elements.refresh.textContent = 'Refresh history';

    const actionRow = document.createElement('div');
    actionRow.className = 'whop-recovery-action';
    const label = document.createElement('label');
    label.innerHTML = '<span>What do you need to do?</span>';
    const select = document.createElement('select');
    select.dataset.backupAction = 'true';
    select.innerHTML = '<option value="backup">Create a recovery backup</option><option value="reset">Clear & resync safely (backup included)</option>';
    label.append(select);
    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'btn primary';
    continueButton.dataset.backupContinue = 'true';
    continueButton.textContent = 'Create backup';
    elements.action = select;
    elements.continue = continueButton;
    actionRow.append(label, continueButton);

    const resetOptions = elements.resetOptions;
    if (resetOptions) {
      resetOptions.before(actionRow);
      const advanced = document.createElement('details');
      advanced.className = 'whop-recovery-advanced';
      advanced.innerHTML = '<summary>Advanced clear/reset options</summary>';
      for (const child of [...resetOptions.children]) {
        if (!child.classList?.contains('button-row')) advanced.append(child);
      }
      resetOptions.replaceChildren(advanced);
      resetOptions.hidden = true;
    }
    if (elements.create) elements.create.hidden = true;
    if (elements.reset) elements.reset.hidden = true;

    select.addEventListener('change', () => {
      syncActionPresentation();
      syncControls();
    });
    continueButton.addEventListener('click', () => {
      if (select.value === 'reset') previewReset();
      else createManualBackup();
    });
    workflow.addEventListener('toggle', () => {
      const stateLabel = summary.querySelector('b');
      if (stateLabel) stateLabel.textContent = workflow.open ? 'Close safety tools' : 'Open safety tools';
      if (workflow.open && !state.loaded) loadOverview();
    });
  }

  async function requestJson(action, options = {}) {
    const response = await fetch(`/api/whop-backups?action=${encodeURIComponent(action)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `Whop backup request failed (${response.status}).`);
      error.status = response.status;
      error.details = data.details || null;
      throw error;
    }
    return data;
  }

  function post(action, body) {
    return requestJson(action, { method: 'POST', body: JSON.stringify(body || {}) });
  }

  function show(message, type = 'ok') {
    if (!elements.status) return;
    elements.status.textContent = String(message || '');
    elements.status.dataset.type = type;
    elements.status.hidden = !message;
  }

  function setBusy(busy, label = '') {
    state.busy = busy;
    for (const button of [elements.create, elements.reset, elements.refresh, elements.confirm, elements.continue]) {
      if (!(button instanceof HTMLButtonElement)) continue;
      if (busy) {
        if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      } else {
        if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
        delete button.dataset.idleLabel;
        button.removeAttribute('aria-busy');
      }
    }
    if (busy && label && elements.confirm instanceof HTMLButtonElement && !elements.dialog?.hidden) elements.confirm.textContent = label;
    syncControls();
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${Math.round(bytes)} B`;
  }

  function formatDate(value) {
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown time';
  }

  function selectedScope() {
    const requested = String(elements.scope?.value || 'source');
    if (requested === 'group') {
      return { scope: 'group', groupKey: String(elements.group?.value || '') };
    }
    if (requested === 'all') return { scope: 'all', experienceId: null };
    return { scope: 'source', experienceId: String(elements.source?.value || '') };
  }

  function countsMarkup(counts = {}) {
    const values = [
      ['Sources', counts.sources || 0],
      ['Saved posts', counts.posts || 0],
      ['Current posts', counts.currentPosts || 0],
      ['Stale posts', counts.stalePosts || 0],
      ['Drafts', counts.drafts || 0],
      ['Published', counts.published || 0],
      ['Rejected', counts.rejected || 0],
      ['Course videos', counts.courseVideos || 0],
      ['Media references', counts.mediaReferences || 0],
    ];
    return values.map(([label, value]) => `<span><strong>${Number(value || 0).toLocaleString()}</strong>${label}</span>`).join('');
  }

  function renderSources() {
    if (!(elements.source instanceof HTMLSelectElement)) return;
    const current = elements.source.value;
    const sources = state.overview?.sources || [];
    elements.source.innerHTML = sources.length
      ? sources.map((source) => `<option value="${escapeHtml(source.experienceId)}">${escapeHtml(source.label)} · …${escapeHtml(source.experienceId.slice(-6))}</option>`).join('')
      : '<option value="">No saved Whop sources</option>';
    if (sources.some((source) => source.experienceId === current)) elements.source.value = current;
  }

  function renderGroups() {
    if (!(elements.group instanceof HTMLSelectElement)) return;
    const current = elements.group.value;
    const groups = state.overview?.groups || [];
    elements.group.innerHTML = groups.length
      ? groups.map((group) => `<option value="${escapeHtml(group.groupKey)}">${escapeHtml(group.label)} · ${Number(group.sourceCount || 0).toLocaleString()} saved source${Number(group.sourceCount || 0) === 1 ? '' : 's'}</option>`).join('')
      : '<option value="">No saved Whop groups</option>';
    if (groups.some((group) => group.groupKey === current)) elements.group.value = current;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderHistory() {
    const backups = state.overview?.backups || [];
    if (elements.empty) elements.empty.hidden = backups.length > 0;
    if (!(elements.history instanceof HTMLElement)) return;
    elements.history.innerHTML = backups.map((backup) => `
      <article class="whop-backup-row" data-backup-id="${escapeHtml(backup.backupId)}">
        <div class="whop-backup-main">
          <div><strong>${escapeHtml(backup.label)}</strong><span>${escapeHtml(backup.scope === 'source' ? `One source · …${String(backup.experienceId || '').slice(-6)}` : 'Entire importer')}</span></div>
          <span class="state-pill" data-state="${escapeHtml(backup.status)}">${escapeHtml(backup.status)}</span>
        </div>
        <div class="whop-backup-meta">
          <span>${formatDate(backup.createdAt)}</span>
          <span>${formatBytes(backup.payloadBytes)}</span>
          <span>${Number(backup.counts?.guides || 0)} guides</span>
          <span>${Number(backup.counts?.mediaReferences || 0)} media refs</span>
        </div>
        ${backup.status === 'verified' ? `
          <div class="button-row">
            <a class="btn ghost" href="${escapeHtml(backup.downloadUrl)}" data-backup-download>Download JSON</a>
            <button class="btn ghost" type="button" data-backup-restore="${escapeHtml(backup.backupId)}">Restore</button>
            <button class="decision disapprove" type="button" data-backup-delete="${escapeHtml(backup.backupId)}">Delete backup</button>
          </div>` : `
          <div class="whop-backup-incomplete">
            <small>This incomplete backup cannot be downloaded, restored, or used for reset.</small>
            <button class="decision disapprove" type="button" data-backup-delete="${escapeHtml(backup.backupId)}">Delete incomplete backup</button>
          </div>`}
        ${backup.restoredAt ? `<small>Last restored ${escapeHtml(formatDate(backup.restoredAt))} · ${Number(backup.restoreCount || 0)} restore(s)</small>` : ''}
      </article>
    `).join('');
  }

  function syncControls() {
    const scope = selectedScope();
    const sourceRequired = scope.scope === 'source';
    const groupRequired = scope.scope === 'group';
    if (elements.sourceField instanceof HTMLElement) elements.sourceField.hidden = !sourceRequired;
    if (elements.groupField instanceof HTMLElement) elements.groupField.hidden = !groupRequired;
    if (elements.source instanceof HTMLSelectElement) elements.source.disabled = state.busy || !sourceRequired;
    if (elements.group instanceof HTMLSelectElement) elements.group.disabled = state.busy || !groupRequired;
    if (elements.resync instanceof HTMLInputElement) {
      elements.resync.disabled = state.busy || !sourceRequired;
      if (!sourceRequired) elements.resync.checked = false;
    }
    for (const input of [elements.includePublished, elements.disconnect]) {
      if (!(input instanceof HTMLInputElement)) continue;
      input.disabled = state.busy || groupRequired;
      if (groupRequired) input.checked = false;
    }
    const valid = sourceRequired ? Boolean(scope.experienceId) : groupRequired ? Boolean(scope.groupKey) : true;
    if (elements.create instanceof HTMLButtonElement) elements.create.disabled = state.busy || !valid;
    if (elements.reset instanceof HTMLButtonElement) elements.reset.disabled = state.busy || !valid || groupRequired;
    if (elements.refresh instanceof HTMLButtonElement) elements.refresh.disabled = state.busy;
    if (elements.continue instanceof HTMLButtonElement) elements.continue.disabled = state.busy || !valid;
    if (elements.action instanceof HTMLSelectElement) elements.action.disabled = state.busy;
    syncActionPresentation();
    if (elements.confirm instanceof HTMLButtonElement) {
      const phrase = String(elements.phrase?.textContent || '');
      elements.confirm.disabled = state.busy || !state.pending || String(elements.confirmation?.value || '').trim() !== phrase;
    }
  }

  async function loadOverview({ quiet = false, force = false } = {}) {
    if (state.busy && !force) return;
    try {
      if (!quiet) show('Loading verified Whop backups…', 'working');
      state.overview = await requestJson('overview');
      state.loaded = true;
      renderSources();
      renderGroups();
      renderHistory();
      syncControls();
      if (!quiet) show(`Backup history ready. ${state.overview.backups.filter((backup) => backup.status === 'verified').length} verified backup(s) available.`, 'ok');
    } catch (error) {
      if (error.status === 401) return;
      show(error.message, 'error');
    }
  }

  function openDialog(pending) {
    state.pending = pending;
    if (elements.dialogTitle) elements.dialogTitle.textContent = pending.title;
    if (elements.dialogCopy) elements.dialogCopy.textContent = pending.copy;
    if (elements.dialogCounts) {
      elements.dialogCounts.innerHTML = pending.counts ? countsMarkup(pending.counts) : '';
      elements.dialogCounts.hidden = !pending.counts;
    }
    if (elements.phrase) elements.phrase.textContent = pending.phrase;
    if (elements.confirmation instanceof HTMLInputElement) elements.confirmation.value = '';
    if (elements.confirm instanceof HTMLButtonElement) elements.confirm.textContent = pending.buttonLabel;
    if (elements.dialog instanceof HTMLDialogElement) elements.dialog.showModal();
    else if (elements.dialog instanceof HTMLElement) elements.dialog.hidden = false;
    syncControls();
    elements.confirmation?.focus();
  }

  function closeDialog() {
    state.pending = null;
    if (elements.dialog instanceof HTMLDialogElement) elements.dialog.close();
    else if (elements.dialog instanceof HTMLElement) elements.dialog.hidden = true;
    if (elements.confirmation instanceof HTMLInputElement) elements.confirmation.value = '';
    syncControls();
  }

  async function createGroupBackup(groupKey) {
    const group = (state.overview?.groups || []).find((entry) => entry.groupKey === groupKey) || null;
    const sources = (state.overview?.sources || []).filter((source) => source.groupKey === groupKey && source.experienceId);
    if (!group || !sources.length) throw new Error('Choose a saved Whop group that contains at least one source.');
    const backups = [];
    const failures = [];
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      show(`Backing up ${group.label}: source ${index + 1} of ${sources.length} · ${source.label}`, 'working');
      try {
        const result = await post('create', {
          scope: 'source',
          experienceId: source.experienceId,
          authorizeReset: false,
          deletePublished: false,
          resync: false,
          disconnectWhop: false,
        });
        if (!result?.backup || result.backup.status !== 'verified') throw new Error('The source backup was not verified.');
        backups.push(result.backup);
      } catch (error) {
        failures.push({
          experienceId: source.experienceId,
          label: source.label,
          error: String(error?.message || 'Backup failed.').slice(0, 240),
        });
      }
    }
    if (!backups.length) {
      throw new Error(`No ${group.label} source backups were verified. ${failures[0]?.error || 'Try again after refreshing recovery history.'}`);
    }
    return {
      group: true,
      groupKey,
      groupLabel: group.label,
      sourceCount: sources.length,
      backups,
      failures,
    };
  }

  async function createBackup({ authorizeReset = false } = {}) {
    const scope = selectedScope();
    if (scope.scope === 'group') {
      if (authorizeReset) throw new Error('Whole-group backup does not perform destructive resets. Back up the group, then clear an exact source only if needed.');
      return createGroupBackup(scope.groupKey);
    }
    const body = {
      ...scope,
      authorizeReset,
      deletePublished: elements.includePublished?.checked === true,
      resync: elements.resync?.checked === true,
      disconnectWhop: elements.disconnect?.checked === true,
    };
    return post('create', body);
  }

  async function createManualBackup() {
    setBusy(true);
    try {
      const result = await createBackup();
      await loadOverview({ quiet: true, force: true });
      if (result.group) {
        const failed = result.failures.length;
        show(
          `${result.groupLabel} backup finished: ${result.backups.length}/${result.sourceCount} source backups verified.${failed ? ` ${failed} source${failed === 1 ? '' : 's'} need another try; every successful backup remains restorable.` : ' Every source is independently downloadable and restorable.'}`,
          failed ? 'warning' : 'ok',
        );
      } else {
        show(`Verified backup created: ${result.backup.backupId}. Download it now or keep it for one-click restore.`, 'ok');
      }
    } catch (error) {
      show(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function previewReset() {
    const scope = selectedScope();
    if (scope.scope === 'group') {
      show('Whole-group recovery is backup-only for safety. Create the group backup first, then clear/resync one exact source if you need a destructive reset.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const preview = await post('preview', {
        ...scope,
        deletePublished: elements.includePublished?.checked === true,
      });
      openDialog({
        type: 'reset',
        title: preview.scope === 'source' ? 'Back up, clear, and resync this source?' : 'Back up and reset the Whop importer?',
        copy: preview.deletePublished
          ? 'A verified backup will be created first. This reset also deletes published guides from the selected scope.'
          : 'A verified backup will be created first. Published guides stay in the private library and R2 media remains pinned by the backup.',
        counts: preview.counts,
        phrase: preview.confirmationPhrase,
        buttonLabel: preview.scope === 'source' ? 'Create backup & clear source' : 'Create backup & reset importer',
      });
    } catch (error) {
      show(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runReset(confirmation) {
    const created = await createBackup({ authorizeReset: true });
    const authorization = created.authorization;
    if (!authorization?.token) throw new Error('The verified backup did not issue a reset authorization. Nothing was deleted.');
    const body = {
      backupId: created.backup.backupId,
      resetToken: authorization.token,
      confirmation,
      resync: authorization.options?.resync === true,
    };
    const result = await post('reset', body);
    await loadOverview({ quiet: true, force: true });
    root.querySelector('[data-refresh-dashboard]')?.click();
    if (result.resync) root.querySelector('[data-refresh-groups]')?.click();
    const warning = result.resync?.complete === false || (result.warnings || []).length > 0;
    const resyncCopy = result.resync?.complete === true
      ? ` Fresh resync found ${result.resync.posts} current post(s).`
      : result.resync?.complete === false
        ? ' The reset succeeded, but resync needs attention; the verified backup remains restorable.'
        : '';
    const warningCopy = (result.warnings || []).length ? ` ${result.warnings.join(' ')}` : '';
    show(
      `Reset complete after verified backup ${created.backup.backupId}. Removed ${result.deleted.guides} guide(s), ${result.deleted.posts} post snapshot(s), and ${result.deleted.sources} source record(s).${resyncCopy}${warningCopy}`,
      warning ? 'warning' : 'ok',
    );
  }

  function backupById(id) {
    return (state.overview?.backups || []).find((backup) => backup.backupId === id) || null;
  }

  function previewRestore(id) {
    const backup = backupById(id);
    if (!backup) return show('Refresh backup history before restoring this item.', 'error');
    openDialog({
      type: 'restore',
      backupId: id,
      title: `Restore “${backup.label}”?`,
      copy: 'Restore works without current Whop access. Newer guides are preserved and reported as conflicts instead of being overwritten.',
      counts: backup.counts,
      phrase: backup.restorePhrase,
      buttonLabel: 'Restore verified backup',
    });
  }

  function previewDelete(id) {
    const backup = backupById(id);
    if (!backup) return show('Refresh backup history before deleting this item.', 'error');
    openDialog({
      type: 'delete',
      backupId: id,
      title: `Delete backup “${backup.label}”?`,
      copy: 'This removes the recovery snapshot and releases its media pins. Existing live guides are not changed.',
      counts: backup.counts,
      phrase: backup.deletePhrase,
      buttonLabel: 'Delete backup permanently',
    });
  }

  async function runPending() {
    if (!state.pending) return;
    const pending = state.pending;
    const confirmation = String(elements.confirmation?.value || '').trim();
    if (confirmation !== pending.phrase) return;
    setBusy(true, pending.buttonLabel);
    try {
      if (pending.type === 'reset') await runReset(confirmation);
      if (pending.type === 'restore') {
        const result = await post('restore', { backupId: pending.backupId, confirmation });
        await loadOverview({ quiet: true, force: true });
        root.querySelector('[data-refresh-dashboard]')?.click();
        show(`Restore finished: ${result.restored.length} restored, ${result.unchanged.length} unchanged, ${result.conflicts.length} preserved as newer conflicts.`, result.conflicts.length ? 'warning' : 'ok');
      }
      if (pending.type === 'delete') {
        await post('delete', { backupId: pending.backupId, confirmation });
        await loadOverview({ quiet: true, force: true });
        show('Backup deleted. Live guides were not changed.', 'ok');
      }
      closeDialog();
    } catch (error) {
      show(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  elements.scope?.addEventListener('change', syncControls);
  elements.source?.addEventListener('change', syncControls);
  elements.group?.addEventListener('change', syncControls);
  elements.confirmation?.addEventListener('input', syncControls);
  elements.create?.addEventListener('click', createManualBackup);
  elements.reset?.addEventListener('click', previewReset);
  elements.refresh?.addEventListener('click', () => loadOverview());
  elements.confirm?.addEventListener('click', runPending);
  elements.cancel?.addEventListener('click', closeDialog);
  elements.dialog?.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  elements.history?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const restore = target?.closest('[data-backup-restore]');
    const remove = target?.closest('[data-backup-delete]');
    if (restore) previewRestore(restore.getAttribute('data-backup-restore'));
    if (remove) previewDelete(remove.getAttribute('data-backup-delete'));
  });

  structureRecoveryPanel();
  syncControls();
})();
