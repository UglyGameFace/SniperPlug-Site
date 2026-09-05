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

  const injected = await injectCaptureIntoTa