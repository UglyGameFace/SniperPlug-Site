(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;

  const active = new Map();
  const INDIVIDUAL_ACTIONS = new Set([
    'source-approve', 'source-disapprove',
    'post-approve', 'post-disapprove', 'post-undo',
  ]);
  const BULK_SELECTORS = [
    '[data-approve-selected]', '[data-disapprove-selected]',
    '[data-approve-all]', '[data-disapprove-all]', '[data-reset-all]',
    '[data-source-approve]', '[data-source-disapprove]',
  ];

  function decisionButton(target) {
    const button = target instanceof Element ? target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement)) return null;
    const action = String(button.dataset.action || '');
    if (INDIVIDUAL_ACTIONS.has(action)) return button;
    return BULK_SELECTORS.some((selector) => button.matches(selector)) ? button : null;
  }

  function lockContext(button) {
    const action = String(button.dataset.action || '');
    if (action.startsWith('source-')) {
      const card = button.closest('[data-experience-id]');
      if (card instanceof HTMLElement) return { key: `source:${card.dataset.experienceId}`, container: card };
    }
    if (action.startsWith('post-')) {
      const card = button.closest('[data-source-key]');
      if (card instanceof HTMLElement) return { key: `post:${card.dataset.sourceKey}`, container: card };
    }
    if (button.matches('[data-source-approve],[data-source-disapprove]')) {
      const panel = button.closest('[data-source-review]');
      if (panel instanceof HTMLElement) return { key: 'source:current-review', container: panel };
    }
    if (button.matches('[data-approve-selected],[data-disapprove-selected]')) {
      return { key: 'source:selected-bulk', container: button.closest('.bulk-selection-bar') || root };
    }
    if (button.matches('[data-approve-all],[data-disapprove-all],[data-reset-all]')) {
      return { key: 'post:visible-bulk', container: button.closest('[data-post-panel]') || root };
    }
    return null;
  }

  function release(key) {
    const entry = active.get(key);
    if (!entry) return;
    clearInterval(entry.poll);
    clearTimeout(entry.timeout);
    if (entry.container.isConnected) delete entry.container.dataset.decisionPending;
    active.delete(key);
  }

  root.addEventListener('click', (event) => {
    const button = decisionButton(event.target);
    if (!button) return;
    const context = lockContext(button);
    if (!context) return;

    if (active.has(context.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const entry = {
      ...context,
      button,
      sawBusy: false,
      poll: null,
      timeout: null,
    };
    active.set(context.key, entry);
    context.container.dataset.decisionPending = 'true';

    queueMicrotask(() => {
      if (!active.has(context.key)) return;
      entry.sawBusy = button.getAttribute('aria-busy') === 'true';
      entry.poll = setInterval(() => {
        if (!button.isConnected) return release(context.key);
        const busy = button.getAttribute('aria-busy') === 'true';
        if (busy) entry.sawBusy = true;
        if (entry.sawBusy && !busy) release(context.key);
      }, 100);
      entry.timeout = setTimeout(() => release(context.key), 125_000);
    });
  }, true);

  root.addEventListener('sniperplug:dashboard-refreshed', () => {
    for (const key of [...active.keys()]) release(key);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      for (const key of [...active.keys()]) release(key);
    }
  });
  window.addEventListener('pagehide', () => {
    for (const key of [...active.keys()]) release(key);
  }, { once: true });
})();