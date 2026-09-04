'use strict';

const CANDIDATE_KEY = 'sniperplugCandidates';
const QUEUE_KEY = 'sniperplugCaptureQueues';
const AUTO_KEY = 'sniperplugAutoTabs';
const PENDING_KEY = 'sniperplugPendingCaptures';
const MAX_QUEUE = 25;
const CANDIDATE_TTL_MS = 10 * 60_000;
const EXPERIENCE_LINK_WINDOW_MS = 15_000;
const INJECTION_SETTLE_MS = 180;
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

function candidateKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function candidateRank(candidate) {
  return (candidate?.experienceId ? 1_000_000 : 0)
    + (candidate?.likelyAppFrame ? 500_000 : 0)
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

function recentExperienceForTab(candidates, tabId, now = Date.now()) {
  return Object.values(candidates)
    .filter((candidate) => candidate?.tabId === tabId
      && candidate.experienceId
      && now - Number(candidate.seenAt || 0) <= EXPERIENCE_LINK_WINDOW_MS)
    .sort((left, right) => Number(right.seenAt || 0) - Number(left.seenAt || 0))[0]?.experienceId || '';
}

function linkExperienceAcrossFrames(candidates, tabId, experienceId, now = Date.now()) {
  if (!experienceId) return;
  for (const candidate of Object.values(candidates)) {
    if (candidate?.tabId !== tabId || candidate.experienceId) continue;
    if (now - Number(candidate.seenAt || 0) > EXPERIENCE_LINK_WINDOW_MS) continue;
    candidate.experienceId = experienceId;
  }
}

async function saveCandidate(sender, candidate) {
  const tabId = Number(sender?.tab?.id);
  const frameId = Number(sender?.frameId ?? 0);
  if (!Number.isInteger(tabId)) return;

  const candidates = pruneCandidates(await readState(CANDIDATE_KEY, {}));
  const now = Date.now();
  const experienceId = String(candidate?.experienceId || '') || recentExperienceForTab(candidates, tabId, now);
  const normalized = {
    tabId,
    frameId,
    seenAt: now,
    experienceId,
    title: String(candidate?.title || ''),
    pageUrl: String(candidate?.pageUrl || ''),
    textLength: Math.max(0, Number(candidate?.textLength || 0)),
    host: String(candidate?.host || ''),
    likelyAppFrame: candidate?.likelyAppFrame === true,
  };

  candidates[candidateKey(tabId, frameId)] = normalized;
  if (normalized.experienceId) linkExperienceAcrossFrames(candidates, tabId, normalized.experienceId, now);
  await writeState(CANDIDATE_KEY, candidates);

  const autoTabs = await readState(AUTO_KEY, {});
  if (autoTabs[String(tabId)] === true) {
    chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-auto', enabled: true }, { frameId }).catch(() => null);
  }
}

async function allFreshCandidates() {
  const candidates = pruneCandidates(await readState(CANDIDATE_KEY, {}));
  await writeState(CANDIDATE_KEY, candidates);
  return Object.values(candidates);
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

async function injectCaptureIntoTab(tabId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content-capture.js'],
    });
    await wait(INJECTION_SETTLE_MS);
    return true;
  } catch {
    return false;
  }
}

async function recoverCandidateAcrossWhopTabs(openTabs = null) {
  const tabs = Array.isArray(openTabs) ? openTabs : await whopTabs();
  const ordered = [...tabs]
    .filter((tab) => Number.isInteger(tab?.id))
    .sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0));

  for (const tab of ordered.slice(0, 4)) {
    await injectCaptureIntoTab(tab.id);
    const candidate = await bestCandidate(tab.id);
    if (candidate) return candidate;
  }
  return null;
}

async function resolveCandidate(preferredTabId = null, openTabs = null) {
  let resolved = await bestCandidateAcrossTabs(preferredTabId);
  if (resolved.candidate) return resolved;
  const recovered = await recoverCandidateAcrossWhopTabs(openTabs);
  if (!recovered) return resolved;
  resolved = await bestCandidateAcrossTabs(preferredTabId);
  return resolved;
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
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const candidate = resolved.candidate;
  if (!candidate) throw new Error('Whop is open in Firefox, but the Better Content frame still did not register. Keep the guide visible and reopen the extension.');
  const sourceTabId = candidate.tabId;
  const response = await chrome.tabs.sendMessage(sourceTabId, { type: 'sniperplug:capture-now' }, { frameId: candidate.frameId });
  if (!response?.ok) throw new Error(response?.error || 'The Better Content frame could not be captured.');
  const queue = await addCapture(sourceTabId, response.capture);
  return { capture: response.capture, queueCount: queue.length, candidate, targetTabId: sourceTabId };
}

async function setAutoCapture(tabId, enabled) {
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const sourceTabId = resolved.candidate?.tabId ?? tabId;
  if (!Number.isInteger(sourceTabId)) throw new Error('Open a Better Content guide in Firefox Nightly before enabling auto-capture.');

  const autoTabs = await readState(AUTO_KEY, {});
  if (enabled) autoTabs[String(sourceTabId)] = true;
  else delete autoTabs[String(sourceTabId)];
  await writeState(AUTO_KEY, autoTabs);
  const candidates = await candidatesForTab(sourceTabId);
  await Promise.allSettled(candidates.map((candidate) => chrome.tabs.sendMessage(
    sourceTabId,
    { type: 'sniperplug:set-auto', enabled },
    { frameId: candidate.frameId },
  )));
  return { enabled, targetTabId: sourceTabId };
}

async function queueForTab(tabId) {
  const queues = await readState(QUEUE_KEY, {});
  return Array.isArray(queues[String(tabId)]) ? queues[String(tabId)] : [];
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
