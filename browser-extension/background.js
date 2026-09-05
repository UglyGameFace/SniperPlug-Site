'use strict';

const CANDIDATE_KEY = 'sniperplugCandidates';
const QUEUE_KEY = 'sniperplugCaptureQueues';
const AUTO_KEY = 'sniperplugAutoTabs';
const PENDING_KEY = 'sniperplugPendingCaptures';
const MAX_QUEUE = 25;
const CANDIDATE_TTL_MS = 10 * 60_000;
const APP_FRAME_SETTLE_MS = 4000;
const APP_FRAME_POLL_MS = 100;
const WHOP_TAB_PATTERNS = [
  'https://whop.com/*',
  'https://*.whop.com/*',
  'https://*.apps.whop.com/*',
];

async function readState(key, fallback) {
  const stored = await chrome.storage.session.get(key);
  return stored[key] ?? fallback;
}

async function writeState(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWhopAppHost(hostname) {
  return String(hostname || '').toLowerCase().endsWith('.apps.whop.com');
}

function experienceIdFromUrl(value) {
  const match = String(value || '').match(/\bexp_[A-Za-z0-9_-]+\b/);
  return match ? match[0] : '';
}

function safeAppFrameUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && isWhopAppHost(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

function candidateKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function isCaptureCandidate(candidate) {
  return candidate?.likelyAppFrame === true
    && isWhopAppHost(candidate?.host)
    && Math.max(0, Number(candidate?.textLength || 0)) >= 80;
}

function candidateRank(candidate) {
  return (candidate?.likelyAppFrame ? 2_000_000 : 0)
    + (candidate?.experienceId ? 1_000_000 : 0)
    + Math.max(0, Number(candidate?.textLength || 0));
}

function sortCandidates(candidates) {
  return candidates.sort((left, right) => {
    const rankDifference = candidateRank(right) - candidateRank(left);
    if (rankDifference) return rankDifference;
    return Number(right?.seenAt || 0) - Number(left?.seenAt || 0);
  });
}

function pruneCandidates(candidates, now = Date.now()) {
  for (const [key, value] of Object.entries(candidates)) {
    if (!value?.seenAt || now - Number(value.seenAt) > CANDIDATE_TTL_MS) delete candidates[key];
  }
  return candidates;
}

async function removeCandidate(tabId, frameId) {
  const candidates = await readState(CANDIDATE_KEY, {});
  const key = candidateKey(tabId, frameId);
  if (Object.prototype.hasOwnProperty.call(candidates, key)) {
    delete candidates[key];
    await writeState(CANDIDATE_KEY, candidates);
  }
}

async function clearCandidatesForTab(tabId) {
  const candidates = await readState(CANDIDATE_KEY, {});
  let changed = false;
  for (const key of Object.keys(candidates)) {
    if (key.startsWith(`${tabId}:`)) {
      delete candidates[key];
      changed = true;
    }
  }
  if (changed) await writeState(CANDIDATE_KEY, candidates);
}

async function saveCandidate(sender, candidate) {
  const tabId = Number(sender?.tab?.id);
  const frameId = Number(sender?.frameId ?? 0);
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return;
  if (candidate?.likelyAppFrame !== true || !isWhopAppHost(candidate?.host)) return;

  const candidates = pruneCandidates(await readState(CANDIDATE_KEY, {}));
  const now = Date.now();
  const tabExperienceId = experienceIdFromUrl(sender?.tab?.url);
  const normalized = {
    tabId,
    frameId,
    seenAt: now,
    experienceId: tabExperienceId || String(candidate?.experienceId || ''),
    title: String(candidate?.title || ''),
    pageUrl: String(candidate?.pageUrl || ''),
    textLength: Math.max(0, Number(candidate?.textLength || 0)),
    host: String(candidate?.host || '').toLowerCase(),
    likelyAppFrame: true,
  };

  candidates[candidateKey(tabId, frameId)] = normalized;
  await writeState(CANDIDATE_KEY, candidates);

  const autoTabs = await readState(AUTO_KEY, {});
  if (autoTabs[String(tabId)] === true) {
    chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-auto', enabled: true }, { frameId }).catch(() => null);
  }
}

async function allFreshCandidates() {
  const candidates = pruneCandidates(await readState(CANDIDATE_KEY, {}));
  await writeState(CANDIDATE_KEY, candidates);
  return Object.values(candidates).filter(isCaptureCandidate);
}

async function candidatesForTab(tabId) {
  const all = await allFreshCandidates();
  return sortCandidates(all.filter((candidate) => candidate.tabId === tabId));
}

async function bestCandidate(tabId) {
  return (await candidatesForTab(tabId))[0] || null;
}

async function bestCandidateAcrossTabs(preferredTabId = null) {
  if (Number.isInteger(preferredTabId)) {
    const preferred = await bestCandidate(preferredTabId);
    if (preferred) return { candidate: preferred, usingRecentTab: false };
  }
  const all = await allFreshCandidates();
  const best = sortCandidates(all)[0] || null;
  return { candidate: best, usingRecentTab: Boolean(best && best.tabId !== preferredTabId) };
}

async function whopTabs() {
  try {
    return await chrome.tabs.query({ url: WHOP_TAB_PATTERNS });
  } catch {
    return [];
  }
}

async function appFrameIds(tabId) {
  if (!Number.isInteger(tabId) || !chrome.webNavigation?.getAllFrames) return [];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    return (Array.isArray(frames) ? frames : [])
      .filter((frame) => Number.isInteger(frame?.frameId) && safeAppFrameUrl(frame?.url))
      .map((frame) => frame.frameId);
  } catch {
    return [];
  }
}

async function injectCaptureIntoFrame(tabId, frameId) {
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId) || !chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['content-capture.js'],
    });
    return true;
  } catch {
    return false;
  }
}

