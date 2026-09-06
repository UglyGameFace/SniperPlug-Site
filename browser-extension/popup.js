'use strict';

const elements = {
  pageTitle: document.getElementById('pageTitle'),
  pageMeta: document.getElementById('pageMeta'),
  pageDetail: document.getElementById('pageDetail'),
  openWhop: document.getElementById('openWhop'),
  crawl: document.getElementById('crawl'),
  crawlScope: document.getElementById('crawlScope'),
  crawlProgress: document.getElementById('crawlProgress'),
  crawlProgressBar: document.getElementById('crawlProgressBar'),
  crawlProgressLabel: document.getElementById('crawlProgressLabel'),
  crawlProgressPercent: document.getElementById('crawlProgressPercent'),
  crawlMeta: document.getElementById('crawlMeta'),
  crawlDiagnostic: document.getElementById('crawlDiagnostic'),
  crawlFailures: document.getElementById('crawlFailures'),
  capture: document.getElementById('capture'),
  auto: document.getElementById('auto'),
  queueCount: document.getElementById('queueCount'),
  queueTitles: document.getElementById('queueTitles'),
  clear: document.getElementById('clear'),
  rights: document.getElementById('rights'),
  sendWhenDone: document.getElementById('sendWhenDone'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
  versionStatus: document.getElementById('versionStatus'),
};

let tabId = null;
let preferredTabId = null;
let pollTimer = 0;
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
  crawlCurrentTitle: '',
  crawlRetries: 0,
  crawlFailures: 0,
  crawlSkipped: 0,
  crawlNew: 0,
  crawlChanged: 0,
  crawlUnchanged: 0,
  crawlDuplicates: 0,
  crawlError: '',
  crawlDiagnostic: '',
  crawlFailureTitles: [],
  crawlScope: 'experience',
  crawlCanResume: false,
  crawlAutoSend: false,
  extensionVersion: null,
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
  if (state.crawlStatus === 'idle') return 'Ready to scan the rendered directory.';
  if (state.crawlStatus === 'starting') return 'Reading this Better Content directory…';
  if (state.crawlStatus === 'running') {
    const current = state.crawlCurrentTitle ? ` · ${state.crawlCurrentTitle}` : '';
    return `${state.crawlCaptured} queued · ${state.crawlRemaining} remaining · ${state.crawlDiscovered} discovered${current}\n${state.crawlNew} new · ${state.crawlChanged} changed · ${state.crawlUnchanged} unchanged · ${state.crawlDuplicates} duplicate · ${state.crawlRetries} retries`;
  }
  if (state.crawlStatus === 'complete') return `Sync scan complete: ${state.crawlNew} new · ${state.crawlChanged} changed · ${state.crawlUnchanged} unchanged · ${state.crawlDuplicates} duplicate.`;
  if (state.crawlStatus === 'complete-empty') return 'Capture-all found no capturable guide pages in this scope.';
  if (state.crawlStatus === 'interrupted') return 'Capture-all was interrupted. Reopen the same Whop experience to resume automatically, or press Resume.';
  if (state.crawlStatus === 'limit') return state.crawlError || 'Capture-all stopped at its safe traversal limit.';
  if (state.crawlStatus === 'error') return state.crawlError || 'Capture-all stopped on an error. The captured queue was kept.';
  if (state.crawlStatus === 'stopped') return 'Capture-all stopped. Already queued pages and traversal progress were kept.';
  return '';
}

function crawlProgressState(input = state) {
  const status = String(input?.crawlStatus || 'idle');
  const finished = Math.max(0, Number(input?.crawlVisited || 0));
  const remaining = Math.max(0, Number(input?.crawlRemaining || 0));
  const discovered = Math.max(0, Number(input?.crawlDiscovered || 0));
  const knownTotal = Math.max(discovered, finished + remaining);
  const complete = status === 'complete' || status === 'complete-empty';

  if (complete) {
    return {
      percent: 100,
      indeterminate: false,
      label: knownTotal > 0 ? `${knownTotal} of ${knownTotal} known pages checked` : 'Scan finished',
    };
  }

  if (status === 'idle') {
    return { percent: 0, indeterminate: false, label: 'Ready to scan' };
  }

  if (status === 'starting' || (status === 'running' && knownTotal === 0)) {
    return { percent: 0, indeterminate: true, label: 'Discovering guide tree…' };
  }

  if (knownTotal === 0) {
    return { percent: 0, indeterminate: false, label: status === 'interrupted' ? 'Waiting to resume' : 'No pages discovered yet' };
  }

  const rawPercent = Math.round((finished / knownTotal) * 100);
  const percent = Math.max(0, Math.min(status === 'running' ? 99 : 100, rawPercent));
  const suffix = status === 'running'
    ? 'known pages checked'
    : status === 'interrupted' || status === 'stopped'
      ? 'known pages checked before pause'
      : 'known pages checked';
  return { percent, indeterminate: false, label: `${finished} of ${knownTotal} ${suffix}` };
}

