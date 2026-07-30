(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;

  const recent = root.querySelector('[data-recent-actions]');
  const recentList = root.querySelector('[data-recent-action-list]');
  const recentStatus = root.querySelector('[data-recent-action-status]');
  let lastGuideTap = { id: '', at: 0 };

  // Samsung Internet can continue a synthetic/default activation after the
  // Control Center starts its async guide load. Cancel browser navigation while
  // allowing the existing delegated click handler to perform the one intended load.
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest('[data-action]');
    if (!action) return;
    const name = action.getAttribute('data-action') || '';
    if (['guide-select', 'guide-load-more', 'post-preview'].includes(name)) event.preventDefault();
    if (name !== 'guide-select') return;
    const id = action.getAttribute('data-guide-id') || '';
    const now = Date.now();
    if (id && lastGuideTap.id === id && now - lastGuideTap.at < 900) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    lastGuideTap = { id, at: now };
  }, true);

  root.addEventListener('sniperplug:guide-loaded', () => {
    const editor = root.querySelector('[data-draft-editor]');
    if (!(editor instanceof HTMLElement) || editor.hidden) return;
    requestAnimationFrame(() => editor.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });

  if (!(recent instanceof HTMLElement) || !(recentList instanceof HTMLElement)) return;

  const header = recent.querySelector('header');
  const controls = document.createElement('div');
  controls.className = 'recent-history-display-controls button-row';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn ghost';
  toggle.textContent = 'Show removed imports';
  toggle.setAttribute('aria-expanded', 'false');

  const clearRemoved = document.createElement('button');
  clearRemoved.type = 'button';
  clearRemoved.className = 'decision disapprove';
  clearRemoved.textContent = 'Clear removed imports';

  controls.append(toggle, clearRemoved);
  header?.append(controls);

  const style = document.createElement('style');
  style.textContent = `
    [data-recent-actions][data-history-collapsed="true"] [data-recent-action-list],
    [data-recent-actions][data-history-collapsed="true"] .recent-actions-controls { display:none !important; }
    [data-recent-action-list] { max-height: min(52vh, 680px); overflow:auto; overscroll-behavior:contain; }
    .recent-history-display-controls { flex-wrap:wrap; justify-content:flex-end; }
  `;
  document.head.append(style);

  function rejectedRows() {
    return [...recentList.querySelectorAll('.recent-action')].filter((row) =>
      row.querySelector('.recent-action-status')?.textContent?.trim().startsWith('Rejected')
    );
  }

  function sync() {
    const count = rejectedRows().length;
    clearRemoved.hidden = count === 0;
    clearRemoved.textContent = count ? `Clear ${count} removed import${count === 1 ? '' : 's'}` : 'Clear removed imports';
    if (!recent.hasAttribute('data-history-collapsed')) recent.dataset.historyCollapsed = count > 0 ? 'true' : 'false';
    const collapsed = recent.dataset.historyCollapsed === 'true';
    toggle.hidden = recentList.children.length === 0;
    toggle.textContent = collapsed ? 'Show removed imports' : 'Collapse removed imports';
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }

  toggle.addEventListener('click', () => {
    recent.dataset.historyCollapsed = recent.dataset.historyCollapsed === 'true' ? 'false' : 'true';
    sync();
  });

  clearRemoved.addEventListener('click', async () => {
    const count = rejectedRows().length;
    if (!count) return;
    if (!window.confirm(`Clear ${count} removed import${count === 1 ? '' : 's'} from this history panel? The rejected source records stay private and can be imported again later.`)) return;
    clearRemoved.disabled = true;
    clearRemoved.textContent = 'Clearing…';
    try {
      const response = await fetch('/api/recent-actions', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', allRejected: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Removed imports could not be cleared.');
      for (const row of rejectedRows()) row.remove();
      recent.dataset.historyCollapsed = 'true';
      if (recentStatus) {
        recentStatus.textContent = `${data.dismissed || count} removed import${(data.dismissed || count) === 1 ? '' : 's'} cleared from this panel.`;
        recentStatus.dataset.state = 'ok';
      }
      sync();
    } catch (error) {
      if (recentStatus) {
        recentStatus.textContent = error.message;
        recentStatus.dataset.state = 'error';
      }
    } finally {
      clearRemoved.disabled = false;
      sync();
    }
  });

  new MutationObserver(sync).observe(recentList, { childList: true });
  sync();
})();
