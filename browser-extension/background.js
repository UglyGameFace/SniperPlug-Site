'use strict';

const CANDIDATE_KEY = 'sniperplugCandidates';
const QUEUE_KEY = 'sniperplugCaptureQueues';
const AUTO_KEY = 'sniperplugAutoTabs';
const PENDING_KEY = 'sniperplugPendingCaptures';
const MAX_QUEUE = 25;
const CANDIDATE_TTL_MS = 10 * 60_000;

async function readState(key, fallback) {
  const stored = await chrome.storage.session.get(key);
  return stored[key] ?? fallback;
}

async function writeState(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

function candidateKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

async function saveCandidate(sender, candidate) {
  const tabId = Number(sender?.tab?.id);
  const frameId = Number(sender?.frameId ?? 0);
  if (!Number.isInteger(tabId)) return;
  const candidates = await readState(CANDIDATE_KEY, {});
  const now = Date.now();
  for (const [key, value] of Object.entries(candidates)) {
    if (!value?.seenAt || now - value.seenAt > CANDIDATE_TTL_MS) delete candidates[key];
  }
  candidates[candidateKey(tabId, frameId)] = {
    tabId,
    frameId,
    seenAt: now,
    experienceId: String(candidate?.experienceId || ''),
    title: String(candidate?.title || ''),
    pageUrl: String(candidate?.pageUrl || ''),
    textLength: Math.max(0, Number(candidate?.textLength || 0)),
    host: String(candidate?.host || ''),
    likelyAppFrame: candidate?.likelyAppFrame === true,
  };
  await writeState(CANDIDATE_KEY, candidates);

  const autoTabs = await readState(AUTO_KEY, {});
  if (autoTabs[String(tabId)] === true) {
    chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-auto', enabled: true }, { frameId }).catch(() => null);
  }
}

async function candidatesForTab(tabId) {
  const candidates = await readState(CANDIDATE_KEY, {});
  const now = Date.now();
  return Object.values(candidates)
    .filter((candidate) => candidate.tabId === tabId && now - Number(candidate.seenAt || 0) <= CANDIDATE_TTL_MS)
    .sort((left, right) => {
      const leftRank = (left.experienceId ? 1_000_000 : 0) + (left.likelyAppFrame ? 500_000 : 0) + left.textLength;
      const rightRank = (right.experienceId ? 1_000_000 : 0) + (right.likelyAppFrame ? 500_000 : 0) + right.textLength;
      return rightRank - leftRank;
    });
}

async function bestCandidate(tabId) {
  return (await candidatesForTab(tabId))[0] || null;
}

function captureIdentity(capture) {
  return `${String(capture?.experienceId || '')}|${String(capture?.pageIdentity || capture?.pageUrl || '')}`;
}

async function addCapture(tabId, capture) {
  if (!capture?.experienceId || !capture?.bodyMarkdown) throw new Error('The Better Content page did not return a complete capture.');
  const queues = await readState(QUEUE_KEY, {});
  const key = String(tabId);
  const current = Array.isArray(queues[key]) ? queues[key] : [];
  const identity = captureIdentity(capture);
  const next = current.filter((item) => captureIdentity(item) !== identity);
  next.push(capture);
  if (next.length > MAX_QUEUE) next.splice(0, next.length - MAX_QUEUE);
  queues[key] = next;
  await writeState(QUEUE_KEY, queues);
  return next;
}

async function clearQueue(tabId) {
  const queues = await readState(QUEUE_KEY, {});
  delete queues[String(tabId)];
  await writeState(QUEUE_KEY, queues);
}

async function captureCurrent(tabId) {
  const candidate = await bestCandidate(tabId);
  if (!candidate) throw new Error('Open a Better Content page inside Whop first. No capturable app frame is active in this tab.');
  const response = await chrome.tabs.sendMessage(tabId, { type: 'sniperplug:capture-now' }, { frameId: candidate.frameId });
  if (!response?.ok) throw new Error(response?.error || 'The Better Content frame could not be captured.');
  const queue = await addCapture(tabId, response.capture);
  return { capture: response.capture, queueCount: queue.length, candidate };
}

async function setAutoCapture(tabId, enabled) {
  const autoTabs = await readState(AUTO_KEY, {});
  if (enabled) autoTabs[String(tabId)] = true;
  else delete autoTabs[String(tabId)];
  await writeState(AUTO_KEY, autoTabs);
  const candidates = await candidatesForTab(tabId);
  await Promise.allSettled(candidates.map((candidate) => chrome.tabs.sendMessage(
    tabId,
    { type: 'sniperplug:set-auto', enabled },
    { frameId: candidate.frameId },
  )));
  return enabled;
}

async function queueForTab(tabId) {
  const queues = await readState(QUEUE_KEY, {});
  return Array.isArray(queues[String(tabId)]) ? queues[String(tabId)] : [];
}

async function openSniperPlug(pendingId) {
  const url = `https://sniperplug.com/control-center/?extensionCapture=${encodeURIComponent(pendingId)}`;
  const tabs = await chrome.tabs.query({ url: ['https://sniperplug.com/control-center/*'] });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { url, active: true });
    if (tabs[0].windowId != null) await chrome.windows?.update?.(tabs[0].windowId, { focused: true }).catch(() => null);
    return tabs[0].id;
  }
  const created = await chrome.tabs.create({ url, active: true });
  return created.id;
}

