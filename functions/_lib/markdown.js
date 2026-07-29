function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function safeUrl(value, { image = false } = {}) {
  try {
    const raw = String(value || '').trim();
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    if (url.protocol !== 'https:' && (!image && url.protocol !== 'http:')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function splitTrailingPunctuation(value) {
  let target = String(value || '');
  let suffix = '';
  while (/[.,!?;:]$/.test(target)) {
    suffix = target.slice(-1) + suffix;
    target = target.slice(0, -1);
  }
  while (target.endsWith(')') && (target.match(/\(/g)?.length || 0) < (target.match(/\)/g)?.length || 0)) {
    suffix = ')' + suffix;
    target = target.slice(0, -1);
  }
  return { target, suffix };
}

function inlineMarkdown(value) {
  let source = String(value ?? '');
  const tokens = [];
  const stash = (html) => `\u0001TOKEN${tokens.push(html) - 1}\u0001`;

  source = source.replace(/`([^`\n]+)`/g, (_, content) => stash(`<code>${escapeHtml(content)}</code>`));
  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (_, alt, target) => {
    const url = safeUrl(target, { image: true });
    return stash(url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`
      : `![${escapeHtml(alt)}](${escapeHtml(target)})`);
  });
  source = source.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (_, label, target) => {
    const url = safeUrl(target);
    return stash(url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(label)}</a>`
      : `${escapeHtml(label)} (${escapeHtml(target)})`);
  });

  let output = escapeHtml(source);
  output = output.replace(/(^|[\s(>])((?:https?:\/\/|www\.)[^\s<]+)/gi, (_, prefix, rawTarget) => {
    const { target, suffix } = splitTrailingPunctuation(rawTarget);
    const url = safeUrl(target);
    return url
      ? `${prefix}<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(target)}</a>${escapeHtml(suffix)}`
      : `${prefix}${escapeHtml(rawTarget)}`;
  });
  output = output
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  output = output.replace(/\u0001TOKEN(\d+)\u0001/g, (_, index) => tokens[Number(index)] || '');
  return output;
}

function tableDelimiter(line) {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableCells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function renderTable(lines, start) {
  if (start + 1 >= lines.length || !lines[start].includes('|') || !tableDelimiter(lines[start + 1])) return null;
  const header = tableCells(lines[start]);
  const align = tableCells(lines[start + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
  const rows = [];
  let index = start + 2;
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rows.push(tableCells(lines[index]));
    index += 1;
  }
  const head = header.map((cell, column) => `<th style="text-align:${align[column] || 'left'}">${inlineMarkdown(cell)}</th>`).join('');
  const body = rows.map((row) => `<tr>${header.map((_, column) => `<td style="text-align:${align[column] || 'left'}">${inlineMarkdown(row[column] || '')}</td>`).join('')}</tr>`).join('');
  return { html: `<div class="guide-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`, next: index };
}

function renderList(lines, start) {
  const first = lines[start].match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
  if (!first) return null;
  const ordered = /^\d/.test(first[1]);
  const items = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index].match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
    if (!match || /^\d/.test(match[1]) !== ordered) break;
    const chunks = [match[2]];
    index += 1;
    while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !/^\s{0,3}([-+*]|\d+[.)])\s+/.test(lines[index])) {
      chunks.push(lines[index].trim());
      index += 1;
    }
    items.push(chunks.join(' '));
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`, next: index };
}

function renderParagraph(parts) {
  let output = '';
  for (let index = 0; index < parts.length; index += 1) {
    const hardBreak = /\s{2}$/.test(parts[index]);
    output += inlineMarkdown(parts[index].replace(/\s{2}$/, ''));
    if (index < parts.length - 1) output += hardBreak ? '<br>\n' : ' ';
  }
  return output;
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([^\s]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s{0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const language = fence[2].replace(/[^a-zA-Z0-9_-]/g, '');
      output.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    const table = renderTable(lines, index);
    if (table) {
      output.push(table.html);
      index = table.next;
      continue;
    }

    const list = renderList(lines, index);
    if (list) {
      output.push(list.html);
      index = list.next;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s{0,3}>\s?/, ''));
        index += 1;
      }
      output.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^(?: {4}|\t)/.test(line)) {
      const code = [];
      while (index < lines.length && (/^(?: {4}|\t)/.test(lines[index]) || !lines[index].trim())) {
        code.push(lines[index].replace(/^(?: {4}|\t)/, ''));
        index += 1;
      }
      output.push(`<pre><code>${escapeHtml(code.join('\n').replace(/\n+$/, ''))}</code></pre>`);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      if (/^\s{0,3}(?:#{1,6}\s+|`{3,}|~{3,}|>|[-+*]\s+|\d+[.)]\s+)/.test(lines[index])) break;
      if (renderTable(lines, index)) break;
      paragraph.push(lines[index]);
      index += 1;
    }
    output.push(`<p>${renderParagraph(paragraph)}</p>`);
  }

  return output.join('\n');
}

export { escapeHtml, inlineMarkdown };
