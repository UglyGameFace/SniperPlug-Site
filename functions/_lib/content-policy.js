import { requireDatabase } from './http.js';

const SPORTS_BET_PATTERN = /\b(?:prizepicks?|sleeper|underdog|sports?book|parlay|prop(?:s)?|pick(?:s)?|odds?|bet(?:ting|s)?|wager|lineup|moneyline|spread|over\/?under|taco|free square|protected play|discount play|cash(?:ed|es)|units?)\b/i;
const TIME_SIGNAL_PATTERN = /\b(?:today|tonight|tomorrow|this morning|this afternoon|this evening|live now|lock(?:ed)? in|last minute|kickoff|tipoff|first pitch|starts? at|game time|expires?|limited time|this week|weekend)\b/i;
const GUIDE_SIGNAL_PATTERN = /\b(?:how to|step(?:s)?|guide|tutorial|method|walkthrough|setup|blueprint|roadmap|checklist|requirements?|instructions?|strategy|playbook|start here|onboarding|lesson|course|troubleshoot|fix|workflow|process|what you need|before you begin)\b/i;
const NOISE_TITLE_PATTERN = /^(?:announcement(?:s)?|general|public forum|content guidelines?|rules?|welcome|test|testing|chat item for review|untitled whop post|imported whop content|daily chat|lounge|random|off topic)$/i;
const PROMO_CHATTER_PATTERN = /\b(?:dm me|tap in|join now|code is|use code|link in bio|who wants|drop(?:ping)? now|live call|voice call|good morning|good night|congrats|let'?s go|wen|lol|lmao)\b/i;
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
  if (type === 'blockquote') return renderBlocks(children, depth + 1).split('\n').map((line) => `> ${line}`).join('\n');
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
  return (Array.isArray(nodes) ? nodes : []).map((node) => renderBlock(node, depth)).filter((value) => String(value || '').trim()).join('\n\n');
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

function structureSignals(markdown) {
  const text = String(markdown || '');
  return {
    headings: (text.match(/^\s{0,3}#{1,6}\s+/gm) || []).length,
    lists: (text.match(/^\s{0,3}(?:[-+*]|\d+[.)])\s+/gm) || []).length,
    links: (text.match(/\[[^\]]+\]\([^)]+\)/g) || []).length,
  };
}

function attachmentCount(value) {
  if (Array.isArray(value)) return value.length;
  if (Array.isArray(value?.files)) return value.files.length;
  return 0;
}

function policy(autoPublishEligible, blocked, code, reason, extra = {}) {
  return { autoPublishEligible, blocked, code, reason, ...extra };
}

export function classifyWhopItem(item, now = Date.now()) {
  const sourceType = String(item?.sourceType || 'forum');
  const markdown = whopContentToMarkdown(item?.content);
  const plain = plainContent(markdown);
  const title = String(item?.title || '').trim();
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  const sourceMeta = item?.sourceMeta || {};
  const sourceTitle = String(sourceMeta.experienceTitle || '').trim();
  const combined = `${sourceTitle}\n${title}\n${plain}`;
  const sportsPick = SPORTS_BET_PATTERN.test(combined);
  const timeSensitive = sportsPick && (TIME_SIGNAL_PATTERN.test(combined) || sourceType === 'chat');
  const hoursOld = ageHours(item?.created_at, now);
  const expiresAt = timeSensitive && Number.isFinite(Date.parse(String(item?.created_at || '')))
    ? new Date(Date.parse(item.created_at) + MAX_SPORTS_PICK_AGE_HOURS * 3_600_000).toISOString()
    : null;
  const signals = structureSignals(markdown);
  const guideSignal = GUIDE_SIGNAL_PATTERN.test(combined) || signals.headings > 0 || signals.lists >= 2;

  if (sourceType === 'chat' && sourceMeta.replyingTo) return policy(false, true, 'chat_reply', 'Chat replies stay in Whop and never become standalone guides.', { timeSensitive, expiresAt });
  if (!plain && !attachments.length) return policy(false, true, 'empty_content', 'This item has no guide content or attached file.', { timeSensitive, expiresAt });
  if (!meaningful(title) && plain.length < 40 && !attachments.length) return policy(false, true, 'low_signal', 'This item is punctuation-only or too small to become a useful guide.', { timeSensitive, expiresAt });
  if (timeSensitive && (hoursOld === null || hoursOld > MAX_SPORTS_PICK_AGE_HOURS)) return policy(false, true, 'expired_sports_pick', 'This sports pick is older than 72 hours and is no longer useful as a current guide.', { timeSensitive, expiresAt });

  if (sourceType === 'chat') return policy(false, false, 'chat_manual_only', 'Chat messages remain available for manual review but are never auto-published as guides.', { timeSensitive, expiresAt });
  if (sourceType === 'course' && sourceMeta.detailDeferred === true) return policy(true, false, 'course_detail_pending', 'The exact course lesson will be re-fetched and revalidated before import.', { timeSensitive, expiresAt });

  if (sourceType === 'course') {
    const placeholder = /^Course lesson from .+\.$/i.test(plain);
    if (placeholder && !attachments.length) return policy(false, false, 'course_placeholder', 'This course card has a title but no lesson body or attached media.', { timeSensitive, expiresAt });
    if (plain.length >= 120 || attachments.length > 0 || guideSignal) return policy(true, false, 'guide_ready', 'This course lesson passed the guide-quality gate.', { timeSensitive, expiresAt });
    return policy(false, false, 'course_manual_review', 'This course lesson needs manual review because it contains very little instructional content.', { timeSensitive, expiresAt });
  }

  if (NOISE_TITLE_PATTERN.test(title) || /\b(?:announcement|content guidelines?|public forum|daily chat|lounge)\b/i.test(sourceTitle)) return policy(false, false, 'source_manual_review', 'Announcements and general discussion sources stay manual so they cannot flood the guide library.', { timeSensitive, expiresAt });
  if (PROMO_CHATTER_PATTERN.test(combined) && plain.length < 500 && !guideSignal) return policy(false, false, 'forum_chatter', 'This looks like community chatter or a short promotion, not a durable guide.', { timeSensitive, expiresAt });
  if (plain.length >= 420) return policy(true, false, 'guide_ready', 'Long-form forum content passed the guide-quality gate.', { timeSensitive, expiresAt });
  if (plain.length >= 220 && guideSignal) return policy(true, false, 'guide_ready', 'Structured forum content passed the guide-quality gate.', { timeSensitive, expiresAt });
  if (attachments.length > 0 && plain.length >= 140 && guideSignal) return policy(true, false, 'guide_ready', 'Instructional forum content with supporting media passed the guide-quality gate.', { timeSensitive, expiresAt });
  return policy(false, false, 'forum_manual_review', 'This forum item remains available for manual review but is not strong enough for automatic publishing.', { timeSensitive, expiresAt });
}