async function preparePending(tabId, rightsConfirmed) {
  if (rightsConfirmed !== true) throw new Error('Confirm that you own the captured content or have explicit permission to republish it.');
  const captures = await queueForTab(tabId);
  if (!captures.length) throw new Error('Capture at least one Better Content page before sending it to SniperPlug.');
  const pendingId = crypto.randomUUID();
  const pending = await readState(PENDING_KEY, {});
  pending[pendingId] = {
    id: pendingId,
    sourceTabId: tabId,
    rightsConfirmed: true,
    captures,
    createdAt: Date.now(),
  };
  await writeState(PENDING_KEY, pending);
  await openSniperPlug(pendingId);
  return { pendingId, count: captures.length };
}

async function pendingCapture(id) {
  const pending = await readState(PENDING_KEY, {});
  const item = pending[String(id || '')] || null;
  if (!item) return null;
  if (Date.now() - Number(item.createdAt || 0) > 30 * 60_000) {
    delete pending[String(id || '')];
    await writeState(PENDING_KEY, pending);
    return null;
  }
  return item;
}

async function clearPending(id, success = false) {
  const pending = await readState(PENDING_KEY, {});
  const item = pending[String(id || '')] || null;
  if (item) {
    delete pending[String(id || '')];
    await writeState(PENDING_KEY, pending);
    if (success && Number.isInteger(item.sourceTabId)) await clearQueue(item.sourceTabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === 'sniperplug:candidate') {
      await saveCandidate(sender, message.candidate || {});
      return { ok: true };
    }
    if (message?.type === 'sniperplug:auto-capture') {
      const tabId = Number(sender?.tab?.id);
      const autoTabs = await readState(AUTO_KEY, {});
      if (Number.isInteger(tabId) && autoTabs[String(tabId)] === true) {
        const queue = await addCapture(tabId, message.capture);
        return { ok: true, queueCount: queue.length };
      }
      return { ok: false, ignored: true };
    }
    if (message?.type === 'sniperplug:popup-state') {
      const tabId = Number(message.tabId);
      const [candidates, queue, autoTabs] = await Promise.all([
        candidatesForTab(tabId),
        queueForTab(tabId),
        readState(AUTO_KEY, {}),
      ]);
      return {
        ok: true,
        candidate: candidates[0] || null,
        candidateCount: candidates.length,
        queueCount: queue.length,
        queuedTitles: queue.slice(-5).map((item) => item.title),
        autoEnabled: autoTabs[String(tabId)] === true,
      };
    }
    if (message?.type === 'sniperplug:capture-current') return { ok: true, ...(await captureCurrent(Number(message.tabId))) };
    if (message?.type === 'sniperplug:set-auto-request') return { ok: true, enabled: await setAutoCapture(Number(message.tabId), message.enabled === true) };
    if (message?.type === 'sniperplug:clear-queue') {
      await clearQueue(Number(message.tabId));
      return { ok: true };
    }
    if (message?.type === 'sniperplug:prepare-send') return { ok: true, ...(await preparePending(Number(message.tabId), message.rightsConfirmed === true)) };
    if (message?.type === 'sniperplug:get-pending') return { ok: true, pending: await pendingCapture(message.pendingId) };
    if (message?.type === 'sniperplug:clear-pending') {
      await clearPending(message.pendingId, message.success === true);
      return { ok: true };
    }
    return { ok: false, error: 'Unknown extension message.' };
  };

  run().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error?.message || error || 'Extension operation failed.') }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  Promise.all([
    readState(CANDIDATE_KEY, {}).then((candidates) => {
      for (const key of Object.keys(candidates)) if (key.startsWith(`${tabId}:`)) delete candidates[key];
      return writeState(CANDIDATE_KEY, candidates);
    }),
    readState(AUTO_KEY, {}).then((autoTabs) => {
      delete autoTabs[String(tabId)];
      return writeState(AUTO_KEY, autoTabs);
    }),
  ]).catch(() => null);
});
