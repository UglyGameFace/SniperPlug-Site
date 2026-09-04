(() => {
  const root = document.querySelector('[data-control-root]');
  const sourceBrowser = root?.querySelector?.('#source-browser');
  if (!(sourceBrowser instanceof HTMLElement) || sourceBrowser.querySelector('[data-mobile-capture-setup]')) return;

  const details = document.createElement('details');
  details.className = 'manual-source';
  details.dataset.mobileCaptureSetup = 'true';

  const summary = document.createElement('summary');
  summary.textContent = 'Android capture for Better Content / Make Money Here';

  const body = document.createElement('div');
  Object.assign(body.style, { display: 'grid', gap: '.8rem', paddingTop: '.8rem' });

  const copy = document.createElement('p');
  copy.style.margin = '0';
  copy.style.lineHeight = '1.55';
  copy.textContent = 'For Better Content pages that Whop lets you view but does not expose through an API: open them in Firefox for Android with Tampermonkey. The SniperPlug helper captures only the rendered page, queues up to 25 pages, and sends them through your normal signed-in Control Center for private draft review.';

  const security = document.createElement('p');
  security.style.margin = '0';
  security.style.lineHeight = '1.55';
  security.textContent = 'The helper does not read Whop cookies, iframe tokens, OAuth tokens, local/session storage credentials, or hidden Better Content network responses.';

  const row = document.createElement('div');
  row.className = 'button-row';

  const tampermonkey = document.createElement('a');
  tampermonkey.className = 'btn ghost';
  tampermonkey.href = 'https://addons.mozilla.org/android/addon/tampermonkey/';
  tampermonkey.target = '_blank';
  tampermonkey.rel = 'noopener';
  tampermonkey.textContent = '1 · Get Tampermonkey';

  const install = document.createElement('a');
  install.className = 'btn primary';
  install.href = '/sniperplug-mobile-capture.user.js';
  install.target = '_blank';
  install.rel = 'noopener';
  install.textContent = '2 · Install SniperPlug helper';

  row.append(tampermonkey, install);
  body.append(copy, security, row);
  details.append(summary, body);

  const manual = sourceBrowser.querySelector('.manual-source');
  if (manual) manual.before(details);
  else sourceBrowser.append(details);
})();
