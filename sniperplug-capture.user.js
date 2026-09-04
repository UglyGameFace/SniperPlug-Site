// ==UserScript==
// @name         SniperPlug Authorized Whop Page Capture
// @namespace    https://sniperplug.com/
// @version      1.0.0
// @description  Capture only the Whop app page currently rendered for you and send it to your private SniperPlug draft queue.
// @author       SniperPlug
// @match        https://*.apps.whop.com/*
// @match        https://*.whop.site/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      sniperplug.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const TOKEN_KEY = 'sniperplug_authorized_capture_token';
  const BUTTON_ID = 'sniperplug-authorized-capture-button';
  const TOAST_ID = 'sniperplug-authorized-capture-toast';
  const CAPTURE_URL = 'https://sniperplug.com/api/capture-page';
  const MIN_TEXT_LENGTH = 80;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function text(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  function absoluteHttpsUrl(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      return url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function toast(message, type = 'ok') {
    let node = document.getElementById(TOAST_ID);
    if (!node) {
      node = document.createElement('div');
      node.id = TOAST_ID;
      Object.assign(node.style, {
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: '76px',
        zIndex: '2147483647',
        padding: '12px 14px',
        borderRadius: '12px',
        font: '600 14px/1.4 system-ui,sans-serif',
        boxShadow: '0 10px 35px rgba(0,0,0,.35)',
        whiteSpace: 'pre-wrap',
      });
      document.documentElement.append(node);
    }
    node.style.background = type === 'error' ? '#39171d' : '#102b20';
    node.style.color = type === 'error' ? '#ffd9df' : '#d9ffea';
    node.style.border = `1px solid ${type === 'error' ? '#8d3443' : '#28724e'}`;
    node.textContent = String(message || '');
    node.hidden = false;
    clearTimeout(node._sniperplugTimer);
    node._sniperplugTimer = setTimeout(() => { node.hidden = true; }, 6500);
  }

  function candidateRoots() {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.prose',
      '[class*="prose"]',
      '[class*="ProseMirror"]',
      '[data-slate-editor="true"]',
      '[data-lexical-editor="true"]',
    ];
    const values = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement) || seen.has(node)) continue;
        seen.add(node);
        values.push(node);
      }
    }
    if (document.body && !seen.has(document.body)) values.push(document.body);
    return values;
  }

  function rootScore(node) {
    const content = text(node.innerText || node.textContent || '');
    if (content.length < MIN_TEXT_LENGTH) return -Infinity;
    const controls = node.querySelectorAll('button,input,select,textarea,nav,[role="navigation"]').length;
    const links = node.querySelectorAll('a').length;
    const headings = node.querySelectorAll('h1,h2,h3,h4').length;
    return content.length + headings * 220 - controls * 180 - Math.max(0, links - 20) * 20;
  }

  function bestContentRoot() {
    const ranked = candidateRoots()
      .map((node) => ({ node, score: rootScore(node) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => right.score - left.score);
    return ranked[0]?.node || document.body;
  }

  function removable(node) {
    if (!(node instanceof Element)) return false;
    if (node.id === BUTTON_ID || node.id === TOAST_ID) return true;
    if (node.matches('script,style,noscript,template,nav,footer,aside,form,button,input,textarea,select,dialog,[hidden],[aria-hidden="true"],[role="navigation"]')) return true;
    const label = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('role') || ''}`.toLowerCase();
    return label.includes('navigation') || label.includes('menu');
  }

  function cloneForCapture(root) {
    const clone = root.cloneNode(true);
    for (const node of [...clone.querySelectorAll('*')]) {
      if (removable(node)) node.remove();
    }
    return clone;
  }

  function escapeMarkdown(value) {
    return String(value || '').replace(/([\\`*_{}\[\]<>])/g, '\\$1');
  }

  function childrenMarkdown(node) {
    return [...node.childNodes].map(nodeToMarkdown).join('');
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').replace(/\s+/g, ' ');
    if (!(node instanceof Element)) return '';
    const tag = node.tagName.toLowerCase();
    if (removable(node)) return '';
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return `\n\n${'#'.repeat(level)} ${text(node.textContent)}\n\n`;
    }
    if (tag === 'br') return '\n';
    if (tag === 'p') return `\n\n${childrenMarkdown(node).trim()}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${childrenMarkdown(node).trim()}**`;
    if (tag === 'em' || tag === 'i') return `*${childrenMarkdown(node).trim()}*`;
    if (tag === 'del' || tag === 's') return `~~${childrenMarkdown(node).trim()}~~`;
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${String(node.textContent || '').replace(/`/g, '\\`')}\``;
    if (tag === 'pre') return `\n\n\`\`\`\n${String(node.textContent || '').trim()}\n\`\`\`\n\n`;
    if (tag === 'blockquote') {
      const value = childrenMarkdown(node).trim().split('\n').map((line) => `> ${line}`).join('\n');
      return `\n\n${value}\n\n`;
    }
    if (tag === 'a') {
      const label = childrenMarkdown(node).trim() || text(node.textContent);
      const href = absoluteHttpsUrl(node.getAttribute('href'));
      return href && label ? `[${label}](${href})` : label;
    }
    if (tag === 'img') {
      const src = absoluteHttpsUrl(node.getAttribute('src') || node.getAttribute('data-src'));
      if (!src) return '';
      const alt = escapeMarkdown(text(node.getAttribute('alt')) || 'Captured image');
      return `\n\n![${alt}](${src})\n\n`;
    }
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      const items = [...node.children].filter((child) => child.tagName?.toLowerCase() === 'li');
      const value = items.map((item, index) => {
        const marker = ordered ? `${index + 1}.` : '-';
        const body = childrenMarkdown(item).trim().replace(/\n+/g, '\n  ');
        return `${marker} ${body}`;
      }).join('\n');
      return value ? `\n\n${value}\n\n` : '';
    }
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'table') return `\n\n${text(node.innerText || node.textContent)}\n\n`;
    if (['div', 'section', 'article', 'main', 'header', 'figure', 'figcaption'].includes(tag)) return `\n${childrenMarkdown(node)}\n`;
    return childrenMarkdown(node);
  }

  function normalizeMarkdown(value) {
    return String(value || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function pageTitle(root) {
    const heading = [...root.querySelectorAll('h1,h2')]
      .map((node) => text(node.textContent))
      .find((value) => value.length >= 3 && value.length <= 140);
    if (heading) return heading;
    const meta = text(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
    if (meta) return meta.slice(0, 140);
    return text(document.title).replace(/\s+[|·-]\s+Whop.*$/i, '').slice(0, 140) || 'Captured Whop guide';
  }

  function experienceIdFromPage() {
    const match = String(location.href).match(/\bexp_[A-Za-z0-9_-]+\b/);
    return match ? match[0] : null;
  }

  function appIdFromPage() {
    const match = String(location.href).match(/\bapp_[A-Za-z0-9_-]+\b/);
    return match ? match[0] : null;
  }

  function appNameFromPage() {
    return text(document.querySelector('meta[property="og:site_name"]')?.getAttribute('content'))
      || text(document.title).split(/[|·]/)[0]
      || location.hostname;
  }

  async function hydrateLazyContent() {
    const scrolling = document.scrollingElement;
    if (!scrolling) return;
    const start = scrolling.scrollTop;
    let previous = -1;
    for (let index = 0; index < 14; index += 1) {
      const bottom = Math.max(0, scrolling.scrollHeight - scrolling.clientHeight);
      if (bottom <= 0 || scrolling.scrollTop >= bottom - 4 || scrolling.scrollTop === previous) break;
      previous = scrolling.scrollTop;
      scrolling.scrollTo({ top: Math.min(bottom, scrolling.scrollTop + Math.max(420, scrolling.clientHeight * 0.8)), behavior: 'auto' });
      await wait(110);
    }
    scrolling.scrollTo({ top: start, behavior: 'auto' });
    await wait(80);
  }

  function capturePayload() {
    const root = bestContentRoot();
    const clone = cloneForCapture(root);
    const markdown = normalizeMarkdown(nodeToMarkdown(clone));
    if (text(markdown).length < MIN_TEXT_LENGTH) throw new Error('SniperPlug could not find enough rendered guide content on this page. Open the guide itself, then try again.');
    const imageUrls = [...new Set([...clone.querySelectorAll('img')]
      .map((image) => absoluteHttpsUrl(image.getAttribute('src') || image.getAttribute('data-src')))
      .filter(Boolean))];
    return {
      sourceUrl: location.href,
      title: pageTitle(clone),
      markdown,
      experienceId: experienceIdFromPage(),
      appId: appIdFromPage(),
      appName: appNameFromPage(),
      imageUrls,
    };
  }

  function postCapture(token, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: CAPTURE_URL,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data: JSON.stringify(payload),
        timeout: 30000,
        onload(response) {
          let data = {};
          try { data = response.responseText ? JSON.parse(response.responseText) : {}; } catch { data = {}; }
          if (response.status >= 200 && response.status < 300) return resolve(data);
          const error = new Error(data.error || `SniperPlug capture failed (${response.status}).`);
          error.status = response.status;
          reject(error);
        },
        ontimeout() { reject(new Error('SniperPlug did not answer the capture request in time.')); },
        onerror() { reject(new Error('The capture request could not reach SniperPlug.')); },
      });
    });
  }

  async function captureCurrentPage(button) {
    if (button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    const idleLabel = button.textContent;
    button.textContent = 'Capturing…';
    button.disabled = true;
    try {
      let token = String(await GM_getValue(TOKEN_KEY, '') || '').trim();
      if (!token) {
        token = String(prompt('Paste the 30-minute SniperPlug capture token from your Control Center:') || '').trim();
        if (!token) throw new Error('No SniperPlug capture token was entered.');
        await GM_setValue(TOKEN_KEY, token);
      }
      await hydrateLazyContent();
      const payload = capturePayload();
      const output = await postCapture(token, payload);
      const guide = output?.guide || {};
      const action = guide.action === 'updated-draft' ? 'Updated private draft' : guide.action === 'unchanged' ? 'Already up to date' : guide.action === 'duplicate-held' ? 'Matching draft already exists' : 'Created private draft';
      toast(`${action}: ${guide.title || payload.title}${guide.imageReviewCount ? `\n${guide.imageReviewCount} image link${guide.imageReviewCount === 1 ? '' : 's'} flagged for review.` : ''}`);
    } catch (error) {
      if (Number(error?.status || 0) === 401) await GM_deleteValue(TOKEN_KEY);
      toast(error?.message || 'SniperPlug capture failed.', 'error');
    } finally {
      button.dataset.busy = 'false';
      button.textContent = idleLabel;
      button.disabled = false;
    }
  }

  function installButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Import to SniperPlug';
    button.title = 'Capture only the guide currently rendered for your authorized account';
    Object.assign(button.style, {
      position: 'fixed',
      right: '12px',
      bottom: '14px',
      zIndex: '2147483647',
      border: '1px solid rgba(93,239,157,.55)',
      borderRadius: '999px',
      padding: '11px 15px',
      background: '#123325',
      color: '#e6fff1',
      font: '700 13px/1 system-ui,sans-serif',
      boxShadow: '0 8px 28px rgba(0,0,0,.4)',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => captureCurrentPage(button));
    document.documentElement.append(button);
  }

  installButton();
})();
