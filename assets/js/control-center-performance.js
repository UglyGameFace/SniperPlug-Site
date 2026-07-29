(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const groupsRoot = root.querySelector('[data-discovered-groups]');
  const masterDefaults = root.querySelector('[data-select-defaults]');
  const clearSelected = root.querySelector('[data-clear-selected]');
  if (!groupsRoot || !masterDefaults || !clearSelected) return;

  let changingSelection = false;
  let summaryFrame = 0;

  function sourceCheckboxes(scope = groupsRoot) {
    return [...scope.querySelectorAll('.discovered-source input[type="checkbox"]')];
  }

  function setCheckbox(checkbox, checked) {
    if (checkbox.checked === checked) return false;
    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
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
