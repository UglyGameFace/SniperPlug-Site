import { HttpError } from './http.js';

const WHOP_HOST = /(^|\.)whop\.com$/i;
const WHOP_CONTENT_HOST = /(^|\.)(?:whopusercontent\.com|whopcdn\.com)$/i;
const SIGNED_QUERY = /^(?:x-amz-|x-goog-|cloudfront-|signature$|sig$|token$|expires?$|policy$|key-pair-id$)/i;

function codeFreeMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let fence = null;
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = null;
      output.push('');
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) {
      output.push('');
      continue;
    }
    output.push(line.replace(/`[^`\n]*`/g, ''));
  }
  return output.join('\n');
}

function normalizeUrl(value) {
  try {
    const raw = String(value || '').trim().replace(/[.,!?;:]+$/, '');
    if (!raw) return null;
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function collectUrls(markdown) {
  const text = codeFreeMarkdown(markdown);
  const found = [];
  const occupied = [];
  const markdownPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let match;
  while ((match = markdownPattern.exec(text))) {
    found.push(match[1]);
    occupied.push([match.index, markdownPattern.lastIndex]);
  }
  const plainPattern = /(?:https?:\/\/|www\.)[^\s<>]+/gi;
  while ((match = plainPattern.exec(text))) {
    if (occupied.some(([start, end]) => match.index >= start && match.index < end)) continue;
    found.push(match[0]);
  }
  return found;
}

function normalizedAllowlist(values) {
  const allowed = new Set();
  for (const value of values || []) {
    const url = normalizeUrl(value);
    if (url) allowed.add(url.toString());
  }
  return allowed;
}

function reasonFor(url, allowed) {
  if (allowed.has(url.toString())) return null;
  const host = url.hostname.toLowerCase();
  if (WHOP_HOST.test(host)) return 'Internal Whop page or creator link must be replaced with a public destination.';
  const signed = [...url.searchParams.keys()].some((key) => SIGNED_QUERY.test(key));
  if (WHOP_CONTENT_HOST.test(host) && signed) return 'Signed or expiring Whop file URL must be replaced with a permanent public file.';
  if (WHOP_CONTENT_HOST.test(host)) return 'Unverified Whop-hosted file URL must be reviewed before publishing.';
  return null;
}

export function auditGuideLinks(markdown, { allowedWhopUrls = [] } = {}) {
  const allowed = normalizedAllowlist(allowedWhopUrls);
  const unique = new Map();
  for (const raw of collectUrls(markdown)) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    unique.set(url.toString(), url);
  }
  const blocked = [];
  let externalCount = 0;
  for (const url of unique.values()) {
    const reason = reasonFor(url, allowed);
    if (reason) blocked.push({ url: url.toString(), host: url.hostname, reason });
    else externalCount += 1;
  }
  return {
    total: unique.size,
    externalCount,
    blockedCount: blocked.length,
    blocked,
  };
}

export function assertPublishableLinks(integrity) {
  const audit = integrity?.linkAudit || {};
  if (Number(audit.blockedCount || 0) > 0) {
    const first = audit.blocked?.[0];
    throw new HttpError(422, `Replace ${audit.blockedCount} blocked Whop or temporary link${audit.blockedCount === 1 ? '' : 's'} before publishing.${first?.reason ? ` ${first.reason}` : ''}`, {
      code: 'blocked_links',
      blocked: audit.blocked || [],
    });
  }
}