function renderCrawlProgress() {
  const progress = crawlProgressState();
  elements.crawlProgress.classList.toggle('is-indeterminate', progress.indeterminate);
  elements.crawlProgressBar.style.width = progress.indeterminate ? '38%' : `${progress.percent}%`;
  elements.crawlProgressLabel.textContent = progress.label;
  elements.crawlProgressPercent.textContent = progress.indeterminate ? 'Scanning…' : `${progress.percent}%`;
  elements.crawlProgress.setAttribute('aria-valuetext', progress.label);
  if (progress.indeterminate) elements.crawlProgress.removeAttribute('aria-valuenow');
  else elements.crawlProgress.setAttribute('aria-valuenow', String(progress.percent));
}

function versionSummary() {
  const version = state.extensionVersion;
  if (!version?.installed) return '';
  if (version.incompatible) return `Extension ${version.installed} is below the supported minimum ${version.minimum}. Update before relying on capture-all.`;
  if (version.updateAvailable) return `Extension ${version.installed} installed · ${version.latest} available.`;
  return `Extension ${version.installed}${version.latest ? ` · current ${version.latest}` : ''}`;
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

  const resume = state.crawlCanResume && !state.crawlEnabled;
  elements.crawl.disabled = !candidate?.experienceId;
  elements.crawl.textContent = state.crawlEnabled ? 'Stop capture-all' : resume ? 'Resume capture-all' : 'Capture all guides';
  elements.crawlScope.disabled = state.crawlEnabled || resume;
  if (state.crawlScope) elements.crawlScope.value = state.crawlScope;
  elements.capture.disabled = !candidate?.experienceId || state.crawlEnabled;
  elements.auto.disabled = !candidate || state.crawlEnabled;
  elements.auto.textContent = `Capture as I browse: ${state.autoEnabled ? 'on' : 'off'}`;
  elements.queueCount.textContent = `${state.queueCount} page${state.queueCount === 1 ? '' : 's'} queued`;
  renderCrawlProgress();
  elements.crawlMeta.textContent = crawlSummary();
  elements.crawlDiagnostic.textContent = state.crawlDiagnostic || '';
  elements.crawlFailures.replaceChildren(...(state.crawlFailureTitles || []).map((title) => {
    const item = document.createElement('li');
    item.textContent = `Skipped: ${title}`;
    return item;
  }));
  elements.queueTitles.replaceChildren(...state.queuedTitles.map((title) => {
    const item = document.createElement('li');
    item.textContent = title;
    return item;
  }));
  elements.clear.disabled = state.queueCount === 0 || state.crawlEnabled;
  elements.send.disabled = state.queueCount === 0 || !elements.rights.checked || state.crawlEnabled;
  elements.sendWhenDone.disabled = state.crawlEnabled;
  elements.send.textContent = state.queueCount
    ? `Send ${state.queueCount} page${state.queueCount === 1 ? '' : 's'} to SniperPlug`
    : 'Send queued pages to SniperPlug';
  elements.versionStatus.textContent = versionSummary();
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (!state.crawlEnabled) return;
  pollTimer = setTimeout(() => refresh().catch(() => null), 900);
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
  schedulePoll();
}

elements.rights.addEventListener('change', render);
elements.sendWhenDone.addEventListener('change', () => {
  if (elements.sendWhenDone.checked && !elements.rights.checked) {
    setStatus('Automatic send requires the ownership/permission confirmation above.', 'error');
  }
  render();
});

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
      setStatus('Capture-all stopped. Pages and traversal progress were kept for resume.', 'ok');
    } else {
      if (elements.sendWhenDone.checked && !elements.rights.checked) {
        throw new Error('Confirm that you own the content or have permission before enabling automatic send.');
      }
      const output = await background({
        type: 'sniperplug:start-traversal',
        tabId,
        scope: elements.crawlScope.value,
        autoSend: elements.sendWhenDone.checked,
        rightsConfirmed: elements.rights.checked,
        resume: state.crawlCanResume,
      });
      if (Number.isInteger(Number(output.targetTabId))) tabId = Number(output.targetTabId);
      state = { ...state, ...output };
      setStatus(state.crawlCanResume
        ? 'Capture-all resumed from saved progress.'
        : 'Capture-all started. Keep the Whop tab available; SniperPlug will walk the authorized rendered guide tree for you.', 'ok');
    }
    render();
    schedulePoll();
  } catch (error) {
    setStatus(error.message, 'error');
    render();
  }
});

elements.capture.addEventListener('click', async () => {
  elements.capture.disabled = true;
  setStatus('Preparing the rendered page, including lazy content and images…');
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
      ? 'Capture-as-I-browse is on. SniperPlug will prepare and queue each Better Content page you open yourself.'
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
  setStatus('Opening SniperPlug and handing off the changed/new pages…');
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

window.addEventListener('unload', () => clearTimeout(pollTimer));
refresh().catch((error) => {
  setStatus(error.message, 'error');
  render();
});