export function rejectionReasonForGuide(row, now = Date.now()) {
  const body = String(row?.body_markdown || '').trim();
  const title = String(row?.title || '').trim();
  const integrity = safeJson(row?.integrity_json, {}) || {};
  const attachments = safeJson(row?.attachment_json, {}) || {};
  const sourceType = String(integrity.sourceType || attachments.sourceType || '');
  const sourceMeta = integrity.sourceMeta || {};
  const importPolicy = integrity.importPolicy || sourceMeta.importPolicy || integrity.policy || {};
  const plain = plainContent(body);
  const count = attachmentCount(attachments);
  const parsed = body.startsWith('{') ? safeJson(body) : null;

  if (integrity.manualReviewCompleted === true) return null;
  if (parsed?.type === 'doc' || Array.isArray(parsed?.content)) return 'Raw Whop structured JSON was imported instead of rendered guide content.';
  if (sourceType === 'chat') return 'Chat content requires explicit manual review and cannot remain in the normal guide queue.';
  if (['chat_reply', 'empty_content', 'low_signal', 'expired_sports_pick', 'course_placeholder', 'forum_chatter'].includes(importPolicy.code)) return importPolicy.reason || 'This item failed the guide-quality gate.';
  if (/^(?:chat item for review|untitled whop post|imported whop content)$/i.test(title)) return 'Fallback title indicates this was not a complete guide.';
  if ((!meaningful(title) || title.length < 3) && plain.length < 100) return 'Guide title and content are too small or punctuation-only.';
  if (sourceType === 'course' && /^Course lesson from .+\.$/i.test(plain) && count === 0) return 'Course card has no lesson body or attached media.';
  if (sourceType === 'forum') {
    const result = classifyWhopItem({ sourceType, title, content: body, attachments: Array.isArray(attachments.files) ? attachments.files : [], sourceMeta, created_at: row?.source_created_at }, now);
    if (result.autoPublishEligible !== true) return result.reason;
  }
  return null;
}

export function quarantineReasonForGuide(row, now = Date.now()) {
  return rejectionReasonForGuide(row, now);
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
    const reason = rejectionReasonForGuide(row);
    if (!reason) continue;
    const integrity = safeJson(row.integrity_json, {}) || {};
    updates.push(db.prepare(`
      UPDATE guides SET status = 'rejected', published_at = NULL, updated_at = ?, integrity_json = ?
      WHERE id = ? AND status = 'published'
    `).bind(now, JSON.stringify({ ...integrity, quarantined: true, quarantineReason: reason, quarantinedAt: now }), row.id));
  }
  if (updates.length) await db.batch(updates);
  return updates.length;
}

export const IMPORT_FRESHNESS_HOURS = Object.freeze({ sportsPicks: MAX_SPORTS_PICK_AGE_HOURS });
