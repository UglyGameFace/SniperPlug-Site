(() => {
  const root = document.querySelector('[data-control-root]');
  const app = document.querySelector('[data-control-app]');
  const categoryPanel = document.querySelector('#category-registry');
  if (!(root instanceof HTMLElement) || !(app instanceof HTMLElement) || !(categoryPanel instanceof HTMLElement)) return;

  const panel = document.createElement('section');
  panel.className = 'control-panel recovery-panel';
  panel.dataset.recoveryPanel = '';
  panel.innerHTML = `
    <header class="panel-head">
      <div>
        <span class="eyebrow">Recovery</span>
        <h2>Removed Whop imports</h2>
        <p>Restore and re-import a removed item in one server-confirmed operation. This re-fetches the exact Whop Experience item and rebuilds its video and media data.</p>
      </div>
      <button class="btn ghost" type="button" data-recovery-refresh>Refresh removed items</button>
    </header>
    <label class="rights-check recovery-rights"><input type="checkbox" data-recovery-rights><span>I own this content or have explicit permission to republish it.</span></label>
    <div class="recovery-state" data-recovery-state role="status" aria-live="polite">Loading removed imports…</div>
    <div class="recovery-list" data-recovery-list></div>
  `;
  categoryPanel.before(panel);

  const stateCopy = panel.querySelector('[data-recovery-state]');
  const list = panel.querySelector('[data-recovery-list]');
  const rights = panel.querySelector('[data-recovery-rights]');
  const refresh = panel.querySelector('[data-recovery-refresh]');
  const pending = new Set();

  const progress = document.createElement('div');
  progress.className = 'recovery-operation';
  progress.hidden = true;
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'assertive');
  progress.innerHTML = '<span class="recovery-spinner" aria-hidden="true"></span><strong>Working…</strong><small>Do not tap again. SniperPlug is waiting for the server to confirm every step.</small>';
  document.body.append(progress);

  function setProgress(active, label = 'Working…') {
    progress.hidden = !active;
    progress.dataset.active = active ? 'true' : 'false';
    const strong = progress.querySelector('strong');
    if (strong) strong.textContent = label;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
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
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    if (!response.ok) throw new Error(body.error || `Recovery request failed (${response.status}).`);
    return body;
  }

  function render(items) {
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'recovery-empty';
      empty.textContent = 'No removed Whop imports are waiting for recovery.';
      list.append(empty);
      stateCopy.textContent = 'Nothing removed.';
      stateCopy.dataset.state = 'ok';
      return;
    }
    stateCopy.textContent = `${items.length} removed import${items.length === 1 ? '' : 's'} can be rebuilt.`;
    stateCopy.dataset.state = 'warning';
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = document.createElement('article');
      row.className = 'recovery-item';
      row.dataset.guideId = String(item.id);
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.title || 'Removed Whop import';
      const meta = document.createElement('small');
      meta.textContent = `${item.sourceGroup || 'Whop Experience'} · ${item.experienceId} · removed ${item.removedAt ? new Date(item.removedAt).toLocaleString() : 'recently'}`;
      copy.append(title, meta);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn primary';
      button.dataset.recoveryRepair = '';
      button.textContent = 'Restore & re-import';
      row.append(copy, button);
      fragment.append(row);
    }
    list.append(fragment);
  }

  async function load(button = null) {
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Refreshing…';
    }
    stateCopy.textContent = 'Checking D1 for removed imports…';
    stateCopy.dataset.state = 'working';
    try {
      const output = await request('/api/guide-repair');
      render(output.removed || []);
    } catch (error) {
      stateCopy.textContent = error.message;
      stateCopy.dataset.state = 'error';
    } finally {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = 'Refresh removed items';
      }
    }
  }

  async function repair(row, button) {
    const guideId = Number(row.dataset.guideId || 0);
    if (!guideId || pending.has(guideId)) return;
    if (!rights.checked) {
      stateCopy.textContent = 'Confirm republication rights before restoring this item.';
      stateCopy.dataset.state = 'warning';
      rights.focus();
      return;
    }

    pending.add(guideId);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Re-fetching from Whop…';
    row.dataset.busy = 'true';
    stateCopy.textContent = 'Whop item accepted. Re-fetching content, rebuilding the draft, and restoring video/media data…';
    stateCopy.dataset.state = 'working';
    setProgress(true, 'Restoring and re-importing…');

    try {
      const output = await request('/api/guide-repair', {
        method: 'POST',
        body: JSON.stringify({ guideId, rightsConfirmed: true }),
      });
      row.remove();
      stateCopy.textContent = `${output.guide?.title || 'Guide'} returned to the private draft queue with fresh Whop content and media data.`;
      stateCopy.dataset.state = 'ok';
      const dashboardRefresh = document.querySelector('[data-refresh-dashboard]');
      if (dashboardRefresh instanceof HTMLButtonElement) dashboardRefresh.click();
      else window.location.reload();
    } catch (error) {
      stateCopy.textContent = error.message;
      stateCopy.dataset.state = 'error';
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Retry restore & re-import';
      delete row.dataset.busy;
    } finally {
      pending.delete(guideId);
      setProgress(false);
    }
  }

  panel.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target || target.disabled) return;
    target.dataset.pressed = 'true';
  }, { passive: true, capture: true });
  panel.addEventListener('pointerup', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (target) requestAnimationFrame(() => { delete target.dataset.pressed; });
  }, { passive: true, capture: true });
  panel.addEventListener('pointercancel', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (target) delete target.dataset.pressed;
  }, { passive: true, capture: true });
  panel.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    if (button.matches('[data-recovery-refresh]')) load(button);
    else if (button.matches('[data-recovery-repair]')) {
      const row = button.closest('[data-guide-id]');
      if (row instanceof HTMLElement) repair(row, button);
    }
  });

  // Samsung Internet benefits from an explicit non-delayed tap policy.
  for (const element of document.querySelectorAll('button,.btn,[data-action]')) {
    if (element instanceof HTMLElement) element.style.touchAction = 'manipulation';
  }

  root.addEventListener('sniperplug:dashboard-refreshed', () => load());
  load();
})();
