(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const pendingId = params.get('extensionCapture');
  if (!pendingId) return;

  const MAX_CAPTURE_BATCH_COUNT = 25;
  const MAX_CAPTURE_BATCH_BODY_BYTES = 2_200_000;
  const MAX_TRANSIENT_RETRIES = 2;
  let pending = null;
  let sending = false;

  const panel = document.createElement('aside');
  panel.setAttribute('aria-live', 'polite');
  Object.assign(panel.style, {
    position: 'fixed',
    left: '14px',
    right: '14px',
    bottom: '14px',
    zIndex: '2147483647',
    maxWidth: '680px',
    margin: '0 auto',
    padding: '14px 16px',
    borderRadius: '16px',
    border: '1px solid rgba(94,230,156,.45)',
    background: 'rgba(6,16,23,.97)',
    color: '#eef7f4',
    boxShadow: '0 16px 48px rgba(0,0,0,.45)',
    fontFamily: 'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  });

  const title = document.createElement('strong');
  title.textContent = 'SniperPlug browser capture';
  title.style.display = 'block';
  title.style.marginBottom = '5px';

  const message = document.createElement('div');
  message.style.fontSize = '13px';
  message.style.lineHeight = '1.45';
  message.style.color = '#b9cac4';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry capture';
  Object.assign(retry.style, {
    marginTop: '10px',
    border: '1px solid #5ee69c',
    borderRadius: '999px',
    padding: '8px 13px',
    background: '#5ee69c',
    color: '#06120d',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'none',
  });

  panel.append(title, message, retry);
  document.documentElement.append(panel);

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setMessage(value, state = 'working') {
    message.textContent = value;
    title.style.color = state === 'error' ? '#ffb8b8' : state === 'ok' ? '#8ff0b7' : '#eef7f4';
    retry.style.display = state === 'error' ? 'inline-block' : 'none';
  }

  async function extension(messagePayload) {
    const response = await chrome.runtime.sendMessage(messagePayload);
    if (!response?.ok) throw new Error(response?.error || 'The capture extension could not complete the handoff.');
    return response;
  }

  async function responseJson(response) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; } catch { return { message: text || `Request failed (${response.status}).` }; }
  }

  function captureBodyBytes(capture) {
    return new TextEncoder().encode(String(capture?.bodyMarkdown || '')).byteLength;
  }

  function captureBatches(captures) {
    const batches = [];
    let current = [];
    let currentBytes = 0;
    for (const capture of Array.isArray(captures) ? captures : []) {
      const bytes = captureBodyBytes(capture);
      if (current.length && (current.length >= MAX_CAPTURE_BATCH_COUNT || currentBytes + bytes > MAX_CAPTURE_BATCH_BODY_BYTES)) {
        batches.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(capture);
      currentBytes += bytes;
    }
    if (current.length) batches.push(current);
    return batches;
  }

  async function sendBatch(captures, batchIndex, batchCount) {
    let attempt = 0;
    while (true) {
      const response = await fetch('/api/browser-capture', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rightsConfirmed: pending?.rightsConfirmed === true,
          captures,
        }),
      });
      const output = await responseJson(response);
      if (response.ok) return output;
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < MAX_TRANSIENT_RETRIES) {
        attempt += 1;
        setMessage(`Batch ${batchIndex + 1}/${batchCount} hit a temporary ${response.status} response. Retrying ${attempt}/${MAX_TRANSIENT_RETRIES}…`);
        await wait(700 * (2 ** (attempt - 1)));
        continue;
      }
      const error = new Error(output?.message || output?.error || `SniperPlug rejected the browser capture (${response.status}).`);
      error.status = response.status;
      throw error;
    }
  }

  async function sendCapture() {
    if (sending) return;
    sending = true;
    retry.disabled = true;
    const captures = pending?.captures || [];
    const batches = captureBatches(captures);
    setMessage(`Sending ${captures.length} changed/new rendered page${captures.length === 1 ? '' : 's'} into the private SniperPlug draft queue…`);
    try {
      const totals = { created: 0, updated: 0, unchanged: 0, held: 0 };
      let sentPages = 0;
      for (let index = 0; index < batches.length; index += 1) {
        setMessage(`Sending batch ${index + 1}/${batches.length} · ${sentPages}/${captures.length} pages complete…`);
        const output = await sendBatch(batches[index], index, batches.length);
        sentPages += batches[index].length;
        for (const key of Object.keys(totals)) totals[key] += Number(output?.[key] || 0);
      }

      await extension({ type: 'sniperplug:clear-pending', pendingId, success: true });
      setMessage(`${totals.created} new draft${totals.created === 1 ? '' : 's'} · ${totals.updated} updated · ${totals.unchanged} unchanged · ${totals.held} held safely. Sync history saved; reloading the private review queue…`, 'ok');
      const clean = new URL(location.href);
      clean.searchParams.delete('extensionCapture');
      clean.searchParams.set('browserCapture', 'success');
      setTimeout(() => location.replace(clean.toString()), 900);
    } catch (error) {
      if (Number(error?.status) === 401) {
        setMessage('The Control Center is locked. Unlock SniperPlug on this page, then press Retry capture. The captured pages are still held inside the extension and were not discarded.', 'error');
      } else if (Number(error?.status) === 403) {
        setMessage(`SniperPlug refused the handoff: ${error.message} Reconnect/verify Whop if needed, then retry.`, 'error');
      } else {
        setMessage(`Capture was not fully saved: ${error?.message || error}. The extension kept the entire queued set. Retrying is safe because already imported pages resolve as unchanged.`, 'error');
      }
    } finally {
      sending = false;
      retry.disabled = false;
    }
  }

  retry.addEventListener('click', sendCapture);

  (async () => {
    try {
      const output = await extension({ type: 'sniperplug:get-pending', pendingId });
      pending = output.pending;
      if (!pending?.captures?.length) {
        setMessage('This browser-capture handoff expired or was already completed. Capture the Better Content pages again.', 'error');
        return;
      }
      await sendCapture();
    } catch (error) {
      setMessage(error?.message || 'The extension could not retrieve the pending Better Content capture.', 'error');
    }
  })();
})();
