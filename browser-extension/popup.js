'use strict';

const elements = {
  pageTitle: document.getElementById('pageTitle'),
  pageMeta: document.getElementById('pageMeta'),
  pageDetail: document.getElementById('pageDetail'),
  openWhop: document.getElementById('openWhop'),
  crawl: document.getElementById('crawl'),
  capture: document.getElementById('capture'),
  auto: document.getElementById('auto'),
  queueCount: document.getElementById('queueCount'),
  crawlMeta: document.getElementById('crawlMeta'),
  queueTitles: document.getElementById('queueTitles'),
  clear: document.getElementById('clear'),
  rights: document.getElementById('rights'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
};

let tabId = null;
let preferredTabId = null;
let state = {
  candidate: null,
  queueCount: 0,
  autoEnabled: false,
  queuedTitles: [],
  whopTabCount: 0,
  usingRecentTab: false,
  crawlEnabled: false,
  crawlStatus: 'idle',
  crawlDiscovered: 0,
  crawlVisited: 0,
  crawlCaptured: 0,
  crawlRemaining: 0,
  crawlError: '',
};

function setStatus(message, status = '') {
  elements.status.textContent = message;
  elements.status.dataset.state = status;
}

async function background(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension could not complete that action.');
  return response;
}

function crawlSummary() {
  if (state.crawlStatus === 'idle') return '';
  if (state.crawlStatus === 'starting') return 'Capture-all is reading the Better Content directory…';
  if (state.crawlStatus === 'running') {
    return `Capture-all: ${state.crawlCaptured} captured · ${state.crawlRemaining} remaining · ${state.crawlDiscovered} discovered`;
  }
  if (state.crawlStatus === 'complete') return `Capture-all complete: ${state.crawlCaptured} guide${state.crawlCaptured === 1 ? '' : 's'} captured.`;
  if (state.crawlStatus === 'complete-empty') return 'Capture-all found no safe guide links to capture on this rendered page.';
  if (state.crawlStatus === 'limit') return state.crawlError || 'Capture-all stopped at its safe traversal limit.';
  if (state.crawlStatus === 'error') return state.crawlError || 'Capture-all stopped because the rendered app left its safe traversal scope.';
  if (state.crawlStatus === 'stopped') return 'Capture-all stopped. Already queued pages were kept.';
  return '';
}

function render() {
  const candidate = state.candidate;
  if (candidate) {
    elements.pageTitle.textContent = candidate.title || 'Better Content page';
    elements.pageMeta.textContent = candidate.experienceId
      ? `${candidate.experienceId} · ${candidate.host}`
      : candidate.host || '';
    const locationNote = state.usingRecentTab ? ' Found in another open Firefox tab.' : '';
    elements.pageDetail.textContent = candidate.experienceId
      ? `${candidate.textLength.toLocaleString()} rendered characters detected in the Better Content frame.${locationNote}`
      : `A Whop app frame is visible, but its exp_ experience ID has not appeared yet.${locationNote}`;
    elements.openWhop.hidden = true;
  } else if (state.whopTabCount === 0) {
    elements.pageTitle.textContent = 'Whop is not open in Firefox';
    elements.pageMeta.textContent = 'The native Whop app is separate from Firefox.';
    elements.pageDetail.textContent = 'Tap Open Whop in Firefox, sign in there, then open Hidden Files → Make Money Here.';
    elements.openWhop.hidden = false;
  } else {
    elements.pageTitle.textContent = 'Whop is open, but Better Content is not rendered yet';
    elements.pageMeta.textContent = `${state.whopTabCount} Whop tab${state.whopTabCount === 1 ? '' : 's'} found in Firefox.`;
    elements.pageDetail.textContent = 'Switch to the Whop tab and open Hidden Files → Make Money Here, then reopen this extension.';
    elements.openWhop.hidden = false;
  }

  elements.crawl.disabled = !candidate?.experienceId;
  elements.crawl.textContent = state.crawlEnabled ? 'Stop capture-all' : 'Capture all guides';
  elements.capture.disabled = !candidate?.experienceId || state.crawlEnabled;
  elements.auto.disabled = !candidate || state.crawlEnabled;
  elements.auto.textContent = `Capture as I browse: ${state.autoEnabled ? 'on' : 'off'}`;
  elements.queueCount.textContent = `${state.queueCount} page${state.queueCount === 1 ? '' : 's'} queued`;
  elements.crawlMeta.textContent = crawlSummary();
  elements.queueTitles.replaceChildren(...state.queuedTitles.map((title) => {
    const item = document.createElement('li');
    item.textContent = title;
    return item;
  }));
  elements.clear.disabled = state.queueCount === 0 || state.crawlEnabled;
  elements.send.disabled = state.queueCount === 0 || !elements.rights.checked || state.crawlEnabled;
  elements.send.textContent = state.queueCount
    ? `Send ${state.queueCount} page${state.queueCount === 1 ? '' : 's'} to SniperPlug`
    : 'Send queued pages to SniperPlug';
}

async function refresh() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  preferredTabId = Number(activeTab?.id);
  if (!Number.isInteger(preferredTabId)) preferredTabId = null;
  const output = await background({ type: 'sniperplug:popup-state', tabId: preferredTabId });
  const resolvedTabId = Number(output.targetTabId);
  tabId = Number.isInteger(resolvedTabId) ? resolvedTabId : preferredTabId;
  state = { ...state, ...output };
  render();
}

