((global) => {
  function exactExperienceId(value) {
    const id = String(value || '').trim();
    return /^exp_[A-Za-z0-9_-]+$/.test(id) ? id : '';
  }

  function countDecisions(entries) {
    const counts = { total: 0, approved: 0, disapproved: 0, pending: 0 };
    for (const entry of entries) {
      const decision = String(entry?.decision || entry?.source?.decision || 'pending');
      counts.total += 1;
      if (Object.prototype.hasOwnProperty.call(counts, decision)) counts[decision] += 1;
    }
    return counts;
  }

  function savedSourceRows(options) {
    const byId = new Map();
    for (const option of Array.isArray(options) ? options : []) {
      const id = exactExperienceId(option?.experienceId || option?.experience_id);
      const decision = String(option?.decision || '');
      if (!id || !['approved', 'disapproved'].includes(decision)) continue;
      byId.set(id, { ...option, experienceId: id, decision });
    }
    return [...byId.values()];
  }

  function currentSourceRows(discovery) {
    const byId = new Map();
    for (const group of Array.isArray(discovery?.groups) ? discovery.groups : []) {
      for (const entry of Array.isArray(group?.sources) ? group.sources : []) {
        const id = exactExperienceId(entry?.experience?.id || entry?.source?.experienceId);
        if (!id) continue;
        byId.set(id, {
          experienceId: id,
          decision: String(entry?.source?.decision || 'pending'),
        });
      }
    }
    return [...byId.values()];
  }

  function summarize(savedOptions, discovery) {
    const savedRows = savedSourceRows(savedOptions);
    const currentRows = currentSourceRows(discovery);
    const currentIds = new Set(currentRows.map((row) => row.experienceId));
    const inactiveRows = savedRows.filter((row) => !currentIds.has(row.experienceId));
    return {
      verified: Boolean(discovery?.accessVerifiedAt),
      saved: countDecisions(savedRows),
      current: countDecisions(currentRows),
      inactive: countDecisions(inactiveRows),
    };
  }

  global.SniperPlugSourceAccessTruth = Object.freeze({ summarize, savedSourceRows, currentSourceRows });
  if (!global.document || typeof global.fetch !== 'function') return;
  if (global.__sniperplugSourceAccessTruthInstalled) return;
  global.__sniperplugSourceAccessTruthInstalled = true;

  const truth = global.__sniperplugSourceAccessTruthState ||= {
    dashboard: null,
    discovery: null,
  };
  const nativeFetch = global.fetch.bind(global);

  function sameOriginApi(input) {
    try {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url || String(input), global.location.href);
      return url.origin === global.location.origin && url.pathname.startsWith('/api/') ? url : null;
    } catch {
      return null;
    }
  }

  function remember(url, payload) {
    if (!payload || typeof payload !== 'object') return;
    const action = url.pathname === '/api/control' ? String(url.searchParams.get('action') || '') : '';
    if (action === 'dashboard') {
      truth.dashboard = payload;
      truth.discovery = null;
    } else if (Array.isArray(payload.sources) && truth.dashboard) {
      truth.dashboard = { ...truth.dashboard, sources: payload.sources };
    }
    if (url.pathname === '/api/discover' && Array.isArray(payload.groups)) truth.discovery = payload;
    global.dispatchEvent(new CustomEvent('sniperplug:source-access-truth', { detail: { url: url.pathname, action } }));
  }

  global.fetch = async function sourceAccessFetch(input, options = {}) {
    const url = sameOriginApi(input);
    const response = await nativeFetch(input, options);
    if (url && String(response.headers.get('content-type') || '').includes('application/json')) {
      response.clone().json().then((payload) => remember(url, payload)).catch(() => null);
    }
    return response;
  };

  function plural(value, singular, pluralValue = `${singular}s`) {
    return Number(value) === 1 ? singular : pluralValue;
  }

  function desiredCopy() {
    const savedOptions = truth.dashboard?.sources || [];
    const summary = summarize(savedOptions, truth.discovery);
    const whop = truth.dashboard?.whop || {};

    if (!summary.saved.total && !truth.discovery) return null;
    if (!whop.connected || !whop.verified) {
      return {
        title: 'Source access unavailable',
        detail: summary.saved.total
          ? `${summary.saved.approved} saved ${plural(summary.saved.approved, 'approval')} retained as history · none are usable until Whop reconnects and live access verifies`
          : 'Connect Whop to verify current source access.',
        state: 'inactive',
      };
    }
    if (!truth.discovery) {
      return {
        title: 'Checking current source access…',
        detail: summary.saved.total
          ? `${summary.saved.approved} saved ${plural(summary.saved.approved, 'approval')} will not be counted as usable until live membership checks finish`
          : 'Live membership and source checks are running.',
        state: 'checking',
      };
    }

    const inactiveApprovalCopy = summary.inactive.approved
      ? `${summary.inactive.approved} previous ${plural(summary.inactive.approved, 'approval')} retained but inactive`
      : 'no inactive previous approvals';
    return {
      title: `${summary.current.approved} currently accessible approved ${plural(summary.current.approved, 'source')}`,
      detail: `${summary.current.total} readable now · ${inactiveApprovalCopy} · inaccessible sources cannot be scanned or imported`,
      state: summary.inactive.total ? 'warning' : 'current',
    };
  }

  let rendering = false;
  let scheduled = false;

  function render() {
    scheduled = false;
    const container = global.document.querySelector('[data-source-options]');
    if (!(container instanceof HTMLElement)) return;
    const copy = desiredCopy();
    if (!copy) return;
    const expected = `${copy.title} ${copy.detail} Manage sources`.replace(/\s+/g, ' ').trim();
    const current = String(container.textContent || '').replace(/\s+/g, ' ').trim();
    if (current === expected && container.dataset.accessTruth === copy.state) return;

    rendering = true;
    const wrapper = global.document.createElement('div');
    wrapper.className = 'source-summary-copy';
    const strong = global.document.createElement('strong');
    strong.textContent = copy.title;
    const detail = global.document.createElement('span');
    detail.textContent = copy.detail;
    wrapper.append(strong, detail);

    const manage = global.document.createElement('a');
    manage.className = 'btn ghost source-summary-action';
    manage.href = '#source-browser';
    manage.textContent = 'Manage sources';

    container.className = 'source-summary';
    container.dataset.accessTruth = copy.state;
    container.replaceChildren(wrapper, manage);
    queueMicrotask(() => { rendering = false; });
  }

  function scheduleRender() {
    if (rendering || scheduled) return;
    scheduled = true;
    queueMicrotask(render);
  }

  global.addEventListener('sniperplug:source-access-truth', scheduleRender);
  global.document.addEventListener('DOMContentLoaded', () => {
    const container = global.document.querySelector('[data-source-options]');
    if (container instanceof HTMLElement) {
      new MutationObserver(scheduleRender).observe(container, { childList: true, subtree: true, characterData: true });
    }
    scheduleRender();
  }, { once: true });
})(globalThis);
