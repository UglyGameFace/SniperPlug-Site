(() => {
  const preview = document.querySelector('[data-post-preview]');
  if (!(preview instanceof HTMLElement)) return;

  function closePreview(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    preview.hidden = true;
    preview.setAttribute('aria-hidden', 'true');
    const body = preview.querySelector('[data-preview-body]');
    if (body) body.replaceChildren();
    document.body.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow');
  }

  // The preview is outside data-control-root, so root-delegated handlers cannot
  // receive its close-button clicks. Own the modal lifecycle at document level.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-close-preview]')) {
      closePreview(event);
      return;
    }
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
  const recent = document.querySelector('[data-recent-actions]');
  const list = document.querySelector('[data-recent-action-list]');
  const status = document.querySelector('[data-recent-action-status]');
  if (!(root instanceof HTMLElement) || !(recent instanceof HTMLElement) || !(list instanceof HTMLElement)) return;
  if (recent.dataset.integrityControls === 'true') return;
  recent.dataset.integrityControls = 'true';
  recent.dataset.historyCollapsed = 'true';

  const controls = document.createElement('div');
  controls.className = 'recent-history-display-controls button-row';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn ghost';
  toggle.textContent = 'Show removed imports';
  toggle.setAttribute('aria-expanded', 'false');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'decision disapprove';
  clear.textContent = 'Clear removed imports';
  controls.append(toggle, clear);
  recent.querySelector('header')?.append(controls);

  const style = document.createElement('style');
  style.textContent = `
    [data-recent-actions][data-history-collapsed="true"] [data-recent-action-list],
    [data-recent-actions][data-history-collapsed="true"] .recent-actions-controls { display:none !important; }
    [data-recent-action-list] { max-height:min(46vh,560px); overflow:auto; overscroll-behavior:contain; }
    .recent-history-display-controls { display:flex; flex-wrap:wrap; gap:.6rem; }
  `;
  document.head.append(style);

  function rejectedRows() {
    return [...list.querySelectorAll('.recent-action')].filter((row) =>
      row.querySelector('.recent-action-status')?.textContent?.trim().startsWith('Rejected')
    );
  }

  function sync() {
    const count = rejectedRows().length;
    const collapsed = recent.dataset.historyCollapsed === 'true';
    toggle.hidden = list.children.length === 0;
    toggle.textContent = collapsed ? `Show removed imports${count ? ` (${count})` : ''}` : 'Collapse removed imports';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    clear.hidden = count === 0;
    clear.textContent = count ? `Clear ${count} removed import${count === 1 ? '' : 's'}` : 'Clear removed imports';
  }

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    recent.dataset.historyCollapsed = recent.dataset.historyCollapsed === 'true' ? 'false' : 'true';
    sync();
  });

  clear.addEventListener('click', async (event) => {
    event.preventDefault();
    const count = rejectedRows().length;
    if (!count) return;
    if (!window.confirm(`Clear ${count} removed import${count === 1 ? '' : 's'} from this panel? This does not delete the original Whop source content.`)) return;
    clear.disabled = true;
    clear.textContent = 'Clearing…';
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
      if (status) {
        status.textContent = `${data.dismissed || count} removed import${(data.dismissed || count) === 1 ? '' : 's'} cleared.`;
        status.dataset.state = 'ok';
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.dataset.state = 'error';
      }
    } finally {
      clear.disabled = false;
      sync();
    }
  });

  new MutationObserver(sync).observe(list, { childList: true });
  sync();
})();