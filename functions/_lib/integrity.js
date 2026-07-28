import { sha256 } from './crypto.js';
import { HttpError } from './http.js';

const DISALLOWED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const REPLACEMENT_CHARACTER = /\uFFFD/;
const BLOCKED_HTML_TAG = /<\s*\/?\s*(?:script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base)\b/i;
const EVENT_HANDLER_ATTRIBUTE = /\son[a-z][a-z0-9_-]*\s*=/i;
const UNSAFE_URL_ATTRIBUTE = /\b(?:href|src)\s*=\s*(["']?)\s*(?:javascript:|data:text\/html)/i;

function assertUnicodeScalars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new HttpError(422, 'Guide content contains an incomplete Unicode character.', { code: 'invalid_unicode', index });
      }
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      throw new HttpError(422, 'Guide content contains an incomplete Unicode character.', { code: 'invalid_unicode', index });
    }
  }
}

function normalizeTransport(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n');
}

function trimBoundaryBlankLines(value) {
  const lines = value.split('\n');
  while (lines.length && /^[\t ]*$/.test(lines[0])) lines.shift();
  while (lines.length && /^[\t ]*$/.test(lines.at(-1))) lines.pop();
  return lines.join('\n');
}

function analyzeCode(value) {
  const lines = value.split('\n');
  const rendered = [];
  let fence = null;
  let fenceCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) {
        fence = { character: marker[1][0], length: marker[1].length, line: index + 1 };
        fenceCount += 1;
      } else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
        fenceCount += 1;
      }
      rendered.push('');
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) {
      rendered.push('');
      continue;
    }
    rendered.push(line.replace(/`[^`\n]*`/g, ''));
  }

  if (fence) {
    throw new HttpError(422, `Guide content has an unclosed code fence starting on line ${fence.line}.`, {
      code: 'unclosed_code_fence',
      line: fence.line,
    });
  }
  return { renderedText: rendered.join('\n'), fenceCount };
}

function count(value, expression) {
  return value.split('\n').filter((line) => expression.test(line)).length;
}

function blankLineRuns(value) {
  const runs = [];
  let active = 0;
  for (const line of value.split('\n')) {
    if (/^[\t ]*$/.test(line)) active += 1;
    else if (active) {
      runs.push(active);
      active = 0;
    }
  }
  if (active) runs.push(active);
  return runs;
}

export async function prepareGuideBody(value, { source = 'Guide content' } = {}) {
  const original = String(value ?? '');
  assertUnicodeScalars(original);
  if (DISALLOWED_CONTROL.test(original)) {
    throw new HttpError(422, `${source} contains a control character that cannot be published safely.`, { code: 'control_character' });
  }
  if (REPLACEMENT_CHARACTER.test(original)) {
    throw new HttpError(422, `${source} contains the replacement character �, which usually means decoding failed.`, { code: 'replacement_character' });
  }

  const normalized = normalizeTransport(original);
  const body = trimBoundaryBlankLines(normalized);
  if (!body.trim()) throw new HttpError(422, `${source} is empty.`, { code: 'empty_content' });
  assertUnicodeScalars(body);

  const code = analyzeCode(body);
  if (BLOCKED_HTML_TAG.test(code.renderedText) || EVENT_HANDLER_ATTRIBUTE.test(code.renderedText) || UNSAFE_URL_ATTRIBUTE.test(code.renderedText)) {
    throw new HttpError(422, `${source} contains unsafe rendered HTML or a dangerous link.`, { code: 'unsafe_content' });
  }

  const repairs = [];
  if (/^\uFEFF/.test(original)) repairs.push('removed_utf8_bom');
  if (/\r/.test(original)) repairs.push('normalized_line_endings');
  if (/[\u2028\u2029]/.test(original)) repairs.push('normalized_unicode_line_separators');
  if (normalizeTransport(original) !== body) repairs.push('trimmed_boundary_blank_lines');

  return {
    body,
    fingerprint: await sha256(body),
    repairs,
    structure: {
      lines: body.split('\n').length,
      blankLineRuns: blankLineRuns(body),
      headings: count(code.renderedText, /^ {0,3}#{1,6}(?:[\t ]+|$)/),
      listItems: count(code.renderedText, /^ {0,3}(?:[-+*]|\d+[.)])(?:[\t ]+|$)/),
      blockquotes: count(code.renderedText, /^ {0,3}>(?:[\t ]+|$)/),
      tables: count(code.renderedText, /^\s*\|.*\|\s*$/),
      fenceCount: code.fenceCount,
    },
  };
}

export async function assertGuideRoundTrip(source, saved) {
  const expected = await prepareGuideBody(source, { source: 'Source guide content' });
  const actual = await prepareGuideBody(saved, { source: 'Saved guide content' });
  if (expected.body !== actual.body || expected.fingerprint !== actual.fingerprint) {
    throw new HttpError(422, 'Saved guide content does not exactly match the normalized source.', {
      code: 'round_trip_mismatch',
      expectedFingerprint: expected.fingerprint,
      actualFingerprint: actual.fingerprint,
    });
  }
  return actual;
}
