(() => {
  const root = document.querySelector('[data-control-root]');
  const app = document.querySelector('[data-control-app]');
  const categoryPanel = document.querySelector('#category-registry');
  if (!(root instanceof HTMLElement) || !(app instanceof HTMLElement) || !(categoryPanel instanceof HTMLElement)) return;

  const panel = document.createElement('section');
  panel.className = 'control-panel recovery-panel';
  panel.dataset.recoveryPanel = '';
  panel.dataset.collapsed = 'true';
  panel.innerHTML = `
    <header class="panel-head">
      <div>
        <span class="eyebrow">Recovery</span>
        <h2>Removed Whop imports</h2>
        <p>Permanent R2 copies can be restored directly. Anything that was only linked to Whop must still be readable by the connected Whop account before it can be re-imported.</p>
      </div>
      <div class="button-row">
        <button class="btn ghost" type="button" data-recovery-toggle aria-expanded="false">Show removed imports</button>
        <button class="btn ghost" type="button" data-recovery-refresh>Refresh</button>
        <button class="decision disapprove" type="button" data-recovery-clear-all hidden>Clear all removed</button>
      </div>
    </header>
    <div data-recovery-content hidden>
      <label class="rights-check recovery-rights"><input type="checkbox" data-recovery-rights><span>I own this content or have explicit permission to republish it.</span></label>
      <div class="recovery-state" data-recovery-state role="status" aria-live="polite">Loading removed imports…</div>
      <div class="recovery-list" data-recovery-list></div>
      <button class="btn ghost" type="button" data-recovery-more hidden>Load more</button>
    </div>
  `;
  categoryPanel.before(panel);

  const content = panel.querySelector('[data-recovery-content]');
  const stateCopy = panel.querySelector('[data-recovery-state]');
  const list = panel.querySelector('[data-recovery-list]');
  const rights = panel.querySelector('[data-recovery-rights]');
  const toggle = panel.querySelector('[data-recovery-toggle]');
  const refresh = panel.querySelector('[data-recovery-refresh]');
  const clearAll = panel.querySelector('[data-recovery-clear-all]');
  const more = panel.querySelector('[data-recovery-more]');
  const pending = new Set();
  let loadSequence = 0;
  let total = 0;
  let offset = 0;
  let loading = false;

  const style = document.createElement('style');
  style.textContent = `
    .recovery-panel[data-collapsed="true"] [data-recovery-content]{display:none!important}
    .recovery-list{max-height:min(58vh,720px);overflow:auto;overscroll-behavior:contain}
    .recovery-panel .panel-head{align-items:flex-start}
    .recovery-item[data-busy="true"]{opacity:.72;pointer-events:none}
    .recovery-item-copy{display:grid;gap:.35rem;min-width:0}
    .recovery-item-note{margin:0;color:var(--muted,#aab0c0);line-height:1.45}
    .recovery-media-state{display:inline-flex;width:max-content;max-width:100%;padding:.25rem .55rem;border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:.78rem}
    .recovery-item[data-media-state="permanent-video"] .recovery-media-state,
    .recovery-item[data-media-state="permanent-media"] .recovery-media-state{color:#74e99a;border-color:rgba(116,233,154,.35)}
    .recovery-item[data-media-state="live-source-video"] .recovery-media-state,
    .recovery-item[data-media-state="missing-media-copy"] .recovery-media-state{color:#ffcf70;border-color:rgba(255,207,112,.35)}
    .recovery-item[data-source-unavailable="true"]{border-color:rgba(255,104,118,.35)}
  `;
  document.head.append(style);

  function resetPressed() {
    for (const element of document.querySelectorAll('[data-pressed], [data-busy="true"] button:not([aria-busy="true"])')) {
      if (element instanceof HTMLElement) delete element.dataset.pressed;
    }
  }
  document.addEventListener('pointerup', resetPressed, true);
  document.addEventListener('pointercancel', resetPressed, true);
  window.addEventListener('blur', resetPressed);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetPressed(); });

  async function request(url, options = {}, timeoutMs = 45_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal,
        headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
      });
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      if (!response.ok) {
        const error = new Error(body.error || `Recovery request failed (${response.status}).`);
        error.status = response.status;
        error.details = body.details || null;
        throw error;
      }
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('The server took too long. No duplicate action was started; refresh and try again.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function setButton(button, active, label) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = active;
    button.toggleAttribute('aria-busy', active);
    if (active) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
      button.textContent = label;
    } else {
      button.textContent = button.dataset.idleLabel || button.textContent;
      delete button.dataset.idleLabel;
      delete button.dataset.pressed;
    }
  }

  function mediaLabel(item) {
    if (item.mediaState === 'permanent-video') return 'Permanent R2 video saved';
    if (item.mediaState === 'permanent-media') return 'Permanent R2 media saved';
    if (item.mediaState === 'live-source-video') return 'Video requires live Whop access';
    if (item.mediaState === 'missing-media-copy') return 'Text saved · media was not copied';
    return 'Text-only saved import';
  }

  function row(item) {
    const article = document.createElement('article');
    article.className = 'recovery-item';
    article.dataset.guideId = String(item.id);
    article.dataset.mediaState = String(item.mediaState || 'text-only');
    const copy = document.createElement('div');
    copy.className = 'recovery-item-copy';
    const title = document.createElement('strong');
    title.textContent = item.title || 'Removed Whop import';
    const meta = document.createElement('small');
    meta.textContent = `${item.sourceGroup || 'Whop Experience'} · ${item.experienceId} · removed ${item.removedAt ? new Date(item.removedAt).toLocaleString() : 'recently'}`;
    const media = document.createElement('span');
    media.className = 'recovery-media-state';
    media.textContent = mediaLabel(item);
    const note = document.createElement('p');
    note.className = 'recovery-item-note';
    note.dataset.recoveryNote = '';
    note.textContent = item.recoveryNote || 'Re-importing requires the original Whop source.';
    copy.append(title, meta, media, note);
    const actions = document.createElement('div');
    actions.className = 'button-row';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn primary';
    restore.dataset.recoveryRepair = '';
    restore.textContent = item.canRestoreSavedCopy ? 'Restore saved R2 copy' : 'Re-import from Whop';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn ghost';
    clear.dataset.recoveryDiscard = '';
    clear.textContent = 'Remove from list';
    actions.append(restore, clear);
    article.append(copy, actions);
    return article;
  }

  function syncSummary(data) {
    total = Number(data.total || 0);
    offset = Number(data.offset || 0) + (data.removed || []).length;
    stateCopy.textContent = total ? `${total} removed import${total === 1 ? '' : 's'} available. Each row now shows whether its media is permanent or still depends on Whop.` : 'No removed Whop imports remain.';
    stateCopy.dataset.state = total ? 'warning' : 'ok';
    clearAll.hidden = total === 0;
    more.hidden = !data.hasMore;
    toggle.textContent = panel.dataset.collapsed === 'true' ? `Show removed imports${total ? ` (${total})` : ''}` : 'Collapse removed imports';
  }

  async function load({ append = false, button = null } = {}) {
    if (loading) return;
    loading = true;
    const sequence = ++loadSequence;
    setButton(button, true, append ? 'Loading…' : 'Refreshing…');
    try {
      const start = append ? offset : 0;
      const data = await request(`/api/guide-repair?offset=${encodeURIComponent(start)}`);
      if (sequence !== loadSequence) return;
      if (!append) list.replaceChildren();
      for (const item of data.removed || []) list.append(row(item));
      syncSummary(data);
    } catch (error) {
      if (sequence === loadSequence) {
        stateCopy.textContent = error.message;
        stateCopy.dataset.state = 'error';
      }
    } finally {
      loading = false;
      setButton(button, false);
    }
  }

  async function discard(ids, button, all = false) {
    const count = all ? total : ids.length;
    if (!count) return;
    const message = all
      ? `Clear all ${count} removed imports from this recovery queue? They remain private audit records but will no longer occupy this page or be recoverable here.`
      : 'Remove this rejected import from the recovery list?';
    if (!window.confirm(message)) return;
    setButton(button, true, all ? 'Clearing all…' : 'Removing…');
    try {
      const data = await request('/api/guide-repair', {
        method: 'POST',
        body: JSON.stringify({ action: 'discard', all, guideIds: ids }),
      });
      list.replaceChildren();
      for (const item of data.removed || []) list.append(row(item));
      syncSummary(data);
      stateCopy.textContent = `${data.cleared || 0} removed import${data.cleared === 1 ? '' : 's'} cleared from this page.`;
      stateCopy.dataset.state = 'ok';
    } catch (error) {
      stateCopy.textContent = error.message;
      stateCopy.dataset.state = 'error';
    } finally { setButton(button, false); }
  }

  function showSourceFailure(article, button, error) {
    const note = article.querySelector('[data-recovery-note]');
    if (note) note.textContent = error.message;
    const code = String(error?.details?.code || '');
    if (['whop_recovery_source_access_lost', 'whop_recovery_source_missing'].includes(code) || [403, 404].includes(Number(error.status || 0))) {
      article.dataset.sourceUnavailable = 'true';
      button.textContent = 'Source access required';
      button.disabled = true;
      button.dataset.idleLabel = 'Source access required';
    }
  }

  async function repair(article, button) {
    const guideId = Number(article.dataset.guideId || 0);
    if (!guideId || pending.has(guideId)) return;
    if (!rights.checked) {
      stateCopy.textContent = 'Confirm republication rights before restoring this item.';
      stateCopy.dataset.state = 'warning';
      rights.focus();
      return;
    }
    pending.add(guideId);
    article.dataset.busy = 'true';
    setButton(button, true, 'Restoring…');
    try {
      const data = await request('/api/guide-repair', {
        method: 'POST', body: JSON.stringify({ guideId, rightsConfirmed: true }),
      }, 180_000);
      article.remove();
      total = Math.max(0, total - 1);
      stateCopy.textContent = data.recoveryMode === 'saved-r2-copy'
        ? `${data.guide?.title || 'Guide'} was restored from its permanent R2 copy without using Whop.`
        : `${data.guide?.title || 'Guide'} was fetched again from Whop and returned to the draft queue.`;
      stateCopy.dataset.state = 'ok';
      toggle.textContent = panel.dataset.collapsed === 'true' ? `Show removed imports${total ? ` (${total})` : ''}` : 'Collapse removed imports';
      clearAll.hidden = total === 0;
      root.dispatchEvent(new CustomEvent('sniperplug:recovery-complete', { detail: { guide: data.guide } }));
    } catch (error) {
      showSourceFailure(article, button, error);
      stateCopy.textContent = error.message;
      stateCopy.dataset.state = 'error';
    } finally {
      pending.delete(guideId);
      delete article.dataset.busy;
      if (article.dataset.sourceUnavailable === 'true') {
        button.removeAttribute('aria-busy');
        button.disabled = true;
        button.textContent = 'Source access required';
        delete button.dataset.idleLabel;
        delete button.dataset.pressed;
      } else {
        setButton(button, false);
      }
    }
  }

  panel.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    event.preventDefault();
    if (button === toggle) {
      const collapsed = panel.dataset.collapsed === 'true';
      panel.dataset.collapsed = collapsed ? 'false' : 'true';
      content.hidden = !collapsed;
      toggle.setAttribute('aria-expanded', String(collapsed));
      toggle.textContent = collapsed ? 'Collapse removed imports' : `Show removed imports${total ? ` (${total})` : ''}`;
      return;
    }
    if (button === refresh) return load({ button });
    if (button === more) return load({ append: true, button });
    if (button === clearAll) return discard([], button, true);
    const article = button.closest('[data-guide-id]');
    if (!(article instanceof HTMLElement)) return;
    const id = Number(article.dataset.guideId || 0);
    if (button.matches('[data-recovery-repair]')) return repair(article, button);
    if (button.matches('[data-recovery-discard]')) return discard([id], button, false);
  });

  root.addEventListener('sniperplug:dashboard-refreshed', () => {
    if (panel.dataset.collapsed !== 'true') load();
  });
  load();
})();
