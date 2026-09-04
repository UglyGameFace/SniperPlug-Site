'use strict';

const elements = {
  pageTitle: document.getElementById('pageTitle'),
  pageMeta: document.getElementById('pageMeta'),
  pageDetail: document.getElementById('pageDetail'),
  capture: document.getElementById('capture'),
  auto: document.getElementById('auto'),
  queueCount: document.getElementById('queueCount'),
  queueTitles: document.getElementById('queueTitles'),
  clear: document.getElementById('clear'),
  rights: document.getElementById('rights'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
};

let tabId = null;
let state = { candidate: null, queueCount: 0, autoEnabled: false, queuedTitles: [] };

function setStatus(message, status = '') {
  elements.status.textContent = message;
  elements.status.dataset.state = status;
}

async function background(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension could not complete that action.');
  return response;
}

function render() {
  const candidate = state.candidate;
  if (candidate) {
    elements.pageTitle.textContent = candidate.title || 'Better Content page';
    elements.pageMeta.textContent = candidate.experienceId
      ? `${candidate.experienceId} · ${candidate.host}`
      : candidate.host || '';
    elements.pageDetail.textContent = candidate.experienceId
      ? `${candidate.textLength.toLocaleString()} rendered characters detected in the best Whop app frame.`
      : 'The app frame is visible, but its exp_ experience ID has not appeared yet. Open an individual guide inside Whop.';
  } else {
    elements.pageTitle.textContent = 'No Better Content page detected';
    elements.pageMeta.textContent = '';
    elements.pageDetail.textContent = 'Open Better Content inside Whop, then reopen this extension.';
  }

  elements.capture.disabled = !candidate?.experienceId;
  elements.auto.disabled = !candidate;
  elements.auto.textContent = `Auto-capture: ${state.autoEnabled ? 'on' : 'off'}`;
  elements.queueCount.textContent = `${state.queueCount} page${state.queueCount === 1 ? '' : 's'} queued`;
  elements.queueTitles.replaceChildren(...state.queuedTitles.map((title) => {
    const item = document.createElement('li');
    item.textContent = title;
    return item;
  }));
  elements.clear.disabled = state.queueCount === 0;
  elements.send.disabled = state.queueCount === 0 || !elements.rights.checked;
  elements.send.textContent = state.queueCount
    ? `Send ${state.queueCount} page${state.queueCount === 1 ? '' : 's'} to SniperPlug`
    : 'Send queued pages to SniperPlug';
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = Number(tab?.id);
  if (!Number.isInteger(tabId)) throw new Error('No active browser tab is available.');
  const output = await background({ type: 'sniperplug:popup-state', tabId });
  state = { ...state, ...output };
  render();
}

elements.rights.addEventListener('change', render);

elements.capture.addEventListener('click', async () => {
  elements.capture.disabled = true;
  setStatus('Reading the rendered Better Content page…');
  try {
    const output = await background({ type: 'sniperplug:capture-current', tabId });
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
    state.autoEnabled = output.enabled;
    setStatus(state.autoEnabled
      ? 'Auto-capture is on. Open each Better Content page you want; the extension will add each stable page to the queue.'
      : 'Auto-capture is off.', 'ok');
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