async function injectCaptureIntoTab(tabId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content-capture.js'],
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForAppCandidate(tabId, timeoutMs = APP_FRAME_SETTLE_MS) {
  const started = Date.now();
  do {
    const candidate = await bestCandidate(tabId);
    if (candidate) return candidate;
    await wait(APP_FRAME_POLL_MS);
  } while (Date.now() - started < timeoutMs);
  return null;
}

async function verifyCandidate(candidate) {
  if (!isCaptureCandidate(candidate)) return null;
  try {
    const response = await chrome.tabs.sendMessage(
      candidate.tabId,
      { type: 'sniperplug:probe-now' },
      { frameId: candidate.frameId },
    );
    if (!response?.ok) throw new Error(response?.error || 'probe failed');
    await wait(40);
    const refreshed = await bestCandidate(candidate.tabId);
    return refreshed && refreshed.frameId === candidate.frameId ? refreshed : refreshed || candidate;
  } catch {
    await removeCandidate(candidate.tabId, candidate.frameId);
    return null;
  }
}

async function recoverCandidateInTab(tab) {
  if (!Number.isInteger(tab?.id)) return null;

  const existing = await bestCandidate(tab.id);
  if (existing) {
    const verified = await verifyCandidate(existing);
    if (verified) return verified;
  }

  const frameIds = await appFrameIds(tab.id);
  if (frameIds.length) {
    for (const frameId of frameIds) await injectCaptureIntoFrame(tab.id, frameId);
    const targeted = await waitForAppCandidate(tab.id);
    if (targeted) return targeted;
  }

  const injected = await injectCaptureIntoTab(tab.id);
  if (!injected) return null;
  return waitForAppCandidate(tab.id);
}

async function recoverCandidateAcrossWhopTabs(openTabs = null, preferredTabId = null) {
  const tabs = Array.isArray(openTabs) ? openTabs : await whopTabs();
  const ordered = [...tabs]
    .filter((tab) => Number.isInteger(tab?.id))
    .sort((left, right) => {
      if (left.id === preferredTabId && right.id !== preferredTabId) return -1;
      if (right.id === preferredTabId && left.id !== preferredTabId) return 1;
      return Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0);
    });

  for (const tab of ordered.slice(0, 4)) {
    const candidate = await recoverCandidateInTab(tab);
    if (candidate) return candidate;
  }
  return null;
}

async function resolveCandidate(preferredTabId = null, openTabs = null) {
  const cached = await bestCandidateAcrossTabs(preferredTabId);
  if (cached.candidate) {
    const verified = await verifyCandidate(cached.candidate);
    if (verified) {
      return {
        candidate: verified,
        usingRecentTab: Boolean(Number.isInteger(preferredTabId) && verified.tabId !== preferredTabId),
      };
    }
  }

  const recovered = await recoverCandidateAcrossWhopTabs(openTabs, preferredTabId);
  if (recovered) {
    return {
      candidate: recovered,
      usingRecentTab: Boolean(Number.isInteger(preferredTabId) && recovered.tabId !== preferredTabId),
    };
  }
  return { candidate: null, usingRecentTab: false };
}

function captureIdentity(capture) {
  return `${String(capture?.experienceId || '')}|${String(capture?.pageIdentity || capture?.pageUrl || '')}`;
}

function isSafeAppCapture(capture) {
  return /^exp_[A-Za-z0-9_-]+$/.test(String(capture?.experienceId || ''))
    && Boolean(String(capture?.bodyMarkdown || '').trim())
    && Boolean(safeAppFrameUrl(capture?.pageUrl || capture?.frameUrl));
}

