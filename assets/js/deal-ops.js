const $ = (id) => document.getElementById(id);
const state = { data: null, tab: 'overview' };
const tabs = document.getElementById('tabs');

function node(tag, className = '', content = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== null && content !== undefined) element.textContent = String(content);
  return element;
}
function put(target, ...children) {
  const element = typeof target === 'string' ? $(target) : target;
  element?.append(...children.filter(Boolean));
  return element;
}
const show = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const number = (value) => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';
const time = (value) => {
  const date = Date.parse(value || '');
  return Number.isFinite(date)
    ? new Date(date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : 'Not observed';
};
const money = (value) => Number.isSafeInteger(value) && value > 0
  ? (value / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : null;
const elapsed = (value) => {
  const when = Date.parse(value || '');
  if (!Number.isFinite(when)) return 'Not observed';
  const mins = Math.max(0, Math.floor((Date.now() - when) / 60000));
  return mins < 2 ? 'Just now' : mins < 60 ? mins + 'm ago' : Math.floor(mins / 60) + 'h ago';
};
function tag(text, tone = 'neutral') { return node('span', 'chip ' + tone, text); }
function sourceValue(value) { return value === null || value === undefined ? 'Unknown' : String(value); }

function chooseTab(tab) {
  state.tab = tab;
  document.querySelectorAll('[data-panel]').forEach((el) => { el.hidden = el.id !== tab; });
  tabs.querySelectorAll('button').forEach((el) => {
    if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  if (tab === 'deals') renderDealList();
}
tabs.addEventListener('click', (event) => {
  const selected = event.target.closest('button[data-tab]');
  if (selected) chooseTab(selected.dataset.tab);
});
document.querySelectorAll('button[data-open-tab]').forEach((button) => {
  button.addEventListener('click', () => chooseTab(button.dataset.openTab));
});

function statusFor(deal) {
  if (String(deal.status || '').startsWith('verified_')) return ['Verified', 'good'];
  if (['retry', 'failed', 'page_retry', 'identity_mismatch', 'incomplete_identity'].includes(deal.status))
    return ['Needs attention', 'bad'];
  if (deal.status === 'pending' || deal.status === 'verifying') return ['Queued', 'warn'];
  if (deal.status === 'not_buyable') return ['Not buyable', 'warn'];
  return [deal.status || 'Unknown', 'neutral'];
}
function exactPrice(deal) {
  // Discovery/apparent prices cannot be advertised as verified buyable prices.
  return String(deal.status || '').startsWith('verified_')
    ? money(deal.exact_current_cents) : null;
}
function dealCard(deal) {
  const item = node('button', 'deal-row');
  item.type = 'button';
  const left = node('div', 'deal-left');
  put(left, node('strong', 'deal-title', deal.title || 'Unnamed retailer item'),
    node('small', '', 'Walmart #' + deal.item_id + ' · ' + (deal.route || 'Unknown route')));
  const right = node('div', 'deal-right');
  put(right, node('strong', '', exactPrice(deal) || 'No verified price'),
    tag(...statusFor(deal)));
  put(item, left, right);
  item.addEventListener('click', () => openDeal(deal));
  return item;
}

function detailRow(label, value) {
  const row = node('div', 'detail-row');
  put(row, node('span', '', label), node('strong', '', value ?? 'Unknown'));
  return row;
}
function openDeal(deal) {
  const dialog = $('detail');
  const body = $('detail-body');
  body.replaceChildren();
  const head = node('div', 'detail-heading');
  put(head, node('h2', '', deal.title || 'Walmart item ' + deal.item_id), tag(...statusFor(deal)));
  put(body, head, node('p', 'fine', 'Captured from a retained bot queue record, not a live retailer checkout.'),
    detailRow('Walmart item ID', deal.item_id),
    detailRow('Status', String(deal.status || 'Unknown').replaceAll('_', ' ')),
    detailRow('Route', deal.route || 'Unknown'),
    detailRow('Last exact price', exactPrice(deal) || 'No verified exact price'),
    detailRow('Reference price', money(deal.exact_reference_cents) || 'Not established'),
    detailRow('Catalog lead price', money(deal.apparent_current_cents) || 'Not observed'),
    detailRow('First discovered', time(deal.first_seen_at)),
    detailRow('Last observed', time(deal.last_seen_at)),
    detailRow('Exact verification', time(deal.verified_at)),
    detailRow('Last attempt', time(deal.last_attempt_at)),
    detailRow('Error category', deal.error_class || 'None recorded'),
    detailRow('Retail stock / variant', 'Not exported'),
    detailRow('Per-server alert receipt', 'Not exported'),
    detailRow('Net resale / sold comps', 'Not verified'));
  if (deal.product_url && /^https:\/\/www\.walmart\.com\/ip\/\d{5,20}$/.test(deal.product_url)) {
    const anchor = node('a', 'link-button', 'Open official Walmart listing');
    anchor.href = deal.product_url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    put(body, anchor);
  }
  put(body, node('p', 'footnote',
    'Safest read-only diagnosis: inspect this exact item using /sniperplug deal_trace in Discord. ' +
    'Do not infer a missed alert from an absent receipt or an outdated listing price.'));
  dialog.showModal?.();
}
$('close-detail').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('click', (event) => { if (event.target === $('detail')) $('detail').close(); });

function filteredDeals() {
  const items = state.data?.snapshot?.deals || [];
  const text = $('search').value.trim().toLowerCase();
  const status = $('deal-status').value;
  const route = $('deal-route').value;
  const hours = Number($('deal-age').value) || 0;
  return items.filter((deal) => {
    if (text && !(deal.title || '').toLowerCase().includes(text) && !deal.item_id.includes(text)) return false;
    if (route && deal.route !== route) return false;
    if (status === 'verified' && !String(deal.status).startsWith('verified_')) return false;
    if (status === 'pending' && !['pending', 'verifying'].includes(deal.status)) return false;
    if (status === 'problem' && !['retry', 'failed', 'page_retry', 'identity_mismatch', 'incomplete_identity', 'not_buyable'].includes(deal.status)) return false;
    const when = Date.parse(deal.last_seen_at || '');
    if (hours && (!Number.isFinite(when) || Date.now() - when > hours * 3600_000)) return false;
    return true;
  });
}
function renderDealList() {
  const deals = filteredDeals();
  $('all-deals').replaceChildren();
  show('deal-count', deals.length + ' sampled item' + (deals.length === 1 ? '' : 's') + ' match. A sample is not complete source coverage.');
  deals.forEach((deal) => put('all-deals', dealCard(deal)));
  if (!deals.length) put('all-deals', node('p', 'empty', 'No matching retained items. This does not mean the retailer has no deals.'));
}
['search', 'deal-status', 'deal-route', 'deal-age'].forEach((id) => {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', renderDealList);
});

function renderChart(history = []) {
  const wrap = $('chart');
  wrap.replaceChildren();
  const points = history.filter((row) => Number.isSafeInteger(row.posted_24h)).slice(-60);
  show('chart-samples', number(points.length));
  if (points.length < 2) {
    wrap.append(node('p', 'empty', 'At least two successful bot snapshots are needed for a trend.'));
    wrap.setAttribute('aria-label', 'No trend data yet');
    return;
  }
  const width = 660; const height = 150; const pad = 16;
  const max = Math.max(1, ...points.map((row) => row.posted_24h));
  const coords = points.map((row, i) => {
    const x = pad + i * (width - pad * 2) / (points.length - 1);
    const y = height - pad - (row.posted_24h / max) * (height - pad * 2);
    return [x, y];
  });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Historical reported 24-hour public post counts');
  const polyline = document.createElementNS(ns, 'polyline');
  polyline.setAttribute('points', coords.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' '));
  polyline.setAttribute('fill', 'none'); polyline.setAttribute('stroke', '#79edba');
  polyline.setAttribute('stroke-width', '3.5'); polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.append(polyline); wrap.append(svg);
  wrap.setAttribute('aria-label', 'Reported 24h posts: ' + points[0].posted_24h + ' to ' + points.at(-1).posted_24h);
}
function alertRow(title, detail, tone = 'warn') {
  const row = node('div', 'alert-row');
  put(row, tag(tone === 'bad' ? '!' : tone === 'good' ? '✓' : '•', tone),
    node('div', '', ''));
  row.lastChild.append(node('strong', '', title), node('p', '', detail));
  return row;
}
function attention(data) {
  const body = $('alerts');
  body.replaceChildren();
  if (!data || data.state !== 'connected') {
    put(body, alertRow('Live bot data unavailable',
      'No recent authenticated runtime snapshot. A deployed website alone cannot prove the bot is healthy.', 'bad'));
    return;
  }
  const snapshot = data.snapshot;
  const worker = snapshot.metrics?.workers || {};
  const events = snapshot.metrics?.events || {};
  const queue = snapshot.metrics?.queue || {};
  const issues = [];
  if (!snapshot.bot?.ready) issues.push(['Bot not ready', 'Discord gateway readiness was false in the latest report.', 'bad']);
  for (const name of ['catalog', 'exact']) {
    const stats = worker[name] || {};
    if (Number(stats.consecutive_failures || 0) >= 3)
      issues.push([name + ' worker failing', stats.consecutive_failures + ' consecutive unsuccessful cycles.', 'bad']);
    if (!stats.last_success_at)
      issues.push([name + ' last success unknown', 'No durable successful-cycle timestamp was supplied.', 'warn']);
  }
  if (Number(events.event_errors_24h || 0) > 0)
    issues.push(['Delivery events with errors', events.event_errors_24h + ' fanout events had retained errors in the last 24 hours.', 'bad']);
  if (Number(queue.due || 0) > 100)
    issues.push(['Verification backlog', queue.due + ' exact queue rows are due and unleased.', 'warn']);
  if (!issues.length) issues.push(['No triggered alarms in exported metrics',
    'This is not an accuracy guarantee. Retail source coverage and resale profit still require independent proof.', 'good']);
  issues.forEach(([t, d, c]) => put(body, alertRow(t, d, c)));
}
function card(label, value, description) {
  const el = node('div', 'statbox');
  put(el, node('span', '', label), node('strong', '', sourceValue(value)), node('small', '', description));
  return el;
}
function breakdownRow(name, value, caption = '') {
  const row = node('div', 'break-row');
  const left = node('div');
  put(left, node('strong', '', name), node('small', '', caption));
  put(row, left, node('b', '', sourceValue(value)));
  return row;
}
function renderDelivery(metrics) {
  $('delivery-cards').replaceChildren(
    card('Posted messages · 24h', number(metrics.posts?.posts_24h), 'Actual durable public post receipts'),
    card('Reserved · 24h', number(metrics.posts?.reserved_24h), 'Post attempts awaiting known resolution'),
    card('Verified events · 24h', number(metrics.events?.events_24h), 'Fanout events, not unique checkout opportunities'),
  );
  const decisions = metrics.decisions || {};
  const labels = [
    ['posted', 'Posted', 'A historical fanout decision confirms a public post'],
    ['quality_blocked', 'Proof / quality blocked', 'Sender declined an untrusted or invalid deal'],
    ['category_muted', 'Category muted', 'Suppressed by subscription preferences'],
    ['below_threshold', 'Below discount threshold', 'Not enough source-proven discount'],
    ['recent_duplicate', 'Recent duplicate', 'Recent public alert suppressed'],
    ['reserved_duplicate', 'Reserved duplicate', 'Durable reservation prevented a duplicate'],
    ['disabled', 'Delivery disabled', 'No configured destination or disabled route'],
    ['wrong_retailer', 'Retailer disabled', 'Walmart not enabled for this destination'],
    ['error', 'Delivery error', 'Stored send-side error'],
    ['unexplained', 'Unexplained outcome', 'No explicit post, skip, or error reason'],
  ];
  $('delivery-decisions').replaceChildren();
  labels.forEach(([key, title, note]) => put('delivery-decisions',
    breakdownRow(title, number(decisions[key]), note)));
  if (!Object.keys(decisions).length) put('delivery-decisions',
    node('p', 'fine', 'No fanout-decision table evidence received yet.'));
}
function renderTiming(metrics) {
  $('workers').replaceChildren();
  for (const name of ['catalog', 'exact']) {
    const data = metrics.workers?.[name] || {};
    const el = node('section', 'panel');
    put(el, node('h3', '', name === 'catalog' ? 'Catalog discovery worker' : 'Exact verification worker'),
      card('Last successful cycle', elapsed(data.last_success_at), time(data.last_success_at)),
      breakdownRow('Completed cycles', number(data.total_cycles)),
      breakdownRow('Failed cycles (lifetime)', number(data.total_failures)),
      breakdownRow('Timeouts (lifetime)', number(data.total_timeouts)),
      breakdownRow('Consecutive failures', number(data.consecutive_failures)),
      breakdownRow('Last cycle', time(data.last_cycle_at)));
    $('workers').append(el);
  }
}
function renderQuality(metrics) {
  const queue = metrics.queue || {};
  const decisions = metrics.decisions || {};
  $('quality-cards').replaceChildren(
    card('Identity blocked', number(queue.identity_blocked), 'Retained exact queue identity mismatches'),
    card('Quality rejected · 24h', number(decisions.quality_blocked), 'Recorded public fanout quality decisions'),
    card('Category muted · 24h', number(decisions.category_muted), 'Actual per-guild suppression decisions'),
    card('Below threshold · 24h', number(decisions.below_threshold), 'Tracked discount gate rejections'),
  );
  $('quality-reasons').replaceChildren(
    breakdownRow('Cheap / fake jewelry blocked', 'Unmeasured', 'Jewelry filter is not yet instrumented as a separate production count'),
    breakdownRow('Resale-profit edge proved', 'Unverified', 'Requires exact sold comparable prices, fees and liquidity'),
    breakdownRow('Page-price lead firing', 'Unmeasured', 'Separate page-price dispatch receipt is not exported'),
    breakdownRow('Mismatched offer or seller', number(queue.identity_blocked), 'Identity-blocked queue rows, not proof of every false listing'),
  );
}
function renderHealth(data) {
  const bot = data?.snapshot?.bot || {};
  const met = data?.snapshot?.metrics || {};
  $('health-rows').replaceChildren(
    breakdownRow('Signed telemetry feed', data?.state === 'connected' ? 'Recent' : 'Unavailable', 'Last receipt: ' + time(data?.received_at)),
    breakdownRow('Discord gateway ready', data?.state === 'connected' ? (bot.ready ? 'Yes' : 'No') : 'Unknown', 'Source: running bot process'),
    breakdownRow('Database backend', bot.backend || 'Unknown', 'Bot self-reported runtime database type'),
    breakdownRow('Servers', number(bot.guild_count), 'Actual gateway guild count'),
    breakdownRow('Process uptime', Number.isSafeInteger(bot.uptime_seconds) ? Math.floor(bot.uptime_seconds / 60) + ' min' : 'Unknown', 'Not provider scan uptime'),
    breakdownRow('Deployed bot commit', bot.release_sha ? bot.release_sha.slice(0, 12) : 'Unknown', 'Requires the production release SHA from Discloud'),
    breakdownRow('Catalog last cycle', time(met.catalog?.last_completed_at), 'Retained global discovery completion'),
    breakdownRow('Latest posted alert', time(met.posts?.latest_post_at), 'Latest durable public delivery receipt'),
  );
  $('gaps').replaceChildren(
    breakdownRow('Exact retailer checkout', 'Not connected', 'Live seller, variant, cart and stock proof is not exported'),
    breakdownRow('Independent missed-deal benchmark', 'Not connected', 'Requires a trusted external source of time-stamped offers'),
    breakdownRow('Measured sniper revisit', 'Not connected', 'Needs per-query start and completion observations'),
    breakdownRow('Per-item Discord receipt', 'Not connected', 'Safe aggregate-only exporter does not share server identities'),
    breakdownRow('Resale comps / jewelry authenticity', 'Not verified', 'No authorized completed-sales feed or material certificate evidence'),
  );
}
function updateRouteFilters(deals) {
  const element = $('deal-route');
  const before = element.value;
  element.replaceChildren(new Option('All routes', ''));
  [...new Set(deals.map((deal) => deal.route).filter(Boolean))].sort().forEach((route) => element.append(new Option(route, route)));
  element.value = [...element.options].some((opt) => opt.value === before) ? before : '';
}
function render(data) {
  state.data = data;
  const live = data.state === 'connected' && data.snapshot?.bot?.ready === true;
  $('live-dot').classList.toggle('online', live);
  show('live-state', live ? 'Bot reporting' : data.state === 'stale' ? 'Evidence stale' : 'Not connected');
  const status = $('notice');
  status.textContent = live
    ? 'Verified bot snapshot received ' + elapsed(data.received_at) + '. All prices and counts represent the recorded observation, not a fresh retailer recheck.'
    : data.state === 'connected' ? 'Telemetry is recent, but the bot reported Discord not ready.'
    : data.state === 'stale' ? 'Last bot report was ' + time(data.received_at) + '. Historic records are shown as stale, not live.'
    : 'No connected SniperPlug bot snapshots. This page will not invent operational results.';
  $('unconnected').hidden = data.state === 'connected';
  const guidance = data.state === 'stale'
    ? 'The bot has reported before. The last report is stale. Check Discloud app status and recent telemetry logs.'
    : data.paired
      ? 'The website is paired. No reports have been accepted. Check the Discloud environment and restart the bot after saving the setting; do not rotate the key to troubleshoot an absent report.'
      : 'The website is not yet paired. The owner can connect the bot from Reliability → Connection settings.';
  show('connection-guidance', guidance);
  show('connection-health',
    data.state === 'connected'
      ? 'Signed bot reports are arriving. Latest receipt: ' + time(data.received_at)
      : data.paired
        ? 'Website paired, Discloud reporting not verified. Last accepted report: ' + time(data.received_at)
        : 'Discloud telemetry is not paired. Check Connection settings.');
  if (data.state !== 'connected') show('connection-reason',
    data.state === 'stale' ? 'Last recorded receipt: ' + time(data.received_at)
      : data.state === 'migration_required' ? 'Telemetry database migration not applied'
      : 'Awaiting the first signed bot snapshot');
  show('last-seen', 'Bot snapshot: ' + time(data.received_at));
  show('evidence-at', 'Evidence: ' + time(data.received_at));
  const metrics = data.snapshot?.metrics || {};
  const bot = data.snapshot?.bot || {};
  const values = {
    posts: metrics.posts?.posts_24h, verified: metrics.queue?.verified,
    due: metrics.queue?.due, events: metrics.events?.events_24h,
    errors: metrics.events?.event_errors_24h, guilds: bot.guild_count,
  };
  for (const [key, value] of Object.entries(values)) show('metric-' + key, number(value));
  const deals = data.snapshot?.deals || [];
  updateRouteFilters(deals);
  $('overview-deals').replaceChildren();
  deals.slice(0, 6).forEach((deal) => put('overview-deals', dealCard(deal)));
  if (!deals.length) put('overview-deals', node('p', 'empty', 'No recent exact queue records available. Nothing is assumed successful.'));
  renderDealList();
  renderChart(data.history || []);
  attention(data);
  renderDelivery(metrics); renderTiming(metrics); renderQuality(metrics); renderHealth(data);
}
async function reload() {
  const button = $('refresh');
  button.disabled = true;
  button.textContent = 'Reading…';
  try {
    const response = await fetch('/api/sniperplug-ops/live', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
    });
    if ([401, 403].includes(response.status)) {
      $('notice').replaceChildren(node('span', '', 'Owner session expired. '));
      const anchor = node('a', '', 'Sign back in');
      anchor.href = '/operations/';
      $('notice').append(anchor);
      return;
    }
    if (!response.ok) throw Error('Server returned HTTP ' + response.status);
    const payload = await response.json();
    if (!payload || typeof payload.state !== 'string') throw Error('Invalid operational response');
    render(payload);
  } catch (error) {
    $('live-dot').classList.remove('online');
    show('live-state', 'Connection error');
    show('notice', 'The operational API could not be read: ' + String(error?.message || error) + '. Data has not been marked healthy.');
  } finally {
    button.disabled = false; button.textContent = 'Refresh';
  }
}
$('refresh').addEventListener('click', reload);
chooseTab('overview');
reload();
setInterval(() => { if (!document.hidden) reload(); }, 60_000);
