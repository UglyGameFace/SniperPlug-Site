import { HttpError } from './http.js';

export function isWhopAppFrameUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.apps.whop.com');
  } catch {
    return false;
  }
}

export function requireWhopAppFrameCaptures(input) {
  const captures = Array.isArray(input?.captures)
    ? input.captures
    : input?.capture ? [input.capture] : [];

  for (const capture of captures) {
    if (!isWhopAppFrameUrl(capture?.pageUrl || capture?.frameUrl)) {
      throw new HttpError(422, 'Browser capture was rejected because it did not come from a rendered Better Content app frame or another supported HTTPS Whop app frame. Reopen the individual content page and capture it again.');
    }
  }

  return captures;
}
