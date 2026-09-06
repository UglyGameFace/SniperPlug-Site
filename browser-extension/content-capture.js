(() => {
  'use strict';

  function isWhopAppHost(hostname) {
    return String(hostname || '').toLowerCase().endsWith('.apps.whop.com');
  }

  const APP_FRAME_HOST = isWhopAppHost(location.hostname)
    ? String(location.hostname || '').toLowerCase()
    : '';
  if (!APP_FRAME_HOST || location.protocol !== 'https:') return;

  if (globalThis.__sniperplugBetterContentCapture?.registerCandidate) {
    globalThis.__sniperplugBetterContentCapture.registerCandidate();
    globalThis.__sniperplugBetterContentCapture.resumeTraversal?.();
    return;
  }

  const MESSAGE_PREFIX = 'sniperplug:';
  const MAX_CANDIDATES = 1200;
  const MAX_TRAVERSAL_TARGETS_PER_PAGE = 220;
  const MIN_CAPTURE_CHARS = 80;
  const AUTO_CAPTURE_DELAY_MS = 1200;
  const TRAVERSAL_SETTLE_MS = 950;
  const SENSITIVE_QUERY_KEY = /(?:token|auth|jwt|session|signature|secret|password|code|state|key)/i;
  const BLOCKED_TRAVERSAL_PATH = /\/(?:api|oauth|auth|login|logout|sign-?out|account|settings|admin|billing|checkout|purchase|support|contact)(?:\/|$)/i;
  let autoEnabled = false;
  let autoTimer = 0;
  let lastAutoIdentity = '';
  let traversalEnabled = false;
  let traversalTimer = 0;
  let lastTraversalIdentity = '';

  function normalizeSpace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function currentAppFrameFallbackUrl() {
    if (location.protocol !== 'https:' || !isWhopAppHost(location.hostname) || !location.host) return '';
    const pathname = String(location.pathname || '/');
    const safePath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `https://${location.host}${safePath}`;
  }

  function safeCurrentFrameUrl(value) {
    const raw = String(value || '').trim();
    const current = String(location.href || '').trim();
    if (!raw || raw !== current) return '';
    return currentAppFrameFallbackUrl();
  }

  function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    const currentFrameFallback = safeCurrentFrameUrl(raw);
    try {
      const url = new URL(raw, currentFrameFallback || location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return currentFrameFallback;
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
      return currentFrameFallback;
    }
  }

  function safeTraversalUrl(value, experienceId = '') {
    const safe = safeHttpUrl(value);
    if (!safe) return '';
    try {
      const url = new URL(safe);
      if (url.protocol !== 'https:' || url.origin !== location.origin || !isWhopAppHost(url.hostname)) return '';
      if (BLOCKED_TRAVERSAL_PATH.test(url.pathname)) return '';
      const targetExperience = String(url.pathname || '').match(/\bexp_[A-Za-z0-9_-]+\b/)?.[0] || '';
      if (experienceId && targetExperience && targetExperience !== experienceId) return '';
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

  function traversalElementExcluded(element) {
    if (!(element instanceof Element) || !elementVisible(element)) return true;
    const excludedAncestor = element.closest('nav,aside,footer,[role="navigation"],[role="menu"],[role="menubar"],[role="toolbar"],[role="dialog"],[role="alertdialog"]');
    if (excludedAncestor) return true;
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const marker = `${node.id || ''} ${node.className || ''}`.toLowerCase();
      if (/\b(?:sidebar|side-nav|navbar|navigation|toolbar|breadcrumb|footer|cookie-banner|modal|popover|tooltip)\b/.test(marker)) return true;
    }
    return false;
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
      const text = normalizeSpace(node.innerText);
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    if (tag === 'br') return '  \n';
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'strong' || tag === 'b') {
      const text = inlineChildren(node, depth + 1).trim();
      return text ? `**${text}**` : '';
    }
    if (tag === 'em' || tag === 'i') {
      const text = inlineChildren(node, depth + 1).trim();
      return text ? `*${text}*` : '';
    }
    if (tag === 's' || tag === 'del') {
      const text = inlineChildren(node, depth + 1).trim();
      return text ? `~~${text}~~` : '';
    }
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
      const text = String(node.textContent || '').replace(/`/g, '\\`').trim();
      return text ? `\`${text}\`` : '';
    }
    if (tag === 'pre') {
      const text = String(node.innerText || node.textContent || '').trimEnd();
      return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : '';
    }
    if (tag === 'a') {
      const text = normalizeSpace(node.innerText || node.textContent);
      const href = safeHttpUrl(node.getAttribute('href'));
      if (!text && !href) return '';
      if (!href) return escapeMarkdownText(text);
      return `[${escapeMarkdownText(text || href)}](${href})`;
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
      return [...node.children].filter((child) => child.tagName?.toLowerCase() === 'li')
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
    const direct = [
      location.href,
      document.referrer,
      ...[...document.querySelectorAll('[data-experience-id]')].slice(0, 20).map((element) => element.getAttribute('data-experience-id')),
      ...[...document.querySelectorAll('a[href]')].slice(0, 250).map((anchor) => anchor.href),
    ];
    for (const value of direct) {
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
    const url = safeHttpUrl(location.href) || currentAppFrameFallbackUrl();
    return `${url}|${title}`.slice(0, 600);
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
    if (!experienceId) throw new Error('This Better Content frame does not expose its Whop experience ID yet. Keep the guide visible and reopen the extension.');
    if (bodyMarkdown.length < MIN_CAPTURE_CHARS) throw new Error('The rendered page is too small to capture. Open an individual Better Content guide first.');
    const pageUrl = safeHttpUrl(location.href) || currentAppFrameFallbackUrl();
    if (!pageUrl) throw new Error('The rendered Better Content page does not have a safe HTTPS app-frame URL.');
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

  function discoverTraversalTargets(root = selectContentRoot()) {
    const experienceId = findExperienceId();
    const currentUrl = safeHttpUrl(location.href) || currentAppFrameFallbackUrl();
    const seen = new Set();
    const candidates = [];
    const elements = [...root.querySelectorAll('a[href],[role="link"][href],[data-href],[data-url]')];
    for (const element of elements) {
      if (candidates.length >= MAX_TRAVERSAL_TARGETS_PER_PAGE || traversalElementExcluded(element)) continue;
      const raw = element.getAttribute('href') || element.getAttribute('data-href') || element.getAttribute('data-url') || '';
      const url = safeTraversalUrl(raw, experienceId);
      if (!url || url === currentUrl || seen.has(url)) continue;
      const label = normalizeSpace(
        element.getAttribute('aria-label')
        || element.getAttribute('title')
        || element.innerText
        || element.textContent,
      ).slice(0, 180);
      if (!label || /^(?:home|account|settings|support|contact support|sign out|log out)$/i.test(label)) continue;
      seen.add(url);
      candidates.push({ url, title: label });
    }

    const expPath = experienceId ? `/experiences/${experienceId}/` : '';
    const scoped = expPath ? candidates.filter((target) => {
      try { return new URL(target.url).pathname.includes(expPath); } catch { return false; }
    }) : [];
    return scoped.length ? scoped : candidates;
  }

  function traversalSnapshot() {
    const root = selectContentRoot();
    const targets = discoverTraversalTargets(root);
    const paragraphChars = [...root.querySelectorAll('p')]
      .reduce((sum, paragraph) => sum + normalizeSpace(paragraph.innerText || paragraph.textContent).length, 0);
    const richBlocks = root.querySelectorAll('pre,table,blockquote').length;
    const directoryLike = targets.length >= 3 && paragraphChars < 420 && richBlocks === 0;
    let capture = null;
    try { capture = buildCapture(); } catch { /* Directory and transition shells are allowed during traversal. */ }
    return {
      experienceId: findExperienceId(),
      pageUrl: safeHttpUrl(location.href) || currentAppFrameFallbackUrl(),
      title: pageTitle(root),
      directoryLike,
      targets,
      capture,
    };
  }

  function candidateSummary() {
    const root = selectContentRoot();
    return {
      experienceId: findExperienceId(),
      title: pageTitle(root),
      pageUrl: safeHttpUrl(location.href) || currentAppFrameFallbackUrl(),
      textLength: normalizeSpace(root?.innerText || '').length,
      host: APP_FRAME_HOST,
      likelyAppFrame: true,
    };
  }

  function registerCandidate() {
    try {
      chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}candidate`, candidate: candidateSummary() }).catch(() => null);
    } catch {
      // Extension context can disappear during browser updates. The page keeps working.
    }
  }

  function scheduleAutoCapture() {
    if (!autoEnabled) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      try {
        const capture = buildCapture();
        const identity = `${capture.experienceId}|${capture.pageIdentity}|${capture.bodyMarkdown.length}`;
        if (identity === lastAutoIdentity) return;
        lastAutoIdentity = identity;
        chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}auto-capture`, capture }).catch(() => null);
      } catch {
        // Navigation can briefly leave the app between pages. Wait for the next stable mutation.
      }
    }, AUTO_CAPTURE_DELAY_MS);
  }

  function scheduleTraversalSnapshot() {
    if (!traversalEnabled) return;
    clearTimeout(traversalTimer);
    traversalTimer = setTimeout(() => {
      try {
        const snapshot = traversalSnapshot();
        const identity = `${snapshot.experienceId}|${snapshot.pageUrl}|${snapshot.targets.length}|${snapshot.capture?.bodyMarkdown?.length || 0}`;
        if (identity === lastTraversalIdentity) return;
        lastTraversalIdentity = identity;
        chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}traversal-page`, snapshot }).catch(() => null);
      } catch {
        // Wait for the next stable render instead of navigating from a transition shell.
      }
    }, TRAVERSAL_SETTLE_MS);
  }

  function resumeTraversal() {
    if (traversalEnabled) scheduleTraversalSnapshot();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === `${MESSAGE_PREFIX}capture-now`) {
      try {
        sendResponse({ ok: true, capture: buildCapture() });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error || 'Capture failed.') });
      }
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}set-auto`) {
      autoEnabled = message.enabled === true;
      if (autoEnabled) scheduleAutoCapture();
      else clearTimeout(autoTimer);
      sendResponse({ ok: true, enabled: autoEnabled });
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}set-traversal`) {
      traversalEnabled = message.enabled === true;
      lastTraversalIdentity = '';
      if (traversalEnabled) scheduleTraversalSnapshot();
      else clearTimeout(traversalTimer);
      sendResponse({ ok: true, enabled: traversalEnabled });
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}traverse-navigate`) {
      const target = safeTraversalUrl(message.url, findExperienceId());
      if (!target) {
        sendResponse({ ok: false, error: 'SniperPlug refused an unsafe or cross-experience traversal target.' });
        return false;
      }
      sendResponse({ ok: true, navigating: target });
      setTimeout(() => location.assign(target), 0);
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}probe-now`) {
      registerCandidate();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  const observer = new MutationObserver(() => {
    registerCandidate();
    scheduleAutoCapture();
    scheduleTraversalSnapshot();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastTraversalIdentity = '';
      registerCandidate();
      scheduleAutoCapture();
      scheduleTraversalSnapshot();
    }
  }, 700);

  globalThis.__sniperplugBetterContentCapture = {
    registerCandidate,
    candidateSummary,
    resumeTraversal,
  };
  registerCandidate();
  setTimeout(registerCandidate, 900);
  setTimeout(registerCandidate, 2200);
})();