async function addCapture(tabId, capture) {
  if (!isSafeAppCapture(capture)) throw new Error('SniperPlug refused a capture that did not come from the rendered Better Content app frame.');
  const queues = await readState(QUEUE_KEY, {});
  const key = String(tabId);
  const current = Array.isArray(queues[key]) ? queues[key].filter(isSafeAppCapture) : [];
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
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const candidate = resolved.candidate;
  if (!candidate || !isCaptureCandidate(candidate)) {
    throw new Error('Whop is open in Firefox, but SniperPlug has not found the rendered Better Content app frame yet. Keep the guide visible and reopen the extension.');
  }
  const sourceTabId = candidate.tabId;
  const response = await chrome.tabs.sendMessage(sourceTabId, { type: 'sniperplug:capture-now' }, { frameId: candidate.frameId });
  if (!response?.ok) throw new Error(response?.error || 'The Better Content frame could not be captured.');
  const queue = await addCapture(sourceTabId, response.capture);
  return { capture: response.capture, queueCount: queue.length, candidate, targetTabId: sourceTabId };
}

async function setAutoCapture(tabId, enabled) {
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const candidate = resolved.candidate;
  if (!candidate || !isCaptureCandidate(candidate)) throw new Error('Open a rendered Better Content guide in Firefox Nightly before enabling auto-capture.');
  const sourceTabId = candidate.tabId;

  const autoTabs = await readState(AUTO_KEY, {});
  if (enabled) autoTabs[String(sourceTabId)] = true;
  else delete autoTabs[String(sourceTabId)];
  await writeState(AUTO_KEY, autoTabs);
  const candidates = await candidatesForTab(sourceTabId);
  await Promise.allSettled(candidates.map((item) => chrome.tabs.sendMessage(
    sourceTabId,
    { type: 'sniperplug:set-auto', enabled },
    { frameId: item.frameId },
  )));
  return { enabled, targetTabId: sourceTabId };
}

async function queueForTab(tabId) {
  const queues = await readState(QUEUE_KEY, {});
  const key = String(tabId);
  const current = Array.isArray(queues[key]) ? queues[key] : [];
  const safe = current.filter(isSafeAppCapture);
  if (safe.length !== current.length) {
    if (safe.length) queues[key] = safe;
    else delete queues[key];
    await writeState(QUEUE_KEY, queues);
  }
  return safe;
}

async function openWhop() {
  const tabs = await whopTabs();
  const existing = [...tabs].sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0))[0];
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing.id;
  }
  const created = await chrome.tabs.create({ url: 'https://whop.com/', active: true });
  return created.id;
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
  const captures = Array.isArray(item.captures) ? item.captures.filter(isSafeAppCapture) : [];
  if (!captures.length) {
    delete pending[String(id || '')];
    await writeState(PENDING_KEY, pending);
    return null;
  }
  if (captures.length !== item.captures.length) {
    item.captures = captures;
    pending[String(id || '')] = item;
    await writeState(PENDING_KEY, pending);
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
      const preferredTabId = Number(message.tabId);
      const [openWhopTabs, autoTabs] = await Promise.all([
        whopTabs(),
        readState(AUTO_KEY, {}),
      ]);
      const { candidate, usingRecentTab } = await resolveCandidate(
        Number.isInteger(preferredTabId) ? preferredTabId : null,
        openWhopTabs,
      );
      const targetTabId = candidate?.tabId ?? (Number.isInteger(preferredTabId) ? preferredTabId : null);
      const queue = Number.isInteger(targetTabId) ? await queueForTab(targetTabId) : [];
      const candidates = Number.isInteger(targetTabId) ? await candidatesForTab(targetTabId) : [];
      return {
        ok: true,
        candidate,
        candidateCount: candidates.length,
        targetTabId,
        usingRecentTab,
        whopTabCount: openWhopTabs.length,
        queueCount: queue.length,
        queuedTitles: queue.slice(-5).map((item) => item.title),
        autoEnabled: Number.isInteger(targetTabId) && autoTabs[String(targetTabId)] === true,
      };
    }
    if (message?.type === 'sniperplug:open-whop') return { ok: true, tabId: await openWhop() };
    if (message?.type === 'sniperplug:capture-current') return { ok: true, ...(await captureCurrent(Number(message.tabId))) };
    if (message?.type === 'sniperplug:set-auto-request') return { ok: true, ...(await setAutoCapture(Number(message.tabId), message.enabled === true)) };
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
    clearCandidatesForTab(tabId),
    readState(AUTO_KEY, {}).then((autoTabs) => {
      delete autoTabs[String(tabId)];
      return writeState(AUTO_KEY, autoTabs);
    }),
  ]).catch(() => null);
});

if (chrome.webNavigation?.onCommitted?.addListener) {
  chrome.webNavigation.onCommitted.addListener((details) => {
    const tabId = Number(details?.tabId);
    const frameId = Number(details?.frameId);
    if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return;
    if (frameId === 0) clearCandidatesForTab(tabId).catch(() => null);
    else removeCandidate(tabId, frameId).catch(() => null);
  });
}
