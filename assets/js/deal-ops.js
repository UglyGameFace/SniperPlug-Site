const byId = (id) => document.getElementById(id);
const els = {
  message: byId('load-message'), refresh: byId('refresh'), metrics: byId('metrics'),
  sources: byId('sources'), views: byId('views'), title: byId('view-title'),
  copy: byId('view-copy'), asof: byId('asof'), filters: byId('filters'),
  count: byId('count'), records: byId('records'), ci: byId('ci'),
  audit: byId('audit'), notes: byId('notes'), detail: byId('detail'),
  detailContent: byId('detail-content'), close: byId('close-detail'),
};
const fields = ['search', 'route', 'category', 'product', 'severity', 'status', 'branch', 'test', 'since'];
const labels = {
  all: ['Overview', 'Every monitored deal/release check, with unknowns left visible.'],
  live: ['Live validation', 'Direct-item checks and page-price firing. Repository implementation is not live execution.'],
  missed: ['Missed or inaccurate deals', 'Offer truth, suppression, and reported incidents need exact production receipts.'],
  revisit: ['Revisit timing', 'The ~16-minute figure is modeled; inspect runtime cycles for measured latency.'],
  timeouts: ['Timeout and retry behavior', 'Cycle watchdogs, failure recovery, and authoritative scanner tasks.'],
  filters: ['Filter quality', 'Demand evidence, net resale, and cheap or fake jewelry rejection.'],
  branches: ['Unfinished PRs & branches', 'GitHub PRs are visible; local-only branches cannot be discovered from this site.'],
  evidence: ['Verified vs unverified evidence', 'Tests and source paths are distinct from production logs and deployment proof.'],
};
let snapshot = null;
let view = 'all';
let visibleLimit = 30;

