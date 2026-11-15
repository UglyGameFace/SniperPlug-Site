const get = (id) => document.getElementById(id);
const state = { paired: false, keyVisible: false };
function write(id, value) { const el = get(id); if (el) el.textContent = String(value); }
function dateLabel(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? new Date(n).toLocaleString() : 'None received';
}
function clearKey() {
  write('pair-token', '');
  get('pair-result').hidden = true;
  state.keyVisible = false;
}
function showConnection(data) {
  state.paired = data.paired === true;
  write('pair-status', state.paired ? 'Paired' : 'Not paired');
  write('last-report', dateLabel(data.received_at));
  write('report-state',
    data.state === 'connected' ? 'Recent signed report' :
    data.state === 'stale' ? 'Report stale' :
    data.state === 'not_connected' ? 'No reports' :
    data.state === 'migration_required' ? 'Database migration missing' : 'Unavailable');
  write('pairing-state',
    state.paired ? 'The website has a connection key registered.' : 'No pairing key is registered in the website.');
  write('key-summary',
    state.paired
      ? 'A key is already registered. There is no need to generate or rotate another one just because the bot has not sent a report.'
      : 'No key exists yet. Generate one once and save it to your canonical Discloud SniperPlug app.');
  get('first-pair').hidden = state.paired;
  get('rotate-section').hidden = !state.paired;
  write('settings-state',
    data.state === 'connected'
      ? 'Connected: a recent signed report was accepted from the bot. No action needed.'
      : data.state === 'stale'
        ? 'Connected previously, but the latest bot report is stale. Check app state and Discloud logs before changing the key.'
        : state.paired
          ? 'Website pairing is complete, but the bot has not delivered a signed report. Verify the Discloud environment is saved and the app has restarted with the new setting. Do not rotate the key unless the bot reports a signature mismatch.'
          : 'No connection key is paired. Generate one below and install it in the canonical Discloud app.');
}
async function reload() {
  const button = get('reload-settings');
  button.disabled = true;
  try {
    const response = await fetch('/api/sniperplug-ops/live', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) {
      write('settings-state', 'Your owner session has expired. Return to the operations page to sign in.');
      return;
    }
    if (!response.ok) throw new Error('Server returned HTTP ' + response.status);
    const data = await response.json();
    if (!data || typeof data.state !== 'string') throw new Error('Invalid operations response');
    showConnection(data);
  } catch (error) {
    write('settings-state', 'Connection check failed: ' + String(error?.message || error));
  } finally { button.disabled = false; }
}
async function issueKey(rotate = false) {
  if (rotate && !window.confirm(
    'Replace your existing paired key? The current Discloud bot will stop reporting until you install this replacement and restart it.'
  )) return;
  clearKey();
  write('action-error', '');
  const button = get(rotate ? 'pair-rotate' : 'pair-start');
  button.disabled = true;
  try {
    const response = await fetch('/api/sniperplug-ops/pair', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: rotate ? { 'x-sniperplug-confirm-rotate': 'yes' } : {},
    });
    const data = await response.json();
    if (!response.ok || typeof data.token !== 'string') {
      throw new Error(data.error || 'The connection key could not be created.');
    }
    state.keyVisible = true;
    get('pair-result').hidden = false;
    write('pair-token', data.token);
    write('copy-feedback', 'The key will disappear after copying or leaving this page.');
    await reload();
  } catch (error) {
    write('action-error', String(error?.message || error));
  } finally { button.disabled = false; }
}
get('pair-start').addEventListener('click', () => issueKey(false));
get('pair-rotate').addEventListener('click', () => issueKey(true));
get('dismiss-key').addEventListener('click', () => {
  clearKey();
  write('action-error', 'One-time key hidden. It cannot be retrieved from this page.');
});
get('copy-key').addEventListener('click', async () => {
  const token = get('pair-token').textContent;
  if (!state.keyVisible || !token) return;
  try {
    await navigator.clipboard.writeText(token);
    clearKey();
    write('action-error', 'Key copied and hidden. Save it to SNIPERPLUG_OPS_INGEST_SECRET in Discloud.');
  } catch {
    write('copy-feedback', 'Clipboard permission unavailable. Long-press and copy the key manually, then use “I’ve saved it, hide key”.');
  }
});
get('reload-settings').addEventListener('click', reload);
window.addEventListener('pagehide', clearKey);
reload();
