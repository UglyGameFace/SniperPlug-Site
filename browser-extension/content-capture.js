(() => {
  'use strict';

  function isWhopAppHost(hostname) {
    return String(hostname || '').toLowerCase().endsWith('.apps.whop.com');
  }

  const APP_FRAME_HOST = isWhopAppHost(location.hostname)
    ? String(location.hostname || '').toLowerCase()
    : '';
  if (!APP_FRAME_HOST || location.protocol !== 'https:') return;
  const CAPTURE_DOCUMENT_ID = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (globalThis.__sniperplugBetterContentCapture?.registerCandidate) {
    globalThis.__sniperplugBetterContentCapture.registerCandidate();
    globalThis.__sniperplugBetterContentCapture.resumeTraversal?.();
    return;
  }

  const MESSAGE_PREFIX = 'sniperplug:';
  const MAX_CANDIDATES = 1200;
  const MAX_TRAVERSAL_TARGETS_PER_PAGE = 260;
  const MIN_CAPTURE_CHARS = 80;
  const AUTO_CAPTURE_DELAY_MS = 1200;
  const TRAVERSAL_SETTLE_MS = 900;
  const MAX_EXPAND_CLICKS = 24;
  const MAX_TAB_PANELS = 12;
  const MAX_SCROLL_STEPS = 12;
  const SENSITIVE_QUERY_KEY = /(?:token|auth|jwt|session|signature|secret|password|code|state|key)/i;
  const BLOCKED_TRAVERSAL_PATH = /\/(?:api|oauth|auth|login|logout|sign-?out|account|settings|admin|billing|checkout|purchase|support|contact)(?:\/|$)/i;
  const SAFE_EXPAND_LABEL = /^(?:(?:show|view|read|load)\s+more|more|expand|continue(?:\s+reading)?|see\s+more)$/i;
  const DANGEROUS_CONTROL_LABEL = /(?:delete|remove|purchase|checkout|buy|subscribe|sign\s*out|log\s*out|account|billing|settings|support|contact)/i;
  let autoEnabled = false;
  let autoTimer = 0;
  let lastAutoIdentity = '';
  let traversalEnabled = false;
  let traversalTimer = 0;
  let lastTraversalIdentity = '';
  let traversalBusy = false;
  let traversalDirty = false;
  let traversalHasRun = false;
  let traversalOverlay = null;
  let traversalOverlayState = null;
  let traversalOverlayPhase = '';
  let traversalOverlayDetail = '';
  let traversalOverlayDismissed = false;
  let traversalOverlayMinimized = false;
  let traversalOverlayTerminalTimer = 0;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeSpace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function dismissTraversalOverlay() {
    clearTimeout(traversalOverlayTerminalTimer);
    traversalOverlayTerminalTimer = 0;
    traversalOverlayDismissed = true;
    if (traversalOverlay?.isConnected) traversalOverlay.remove();
    traversalOverlay = null;
  }

  function setTraversalOverlayMinimized(minimized) {
    traversalOverlayMinimized = minimized === true;
    const overlay = traversalOverlay;
    if (!overlay?.isConnected) return;
    const body = overlay.querySelector('[data-sp-body]');
    const button = overlay.querySelector('[data-sp-minimize]');
    if (body) body.style.display = traversalOverlayMinimized ? 'none' : 'block';
    if (button) {
      button.textContent = traversalOverlayMinimized ? '□' : '−';
      button.setAttribute('aria-label', traversalOverlayMinimized ? 'Restore Capture-all progress' : 'Minimize Capture-all progress');
      button.setAttribute('title', traversalOverlayMinimized ? 'Restore' : 'Minimize');
    }
  }

  function overlayControlButton(button) {
    Object.assign(button.style, {
      appearance: 'none', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)',
      color: '#e8fff4', width: '30px', height: '28px', borderRadius: '8px', font: '700 16px/1 system-ui, sans-serif',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0', cursor: 'pointer', touchAction: 'manipulation',
    });
  }

  function ensureTraversalOverlay() {
    if (traversalOverlayDismissed) return null;
    if (traversalOverlay?.isConnected) return traversalOverlay;
    const overlay = document.createElement('div');
    overlay.id = 'sniperplug-capture-all-overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = '<div data-sp-header><div data-sp-title>SniperPlug Capture-all</div><div data-sp-controls><button type="button" data-sp-minimize aria-label="Minimize Capture-all progress" title="Minimize">−</button><button type="button" data-sp-stop aria-label="Stop Capture-all" title="Stop">■</button><button type="button" data-sp-close aria-label="Hide Capture-all progress" title="Hide">×</button></div></div><div data-sp-body><div data-sp-phase>Starting…</div><div data-sp-track><div data-sp-bar></div></div><div data-sp-counts>Discovering rendered guides…</div></div>';
    Object.assign(overlay.style, {
      position: 'fixed', top: '12px', right: '12px', width: 'min(360px, calc(100vw - 24px))',
      zIndex: '2147483647', padding: '12px', borderRadius: '14px', background: 'rgba(5,16,25,.96)',
      color: '#e8fff4', border: '1px solid rgba(91,226,158,.45)', boxShadow: '0 12px 32px rgba(0,0,0,.35)',
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.35', pointerEvents: 'auto',
    });
    const header = overlay.querySelector('[data-sp-header]');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '7px' });
    const title = overlay.querySelector('[data-sp-title]');
    Object.assign(title.style, { fontWeight: '800', fontSize: '14px' });
    const controls = overlay.querySelector('[data-sp-controls]');
    Object.assign(controls.style, { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: '0' });
    for (const button of controls.querySelectorAll('button')) overlayControlButton(button);
    const phase = overlay.querySelector('[data-sp-phase]');
    Object.assign(phase.style, { color: '#9ff3c7', marginBottom: '8px' });
    const track = overlay.querySelector('[data-sp-track]');
    Object.assign(track.style, { height: '8px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(255,255,255,.12)', marginBottom: '7px' });
    const bar = overlay.querySelector('[data-sp-bar]');
    Object.assign(bar.style, { height: '100%', width: '18%', borderRadius: '999px', background: '#5be29e', transition: 'width .2s ease' });
    const counts = overlay.querySelector('[data-sp-counts]');
    Object.assign(counts.style, { color: '#c7d4d0' });
    overlay.querySelector('[data-sp-minimize]').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTraversalOverlayMinimized(!traversalOverlayMinimized);
    });
    overlay.querySelector('[data-sp-close]').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dismissTraversalOverlay();
    });
    overlay.querySelector('[data-sp-stop]').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const stop = overlay.querySelector('[data-sp-stop]');
      stop.disabled = true;
      stop.textContent = '…';
      try {
        chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}overlay-stop-traversal` }).catch(() => {
stop.disabled = false;
stop.textContent = '■';
        });
      } catch {
        stop.disabled = false;
        stop.textContent = '■';
      }
    });
    (document.body || document.documentElement).appendChild(overlay);
    traversalOverlay = overlay;
    setTraversalOverlayMinimized(traversalOverlayMinimized);
    return overlay;
  }

  function renderTraversalOverlay() {
    const state = traversalOverlayState || {};
    const terminal = ['complete', 'complete-empty', 'error', 'limit', 'stopped', 'interrupted'].includes(String(state.crawlStatus || ''));
    if (!traversalEnabled && !terminal) {
      dismissTraversalOverlay();
      return;
    }
    if (traversalOverlayDismissed) return;
    const overlay = ensureTraversalOverlay();
    if (!overlay) return;
    overlay.style.display = 'block';
    const phaseNames = { settling: 'Settling…', reading: 'Reading…', expanding: 'Expanding…', scrolling: 'Scrolling…', images: 'Images…', tabs: 'Tabs…', extracting: 'Extracting…', sending: 'Saving…', retrying: 'Retrying…' };
    const status = String(state.crawlStatus || (traversalEnabled ? 'starting' : 'idle'));
    const visited = Math.max(0, Number(state.crawlVisited || 0));
    const remaining = Math.max(0, Number(state.crawlRemaining || 0));
    const discovered = Math.max(0, Number(state.crawlDiscovered || 0));
    const known = Math.max(discovered, visited + remaining);
    const complete = status === 'complete' || status === 'complete-empty';
    const percent = complete ? 100 : known > 0 ? Math.max(2, Math.min(99, Math.round((visited / known) * 100))) : 18;
    overlay.querySelector('[data-sp-bar]').style.width = `${percent}%`;
    overlay.querySelector('[data-sp-phase]').textContent = traversalOverlayDetail || phaseNames[traversalOverlayPhase] || (terminal ? status.replace('-', ' ') : 'Scanning rendered Better Content…');
    overlay.querySelector('[data-sp-counts]').textContent = known > 0
      ? `${visited} of ${known} known pages checked · ${Math.max(0, Number(state.crawlCaptured || 0))} queued · ${Math.max(0, Number(state.crawlRetries || 0))} retries`
      : terminal ? (state.crawlError || state.crawlDiagnostic || 'Capture-all finished.') : 'Discovering rendered guides…';
    setTraversalOverlayMinimized(traversalOverlayMinimized);
    if (terminal && !traversalOverlayTerminalTimer) {
      traversalOverlayTerminalTimer = setTimeout(() => dismissTraversalOverlay(), 4200);
    } else if (!terminal && traversalOverlayTerminalTimer) {
      clearTimeout(traversalOverlayTerminalTimer);
      traversalOverlayTerminalTimer = 0;
    }
  }

  function updateTraversalOverlayState(next) {
    traversalOverlayState = next && typeof next === 'object' ? next : traversalOverlayState;
    renderTraversalOverlay();
  }

  function reportTraversalProgress(phase, detail = '') {
    if (!traversalEnabled) return;
    traversalOverlayPhase = String(phase || '');
    traversalOverlayDetail = normalizeSpace(detail).slice(0, 180);
    renderTraversalOverlay();
    try {
      chrome.runtime.sendMessage({
        type: `${MESSAGE_PREFIX}traversal-progress`,
        progress: {
          phase: String(phase || '').slice(0, 32),
          detail: normalizeSpace(detail).slice(0, 180),
          at: Date.now(),
        },
      }).catch(() => null);
    } catch {
      // Popup/background can disappear while Firefox keeps the Whop frame alive.
    }
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

  function queryLooksSensitive(url) {
    for (const key of [...url.searchParams.keys()]) {
      const values = url.searchParams.getAll(key);
      if (SENSITIVE_QUERY_KEY.test(key)) return true;
      if (values.some((item) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item) || String(item || '').length > 180)) return true;
    }
    return false;
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
          || values.some((item) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item) || String(item || '').length > 180);
        if (sensitive) url.searchParams.delete(key);
      }
      url.searchParams.sort();
      return url.toString();
    } catch {
      return currentFrameFallback;
    }
  }

  function safeTraversalUrl(value, experienceId = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      if (url.protocol !== 'https:' || url.origin !== location.origin || !isWhopAppHost(url.hostname)) return '';
      if (BLOCKED_TRAVERSAL_PATH.test(url.pathname) || queryLooksSensitive(url)) return '';
      const targetExperience = String(url.pathname || '').match(/\bexp_[A-Za-z0-9_-]+\b/)?.[0] || '';
      if (experienceId && targetExperience && targetExperience !== experienceId) return '';
      url.hash = '';
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
    if (element?.closest?.('#sniperplug-capture-all-overlay')) return true;
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
    if (element.closest('#sniperplug-capture-all-overlay')) return true;
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
    for (let node = element?.parentElement; node && depth < 20; node = node.parentElement) depth += 1;
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
    if (['p', 'section', 'article', 'main', 'div', 'header', 'details'].includes(tag)) return blockChildren(node, depth + 1);
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

  function buildCapture(extraMarkdown = '', diagnostics = {}) {
    const root = selectContentRoot();
    const title = pageTitle(root);
    const mainMarkdown = cleanMarkdown(renderNode(root));
    const bodyMarkdown = cleanMarkdown([mainMarkdown, extraMarkdown].filter(Boolean).join('\n\n'));
    const experienceId = findExperienceId();
    if (!experienceId) throw new Error('This Better Content frame does not expose its Whop experience ID yet. Keep the content visible and retry.');
    if (bodyMarkdown.length < MIN_CAPTURE_CHARS) throw new Error('The rendered page is too small to capture.');
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
      diagnostics,
    };
  }

  function safeExpandableControls(root) {
    const controls = [...root.querySelectorAll('button,[role="button"]')];
    return controls.filter((control) => {
      if (traversalElementExcluded(control) || control.hasAttribute('disabled')) return false;
      if (control.closest('form') && String(control.getAttribute('type') || '').toLowerCase() === 'submit') return false;
      if (control.getAttribute('aria-haspopup') === 'dialog') return false;
      const label = normalizeSpace(control.getAttribute('aria-label') || control.getAttribute('title') || control.innerText || control.textContent);
      if (!label || DANGEROUS_CONTROL_LABEL.test(label)) return false;
      return SAFE_EXPAND_LABEL.test(label) || control.getAttribute('aria-expanded') === 'false';
    }).slice(0, MAX_EXPAND_CLICKS);
  }

  async function expandLazyContent(root) {
    let detailsOpened = 0;
    for (const detail of [...root.querySelectorAll('details')].slice(0, 60)) {
      if (!detail.open && elementVisible(detail)) {
        detail.open = true;
        detailsOpened += 1;
      }
    }

    let controlsClicked = 0;
    for (let pass = 0; pass < 3; pass += 1) {
      const controls = safeExpandableControls(root).slice(0, MAX_EXPAND_CLICKS - controlsClicked);
      if (!controls.length) break;
      for (const control of controls) {
        if (controlsClicked >= MAX_EXPAND_CLICKS) break;
        try {
          control.click();
          controlsClicked += 1;
          await wait(90);
        } catch { /* Keep reading the page even when one optional expander misbehaves. */ }
      }
      await wait(220);
    }
    return { detailsOpened, controlsClicked };
  }

  async function scrollForLazyRender() {
    const scrolling = document.scrollingElement || document.documentElement;
    if (!scrolling || typeof globalThis.scrollTo !== 'function') return { scrollSteps: 0 };
    const startX = globalThis.scrollX || 0;
    const startY = globalThis.scrollY || 0;
    let steps = 0;
    let lastHeight = 0;
    for (let index = 0; index < MAX_SCROLL_STEPS; index += 1) {
      const height = Math.max(scrolling.scrollHeight || 0, document.body?.scrollHeight || 0);
      if (height <= (globalThis.innerHeight || 0) + 20) break;
      const targetY = Math.min(height, Math.round((index + 1) * Math.max(360, (globalThis.innerHeight || 720) * 0.78)));
      globalThis.scrollTo(0, targetY);
      steps += 1;
      await wait(150);
      if (targetY + (globalThis.innerHeight || 0) >= height - 20 && height === lastHeight) break;
      lastHeight = height;
    }
    globalThis.scrollTo(startX, startY);
    await wait(100);
    return { scrollSteps: steps };
  }

  async function waitForImages(root) {
    const pending = [...root.querySelectorAll('img')].filter((image) => elementVisible(image) && !image.complete).slice(0, 30);
    if (!pending.length) return { imagesWaited: 0, imagesStillPending: 0 };
    await Promise.race([
      Promise.allSettled(pending.map((image) => new Promise((resolve) => {
        const done = () => resolve();
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
      }))),
      wait(1600),
    ]);
    return {
      imagesWaited: pending.length,
      imagesStillPending: pending.filter((image) => !image.complete).length,
    };
  }

  async function collectTabPanels(root) {
    const tabs = [...root.querySelectorAll('[role="tab"][aria-controls]')]
      .filter((tab) => !traversalElementExcluded(tab) && !DANGEROUS_CONTROL_LABEL.test(normalizeSpace(tab.innerText || tab.textContent)))
      .slice(0, MAX_TAB_PANELS);
    if (tabs.length < 2) return { markdown: '', tabPanels: 0, discoveredTargets: [] };
    const initiallySelected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || null;
    const sections = [];
    const discoveredTargets = [];
    const targetSeen = new Set();
    const seen = new Set();
    for (const tab of tabs) {
      const panelId = String(tab.getAttribute('aria-controls') || '').trim();
      if (!panelId) continue;
      try {
        tab.click();
        await wait(180);
      } catch { continue; }
      const panel = document.getElementById(panelId);
      if (!(panel instanceof Element) || !elementVisible(panel)) continue;
      for (const target of discoverTraversalTargets(panel)) {
        if (!targetSeen.has(target.url)) {
          targetSeen.add(target.url);
          discoveredTargets.push(target);
        }
      }
      const body = cleanMarkdown(renderNode(panel));
      if (body.length < 30 || seen.has(body)) continue;
      seen.add(body);
      const label = normalizeSpace(tab.getAttribute('aria-label') || tab.innerText || tab.textContent || 'Tab').slice(0, 100);
      sections.push(`## ${label}\n\n${body}`);
    }
    if (initiallySelected) {
      try { initiallySelected.click(); } catch { /* No-op. */ }
    }
    return { markdown: sections.join('\n\n'), tabPanels: sections.length, discoveredTargets };
  }

  async function prepareRenderedPage({ includeTabs = true, reportProgress = false } = {}) {
    if (reportProgress) reportTraversalProgress('reading');
    const root = selectContentRoot();
    if (reportProgress) reportTraversalProgress('expanding');
    const expanded = await expandLazyContent(root);
    if (reportProgress) reportTraversalProgress('scrolling');
    const scrolled = await scrollForLazyRender();
    if (reportProgress) reportTraversalProgress('images');
    const images = await waitForImages(root);
    if (reportProgress) reportTraversalProgress('tabs');
    const tabs = includeTabs ? await collectTabPanels(root) : { markdown: '', tabPanels: 0, discoveredTargets: [] };
    if (reportProgress) reportTraversalProgress('extracting');
    await wait(120);
    return {
      extraMarkdown: tabs.markdown,
      discoveredTargets: tabs.discoveredTargets || [],
      diagnostics: {
        ...expanded,
        ...scrolled,
        ...images,
        tabPanels: tabs.tabPanels,
      },
    };
  }

  async function buildPreparedCapture(options = {}) {
    const prepared = await prepareRenderedPage(options);
    return buildCapture(prepared.extraMarkdown, prepared.diagnostics);
  }

  function traversalActivationLabel(element) {
    return normalizeSpace(
      element?.getAttribute?.('aria-label')
      || element?.getAttribute?.('title')
      || element?.innerText
      || element?.textContent,
    ).slice(0, 180);
  }

  function traversalActivationElements(root = selectContentRoot()) {
    const raw = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let inspected = 0;
    for (let element = walker.nextNode(); element && inspected < MAX_CANDIDATES; element = walker.nextNode()) {
      inspected += 1;
      if (!(element instanceof Element) || traversalElementExcluded(element)) continue;
      if (element.closest('a[href],[data-href],[data-url],form')) continue;
      if (element.matches('[role="tab"]') || element.getAttribute('aria-haspopup') || element.hasAttribute('disabled')) continue;
      if (element.hasAttribute('aria-expanded')) continue;
      const rawLabel = normalizeSpace(element.getAttribute('aria-label') || element.getAttribute('title') || element.innerText || element.textContent);
      if (!rawLabel || rawLabel.length > 220) continue;
      const style = getComputedStyle(element);
      const interactive = element.matches('button,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])') || style.cursor === 'pointer';
      if (!interactive) continue;
      const label = traversalActivationLabel(element);
      if (!label || label.length < 3 || DANGEROUS_CONTROL_LABEL.test(label) || SAFE_EXPAND_LABEL.test(label)) continue;
      if (/^(?:copy|download|share|save|print|play|pause|next|previous|back|close|cancel|submit|send|search|menu)$/i.test(label)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 30) continue;
      raw.push(element);
    }
    return raw.filter((element, index) => {
      const label = traversalActivationLabel(element);
      return !raw.some((other, otherIndex) => otherIndex !== index && other.contains(element) && traversalActivationLabel(other) === label);
    }).slice(0, MAX_TRAVERSAL_TARGETS_PER_PAGE);
  }

  function activationIdentityUrl(parentUrl, label, ordinal, experienceId) {
    try {
      const url = new URL(parentUrl);
      url.searchParams.set('sp_guide', `${Math.max(0, Number(ordinal || 0))}:${String(label || '').slice(0, 96)}`);
      url.searchParams.sort();
      return safeTraversalUrl(url.toString(), experienceId);
    } catch {
      return '';
    }
  }

  function discoverTraversalActivators(root = selectContentRoot()) {
    const experienceId = findExperienceId();
    const parentUrl = safeTraversalUrl(location.href, experienceId) || currentAppFrameFallbackUrl();
    if (!parentUrl) return [];
    const counts = new Map();
    const targets = [];
    for (const element of traversalActivationElements(root)) {
      const label = traversalActivationLabel(element);
      const ordinal = counts.get(label) || 0;
      counts.set(label, ordinal + 1);
      const url = activationIdentityUrl(parentUrl, label, ordinal, experienceId);
      if (!url) continue;
      targets.push({
        url,
        title: label,
        activation: true,
        parentUrl,
        parentTitle: pageTitle(root),
        activationLabel: label,
        activationOrdinal: ordinal,
      });
    }
    return targets;
  }

  async function activateTraversalTarget(target) {
    const experienceId = findExperienceId();
    const currentUrl = safeTraversalUrl(location.href, experienceId) || currentAppFrameFallbackUrl();
    const parentUrl = safeTraversalUrl(target?.parentUrl, experienceId);
    if (!currentUrl || !parentUrl || currentUrl !== parentUrl) {
      return { ok: false, error: 'Capture-all refused to activate a guide card outside its verified parent directory.' };
    }
    const label = normalizeSpace(target?.activationLabel || target?.title).slice(0, 180);
    const ordinal = Math.max(0, Number(target?.activationOrdinal || 0));
    const matches = traversalActivationElements(selectContentRoot()).filter((element) => traversalActivationLabel(element) === label);
    const element = matches[ordinal] || null;
    if (!element) return { ok: false, error: `The rendered guide card “${label || 'unknown'}” is no longer available.` };
    try { element.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* Optional viewport assist. */ }
    await wait(60);
    try {
      element.click();
      return { ok: true, activated: true, title: label };
    } catch (error) {
      return { ok: false, error: String(error?.message || error || 'The rendered guide card could not be activated.') };
    }
  }

  function discoverTraversalTargets(root = selectContentRoot()) {
    const experienceId = findExperienceId();
    const currentUrl = safeTraversalUrl(location.href, experienceId) || safeHttpUrl(location.href) || currentAppFrameFallbackUrl();
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
      candidates.push({ url, title: label, activation: false });
    }

    const expPath = experienceId ? `/experiences/${experienceId}/` : '';
    const scoped = expPath ? candidates.filter((target) => {
      try { return new URL(target.url).pathname.includes(expPath); } catch { return false; }
    }) : [];
    const navigable = scoped.length ? scoped : candidates;
    const activations = discoverTraversalActivators(root).filter((target) => !seen.has(target.url));
    return [...navigable, ...activations].slice(0, MAX_TRAVERSAL_TARGETS_PER_PAGE);
  }

  function classifyRenderedPage(root, targets, capture) {
    const paragraphChars = [...root.querySelectorAll('p')]
      .reduce((sum, paragraph) => sum + normalizeSpace(paragraph.innerText || paragraph.textContent).length, 0);
    const richBlocks = root.querySelectorAll('pre,table,blockquote').length;
    const cardLike = root.querySelectorAll('a[href],[role="link"],[data-href],[data-url],button,[role="button"],[tabindex]:not([tabindex="-1"])').length;
    const pathname = String(location.pathname || '');
    const pathLooksDirectory = /\/(?:pages|content|guides|library)\/?$/i.test(pathname);
    const proseLight = paragraphChars < 520 && richBlocks === 0;
    const linkDense = targets.length >= 2 && cardLike >= Math.max(3, targets.length);
    const bodyShort = !capture || String(capture.bodyMarkdown || '').length < 1500;
    return {
      directoryLike: Boolean((pathLooksDirectory && targets.length) || (linkDense && proseLight && bodyShort)),
      paragraphChars,
      richBlocks,
      linkCount: targets.length,
    };
  }

  async function traversalSnapshot() {
    const prepared = await prepareRenderedPage({ includeTabs: true, reportProgress: true });
    const root = selectContentRoot();
    const targets = [];
    const targetSeen = new Set();
    for (const target of [...discoverTraversalTargets(root), ...(prepared.discoveredTargets || [])]) {
      if (!targetSeen.has(target.url)) {
        targetSeen.add(target.url);
        targets.push(target);
      }
    }
    let capture = null;
    try { capture = buildCapture(prepared.extraMarkdown, prepared.diagnostics); } catch { /* Transition/directory shells may not be capturable. */ }
    const classification = classifyRenderedPage(root, targets, capture);
    return {
      experienceId: findExperienceId(),
      pageUrl: safeHttpUrl(location.href) || currentAppFrameFallbackUrl(),
      title: pageTitle(root),
      ...classification,
      targets,
      capture,
      diagnostics: prepared.diagnostics,
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
      documentId: CAPTURE_DOCUMENT_ID,
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
    if (!autoEnabled || traversalEnabled) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(async () => {
      if (!autoEnabled || traversalEnabled) return;
      try {
        const capture = await buildPreparedCapture({ includeTabs: true });
        const identity = `${capture.experienceId}|${capture.pageIdentity}|${capture.bodyMarkdown.length}`;
        if (identity === lastAutoIdentity) return;
        lastAutoIdentity = identity;
        chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}auto-capture`, capture }).catch(() => null);
      } catch {
        // Navigation can briefly leave the app between pages. Wait for the next stable mutation.
      }
    }, AUTO_CAPTURE_DELAY_MS);
  }

  function resetTraversalSnapshotSchedule() {
    clearTimeout(traversalTimer);
    traversalTimer = 0;
    traversalDirty = false;
  }

  async function runTraversalSnapshot() {
    if (!traversalEnabled) return false;
    if (traversalBusy) {
      traversalDirty = true;
      return false;
    }
    traversalBusy = true;
    traversalDirty = false;
    try {
      const snapshot = await traversalSnapshot();
      if (!traversalEnabled) return false;
      traversalHasRun = true;
      const identity = `${snapshot.experienceId}|${snapshot.pageUrl}|${snapshot.targets.length}|${snapshot.capture?.bodyMarkdown?.length || 0}|${snapshot.diagnostics?.controlsClicked || 0}`;
      if (identity === lastTraversalIdentity) return true;
      lastTraversalIdentity = identity;
      reportTraversalProgress('sending');
      chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}traversal-page`, snapshot }).catch(() => null);
      return true;
    } catch (error) {
      if (traversalEnabled) {
        traversalDirty = true;
        reportTraversalProgress('retrying', String(error?.message || error || 'Rendered page changed while it was being prepared.'));
      }
      return false;
    } finally {
      traversalBusy = false;
      if (traversalEnabled && traversalDirty) scheduleTraversalSnapshot();
    }
  }

  function scheduleTraversalSnapshot() {
    if (!traversalEnabled) return;
    if (traversalBusy) {
      traversalDirty = true;
      return;
    }
    if (traversalTimer) return;
    reportTraversalProgress('settling');
    traversalTimer = setTimeout(() => {
      traversalTimer = 0;
      return runTraversalSnapshot();
    }, TRAVERSAL_SETTLE_MS);
  }

  function runTraversalSnapshotNow() {
    if (!traversalEnabled) return;
    if (traversalTimer) {
      clearTimeout(traversalTimer);
      traversalTimer = 0;
    }
    runTraversalSnapshot();
  }

  function resumeTraversal() {
    if (!traversalEnabled) return;
    if (!traversalHasRun && !traversalBusy) {
      runTraversalSnapshotNow();
      return;
    }
    scheduleTraversalSnapshot();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === `${MESSAGE_PREFIX}capture-now`) {
      buildPreparedCapture({ includeTabs: true })
        .then((capture) => sendResponse({ ok: true, capture }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || 'Capture failed.') }));
      return true;
    }
    if (message?.type === `${MESSAGE_PREFIX}set-auto`) {
      autoEnabled = message.enabled === true;
      if (autoEnabled && !traversalEnabled) scheduleAutoCapture();
      else clearTimeout(autoTimer);
      sendResponse({ ok: true, enabled: autoEnabled });
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}set-traversal`) {
      const nextTraversalEnabled = message.enabled === true;
      if (nextTraversalEnabled === traversalEnabled) {
        if (nextTraversalEnabled) resumeTraversal();
        sendResponse({ ok: true, enabled: traversalEnabled, unchanged: true });
        return false;
      }
      traversalEnabled = nextTraversalEnabled;
      lastTraversalIdentity = '';
      traversalHasRun = false;
      resetTraversalSnapshotSchedule();
      if (traversalEnabled) {
        clearTimeout(autoTimer);
        traversalOverlayDismissed = false;
        traversalOverlayMinimized = false;
        ensureTraversalOverlay();
        runTraversalSnapshotNow();
      } else if (autoEnabled) {
        scheduleAutoCapture();
      }
      sendResponse({ ok: true, enabled: traversalEnabled });
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}traversal-snapshot-now`) {
      if (!traversalEnabled) {
        sendResponse({ ok: false, error: 'Capture-all is not enabled in this rendered frame.' });
        return false;
      }
      runTraversalSnapshotNow();
      sendResponse({ ok: true, started: true });
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}traversal-state`) {
      updateTraversalOverlayState(message.state || {});
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === `${MESSAGE_PREFIX}traverse-activate`) {
      activateTraversalTarget(message.target || {})
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error || 'Guide activation failed.') }));
      return true;
    }
    if (message?.type === `${MESSAGE_PREFIX}traverse-navigate`) {
      const target = safeTraversalUrl(message.url, findExperienceId());
      if (!target) {
        sendResponse({ ok: false, error: 'SniperPlug refused an unsafe, credential-bearing, cross-origin, or cross-experience traversal target.' });
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

  const observer = new MutationObserver((mutations) => {
    if (traversalOverlay && mutations.length && mutations.every((mutation) => mutation.target === traversalOverlay || traversalOverlay.contains(mutation.target))) return;
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
      traversalHasRun = false;
      resetTraversalSnapshotSchedule();
      registerCandidate();
      scheduleAutoCapture();
      resumeTraversal();
    }
  }, 700);

  globalThis.__sniperplugBetterContentCapture = {
    registerCandidate,
    candidateSummary,
    resumeTraversal,
    runTraversalSnapshotNow,
  };
  registerCandidate();
  setTimeout(registerCandidate, 900);
  setTimeout(registerCandidate, 2200);
})();