elements.rights.addEventListener('change', render);

elements.openWhop.addEventListener('click', async () => {
  elements.openWhop.disabled = true;
  setStatus('Opening Whop inside Firefox Nightly…');
  try {
    await background({ type: 'sniperplug:open-whop' });
    setStatus('Open Hidden Files → Make Money Here, then reopen SniperPlug Capture.', 'ok');
    setTimeout(() => window.close(), 600);
  } catch (error) {
    setStatus(error.message, 'error');
    elements.openWhop.disabled = false;
  }
});

elements.crawl.addEventListener('click', async () => {
  elements.crawl.disabled = true;
  try {
    if (state.crawlEnabled) {
      const output = await background({ type: 'sniperplug:stop-traversal', tabId });
      state = { ...state, ...output };
      setStatus('Capture-all stopped. Pages already queued were kept.', 'ok');
    } else {
      const output = await background({ type: 'sniperplug:start-traversal', tabId });
      if (Number.isInteger(Number(output.targetTabId))) tabId = Number(output.targetTabId);
      state = { ...state, ...output };
      setStatus('Capture-all started. Keep the Whop tab open; SniperPlug will open the safe Better Content guide links for you.', 'ok');
    }
    render();
    setTimeout(() => refresh().catch(() => null), 1200);
  } catch (error) {
    setStatus(error.message, 'error');
    render();
  }
});

elements.capture.addEventListener('click', async () => {
  elements.capture.disabled = true;
  setStatus('Reading the rendered Better Content page…');
  try {
    const output = await background({ type: 'sniperplug:capture-current', tabId });
    if (Number.isInteger(Number(output.targetTabId))) tabId = Number(output.targetTabId);
    setStatus(`Captured “${output.capture.title}”.`, 'ok');
    await refresh();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    render();
  }
});

elements.auto.addEventListener('click', async () => {
  elements.auto.disabled = true;
  try {
    const output = await background({ type: 'sniperplug:set-auto-request', tabId, enabled: !state.autoEnabled });
    if (Number.isInteger(Number(output.targetTabId))) tabId = Number(output.targetTabId);
    state.autoEnabled = output.enabled;
    setStatus(state.autoEnabled
      ? 'Capture-as-I-browse is on. SniperPlug will queue each Better Content page you choose to open yourself.'
      : 'Capture-as-I-browse is off.', 'ok');
    render();
  } catch (error) {
    setStatus(error.message, 'error');
    render();
  }
});

elements.clear.addEventListener('click', async () => {
  try {
    await background({ type: 'sniperplug:clear-queue', tabId });
    setStatus('Capture queue cleared.', 'ok');
    await refresh();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

elements.send.addEventListener('click', async () => {
  elements.send.disabled = true;
  setStatus('Opening SniperPlug and handing off the captured pages…');
  try {
    const output = await background({
      type: 'sniperplug:prepare-send',
      tabId,
      rightsConfirmed: elements.rights.checked,
    });
    setStatus(`${output.count} captured page${output.count === 1 ? '' : 's'} queued for SniperPlug.`, 'ok');
    setTimeout(() => window.close(), 450);
  } catch (error) {
    setStatus(error.message, 'error');
    render();
  }
});

refresh().catch((error) => {
  setStatus(error.message, 'error');
  render();
});
