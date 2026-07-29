import { requireDatabase } from './http.js';

const SPORTS_BET_PATTERN = /\b(?:prizepicks?|sleeper|underdog|sports?book|parlay|prop(?:s)?|pick(?:s)?|odds?|bet(?:ting|s)?|wager|lineup|moneyline|spread|over\/?under|taco|free square|protected play|discount play|cash(?:ed|es)|units?)\b/i;
const TIME_SIGNAL_PATTERN = /\b(?:today|tonight|tomorrow|this morning|this afternoon|this evening|live now|lock(?:ed)? in|last minute|kickoff|tipoff|first pitch|starts? at|game time|expires?|limited time|this week|weekend)\b/i;
const MAX_SPORTS_PICK_AGE_HOURS = 72;

function safeJson(value, fallback = null) {
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n');
}

function escapeLinkLabel(value) {
  return String(value || '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
}

function markText(text, marks = []) {
  let output = String(text || '');
  for (const mark of Array.isArray(marks) ? marks : []) {
    const type = String(mark?.type || '').toLowerCase();
    if (type === 'link') {
      const href = String(mark?.attrs?.href || '').trim();
      if (/^https?:\/\//i.test(href)) output = `[${escapeLinkLabel(output) || href}](${href})`;
    } else if (type === 'bold' || type === 'strong') output = `**${output}**`;
    else if (type === 'italic' || type === 'em') output = `*${output}*`;
    else if (type === 'strike' || type === 'strikethrough') output = `~~${output}~~`;
    else if (type === 'code') output = `\`${output.replace(/`/g, '\\`')}\``;
  }
  return output;
}

function inlineNode(node) {
  if (!node || typeof node !== 'object') return '';
  const type = String(node.type || '');
  if (type === 'text') return markText(node.text || '', node.marks);
  if (type === 'hardBreak') return '  \n';
  if (type === 'mention') return String(node.attrs?.label || node.attrs?.username || node.attrs?.name || '').trim();
  if (type === 'emoji') return String(node.attrs?.native || node.attrs?.emoji || node.attrs?.shortcode || '').trim();
  if (type === 'image') {
    const src = String(node.attrs?.src || node.attrs?.url || '').trim();
    const alt = escapeLinkLabel(node.attrs?.alt || node.attrs?.title || 'Image');
    return /^https?:\/\//i.test(src) ? `![${alt}](${src})` : '';
  }
  return (Array.isArray(node.content) ? node.content : []).map(inlineNode).join('');
}

function renderListItem(node, ordered, index, depth) {
  const blocks = renderBlocks(node?.content || [], depth + 1).trim().split('\n');
  const prefix = ordered ? `${index + 1}. ` : '- ';
  if (!blocks.length) return prefix;
  return blocks.map((line, lineIndex) => `${lineIndex === 0 ? prefix : '  '}${line}`).join('\n');
}

function renderBlock(node, depth = 0) {
  if (!node || typeof node !== 'object') return '';
  const type = String(node.type || '');
  const children = Array.isArray(node.content) ? node.content : [];
  if (type === 'doc') return renderBlocks(children, depth);
  if (type === 'paragraph') return children.map(inlineNode).join('').trimEnd();
  if (type === 'heading') {
    const level = Math.max(1, Math.min(6, Number(node.attrs?.level || 2)));
    return `${'#'.repeat(level)} ${children.map(inlineNode).join('').trim()}`;
  }
  if (type === 'blockquote') {
    return renderBlocks(children, depth + 1).split('\n').map((line) => `> ${line}`).join('\n');
  }
  if (type === 'bulletList' || type === 'orderedList') {
    const ordered = type === 'orderedList';
    return children.map((item, index) => renderListItem(item, ordered, index, depth)).join('\n');
  }
  if (type === 'listItem') return renderBlocks(children, depth + 1);
  if (type === 'codeBlock') {
    const language = String(node.attrs?.language || node.attrs?.lang || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const code = children.map((child) => child?.text || inlineNode(child)).join('');
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }
  if (type === 'horizontalRule') return '---';
  if (type === 'image') return inlineNode(node);
  return children.map((child) => renderBlock(child, depth + 1) || inlineNode(child)).filter(Boolean).join('\n\n');
}

function renderBlocks(nodes, depth = 0) {
  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => renderBlock(node, depth))
    .filter((value) => String(value || '').trim())
    .join('\n\n');
}

export function whopContentToMarkdown(value) {
  if (value && typeof value === 'object') return renderBlock(value).trim();
  const text = normalizeText(value).trim();
  if (!text) return '';
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    const parsed = safeJson(text);
    if (parsed && typeof parsed === 'object') {
      const rendered = Array.isArray(parsed) ? renderBlocks(parsed) : renderBlock(parsed);
      if (rendered.trim()) return rendered.trim();
    }
  }
  return text;
}

