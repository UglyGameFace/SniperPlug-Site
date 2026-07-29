(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const sourceOptions = root.querySelector('[data-source-options]');
  const discoveredGroups = root.querySelector('[data-discovered-groups]');
  const selectedCount = root.querySelector('[data-selected-source-count]');
  const bulkWorkflow = root.querySelector('[data-bulk-workflow]');
  const bulkWorkflowSummary = root.querySelector('[data-bulk-workflow-summary]');
  const bulkJobPanel = root.querySelector('[data-bulk-job-panel]');
  if (!sourceOptions || !discoveredGroups || !selectedCount || !bulkWorkflow || !bulkWorkflowSummary || !bulkJobPanel) return;

  let compacting = false;
  let selectionFrame = 0;
  let compactFrame = 0;

  function compactSourceDecisions() {
    compactFrame = 0;
    if (compacting || sourceOptions.dataset.compacted === 'true') return;
    const chips = [...sourceOptions.querySelectorAll(':scope > .source-chip')];
    if (!chips.length) return;

    const counts = { approved: 0, disapproved: 0, pending: 0 };
    for (const chip of chips) {
      const state = chip.dataset.state || 'pending';
      counts[state] = Number(counts[state] || 0) + 1;
    }

    compacting = true;
    const copy = document.createElement('div');
    copy.className = 'source-summary-copy';
    const heading = document.createElement('strong');
    heading.textContent = `${counts.approved} approved source${counts.approved === 1 ? '' : 's'}`;
    const detail = document.createElement('span');
    detail.textContent = `${chips.length} saved decision${chips.length === 1 ? '' : 's'} · ${counts.disapproved} disapproved · ${counts.pending} pending`;
    copy.append(heading, detail);

    const manage = document.createElement('a');
    manage.className = 'btn ghost source-summary-action';
    manage.href = '#source-browser';
    manage.textContent = 'Manage sources';

    sourceOptions.className = 'source-summary';
    sourceOptions.replaceChildren(copy, manage);
    sourceOptions.dataset.compacted = 'true';
    queueMicrotask(() => { compacting = false; });
  }

  function scheduleCompact() {
    delete sourceOptions.dataset.compacted;
    if (compactFrame) return;
    compactFrame = requestAnimationFrame(compactSourceDecisions);
  }

  function selectedSourceTotal() {
    return discoveredGroups.querySelectorAll('.discovered-source input[type="checkbox"]:checked').length;
  }

  function syncSelectionSummary() {
    selectionFrame = 0;
    const count = selectedSourceTotal();
    selectedCount.textContent = `${count} selected`;
    bulkWorkflowSummary.textContent = count
      ? `${count} source${count === 1 ? '' : 's'} selected · open to publish`
      : 'Open when ready to import and publish';
    bulkWorkflow.dataset.hasSelection = count ? 'true' : 'false';
  }

  function scheduleSelectionSummary() {
    if (selectionFrame) return;
    selectionFrame = requestAnimationFrame(syncSelectionSummary);
  }

  function revealActiveJob() {
    if (!bulkJobPanel.hidden) bulkWorkflow.open = true;
  }

  new MutationObserver(scheduleCompact).observe(sourceOptions, { childList: true });
  new MutationObserver(scheduleSelectionSummary).observe(discoveredGroups, { childList: true });
  new MutationObserver(revealActiveJob).observe(bulkJobPanel, { attributes: true, attributeFilter: ['hidden'] });

  root.addEventListener('change', (event) => {
    if (event.target.matches('.discovered-source input[type="checkbox"], [data-select-defaults]')) scheduleSelectionSummary();
  });
  root.addEventListener('sniperplug:selection-updated', scheduleSelectionSummary);

  compactSourceDecisions();
  syncSelectionSummary();
  revealActiveJob();
})();
