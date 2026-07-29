(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const groupsRoot = root.querySelector('[data-discovered-groups]');
  const masterDefaults = root.querySelector('[data-select-defaults]');
  const approveSelected = root.querySelector('[data-approve-selected]');
  const disapproveSelected = root.querySelector('[data-disapprove-selected]');
  const clearSelected = root.querySelector('[data-clear-selected]');
  const sourceOptions = root.querySelector('[data-source-options]');
  const globalStatus = root.querySelector('[data-global-status]');
  const refreshGroups = root.querySelector('[data-refresh-groups]');
  const bulkWorkflow = root.querySelector('[data-bulk-workflow]');
  if (!groupsRoot || !masterDefaults || !approveSelected || !disapproveSelected || !clearSelected) return;

  let changingSelection = false;
  let summaryFrame = 0;
  let decisionBusy = false;

  function sourceCheckboxes(scope = groupsRoot) {
    return [...scope.querySelectorAll('.discovered-source input[type="checkbox"]')];
  }

  function sourceIdForCheckbox(checkbox) {
    const source = checkbox.closest('.discovered-source');
    if (!source) return '';
    if (source.dataset.experienceId) return source.dataset.experienceId;
    const id = source.textContent.match(/\bexp_[A-Za-z0-9_-]+\b/)?.[0] || '';
    if (id) source.dataset.experienceId = id;
    return id;
  }

  function setCheckbox(checkbox, checked) {
    if (checkbox.checked === checked) return false;
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function selectedIds() {
    return [...new Set(sourceCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map(sourceIdForCheckbox)
      .filter(Boolean))];
  }

  function scheduleSelectionSummary() {
    if (summaryFrame) return;
    summaryFrame = requestAnimationFrame(() => {
      summaryFrame = 0;
      for (const group of groupsRoot.querySelectorAll('.discovered-group')) {
        const checked = sourceCheckboxes(group).some((checkbox) => checkbox.checked);
        const clear = group.querySelector('[data-fast-group-clear]');
        if (clear) clear.disabled = !checked;
      }
      root.dispatchEvent(new CustomEvent('sniperplug:selection-updated'));
    });
  }

  function applySelection(checkboxes, checked) {
    changingSelection = true;
    window.__sniperplugSelectionBatch = true;
    let changed = false;
    try {
      for (const checkbox of checkboxes) changed = setCheckbox(checkbox, checked) || changed;
    } finally {
      changingSelection = false;
      window.__sniperplugSelectionBatch = false;
    }
    if (changed) scheduleSelectionSummary();
  }

  function showStatus(message, type = 'ok') {
    if (!globalStatus) return;
    globalStatus.textContent = message;
    globalStatus.dataset.type = type;
    globalStatus.hidden = false;
  }

  function renderSavedSourceOptions(sources) {
    if (!sourceOptions || !Array.isArray(sources)) return;
    sourceOptions.replaceChildren();
    for (const source of sources) {
      const chip = document.createElement('span');
      chip.className = 'source-chip';
      chip.dataset.state = source.decision || 'pending';
      const strong = document.createElement('strong');
      strong.textContent = source.label || source.experienceId || 'Whop source';
      const small = document.createElement('small');
      small.textContent = source.decision === 'approved' ? 'Approved' : source.decision === 'disapproved' ? 'Disapproved' : 'Needs decision';
      chip.append(strong, small);
      sourceOptions.append(chip);
    }
  }

  function updateVisibleDecisions(ids, decision) {
    const changed = new Set(ids);
    const label = decision === 'approved' ? 'Approved' : 'Disapproved';
    for (const source of groupsRoot.querySelectorAll('.discovered-source')) {
      const id = source.dataset.experienceId || source.textContent.match(/\bexp_[A-Za-z0-9_-]+\b/)?.[0] || '';
      if (!changed.has(id)) continue;
      source.dataset.experienceId = id;
      source.dataset.state = decision;
      const meta = source.querySelector('small');
      if (meta) meta.textContent = meta.textContent.replace(/\b(?:Approved|Disapproved|Needs decision)\b/g, label);
      const approve = source.querySelector('.decision.approve');
      const disapprove = source.querySelector('.decision.disapprove');
      const review = source.querySelector('.btn.ghost');
      if (approve) approve.disabled = decision === 'approved';
      if (disapprove) disapprove.disabled = decision === 'disapproved';
      if (review) review.textContent = decision === 'approved' ? 'Review content' : 'Review source';
    }
  }

  async function saveSelectedDecision(decision) {
    if (decisionBusy) return;
    const ids = selectedIds();
    if (!ids.length) return;
    decisionBusy = true;
    approveSelected.disabled = true;
    disapproveSelected.disabled = true;
    clearSelected.disabled = true;
    const activeButton = decision === 'approved' ? approveSelected : disapproveSelected;
    const originalLabel = activeButton.textContent;
    activeButton.textContent = decision === 'approved' ? `Approving ${ids.length}…` : `Disapproving ${ids.length}…`;
    try {
      const response = await fetch('/api/control?action=source-decision', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ experienceIds: ids, decision }),
      });
      const output = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(output.error || `Source decision failed (${response.status}).`);
      updateVisibleDecisions(ids, decision);
      renderSavedSourceOptions(output.sources);
      if (decision === 'disapproved') {
        applySelection(sourceCheckboxes().filter((checkbox) => checkbox.checked), false);
        masterDefaults.checked = false;
        masterDefaults.indeterminate = false;
        showStatus(`${ids.length} Whop source${ids.length === 1 ? '' : 's'} disapproved in one batch.`, 'warning');
      } else {
        if (bulkWorkflow) bulkWorkflow.open = true;
        showStatus(`${ids.length} Whop source${ids.length === 1 ? '' : 's'} approved and still selected. Confirm rights, then run Approve, import & publish selected.`, 'ok');
      }
      refreshGroups?.click();
    } catch (error) {
      showStatus(String(error?.message || 'The selected Whop sources could not be updated.'), 'error');
    } finally {
      decisionBusy = false;
      activeButton.textContent = originalLabel;
      scheduleSelectionSummary();
    }
  }

  groupsRoot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fast-group-select],[data-fast-group-clear]');
    if (!button) return;
    const group = button.closest('.discovered-group');
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    applySelection(sourceCheckboxes(group), button.matches('[data-fast-group-select]'));
  }, true);

  root.addEventListener('change', (event) => {
    if (changingSelection || event.target !== masterDefaults) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    const priority = [...groupsRoot.querySelectorAll('.discovered-group[data-default-group="true"] .discovered-source input[type="checkbox"]')];
    applySelection(priority, masterDefaults.checked);
  }, true);

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-approve-selected],[data-disapprove-selected]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void saveSelectedDecision(button.matches('[data-approve-selected]') ? 'approved' : 'disapproved');
  }, true);

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-clear-selected]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    applySelection(sourceCheckboxes().filter((checkbox) => checkbox.checked), false);
    masterDefaults.checked = false;
    masterDefaults.indeterminate = false;
    scheduleSelectionSummary();
  }, true);

  root.addEventListener('change', (event) => {
    if (event.target.matches('.discovered-source input[type="checkbox"]')) scheduleSelectionSummary();
  });

  root.addEventListener('pointerdown', (event) => {
    const control = event.target.closest('button,.btn,a[href]');
    if (!control || control.hasAttribute('disabled')) return;
    control.dataset.pressed = 'true';
  }, { passive: true });

  root.addEventListener('pointerup', (event) => {
    const control = event.target.closest('[data-pressed="true"]');
    if (control) delete control.dataset.pressed;
  }, { passive: true });

  root.addEventListener('pointercancel', () => {
    for (const control of root.querySelectorAll('[data-pressed="true"]')) delete control.dataset.pressed;
  }, { passive: true });
})();
