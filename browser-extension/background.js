'use strict';

const CANDIDATE_KEY = 'sniperplugCandidates';
const QUEUE_KEY = 'sniperplugCaptureQueues';
const AUTO_KEY = 'sniperplugAutoTabs';
const TRAVERSAL_KEY = 'sniperplugTraversalTabs';
const PENDING_KEY = 'sniperplugPendingCaptures';
const HISTORY_KEY = 'sniperplugCaptureHistory';
const VERSION_KEY = 'sniperplugVersionStatus';
const MAX_QUEUE = 120;
const MAX_QUEUE_BODY_CHARS = 4_000_000;
const MAX_TRAVERSAL_VISITS = 240;
const MAX_TRAVERSAL_RETRIES = 3;
const MAX_FAILURES_REPORTED = 24;
const TRAVERSAL_NAV_TIMEOUT_MS = 12_000;
const TRAVERSAL_RESUME_MAX_AGE_MS = 24 * 60 * 60_000;
const CANDIDATE_TTL_MS = 10 * 60_000;
const APP_FRAME_SETTLE_MS = 4000;
const APP_FRAME_POLL_MS = 100;
const VERSION_CACHE_MS = 6 * 60 * 60_000;
const SENSITIVE_QUERY_KEY = /(?:token|auth|jwt|session|signature|secret|password|code|state|key)/i;
const BLOCKED_TRAVERSAL_PATH = /\/(?:api|oauth|auth|login|logout|sign-?out|account|settings|admin|billing|checkout|purchase|support|contact)(?:\/|$)/i;
const PRESENTATION_QUERY_KEY = /^(?:view|theme|embed|ref|from|source)$/i;
const WHOP_TAB_PATTERNS = [
  'https://whop.com/*',
  'https://*.whop.com/*',
  'https://*.apps.whop.com/*',
];
const traversalLocks = new Map();
const traversalTimers = new Map();

function sessionStore() {
  return chrome.storage?.session;
}

function persistentStore() {
  return chrome.storage?.local || chrome.storage?.session;
}

async function readFrom(store, key, fallback) {
  if (!store?.get) return fallback;
  const stored = await store.get(key);
  return stored?.[key] ?? fallback;
}

async function writeTo(store, key, value) {
  if (!store?.set) return;
  await store.set({ [key]: value });
}

async function readSession(key, fallback) {
  return readFrom(sessionStore(), key, fallback);
}

async function writeSession(key, value) {
  return writeTo(sessionStore(), key, value);
}

async function readPersistent(key, fallback) {
  return readFrom(persistentStore(), key, fallback);
}

async function writePersistent(key, value) {
  return writeTo(persistentStore(), key, value);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTraversalLock(tabId, task) {
  const key = Number.isInteger(tabId) ? tabId : -1;
  const previous = traversalLocks.get(key) || Promise.resolve();
  let next;
  next = previous
    .catch(() => null)
    .then(task)
    .finally(() => {
      if (traversalLocks.get(key) === next) traversalLocks.delete(key);
    });
  traversalLocks.set(key, next);
  return next;
}

function isWhopAppHost(hostname) {
  return String(hostname || '').toLowerCase().endsWith('.apps.whop.com');
}

function experienceIdFromUrl(value) {
  const match = String(value || '').match(/\bexp_[A-Za-z0-9_-]+\b/);
  return match ? match[0] : '';
}

function queryLooksSensitive(url) {
  for (const key of [...url.searchParams.keys()]) {
    const values = url.searchParams.getAll(key);
    if (SENSITIVE_QUERY_KEY.test(key)) return true;
    if (values.some((item) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item) || String(item || '').length > 180)) return true;
  }
  return false;
}

function safeAppFrameUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && isWhopAppHost(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

function normalizedTraversalUrl(value, state) {
  const url = safeAppFrameUrl(value);
  if (!url || BLOCKED_TRAVERSAL_PATH.test(url.pathname) || queryLooksSensitive(url)) return '';
  if (state?.host && url.hostname.toLowerCase() !== String(state.host).toLowerCase()) return '';
  const targetExperience = experienceIdFromUrl(url.pathname);
  if (state?.experienceId && targetExperience && targetExperience !== state.experienceId) return '';
  if (state?.scope === 'section' && state?.scopePath
    && url.pathname !== state.scopePath
    && !url.pathname.startsWith(`${state.scopePath}/`)) return '';
  url.hash = '';
  url.searchParams.sort();
  return url.toString();
}

function stablePageKey(capture) {
  const url = safeAppFrameUrl(capture?.pageUrl || capture?.frameUrl);
  if (!url) return '';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEY.test(key) || PRESENTATION_QUERY_KEY.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return `${String(capture?.experienceId || '')}|${url.origin}${url.pathname}${url.search}`;
}

async function digestText(value) {
  const text = String(value || '');
  if (globalThis.crypto?.subtle && typeof TextEncoder === 'function') {
    try {
      const bytes = new TextEncoder().encode(text);
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
    } catch { /* Deterministic fallback below. */ }
  }
  let h1 = 2166136261;
  let h2 = 2246822519;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 ^= code + index;
    h2 = Math.imul(h2, 3266489917);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}${text.length.toString(16).padStart(8, '0')}`;
}

async function captureFingerprint(capture) {
  const images = (Array.isArray(capture?.images) ? capture.images : [])
    .map((image) => String(image?.url || ''))
    .filter(Boolean)
    .sort();
  return digestText(JSON.stringify({
    title: String(capture?.title || '').trim(),
    body: String(capture?.bodyMarkdown || '').trim(),
    images,
  }));
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
  const candidates = await readSession(CANDIDATE_KEY, {});
  const key = candidateKey(tabId, frameId);
  if (Object.prototype.hasOwnProperty.call(candidates, key)) {
    delete candidates[key];
    await writeSession(CANDIDATE_KEY, candidates);
  }
}

async function clearCandidatesForTab(tabId) {
  const candidates = await readSession(CANDIDATE_KEY, {});
  let changed = false;
  for (const key of Object.keys(candidates)) {
    if (key.startsWith(`${tabId}:`)) {
      delete candidates[key];
      changed = true;
    }
  }
  if (changed) await writeSession(CANDIDATE_KEY, candidates);
}

function traversalId(experienceId, host) {
  return `${String(experienceId || '').trim()}|${String(host || '').toLowerCase()}`;
}

async function allTraversals() {
  const traversals = await readPersistent(TRAVERSAL_KEY, {});
  const now = Date.now();
  let changed = false;
  for (const [id, state] of Object.entries(traversals)) {
    if (!state?.updatedAt || now - Number(state.updatedAt) > TRAVERSAL_RESUME_MAX_AGE_MS) {
      delete traversals[id];
      changed = true;
    }
  }
  if (changed) await writePersistent(TRAVERSAL_KEY, traversals);
  return traversals;
}

async function traversalForCandidate(candidate) {
  if (!candidate?.experienceId || !candidate?.host) return null;
  const traversals = await allTraversals();
  return traversals[traversalId(candidate.experienceId, candidate.host)] || null;
}

async function traversalForTab(tabId, candidate = null) {
  const traversals = await allTraversals();
  const direct = Object.values(traversals).find((state) => state?.tabId === tabId) || null;
  if (direct) return direct;
  if (candidate?.experienceId && candidate?.host) return traversals[traversalId(candidate.experienceId, candidate.host)] || null;
  return null;
}

async function saveTraversal(state) {
  if (!state?.experienceId || !state?.host) return;
  const traversals = await allTraversals();
  traversals[traversalId(state.experienceId, state.host)] = state;
  await writePersistent(TRAVERSAL_KEY, traversals);
}

async function deleteTraversal(state) {
  if (!state?.experienceId || !state?.host) return;
  const traversals = await allTraversals();
  delete traversals[traversalId(state.experienceId, state.host)];
  await writePersistent(TRAVERSAL_KEY, traversals);
}

async function saveCandidate(sender, candidate) {
  const tabId = Number(sender?.tab?.id);
  const frameId = Number(sender?.frameId ?? 0);
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return;
  if (candidate?.likelyAppFrame !== true || !isWhopAppHost(candidate?.host)) return;

  const candidates = pruneCandidates(await readSession(CANDIDATE_KEY, {}));
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
  await writeSession(CANDIDATE_KEY, candidates);

  const traversal = await traversalForCandidate(normalized);
  if (traversal && (traversal.enabled === true || traversal.status === 'interrupted')) {
    if (traversal.status === 'interrupted') {
      traversal.enabled = true;
      traversal.status = 'running';
      traversal.lastDiagnostic = 'Resumed after the Whop tab or browser was reopened.';
      if (traversal.currentTarget?.url) {
        traversal.pending = [traversal.currentTarget, ...(Array.isArray(traversal.pending) ? traversal.pending : [])];
        traversal.currentTarget = null;
      }
    }
    const previousTabId = Number(traversal.tabId ?? traversal.lastTabId);
    traversal.tabId = tabId;
    traversal.frameId = frameId;
    traversal.lastTabId = tabId;
    if (Number.isInteger(previousTabId) && previousTabId !== tabId) await migrateQueue(previousTabId, tabId);
    traversal.updatedAt = now;
    await saveTraversal(traversal);
    await setPassiveAutoForTab(tabId, false);
    chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-auto', enabled: false }, { frameId }).catch(() => null);
    chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-traversal', enabled: true }, { frameId }).catch(() => null);
  } else {
    const autoTabs = await readSession(AUTO_KEY, {});
    if (autoTabs[String(tabId)] === true) {
      chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-auto', enabled: true }, { frameId }).catch(() => null);
    }
  }
}

async function allFreshCandidates() {
  const candidates = pruneCandidates(await readSession(CANDIDATE_KEY, {}));
  await writeSession(CANDIDATE_KEY, candidates);
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
  return stablePageKey(capture) || `${String(capture?.experienceId || '')}|${String(capture?.pageIdentity || capture?.pageUrl || '')}`;
}

function isSafeAppCapture(capture) {
  return /^exp_[A-Za-z0-9_-]+$/.test(String(capture?.experienceId || ''))
    && Boolean(String(capture?.bodyMarkdown || '').trim())
    && Boolean(safeAppFrameUrl(capture?.pageUrl || capture?.frameUrl));
}

function captureBodyChars(capture) {
  return String(capture?.bodyMarkdown || '').length;
}

function queueBodyChars(captures) {
  return captures.reduce((sum, capture) => sum + captureBodyChars(capture), 0);
}

async function captureHistory() {
  return readPersistent(HISTORY_KEY, {});
}

async function classifySyncCapture(tabId, capture) {
  const key = stablePageKey(capture);
  const fingerprint = await captureFingerprint(capture);
  const history = await captureHistory();
  const queues = await readPersistent(QUEUE_KEY, {});
  const current = Array.isArray(queues[String(tabId)]) ? queues[String(tabId)].filter(isSafeAppCapture) : [];
  const currentSameKey = current.find((item) => captureIdentity(item) === key);
  const duplicateFingerprint = current.find((item) => item?._sniperplugFingerprint === fingerprint && captureIdentity(item) !== key);
  const historicalDuplicate = Object.entries(history).find(([historyKey, item]) => historyKey !== key && item?.fingerprint === fingerprint);
  if (duplicateFingerprint || historicalDuplicate) return { action: 'duplicate', key, fingerprint };
  if (currentSameKey?._sniperplugFingerprint === fingerprint) return { action: 'duplicate', key, fingerprint };
  const previous = history[key];
  if (previous?.fingerprint === fingerprint) return { action: 'unchanged', key, fingerprint };
  return { action: previous ? 'changed' : 'new', key, fingerprint };
}

async function addCapture(tabId, capture, options = {}) {
  if (!isSafeAppCapture(capture)) throw new Error('SniperPlug refused a capture that did not come from the rendered Better Content app frame.');
  const queues = await readPersistent(QUEUE_KEY, {});
  const key = String(tabId);
  const current = Array.isArray(queues[key]) ? queues[key].filter(isSafeAppCapture) : [];
  const identity = captureIdentity(capture);
  const fingerprint = options.fingerprint || await captureFingerprint(capture);
  const enriched = {
    ...capture,
    _sniperplugStableKey: identity,
    _sniperplugFingerprint: fingerprint,
    _sniperplugChangeType: options.changeType || capture?._sniperplugChangeType || 'manual',
  };
  const existingIndex = current.findIndex((item) => captureIdentity(item) === identity);
  const next = [...current];
  if (existingIndex >= 0) next.splice(existingIndex, 1, enriched);
  else next.push(enriched);
  if (next.length > MAX_QUEUE) {
    throw new Error(`Capture-all reached the safe ${MAX_QUEUE}-page extension queue limit. Send the queued pages to SniperPlug before capturing more.`);
  }
  if (queueBodyChars(next) > MAX_QUEUE_BODY_CHARS) {
    throw new Error('Capture-all reached the safe extension storage limit. Send the queued pages to SniperPlug before capturing more.');
  }
  queues[key] = next;
  await writePersistent(QUEUE_KEY, queues);
  return next;
}

async function queueForTab(tabId) {
  const queues = await readPersistent(QUEUE_KEY, {});
  const key = String(tabId);
  const current = Array.isArray(queues[key]) ? queues[key] : [];
  const safe = current.filter(isSafeAppCapture);
  if (safe.length !== current.length) {
    if (safe.length) queues[key] = safe;
    else delete queues[key];
    await writePersistent(QUEUE_KEY, queues);
  }
  return safe;
}

async function migrateQueue(oldTabId, newTabId) {
  if (!Number.isInteger(oldTabId) || !Number.isInteger(newTabId) || oldTabId === newTabId) return;
  const queues = await readPersistent(QUEUE_KEY, {});
  const oldQueue = Array.isArray(queues[String(oldTabId)]) ? queues[String(oldTabId)] : [];
  if (!oldQueue.length) return;
  const current = Array.isArray(queues[String(newTabId)]) ? queues[String(newTabId)] : [];
  const merged = [...current];
  for (const capture of oldQueue) {
    const identity = captureIdentity(capture);
    const index = merged.findIndex((item) => captureIdentity(item) === identity);
    if (index >= 0) merged[index] = capture;
    else merged.push(capture);
  }
  queues[String(newTabId)] = merged.slice(-MAX_QUEUE);
  delete queues[String(oldTabId)];
  await writePersistent(QUEUE_KEY, queues);
}

async function clearQueue(tabId) {
  const queues = await readPersistent(QUEUE_KEY, {});
  delete queues[String(tabId)];
  await writePersistent(QUEUE_KEY, queues);
}

async function captureCurrent(tabId) {
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const candidate = resolved.candidate;
  if (!candidate || !isCaptureCandidate(candidate)) {
    throw new Error('Whop is open in Firefox, but SniperPlug has not found the rendered Better Content app frame yet. Keep the content visible and reopen the extension.');
  }
  const sourceTabId = candidate.tabId;
  const response = await chrome.tabs.sendMessage(sourceTabId, { type: 'sniperplug:capture-now' }, { frameId: candidate.frameId });
  if (!response?.ok) throw new Error(response?.error || 'The Better Content frame could not be captured.');
  const queue = await addCapture(sourceTabId, response.capture, { changeType: 'manual' });
  return { capture: response.capture, queueCount: queue.length, candidate, targetTabId: sourceTabId };
}

async function setPassiveAutoForTab(tabId, enabled) {
  const autoTabs = await readSession(AUTO_KEY, {});
  if (enabled) autoTabs[String(tabId)] = true;
  else delete autoTabs[String(tabId)];
  await writeSession(AUTO_KEY, autoTabs);
}

async function setAutoCapture(tabId, enabled) {
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const candidate = resolved.candidate;
  if (!candidate || !isCaptureCandidate(candidate)) throw new Error('Open a rendered Better Content guide in Firefox Nightly before enabling capture-as-I-browse.');
  const sourceTabId = candidate.tabId;
  const traversal = await traversalForTab(sourceTabId, candidate);
  if (enabled && traversal?.enabled) throw new Error('Capture-as-I-browse stays off while Capture all guides is running.');
  await setPassiveAutoForTab(sourceTabId, enabled);
  const candidates = await candidatesForTab(sourceTabId);
  await Promise.allSettled(candidates.map((item) => chrome.tabs.sendMessage(
    sourceTabId,
    { type: 'sniperplug:set-auto', enabled },
    { frameId: item.frameId },
  )));
  return { enabled, targetTabId: sourceTabId };
}

function traversalPublicState(state) {
  if (!state) return {
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
  };
  const resumable = ['stopped', 'interrupted', 'error', 'limit'].includes(String(state.status || ''));
  return {
    crawlEnabled: state.enabled === true,
    crawlStatus: String(state.status || 'idle'),
    crawlDiscovered: Math.max(0, Number(state.discovered || 0)),
    crawlVisited: Array.isArray(state.visited) ? state.visited.length : 0,
    crawlCaptured: Math.max(0, Number(state.captured || 0)),
    crawlRemaining: (Array.isArray(state.pending) ? state.pending.length : 0) + (state.currentTarget ? 1 : 0),
    crawlCurrentTitle: String(state.currentTarget?.title || state.currentTitle || ''),
    crawlRetries: Math.max(0, Number(state.retryCount || 0)),
    crawlFailures: Array.isArray(state.failures) ? state.failures.length : 0,
    crawlSkipped: Math.max(0, Number(state.skipped || 0)),
    crawlNew: Math.max(0, Number(state.newCount || 0)),
    crawlChanged: Math.max(0, Number(state.changedCount || 0)),
    crawlUnchanged: Math.max(0, Number(state.unchangedCount || 0)),
    crawlDuplicates: Math.max(0, Number(state.duplicateCount || 0)),
    crawlError: String(state.error || ''),
    crawlDiagnostic: String(state.lastDiagnostic || ''),
    crawlFailureTitles: (Array.isArray(state.failures) ? state.failures : []).slice(-5).map((item) => item.title || item.url).filter(Boolean),
    crawlScope: state.scope === 'section' ? 'section' : 'experience',
    crawlCanResume: resumable,
    crawlAutoSend: state.autoSend === true,
  };
}

async function setTraversalFrame(tabId, frameId, enabled) {
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return false;
  try {
    const response = await chrome.tabs.sendMessage(
      tabId,
      { type: 'sniperplug:set-traversal', enabled: enabled === true },
      { frameId },
    );
    return response?.ok === true;
  } catch {
    return false;
  }
}

function sectionScopePath(seedUrl, experienceId) {
  const seed = safeAppFrameUrl(seedUrl);
  if (!seed) return `/experiences/${experienceId}`;
  return seed.pathname.replace(/\/+$/, '') || `/experiences/${experienceId}`;
}

function clearTraversalTimer(state) {
  const id = traversalId(state?.experienceId, state?.host);
  const timer = traversalTimers.get(id);
  if (timer) clearTimeout(timer);
  traversalTimers.delete(id);
}

function scheduleTraversalTimeout(state) {
  clearTraversalTimer(state);
  if (!state?.enabled || !state?.currentTarget?.url) return;
  const id = traversalId(state.experienceId, state.host);
  const expectedUrl = state.currentTarget.url;
  const timer = setTimeout(() => {
    withTraversalLock(Number(state.tabId), async () => {
      const latest = await traversalForCandidate(state);
      if (!latest?.enabled || latest.currentTarget?.url !== expectedUrl) return;
      await retryOrSkipCurrent(latest, 'The page did not finish rendering before the navigation timeout.');
    }).catch(() => null);
  }, TRAVERSAL_NAV_TIMEOUT_MS);
  traversalTimers.set(id, timer);
}

async function startTraversal(tabId, options = {}) {
  const openTabs = await whopTabs();
  const resolved = await resolveCandidate(Number.isInteger(tabId) ? tabId : null, openTabs);
  const candidate = resolved.candidate;
  if (!candidate || !isCaptureCandidate(candidate) || !candidate.experienceId) {
    throw new Error('Open Hidden Files → Make Money Here in Firefox Nightly so SniperPlug can see the Better Content directory before starting Capture all guides.');
  }
  const seed = safeAppFrameUrl(candidate.pageUrl);
  if (!seed) throw new Error('The Better Content directory does not expose a safe app-frame URL yet.');
  const sourceTabId = candidate.tabId;
  const scope = options.scope === 'section' ? 'section' : 'experience';
  const existing = await traversalForCandidate(candidate);
  let state;
  if (existing && options.resume === true && ['stopped', 'interrupted', 'error', 'limit'].includes(existing.status)) {
    state = existing;
    const oldTabId = Number(state.tabId);
    state.enabled = true;
    state.status = 'running';
    state.error = '';
    state.tabId = sourceTabId;
    state.frameId = candidate.frameId;
    state.autoSend = options.autoSend === true ? true : state.autoSend === true;
    state.rightsConfirmed = options.rightsConfirmed === true ? true : state.rightsConfirmed === true;
    if (state.currentTarget?.url) {
      state.pending = [state.currentTarget, ...(Array.isArray(state.pending) ? state.pending : [])];
      state.currentTarget = null;
    }
    if (Number.isInteger(oldTabId) && oldTabId !== sourceTabId) await migrateQueue(oldTabId, sourceTabId);
    state.lastDiagnostic = 'Resumed the saved capture-all session.';
  } else {
    state = {
      enabled: true,
      status: 'starting',
      error: '',
      experienceId: candidate.experienceId,
      host: String(candidate.host || '').toLowerCase(),
      tabId: sourceTabId,
      frameId: candidate.frameId,
      seedUrl: seed.toString(),
      scope,
      scopePath: scope === 'section' ? sectionScopePath(seed.toString(), candidate.experienceId) : `/experiences/${candidate.experienceId}/`,
      currentTarget: null,
      currentTitle: '',
      pending: [],
      visited: [],
      retries: {},
      failures: [],
      discovered: 0,
      captured: 0,
      skipped: 0,
      retryCount: 0,
      newCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      duplicateCount: 0,
      lastSnapshotKey: '',
      lastDiagnostic: '',
      autoSend: options.autoSend === true,
      rightsConfirmed: options.rightsConfirmed === true,
      passiveAutoWasEnabled: (await readSession(AUTO_KEY, {}))[String(sourceTabId)] === true,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  await setPassiveAutoForTab(sourceTabId, false);
  await saveTraversal(state);
  const candidates = await candidatesForTab(sourceTabId);
  await Promise.allSettled(candidates.map((item) => chrome.tabs.sendMessage(sourceTabId, { type: 'sniperplug:set-auto', enabled: false }, { frameId: item.frameId })));
  const attached = await setTraversalFrame(sourceTabId, candidate.frameId, true);
  if (!attached) {
    state.enabled = false;
    state.status = 'error';
    state.error = 'SniperPlug could not attach Capture all guides to the rendered Better Content frame.';
    state.updatedAt = Date.now();
    await saveTraversal(state);
    throw new Error(state.error);
  }
  return { targetTabId: sourceTabId, ...traversalPublicState(state) };
}

async function stopTraversal(tabId, status = 'stopped', error = '') {
  const candidate = await bestCandidate(tabId);
  const state = await traversalForTab(tabId, candidate);
  if (!state) return { targetTabId: tabId, ...traversalPublicState(null) };
  clearTraversalTimer(state);
  state.enabled = false;
  state.status = status;
  state.error = error;
  state.updatedAt = Date.now();
  await saveTraversal(state);
  const candidates = await candidatesForTab(tabId);
  await Promise.allSettled(candidates.map((item) => setTraversalFrame(tabId, item.frameId, false)));
  if (state.passiveAutoWasEnabled && status === 'stopped') {
    await setPassiveAutoForTab(tabId, true);
    await Promise.allSettled(candidates.map((item) => chrome.tabs.sendMessage(tabId, { type: 'sniperplug:set-auto', enabled: true }, { frameId: item.frameId })));
  }
  return { targetTabId: tabId, ...traversalPublicState(state) };
}

function mergeTraversalTargets(state, targets) {
  const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
  const known = new Set([
    ...visited,
    ...(Array.isArray(state.pending) ? state.pending.map((item) => item.url) : []),
    state.currentTarget?.url || '',
    state.seedUrl || '',
  ].filter(Boolean));
  const pending = Array.isArray(state.pending) ? [...state.pending] : [];
  for (const raw of Array.isArray(targets) ? targets.slice(0, 360) : []) {
    if (known.size >= MAX_TRAVERSAL_VISITS) break;
    const url = normalizedTraversalUrl(raw?.url, state);
    if (!url || known.has(url)) continue;
    known.add(url);
    pending.push({
      url,
      title: String(raw?.title || '').trim().slice(0, 180),
    });
  }
  state.pending = pending;
  state.discovered = Math.max(Number(state.discovered || 0), known.size - (state.seedUrl ? 1 : 0));
}

async function sendTraversalNavigation(state, target) {
  state.status = 'running';
  state.currentTarget = { ...target, startedAt: Date.now() };
  state.currentTitle = target.title || '';
  state.updatedAt = Date.now();
  await saveTraversal(state);
  try {
    const response = await chrome.tabs.sendMessage(
      state.tabId,
      { type: 'sniperplug:traverse-navigate', url: target.url },
      { frameId: state.frameId },
    );
    if (!response?.ok) throw new Error(response?.error || 'navigation refused');
    scheduleTraversalTimeout(state);
    return true;
  } catch (error) {
    await retryOrSkipCurrent(state, `Navigation failed: ${String(error?.message || error || 'unknown error')}`);
    return false;
  }
}

async function nextTraversalTarget(state) {
  const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
  while (state.pending.length && visited.has(state.pending[0]?.url)) state.pending.shift();
  if (state.visited.length >= MAX_TRAVERSAL_VISITS) {
    return stopTraversal(state.tabId, 'limit', `Capture-all stopped at the safe ${MAX_TRAVERSAL_VISITS}-page traversal limit.`);
  }
  const nextTarget = state.pending.shift() || null;
  if (!nextTarget) {
    clearTraversalTimer(state);
    state.enabled = false;
    state.status = state.captured > 0 || state.unchangedCount > 0 ? 'complete' : 'complete-empty';
    state.currentTarget = null;
    state.currentTitle = '';
    state.updatedAt = Date.now();
    await saveTraversal(state);
    await setTraversalFrame(state.tabId, state.frameId, false);
    if (state.passiveAutoWasEnabled) {
      await setPassiveAutoForTab(state.tabId, true);
      const candidates = await candidatesForTab(state.tabId);
      await Promise.allSettled(candidates.map((item) => chrome.tabs.sendMessage(state.tabId, { type: 'sniperplug:set-auto', enabled: true }, { frameId: item.frameId })));
    }
    if (state.autoSend === true && state.rightsConfirmed === true) {
      const queue = await queueForTab(state.tabId);
      if (queue.length) {
        state.lastDiagnostic = `Capture-all finished. Sending ${queue.length} changed/new page${queue.length === 1 ? '' : 's'} to SniperPlug automatically.`;
        await saveTraversal(state);
        try { await preparePending(state.tabId, true); } catch (error) {
          state.status = 'error';
          state.error = `Capture completed, but automatic handoff failed: ${String(error?.message || error)}`;
          await saveTraversal(state);
        }
      }
    }
    return { complete: true, ...traversalPublicState(state) };
  }
  await sendTraversalNavigation(state, nextTarget);
  return { complete: false, ...traversalPublicState(state) };
}

async function retryOrSkipCurrent(state, reason) {
  clearTraversalTimer(state);
  const target = state.currentTarget;
  if (!target?.url) return nextTraversalTarget(state);
  const retries = state.retries || {};
  const attempts = Math.max(0, Number(retries[target.url] || 0));
  if (attempts < MAX_TRAVERSAL_RETRIES) {
    retries[target.url] = attempts + 1;
    state.retries = retries;
    state.retryCount = Math.max(0, Number(state.retryCount || 0)) + 1;
    state.lastDiagnostic = `Retry ${attempts + 1}/${MAX_TRAVERSAL_RETRIES}: ${target.title || target.url}. ${reason}`;
    state.updatedAt = Date.now();
    await saveTraversal(state);
    await wait(Math.min(2400, 450 * (attempts + 1)));
    await sendTraversalNavigation(state, target);
    return traversalPublicState(state);
  }
  const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
  visited.add(target.url);
  state.visited = [...visited].slice(-MAX_TRAVERSAL_VISITS);
  state.failures = [...(Array.isArray(state.failures) ? state.failures : []), {
    url: target.url,
    title: target.title || target.url,
    reason,
  }].slice(-MAX_FAILURES_REPORTED);
  state.skipped = Math.max(0, Number(state.skipped || 0)) + 1;
  state.lastDiagnostic = `Skipped ${target.title || target.url} after ${MAX_TRAVERSAL_RETRIES} retries.`;
  state.currentTarget = null;
  state.currentTitle = '';
  state.lastSnapshotKey = '';
  await saveTraversal(state);
  return nextTraversalTarget(state);
}

async function handleTraversalPage(sender, snapshot) {
  const tabId = Number(sender?.tab?.id);
  const frameId = Number(sender?.frameId ?? 0);
  if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return { ignored: true };
  return withTraversalLock(tabId, async () => {
    const candidate = await bestCandidate(tabId);
    const state = await traversalForTab(tabId, candidate);
    if (!state?.enabled) return { ignored: true, ...traversalPublicState(state) };
    if (state.frameId !== frameId) state.frameId = frameId;
    const snapshotExperience = String(snapshot?.experienceId || '').trim();
    if (snapshotExperience && snapshotExperience !== state.experienceId) {
      return stopTraversal(tabId, 'error', 'Capture-all stopped because Better Content navigated to a different Whop experience.');
    }
    const pageUrl = normalizedTraversalUrl(snapshot?.pageUrl, state);
    if (!pageUrl) return stopTraversal(tabId, 'error', 'Capture-all stopped because Better Content left the verified app-frame scope or exposed a credential-bearing URL.');

    clearTraversalTimer(state);
    const targetSignature = (Array.isArray(snapshot?.targets) ? snapshot.targets : [])
      .slice(0, 360)
      .map((target) => String(target?.url || ''))
      .sort()
      .join('|');
    const snapshotKey = `${pageUrl}|${snapshot?.capture?.bodyMarkdown?.length || 0}|${targetSignature}|${snapshot?.diagnostics?.controlsClicked || 0}`;
    if (snapshotKey === state.lastSnapshotKey) return { ignored: true, ...traversalPublicState(state) };
    state.lastSnapshotKey = snapshotKey;
    state.updatedAt = Date.now();
    state.lastDiagnostic = snapshot?.diagnostics
      ? `Rendered page prepared: ${Number(snapshot.diagnostics.scrollSteps || 0)} scroll step(s), ${Number(snapshot.diagnostics.controlsClicked || 0)} expander(s), ${Number(snapshot.diagnostics.tabPanels || 0)} tab panel(s), ${Number(snapshot.diagnostics.imagesStillPending || 0)} image(s) still pending.`
      : '';

    const currentMatched = state.currentTarget?.url && normalizedTraversalUrl(state.currentTarget.url, state) === pageUrl;
    const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
    if (currentMatched) {
      visited.add(state.currentTarget.url);
      state.currentTarget = null;
      state.currentTitle = '';
    }
    visited.add(pageUrl);
    state.visited = [...visited].slice(-MAX_TRAVERSAL_VISITS);

    mergeTraversalTargets(state, snapshot?.targets);

    const renderLooksEmpty = snapshot?.directoryLike !== true
      && !snapshot?.capture
      && (!Array.isArray(snapshot?.targets) || snapshot.targets.length === 0);
    if (renderLooksEmpty && currentMatched) {
      state.currentTarget = { url: pageUrl, title: String(snapshot?.title || pageUrl) };
      return { retrying: true, ...(await retryOrSkipCurrent(state, 'The page rendered no capturable body or child links.')) };
    }

    if (snapshot?.capture && snapshot?.directoryLike !== true) {
      try {
        const classified = await classifySyncCapture(tabId, snapshot.capture);
        if (classified.action === 'new' || classified.action === 'changed') {
          await addCapture(tabId, snapshot.capture, {
            fingerprint: classified.fingerprint,
            changeType: classified.action,
          });
          state.captured += 1;
          if (classified.action === 'new') state.newCount += 1;
          else state.changedCount += 1;
        } else if (classified.action === 'unchanged') {
          state.unchangedCount += 1;
        } else {
          state.duplicateCount += 1;
        }
      } catch (error) {
        return stopTraversal(tabId, 'error', String(error?.message || error || 'Capture-all could not queue this page.'));
      }
    } else if (snapshot?.directoryLike === true) {
      state.skipped += 1;
    }

    await saveTraversal(state);
    return nextTraversalTarget(state);
  });
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
  const pendingId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const pending = await readPersistent(PENDING_KEY, {});
  pending[pendingId] = {
    id: pendingId,
    sourceTabId: tabId,
    rightsConfirmed: true,
    captures,
    createdAt: Date.now(),
  };
  await writePersistent(PENDING_KEY, pending);
  await openSniperPlug(pendingId);
  return { pendingId, count: captures.length };
}

async function pendingCapture(id) {
  const pending = await readPersistent(PENDING_KEY, {});
  const item = pending[String(id || '')] || null;
  if (!item) return null;
  if (Date.now() - Number(item.createdAt || 0) > 30 * 60_000) {
    delete pending[String(id || '')];
    await writePersistent(PENDING_KEY, pending);
    return null;
  }
  const captures = Array.isArray(item.captures) ? item.captures.filter(isSafeAppCapture) : [];
  if (!captures.length) {
    delete pending[String(id || '')];
    await writePersistent(PENDING_KEY, pending);
    return null;
  }
  if (captures.length !== item.captures.length) {
    item.captures = captures;
    pending[String(id || '')] = item;
    await writePersistent(PENDING_KEY, pending);
  }
  return item;
}

async function commitCaptureHistory(captures) {
  const history = await captureHistory();
  const now = Date.now();
  for (const capture of Array.isArray(captures) ? captures : []) {
    const key = capture?._sniperplugStableKey || stablePageKey(capture);
    const fingerprint = capture?._sniperplugFingerprint || await captureFingerprint(capture);
    if (!key || !fingerprint) continue;
    history[key] = {
      fingerprint,
      title: String(capture?.title || '').slice(0, 180),
      pageUrl: String(capture?.pageUrl || '').slice(0, 800),
      importedAt: now,
    };
  }
  await writePersistent(HISTORY_KEY, history);
}

async function clearPending(id, success = false) {
  const pending = await readPersistent(PENDING_KEY, {});
  const item = pending[String(id || '')] || null;
  if (item) {
    delete pending[String(id || '')];
    await writePersistent(PENDING_KEY, pending);
    if (success) {
      await commitCaptureHistory(item.captures || []);
      if (Number.isInteger(item.sourceTabId)) await clearQueue(item.sourceTabId);
    }
  }
}

function compareVersions(left, right) {
  const a = String(left || '').split('.').map((item) => Number.parseInt(item, 10) || 0);
  const b = String(right || '').split('.').map((item) => Number.parseInt(item, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

async function extensionVersionState() {
  const installed = String(chrome.runtime?.getManifest?.()?.version || 'unknown');
  const cached = await readSession(VERSION_KEY, null);
  if (cached?.checkedAt && Date.now() - Number(cached.checkedAt) < VERSION_CACHE_MS) return { installed, ...cached };
  if (typeof fetch !== 'function') return { installed, updateAvailable: false, latest: '', minimum: '', checkedAt: 0 };
  try {
    const response = await fetch('https://sniperplug.com/browser-extension-version.json', { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`version check ${response.status}`);
    const data = await response.json();
    const latest = String(data?.latest || '').trim();
    const minimum = String(data?.minimum || '').trim();
    const next = {
      latest,
      minimum,
      updateAvailable: Boolean(latest && installed !== 'unknown' && compareVersions(installed, latest) < 0),
      incompatible: Boolean(minimum && installed !== 'unknown' && compareVersions(installed, minimum) < 0),
      notes: String(data?.notes || '').slice(0, 240),
      checkedAt: Date.now(),
    };
    await writeSession(VERSION_KEY, next);
    return { installed, ...next };
  } catch {
    return { installed, updateAvailable: false, latest: '', minimum: '', checkedAt: Date.now() };
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
      const autoTabs = await readSession(AUTO_KEY, {});
      const traversal = Number.isInteger(tabId) ? await traversalForTab(tabId, await bestCandidate(tabId)) : null;
      if (Number.isInteger(tabId) && autoTabs[String(tabId)] === true && !traversal?.enabled) {
        const queue = await addCapture(tabId, message.capture, { changeType: 'auto' });
        return { ok: true, queueCount: queue.length };
      }
      return { ok: false, ignored: true };
    }
    if (message?.type === 'sniperplug:traversal-page') {
      return { ok: true, ...(await handleTraversalPage(sender, message.snapshot || {})) };
    }
    if (message?.type === 'sniperplug:popup-state') {
      const preferredTabId = Number(message.tabId);
      const [openWhopTabs, autoTabs, version] = await Promise.all([
        whopTabs(),
        readSession(AUTO_KEY, {}),
        extensionVersionState(),
      ]);
      const { candidate, usingRecentTab } = await resolveCandidate(
        Number.isInteger(preferredTabId) ? preferredTabId : null,
        openWhopTabs,
      );
      const targetTabId = candidate?.tabId ?? (Number.isInteger(preferredTabId) ? preferredTabId : null);
      const traversal = Number.isInteger(targetTabId) ? await traversalForTab(targetTabId, candidate) : null;
      if (candidate && traversal && traversal.tabId !== targetTabId) {
        const oldTabId = Number(traversal.tabId);
        traversal.tabId = targetTabId;
        traversal.frameId = candidate.frameId;
        await saveTraversal(traversal);
        if (Number.isInteger(oldTabId)) await migrateQueue(oldTabId, targetTabId);
      }
      if (traversal?.enabled && traversal.currentTarget?.startedAt && Date.now() - Number(traversal.currentTarget.startedAt) > TRAVERSAL_NAV_TIMEOUT_MS) {
        await retryOrSkipCurrent(traversal, 'Recovered a stale in-progress navigation while reopening the extension.');
      }
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
        queuedTitles: queue.slice(-8).map((item) => item.title),
        autoEnabled: Number.isInteger(targetTabId) && autoTabs[String(targetTabId)] === true && !traversal?.enabled,
        extensionVersion: version,
        ...traversalPublicState(traversal),
      };
    }
    if (message?.type === 'sniperplug:open-whop') return { ok: true, tabId: await openWhop() };
    if (message?.type === 'sniperplug:capture-current') return { ok: true, ...(await captureCurrent(Number(message.tabId))) };
    if (message?.type === 'sniperplug:set-auto-request') return { ok: true, ...(await setAutoCapture(Number(message.tabId), message.enabled === true)) };
    if (message?.type === 'sniperplug:start-traversal') return { ok: true, ...(await startTraversal(Number(message.tabId), {
      scope: message.scope,
      autoSend: message.autoSend === true,
      rightsConfirmed: message.rightsConfirmed === true,
      resume: message.resume === true,
    })) };
    if (message?.type === 'sniperplug:stop-traversal') return { ok: true, ...(await stopTraversal(Number(message.tabId))) };
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
    readSession(AUTO_KEY, {}).then((autoTabs) => {
      delete autoTabs[String(tabId)];
      return writeSession(AUTO_KEY, autoTabs);
    }),
    traversalForTab(tabId).then(async (state) => {
      if (!state) return;
      clearTraversalTimer(state);
      if (state.enabled) {
        state.enabled = false;
        state.status = 'interrupted';
        state.lastDiagnostic = 'Capture-all was interrupted because the Whop tab closed. It will resume when the same authorized experience is opened again.';
        state.lastTabId = tabId;
        state.tabId = null;
        state.frameId = null;
        state.updatedAt = Date.now();
        await saveTraversal(state);
      }
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
