// ==UserScript==
// @name         SniperPlug Better Content Mobile Capture
// @namespace    https://sniperplug.com/
// @version      0.1.0
// @description  Capture Better Content pages already rendered for your Whop account and hand them to the signed-in SniperPlug Control Center.
// @author       SniperPlug
// @match        https://*.apps.whop.com/*
// @match        https://*.whop.com/*
// @match        https://sniperplug.com/control-center/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'sniperplug_mobile_better_content_queue_v1';
  const MAX_CAPTURES = 25;
  const MIN_CAPTURE_CHARS = 80;
  const MAX_CANDIDATES = 1200;
  const AUTO_CAPTURE_DELAY_MS = 1200;
  const QUEUE_MAX_AGE_MS = 2 * 60 * 60_000;
  const SENSITIVE_QUERY_KEY = /(?:token|auth|jwt|session|signature|secret|password|code|state|key)/i;
  const SNIPERPLUG_ORIGIN = 'https://sniperplug.com';
  const isSniperPlug = location.origin === SNIPERPLUG_ORIGIN;
  const isWhop = /(^|\.)whop\.com$/i.test(location.hostname) || location.hostname.endsWith('.apps.whop.com');
  let autoEnabled = false;
  let autoTimer = 0;
  let lastAutoFingerprint = '';

  function normalizeSpace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim(), location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        const values = url.searchParams.getAll(key);
        const sensitive = SENSITIVE_QUERY_KEY.test(key)
          || values.some((item) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item) || item.length > 180);
        if (sensitive) url.searchParams.delete(key);
      }
      url.searchParams.sort();
      return url.toString();
    } catch {
      return '';
    }
  }

  function elementVisible(element) {
    if (!(element instanceof Element)) return true;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function ignoredElement(element) {
    const tag = element.tagName?.toLowerCase() || '';
    if (['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'button', 'input', 'textarea', 'select', 'option'].includes(tag)) return true;
    const role = String(element.getAttribute('role') || '').toLowerCase();
    if (['navigation', 'menu', 'menubar', 'toolbar', 'dialog', 'alertdialog'].includes(role)) return true;
    const marker = `${element.id || ''} ${element.className || ''}`.toLowerCase();
    if (/\b(?:sidebar|side-nav|navbar|navigation|toolbar|breadcrumb|footer|cookie-banner|modal|popover|tooltip)\b/.test(marker)) return true;
    return !elementVisible(element);
  }

  function textLength(element) {
    return normalizeSpace(element?.innerText || element?.textContent || '').length;
  }

  function elementDepth(element) {
    let depth = 0;
    for (let node = element; node?.parentElement && depth < 20; node = node.parentElement) depth += 1;
    return depth;
  }

  function candidateScore(element) {
    if (!(element instanceof Element) || ignoredElement(element)) return -Infinity;
    const length = textLength(element);
    if (length < MIN_CAPTURE_CHARS) return -Infinity;
    const headings = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
    const paragraphs = element.querySelectorAll('p').length;
    const listItems = element.querySelectorAll('li').length;
    const images = element.querySelectorAll('img').length;
    const links = element.querySelectorAll('a').length;
    const buttons = element.querySelectorAll('button,[role="button"]').length;
    const tag = element.tagName.toLowerCase();
    const semanticBonus = tag === 'article' ? 1200 : tag === 'main' || element.getAttribute('role') === 'main' ? 900 : 0;
    const depthBonus = Math.min(10, elementDepth(element)) * 12;
    return length + headings * 240 + paragraphs * 70 + listItems * 35 + images * 30 + semanticBonus + depthBonus - links * 6 - buttons * 35;
  }

  function selectContentRoot() {
    const preferred = [...document.querySelectorAll('article,main,[role="main"]')]
      .filter((element) => candidateScore(element) > -Infinity)
      .sort((a, b) => candidateScore(b) - candidateScore(a));
    if (preferred.length) return preferred[0];

    let best = document.body;
    let bestScore = candidateScore(document.body);
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
    let visited = 0;
    for (let element = walker.nextNode(); element && visited < MAX_CANDIDATES; element = walker.nextNode()) {
      visited += 1;
      const score = candidateScore(element);
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }
    return best || document.body || document.documentElement;
  }

  function escapeMarkdownText(value) {
    return String(value || '').replace(/([\\`*_{}\[\]<>])/g, '\\$1');
  }

  function inlineChildren(element, depth) {
    return [...element.childNodes].map((node) => renderNode(node, depth)).join('');
  }

  function blockChildren(element, depth) {
    return [...element.childNodes]
      .map((node) => renderNode(node, depth))
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  function renderListItem(element, ordered, index, depth) {
    const body = blockChildren(element, depth + 1).replace(/\n{3,}/g, '\n\n');
    if (!body) return '';
    const lines = body.split('\n');
    const prefix = ordered ? `${index + 1}. ` : '- ';
    return lines.map((line, lineIndex) => `${lineIndex === 0 ? prefix : '  '}${line}`).join('\n');
  }

  function renderTable(element, depth) {
    const rows = [...element.querySelectorAll(':scope > thead > tr,:scope > tbody > tr,:scope > tr')];
    if (!rows.length) return blockChildren(element, depth + 1);
    const values = rows.map((row) => [...row.querySelectorAll(':scope > th,:scope > td')].map((cell) => normalizeSpace(cell.innerText)));
    const width = Math.max(...values.map((row) => row.length), 0);
    if (!width) return '';
    const header = values[0].concat(Array(Math.max(0, width - values[0].length)).fill(''));
    const separator = Array(width).fill('---');
    const rest = values.slice(1).map((row) => row.concat(Array(Math.max(0, width - row.length)).fill('')));
    return [header, separator, ...rest].map((row) => `| ${row.map((cell) => String(cell || '').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n');
  }

  function renderNode(node, depth = 0) {
    if (depth > 80 || !node) return '';
    if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText(node.nodeValue || '').replace(/\s+/g, ' ');
    if (!(node instanceof Element) || ignoredElement(node)) return '';

    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const value = normalizeSpace(node.innerText);
      return value ? `${'#'.repeat(level)} ${value}` : '';
    }
    if (tag === 'br') return '  \n';
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'strong' || tag === 'b') {
      const value = inlineChildren(node, depth + 1).trim();
      return value ? `**${value}**` : '';
    }
    if (tag === 'em' || tag === 'i') {
      const value = inlineChildren(node, depth + 1).trim();
      return value ? `*${value}*` : '';
    }
    if (tag === 's' || tag === 'del') {
      const value = inlineChildren(node, depth + 1).trim();
      return value ? `~~${value}~~` : '';
    }
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
      const value = String(node.textContent || '').replace(/`/g, '\\`').trim();
      return value ? `\`${value}\`` : '';
    }
    if (tag === 'pre') {
      const value = String(node.innerText || node.textContent || '').trimEnd();
      return value ? `\n\n\`\`\`\n${value}\n\`\`\`\n\n` : '';
    }
    if (tag === 'a') {
      const label = normalizeSpace(node.innerText || node.textContent);
      const href = safeHttpUrl(node.getAttribute('href'));
      if (!label && !href) return '';
      if (!href) return escapeMarkdownText(label);
      return `[${escapeMarkdownText(label || href)}](${href})`;
    }
    if (tag === 'img') {
      const src = safeHttpUrl(node.currentSrc || node.getAttribute('src'));
      if (!src) return '';
      const alt = normalizeSpace(node.getAttribute('alt') || node.getAttribute('title') || 'Image').replace(/[\[\]]/g, '').slice(0, 160) || 'Image';
      return `![${alt}](${src})`;
    }
    if (tag === 'blockquote') {
      const body = blockChildren(node, depth + 1);
      return body ? body.split('\n').map((line) => `> ${line}`).join('\n') : '';
    }
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      return [...node.children]
        .filter((child) => child.tagName?.toLowerCase() === 'li')
        .map((child, index) => renderListItem(child, ordered, index, depth + 1))
        .filter(Boolean)
        .join('\n');
    }
    if (tag === 'li') return blockChildren(node, depth + 1);
    if (tag === 'table') return renderTable(node, depth + 1);
    if (['p', 'section', 'article', 'main', 'div', 'header'].includes(tag)) return blockChildren(node, depth + 1);
    return inlineChildren(node, depth + 1);
  }

  function cleanMarkdown(value) {
    return String(value || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  function findExperienceId() {
    const values = [
      location.href,
      document.referrer,
      ...[...document.querySelectorAll('[data-experience-id]')].slice(0, 20).map((element) => element.getAttribute('data-experience-id')),
      ...[...document.querySelectorAll('a[href]')].slice(0, 250).map((anchor) => anchor.href),
    ];
    for (const value of values) {
      const match = String(value || '').match(/\bexp_[A-Za-z0-9_-]+\b/);
      if (match) return match[0];
    }
    return '';
  }

  function pageTitle(root) {
    const heading = root?.querySelector?.('h1') || root?.querySelector?.('h2');
    const headingText = normalizeSpace(heading?.innerText || heading?.textContent);
    if (headingText) return headingText.slice(0, 140);
    const ogTitle = normalizeSpace(document.querySelector('meta[property="og:title"]')?.content);
    if (ogTitle) return ogTitle.slice(0, 140);
    const title = normalizeSpace(document.title).replace(/\s+[|·-]\s+Whop.*$/i, '').trim();
    return title.slice(0, 140) || 'Better Content page';
  }

  function pageIdentity(title) {
    const url = safeHttpUrl(location.href);
    return `${url || location.origin + location.pathname}|${title}`.slice(0, 600);
  }

  function collectImages(root) {
    const images = [];
    const seen = new Set();
    for (const image of [...root.querySelectorAll('img')]) {
      if (images.length >= 50 || !elementVisible(image)) continue;
      const url = safeHttpUrl(image.currentSrc || image.getAttribute('src'));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      images.push({
        url,
        alt: normalizeSpace(image.getAttribute('alt') || image.getAttribute('title') || 'Captured image').slice(0, 160),
        width: image.naturalWidth || image.width || null,
        height: image.naturalHeight || image.height || null,
      });
    }
    return images;
  }

  function buildCapture() {
    const root = selectContentRoot();
    const title = pageTitle(root);
    const bodyMarkdown = cleanMarkdown(renderNode(root));
    const experienceId = findExperienceId();
    if (!experienceId) throw new Error('This Better Content frame does not expose its Whop experience ID yet. Open the guide inside Whop and try again.');
    if (bodyMarkdown.length < MIN_CAPTURE_CHARS) throw new Error('The rendered page is too small to capture. Open an individual Better Content guide first.');
    const pageUrl = safeHttpUrl(location.href);
    if (!pageUrl) throw new Error('The rendered Better Content page does not have a safe HTTPS URL.');
    return {
      experienceId,
      title,
      pageUrl,
      frameUrl: pageUrl,
      pageIdentity: pageIdentity(title),
      documentTitle: normalizeSpace(document.title).slice(0, 180),
      appHint: normalizeSpace(document.querySelector('meta[name="application-name"]')?.content || document.title).slice(0, 120),
      bodyMarkdown,
      images: collectImages(root),
      capturedAt: new Date().toISOString(),
      textLength: normalizeSpace(root.innerText || '').length,
    };
  }

  function captureKey(capture) {
    return `${capture.experienceId}|${capture.pageIdentity}`;
  }

  async function readQueue() {
    const raw = await GM_getValue(STORAGE_KEY, null);
    if (!raw || typeof raw !== 'object') return { id: '', captures: [], rightsConfirmed: false, autoEnabled: false, createdAt: '', updatedAt: '' };
    if (raw.createdAt && Date.now() - Date.parse(raw.createdAt) > QUEUE_MAX_AGE_MS) {
      await GM_deleteValue(STORAGE_KEY);
      return { id: '', captures: [], rightsConfirmed: false, autoEnabled: false, createdAt: '', updatedAt: '' };
    }
    return {
      id: String(raw.id || ''),
      captures: Array.isArray(raw.captures) ? raw.captures.slice(0, MAX_CAPTURES) : [],
      rightsConfirmed: raw.rightsConfirmed === true,
      autoEnabled: raw.autoEnabled === true,
      createdAt: String(raw.createdAt || ''),
      updatedAt: String(raw.updatedAt || ''),
    };
  }

  function queueId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function writeQueue(queue) {
    const now = new Date().toISOString();
    const next = {
      ...queue,
      id: queue.id || queueId(),
      captures: (queue.captures || []).slice(0, MAX_CAPTURES),
      createdAt: queue.createdAt || now,
      updatedAt: now,
    };
    await GM_setValue(STORAGE_KEY, next);
    return next;
  }

  async function addCapture(capture) {
    const queue = await readQueue();
    const key = captureKey(capture);
    const captures = queue.captures.filter((entry) => captureKey(entry) !== key);
    captures.push(capture);
    if (captures.length > MAX_CAPTURES) captures.splice(0, captures.length - MAX_CAPTURES);
    return writeQueue({ ...queue, captures });
  }

  function toast(message, error = false) {
    let node = document.getElementById('sniperplug-mobile-capture-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'sniperplug-mobile-capture-toast';
      Object.assign(node.style, {
        position: 'fixed', left: '12px', right: '12px', bottom: '86px', zIndex: '2147483647',
        padding: '12px 14px', borderRadius: '12px', font: '600 13px/1.45 system-ui,sans-serif',
        boxShadow: '0 12px 36px rgba(0,0,0,.42)', whiteSpace: 'pre-wrap',
      });
      document.documentElement.append(node);
    }
    node.style.background = error ? '#3b171d' : '#102d21';
    node.style.border = `1px solid ${error ? '#94384a' : '#2c7a55'}`;
    node.style.color = error ? '#ffdbe1' : '#dcffeb';
    node.textContent = String(message || '');
    node.hidden = false;
    clearTimeout(node._hideTimer);
    node._hideTimer = setTimeout(() => { node.hidden = true; }, 6000);
  }

  async function captureCurrent(manual = true) {
    try {
      const capture = buildCapture();
      const fingerprint = `${captureKey(capture)}|${capture.bodyMarkdown.length}`;
      if (!manual && fingerprint === lastAutoFingerprint) return null;
      lastAutoFingerprint = fingerprint;
      const queue = await addCapture(capture);
      if (manual) toast(`Queued “${capture.title}” for SniperPlug.\n${queue.captures.length}/${MAX_CAPTURES} page${queue.captures.length === 1 ? '' : 's'} queued.`);
      await updateWhopPanel();
      return capture;
    } catch (error) {
      if (manual) toast(error?.message || 'Could not capture this rendered page.', true);
      return null;
    }
  }

  function scheduleAutoCapture() {
    if (!autoEnabled) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { captureCurrent(false); }, AUTO_CAPTURE_DELAY_MS);
  }

  let panel;
  let panelCount;
  let autoButton;

  async function updateWhopPanel() {
    if (!panel) return;
    const queue = await readQueue();
    autoEnabled = queue.autoEnabled;
    panelCount.textContent = `${queue.captures.length}/${MAX_CAPTURES} queued`;
    autoButton.textContent = autoEnabled ? 'Auto: ON' : 'Auto: OFF';
    autoButton.style.background = autoEnabled ? '#1f6f4a' : '#15202c';
  }

  function createButton(label, handler, primary = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      border: primary ? '1px solid #5ee69c' : '1px solid rgba(255,255,255,.18)',
      borderRadius: '999px', padding: '9px 12px', background: primary ? '#5ee69c' : '#15202c',
      color: primary ? '#06120d' : '#eef7f4', font: '700 12px/1 system-ui,sans-serif', cursor: 'pointer',
    });
    button.addEventListener('click', handler);
    return button;
  }

  async function installWhopPanel() {
    if (!isWhop || isSniperPlug || document.getElementById('sniperplug-mobile-capture-panel')) return;
    panel = document.createElement('aside');
    panel.id = 'sniperplug-mobile-capture-panel';
    Object.assign(panel.style, {
      position: 'fixed', right: '10px', bottom: '10px', zIndex: '2147483647', width: 'min(310px,calc(100vw - 20px))',
      padding: '11px', borderRadius: '14px', border: '1px solid rgba(94,230,156,.42)',
      background: 'rgba(6,16,23,.96)', color: '#eef7f4', boxShadow: '0 14px 42px rgba(0,0,0,.45)',
      font: '13px/1.35 system-ui,sans-serif',
    });
    const heading = document.createElement('strong');
    heading.textContent = 'SniperPlug Better Content';
    heading.style.display = 'block';
    heading.style.marginBottom = '4px';
    panelCount = document.createElement('small');
    panelCount.style.display = 'block';
    panelCount.style.color = '#a9bbb5';
    panelCount.style.marginBottom = '9px';
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
    row.append(createButton('Capture page', () => captureCurrent(true), true));
    autoButton = createButton('Auto: OFF', async () => {
      const queue = await readQueue();
      autoEnabled = !queue.autoEnabled;
      await writeQueue({ ...queue, autoEnabled });
      if (autoEnabled) scheduleAutoCapture();
      else clearTimeout(autoTimer);
      await updateWhopPanel();
      toast(autoEnabled ? 'Auto-capture enabled. Open each Better Content guide you want and let it settle for a moment.' : 'Auto-capture disabled.');
    });
    row.append(autoButton);
    row.append(createButton('Send to SniperPlug', async () => {
      const queue = await readQueue();
      if (!queue.captures.length) {
        toast('Capture at least one Better Content page first.', true);
        return;
      }
      const rights = confirm('Confirm: you own this content or have explicit permission to republish these captured pages on SniperPlug.');
      if (!rights) return;
      const saved = await writeQueue({ ...queue, rightsConfirmed: true, autoEnabled: false });
      const destination = `${SNIPERPLUG_ORIGIN}/control-center/?mobileCapture=${encodeURIComponent(saved.id)}`;
      const opened = window.open(destination, '_blank', 'noopener');
      if (!opened) location.href = destination;
    }, true));
    row.append(createButton('Clear', async () => {
      await GM_deleteValue(STORAGE_KEY);
      autoEnabled = false;
      clearTimeout(autoTimer);
      await updateWhopPanel();
      toast('SniperPlug mobile capture queue cleared.');
    }));
    panel.append(heading, panelCount, row);
    document.documentElement.append(panel);
    await updateWhopPanel();
  }

  function installWhopObservers() {
    if (!isWhop || isSniperPlug) return;
    const observer = new MutationObserver(() => scheduleAutoCapture());
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleAutoCapture();
      }
    }, 700);
  }

  async function installSniperPlugRelay() {
    if (!isSniperPlug) return;
    const pendingId = new URLSearchParams(location.search).get('mobileCapture');
    if (!pendingId) return;

    let queue = await readQueue();
    if (!queue.id || queue.id !== pendingId || !queue.captures.length) {
      toast('This mobile Better Content capture queue expired or was already sent.', true);
      return;
    }

    const relay = document.createElement('aside');
    Object.assign(relay.style, {
      position: 'fixed', left: '12px', right: '12px', bottom: '12px', zIndex: '2147483647', maxWidth: '680px', margin: '0 auto',
      padding: '14px 16px', borderRadius: '16px', border: '1px solid rgba(94,230,156,.45)',
      background: 'rgba(6,16,23,.97)', color: '#eef7f4', boxShadow: '0 16px 48px rgba(0,0,0,.45)',
      font: '13px/1.45 system-ui,sans-serif',
    });
    const title = document.createElement('strong');
    title.textContent = 'SniperPlug mobile capture';
    title.style.display = 'block';
    title.style.marginBottom = '5px';
    const message = document.createElement('div');
    message.style.color = '#b9cac4';
    const retry = createButton('Retry capture', () => send(), true);
    retry.style.marginTop = '9px';
    retry.style.display = 'none';
    relay.append(title, message, retry);
    document.documentElement.append(relay);
    let sending = false;

    function setRelay(value, state = 'working') {
      message.textContent = value;
      title.style.color = state === 'error' ? '#ffb8b8' : state === 'ok' ? '#8ff0b7' : '#eef7f4';
      retry.style.display = state === 'error' ? 'inline-block' : 'none';
    }

    async function send() {
      if (sending) return;
      sending = true;
      retry.disabled = true;
      queue = await readQueue();
      setRelay(`Sending ${queue.captures.length} rendered Better Content page${queue.captures.length === 1 ? '' : 's'} into the private SniperPlug draft queue…`);
      try {
        const response = await fetch('/api/browser-capture', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ rightsConfirmed: queue.rightsConfirmed === true, captures: queue.captures }),
        });
        const output = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(output?.message || output?.error || `SniperPlug rejected the mobile capture (${response.status}).`);
          error.status = response.status;
          throw error;
        }
        await GM_deleteValue(STORAGE_KEY);
        const created = Number(output?.created || 0);
        const updated = Number(output?.updated || 0);
        const unchanged = Number(output?.unchanged || 0);
        const held = Number(output?.held || 0);
        setRelay(`${created} new draft${created === 1 ? '' : 's'} · ${updated} updated · ${unchanged} unchanged · ${held} held safely. Reloading the private review queue…`, 'ok');
        const clean = new URL(location.href);
        clean.searchParams.delete('mobileCapture');
        clean.searchParams.set('browserCapture', 'success');
        setTimeout(() => location.replace(clean.toString()), 900);
      } catch (error) {
        if (Number(error?.status) === 401) {
          setRelay('The Control Center is locked. Unlock SniperPlug on this page, then press Retry capture. Your Better Content pages are still queued in Tampermonkey.', 'error');
        } else if (Number(error?.status) === 403) {
          setRelay(`SniperPlug refused the handoff: ${error.message} Reconnect/verify Whop if needed, then retry.`, 'error');
        } else {
          setRelay(`Capture was not saved: ${error?.message || error}. The pages remain queued so you can retry.`, 'error');
        }
      } finally {
        sending = false;
        retry.disabled = false;
      }
    }

    await send();
  }

  if (isSniperPlug) installSniperPlugRelay();
  else if (isWhop) {
    installWhopPanel();
    installWhopObservers();
    readQueue().then((queue) => {
      autoEnabled = queue.autoEnabled;
      if (autoEnabled) scheduleAutoCapture();
    });
  }
})();