export function plainContent(value) {
  return whopContentToMarkdown(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[`*_~>|#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ageHours(createdAt, now = Date.now()) {
  const timestamp = Date.parse(String(createdAt || ''));
  return Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 3_600_000) : null;
}

function meaningful(value) {
  return /[\p{L}\p{N}]/u.test(String(value || ''));
}

export function classifyWhopItem(item, now = Date.now()) {
  const sourceType = String(item?.sourceType || 'forum');
  const markdown = whopContentToMarkdown(item?.content);
  const plain = plainContent(markdown);
  const title = String(item?.title || '').trim();
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  const sourceMeta = item?.sourceMeta || {};
  const combined = `${title}\n${plain}`;
  const sportsPick = SPORTS_BET_PATTERN.test(combined);
  const timeSensitive = sportsPick && (TIME_SIGNAL_PATTERN.test(combined) || sourceType === 'chat');
  const hoursOld = ageHours(item?.created_at, now);
  const expiresAt = timeSensitive && Number.isFinite(Date.parse(String(item?.created_at || '')))
    ? new Date(Date.parse(item.created_at) + MAX_SPORTS_PICK_AGE_HOURS * 3_600_000).toISOString()
    : null;

  if (sourceType === 'chat' && sourceMeta.replyingTo) {
    return { autoPublishEligible: false, blocked: true, code: 'chat_reply', reason: 'Chat replies and comments stay in Whop and are never turned into standalone guides.', timeSensitive, expiresAt };
  }
  if (!plain && !attachments.length) {
    return { autoPublishEligible: false, blocked: true, code: 'empty_content', reason: 'This item has no guide content or attached file.', timeSensitive, expiresAt };
  }
  if (!meaningful(title) && plain.length < 40 && !attachments.length) {
    return { autoPublishEligible: false, blocked: true, code: 'low_signal', reason: 'This item is punctuation-only or too small to become a useful guide.', timeSensitive, expiresAt };
  }
  if (timeSensitive && (hoursOld === null || hoursOld > MAX_SPORTS_PICK_AGE_HOURS)) {
    return { autoPublishEligible: false, blocked: true, code: 'expired_sports_pick', reason: 'This sports pick is older than 72 hours and is no longer useful as a current guide.', timeSensitive, expiresAt };
  }
  if (sourceType === 'chat') {
    const substantial = plain.length >= 320 || (attachments.length > 0 && plain.length >= 60);
    if (!sourceMeta.pinned && !substantial) {
      return { autoPublishEligible: false, blocked: false, code: 'manual_review', reason: 'Short chat messages remain available for manual review but are excluded from automatic publishing.', timeSensitive, expiresAt };
    }
  }
  if (sourceType === 'forum' && plain.length < 80 && !attachments.length) {
    return { autoPublishEligible: false, blocked: false, code: 'manual_review', reason: 'This short forum post needs manual review before it can become a guide.', timeSensitive, expiresAt };
  }
  return { autoPublishEligible: true, blocked: false, code: 'guide_ready', reason: 'Long-form source content passed the automatic guide-quality gate.', timeSensitive, expiresAt };
}

export function quarantineReasonForGuide(row, now = Date.now()) {
  const body = String(row?.body_markdown || '').trim();
  const title = String(row?.title || '').trim();
  const integrity = safeJson(row?.integrity_json, {}) || {};
  const attachments = safeJson(row?.attachment_json, {}) || {};
  const sourceType = String(integrity.sourceType || attachments.sourceType || '');
  const sourceMeta = integrity.sourceMeta || {};
  const plain = plainContent(body);
  const parsed = body.startsWith('{') ? safeJson(body) : null;
  if (parsed?.type === 'doc' || Array.isArray(parsed?.content)) return 'Raw Whop structured JSON was published instead of rendered guide content.';
  if (sourceType === 'chat' && sourceMeta.replyingTo) return 'Chat reply/comment was incorrectly published as a standalone guide.';
  if ((!meaningful(title) || title.length < 3) && plain.length < 80) return 'Guide title and content are too small or punctuation-only.';
  if (sourceType === 'chat' && SPORTS_BET_PATTERN.test(`${title}\n${plain}`)) {
    const hoursOld = ageHours(row?.source_created_at, now);
    if (hoursOld === null || hoursOld > MAX_SPORTS_PICK_AGE_HOURS) return 'Expired sports pick is older than the 72-hour freshness window.';
  }
  return null;
}

export async function quarantineUnsafePublishedGuides(env) {
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT id, title, body_markdown, source_created_at, integrity_json, attachment_json
    FROM guides
    WHERE status = 'published' AND source_key IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 1000
  `).all();
  const updates = [];
  const now = new Date().toISOString();
  for (const row of rows.results || []) {
    const reason = quarantineReasonForGuide(row);
    if (!reason) continue;
    const integrity = safeJson(row.integrity_json, {}) || {};
    updates.push(db.prepare(`
      UPDATE guides
      SET status = 'draft', published_at = NULL, updated_at = ?, integrity_json = ?
      WHERE id = ? AND status = 'published'
    `).bind(now, JSON.stringify({ ...integrity, quarantined: true, quarantineReason: reason, quarantinedAt: now }), row.id));
  }
  if (updates.length) await db.batch(updates);
  return updates.length;
}

export const IMPORT_FRESHNESS_HOURS = Object.freeze({ sportsPicks: MAX_SPORTS_PICK_AGE_HOURS });