function elt(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined && value !== null) node.textContent = String(value);
  return node;
}
function add(parent, ...children) { children.forEach((child) => child && parent.append(child)); return parent; }
function link(label, url) {
  if (typeof url !== 'string' || !/^https:\/\/github\.com\/UglyGameFace\/(SniperPlug|SniperPlug-Site)(?:\/|$)/.test(url)) return elt('span', 'muted', label);
  const a = elt('a', 'link', label);
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function dateLabel(value) {
  if (!value) return 'Not observed';
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not observed';
}
function badge(value) { return elt('span', 'status status-' + String(value || 'unknown').replace(/[^a-z-]/g, ''), String(value || 'unknown').replaceAll('_', ' ')); }
function textRow(label, value) {
  const row = elt('div', 'detail-row');
  add(row, elt('dt', '', label), elt('dd', '', value || 'Unknown'));
  return row;
}
function listSection(title, values) {
  const section = elt('section', 'detail-section');
  add(section, elt('h3', '', title));
  if (!values?.length) add(section, elt('p', 'muted', 'No authoritative evidence attached.'));
  else {
    const ul = elt('ul');
    for (const value of values) add(ul, elt('li', '', value));
    add(section, ul);
  }
  return section;
}
function linksSection(title, values) {
  const section = elt('section', 'detail-section');
  add(section, elt('h3', '', title));
  if (!values?.length) add(section, elt('p', 'muted', 'No verified repository link.'));
  else {
    const wrap = elt('div', 'link-list');
    values.forEach((entry) => add(wrap, link(entry.label, entry.url)));
    add(section, wrap);
  }
  return section;
}
function openDetail(item) {
  els.detailContent.replaceChildren();
  const heading = elt('div', 'detail-heading');
  add(heading, elt('h2', '', item.title), badge(item.status));
  const desc = elt('p', 'muted', item.expected || 'No description.');
  const dl = elt('dl', 'detail-grid');
  add(dl,
    textRow('Evidence level', item.evidenceLevel || 'unknown'),
    textRow('Runtime status', item.runtime || 'unknown'),
    textRow('Deployment', item.deployed || 'unknown'),
    textRow('Severity', item.severity),
    textRow('Route', item.route),
    textRow('Category', item.category),
    textRow('Product type', item.productType),
    textRow('Branch', item.branch),
    textRow('Test', item.test),
    textRow('Observed at', dateLabel(item.observedAt)),
    textRow('Source listing', item.listing?.url || 'Not connected'),
    textRow('Price / stock evidence', item.price || 'Not connected'),
    textRow('Logs', item.logLines || 'Not connected'),
  );
  const why = elt('section', 'detail-section warning');
  add(why, elt('h3', '', 'Missing or blocked evidence'), elt('p', '', item.reason || 'Not established.'));
  const next = elt('section', 'detail-section');
  add(next, elt('h3', '', 'Safest next diagnostic'), elt('p', '', item.diagnostic || 'Read the source evidence.'));
  add(els.detailContent, heading, desc, dl, why,
    listSection('Required production evidence', item.required),
    linksSection('Source and related code', [...(item.links || []), ...(item.codeLinks || [])]),
    linksSection('Relevant regression tests', item.testLinks || []), next);
  if (typeof els.detail.showModal === 'function') els.detail.showModal();
}
function renderMetrics() {
  const items = snapshot?.checks || [];
  const monitors = items.filter((x) => !/^(pr-|issue-|branch-)/.test(x.id));
  const prSource = snapshot?.sources?.githubPrs;
  const stats = [
    ['Tracked checks', monitors.length, 'Source paths and test references'],
    ['Code on main', monitors.filter((x) => x.codePresent === true).length, 'Not a live Discloud result'],
    ['Runtime verified', monitors.filter((x) => x.runtime === 'verified').length, 'Unconnected = not verified'],
    ['Open PRs', prSource === 'unavailable' ? '—' : items.filter((x) => x.id.startsWith('pr-')).length, 'Verified GitHub metadata'],
    ['Remote branches', snapshot?.branchSummary?.remoteCount ?? '—', 'Not proof of unmerged work'],
    ['Bot deployment', snapshot?.sources?.deployment === 'not_connected' ? 'Unknown' : 'Check', 'Discloud SHA not connected'],
  ];
  els.metrics.replaceChildren(...stats.map(([label, value, subtitle]) => {
    const card = elt('div', 'metric');
    add(card, elt('span', '', label), elt('strong', '', value), elt('small', '', subtitle));
    return card;
  }));
}
function renderSources() {
  els.sources.replaceChildren();
  const statuses = snapshot?.sources || {};
  const sourceNames = [
    ['GitHub main', 'githubCommit'],
    ['Source tree', 'githubTree'],
    ['CI', 'githubCi'],
    ['PRs', 'githubPrs'],
    ['Remote branches', 'githubBranches'],
    ['Discloud', 'discloud'],
    ['Retailer', 'retailer'],
    ['Discord', 'discord'],
    ['Deployment', 'deployment'],
  ];
  for (const [name, field] of sourceNames) {
    const chip = elt('div', 'source-chip');
    add(chip, elt('strong', '', name), badge(statuses[field] || 'unknown'));
    add(els.sources, chip);
  }
}
function fillSelect(id, values) {
  const select = byId(id);
  const current = select.value;
  while (select.options.length > 1) select.remove(1);
  [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach((value) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = value; select.append(option);
  });
  select.value = [...select.options].some((opt) => opt.value === current) ? current : '';
}
function initFilters() {
  const items = snapshot?.checks || [];
  fillSelect('route', items.map((x) => x.route));
  fillSelect('category', items.map((x) => x.category));
  fillSelect('product', items.map((x) => x.productType));
  fillSelect('severity', items.map((x) => x.severity));
  fillSelect('status', snapshot?.statusValues || []);
  fillSelect('branch', items.map((x) => x.branch));
  fillSelect('test', items.map((x) => x.test));
}
function matching(item) {
  if (view === 'branches') {
    if (!(item.id.startsWith('pr-') || item.id.startsWith('branch-'))) return false;
  } else if (item.id.startsWith('branch-')) {
    return false;
  } else if (view === 'evidence') {
    if (item.runtime === 'verified') return false;
  } else if (view !== 'all' && item.view !== view) return false;
  const selections = {
    route: item.route, category: item.category, product: item.productType,
    severity: item.severity, status: item.status, branch: item.branch, test: item.test,
  };
  for (const [field, actual] of Object.entries(selections)) {
    const wanted = byId(field).value;
    if (wanted && actual !== wanted) return false;
  }
  const date = byId('since').value;
  if (date && (!item.date || item.date.slice(0, 10) < date)) return false;
  const search = byId('search').value.trim().toLowerCase();
  if (search) {
    const haystack = [item.title, item.route, item.category, item.productType, item.branch, item.test, item.expected, item.reason, ...(item.tests || [])].join(' ').toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}
function renderCards() {
  const [title, description] = labels[view];
  els.title.textContent = title; els.copy.textContent = description;
  const data = (snapshot?.checks || []).filter(matching);
  els.count.textContent = data.length + ' matching record' + (data.length === 1 ? '' : 's')
    + (view === 'branches' ? ' · remote branch presence is not unmerged status' : '');
  els.records.replaceChildren();
  if (!data.length) add(els.records, elt('p', 'empty', 'No matching evidence. Clear filters or use another view. An empty result does not prove a clean production system.'));
  for (const item of data.slice(0, visibleLimit)) {
    const card = elt('article', 'record');
    const top = elt('div', 'record-top');
    add(top, elt('span', 'eyebrow', item.route + ' · ' + item.category), badge(item.status));
    const titleButton = elt('button', 'record-title', item.title);
    titleButton.type = 'button'; titleButton.addEventListener('click', () => openDetail(item));
    const details = elt('p', 'muted', item.expected);
    const chips = elt('div', 'record-meta');
    add(chips, elt('span', '', 'Severity: ' + item.severity), elt('span', '', 'Code: ' + (item.evidenceLevel || 'unknown')), elt('span', '', 'Runtime: ' + (item.runtime || 'unknown')), elt('span', '', 'Branch: ' + (item.branch || 'unknown')));
    const bottom = elt('div', 'record-bottom');
    add(bottom, elt('span', 'muted', item.reason || 'No live evidence.'));
    const more = elt('button', 'detail-button', 'View evidence');
    more.type = 'button'; more.addEventListener('click', () => openDetail(item));
    add(bottom, more); add(card, top, titleButton, details, chips, bottom);
    add(els.records, card);
  }
  if (data.length > visibleLimit) {
    const button = elt('button', 'load-more', 'Show next ' + Math.min(30, data.length - visibleLimit)
      + ' (' + (data.length - visibleLimit) + ' remaining)');
    button.type = 'button';
    button.addEventListener('click', () => { visibleLimit += 30; renderCards(); });
    add(els.records, button);
  }
}
function renderTimelines() {
  els.ci.replaceChildren();
  const runs = snapshot?.ci || [];
  if (!runs.length) add(els.ci, elt('p', 'empty', 'No exact-main-head CI result returned. This does not mean tests passed or failed.'));
  for (const run of runs) {
    const row = elt('div', 'timeline-row');
    add(row, badge(run.status), link(run.name, run.url), elt('small', '', dateLabel(run.completedAt)));
    add(els.ci, row);
  }
  els.audit.replaceChildren();
  const events = snapshot?.audit || [];
  if (!events.length) add(els.audit, elt('p', 'empty', 'Recent GitHub commit history unavailable.'));
  for (const event of events) {
    const row = elt('div', 'timeline-row');
    add(row, badge(event.state), link(event.label, event.url), elt('small', '', dateLabel(event.at)));
    add(els.audit, row);
  }
}
function renderNotes() {
  els.notes.replaceChildren(elt('h2', '', 'Evidence boundaries'));
  const ul = elt('ul');
  (snapshot?.notes || []).forEach((note) => add(ul, elt('li', '', note)));
  add(els.notes, ul);
}
function render() {
  renderMetrics(); renderSources(); initFilters(); renderCards(); renderTimelines(); renderNotes();
  els.asof.textContent = 'GitHub evidence captured: ' + dateLabel(snapshot?.generatedAt)
    + (snapshot?.snapshotStale ? ' · STALE' : ' · scheduled snapshot');
}
async function load() {
  els.refresh.disabled = true; els.refresh.textContent = 'Loading…';
  els.message.hidden = false; els.message.textContent = 'Loading saved repository evidence without running any deal scans.';
  try {
    const response = await fetch('/api/deal-ops', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      const anchor = elt('a', 'link', 'Sign in to Control Center');
      anchor.href = '/control-center/'; els.message.replaceChildren(elt('span', '', 'Owner access required. '), anchor);
      return;
    }
    if (!response.ok) throw new Error('Evidence request returned HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.checks) || typeof data.sources !== 'object') throw new Error('Evidence response format was invalid');
    snapshot = data;
    render();
    const unreachable = Object.values(data.sources).filter((value) => value === 'unavailable').length;
    els.message.textContent = data.snapshotStale
      ? 'The last GitHub snapshot is stale. Repository evidence remains visible with its original timestamp. Discloud, retailer and Discord feeds are still not connected.'
      : unreachable
        ? `${unreachable} repository source(s) unavailable. No missing evidence is counted as healthy.`
        : `GitHub metadata captured ${dateLabel(data.generatedAt)}. This is a scheduled snapshot, not a live scan. Discloud, retailer and Discord feeds remain unconnected.`;
  } catch (error) {
    els.message.textContent = 'Read-only evidence could not load: ' + String(error?.message || error) + '. No operational status has been inferred.';
  } finally {
    els.refresh.disabled = false; els.refresh.textContent = 'Reload snapshot';
  }
}
els.refresh.addEventListener('click', load);
els.views.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  view = button.dataset.view;
  els.views.querySelectorAll('button').forEach((candidate) => {
    if (candidate === button) candidate.setAttribute('aria-current', 'page');
    else candidate.removeAttribute('aria-current');
  });
  visibleLimit = 30;
  if (snapshot) renderCards();
});
fields.forEach((name) => {
  const control = byId(name);
  control.addEventListener(name === 'search' ? 'input' : 'change', () => { visibleLimit = 30; if (snapshot) renderCards(); });
});
els.filters.addEventListener('reset', () => {
  requestAnimationFrame(() => { visibleLimit = 30; if (snapshot) renderCards(); });
});
els.close.addEventListener('click', () => els.detail.close());
els.detail.addEventListener('click', (event) => { if (event.target === els.detail) els.detail.close(); });
load();
