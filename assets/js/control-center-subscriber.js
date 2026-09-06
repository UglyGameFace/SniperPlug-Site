(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;

  const loginMessage = root.querySelector('[data-login-message]');
  const globalStatus = root.querySelector('[data-global-status]');
  const subscriberStatus = root.querySelector('[data-subscriber-workspace]');
  const loginPanel = root.querySelector('[data-login-panel]');
  const bulkWorkflow = root.querySelector('[data-bulk-workflow]');
  const bulkSummary = root.querySelector('[data-bulk-workflow-summary]');
  const bulkButton = root.querySelector('[data-bulk-publish]');
  const draftStatus = root.querySelector('[data-draft-status-filter]');
  const accountStyle = document.createElement('style');
  let accountKind = '';
  let syncPromise = null;

  accountStyle.dataset.sniperplugSubscriberUi = '';
  accountStyle.textContent = `
    html[data-sniperplug-account-kind="subscriber"] [data-owner-only] { display: none !important; }
    html[data-sniperplug-account-kind="subscriber"] [data-subscriber-only] { display: initial; }
    [data-subscriber-only] { display: none; }
    .subscriber-login-card { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border, rgba(255,255,255,.12)); }
    .subscriber-login-card p { margin: .35rem 0 .75rem; }
    .subscriber-login-card small { display: block; margin-top: .55rem; opacity: .78; line-height: 1.45; }
  `;
  document.head.append(accountStyle);

  function setMessage(element, message, type = 'ok') {
    if (!(element instanceof HTMLElement)) return;
    element.textContent = String(message || '');
    element.dataset.type = type;
    element.hidden = !message;
  }

  function setAccountKind(kind) {
    accountKind = kind === 'subscriber' ? 'subscriber' : kind === 'owner' ? 'owner' : '';
    if (accountKind) document.documentElement.dataset.sniperplugAccountKind = accountKind;
    else delete document.documentElement.dataset.sniperplugAccountKind;
    root.dataset.accountKind = accountKind;
  }

  function subscriberCopy() {
    if (accountKind !== 'subscriber') return;

    if (subscriberStatus instanceof HTMLElement) {
      subscriberStatus.hidden = false;
      subscriberStatus.dataset.type = 'ok';
      subscriberStatus.textContent = 'Paid subscriber workspace · Whop access verified · imports and drafts are isolated to this account. Public SniperPlug publishing remains owner-only.';
    }

    const heroEyebrow = root.querySelector('.control-hero .eyebrow');
    const heroCopy = root.querySelector('.control-hero p');
    if (heroEyebrow) heroEyebrow.textContent = '⚡ SniperPlug importer';
    if (heroCopy) heroCopy.textContent = 'Review your authorized Whop sources, import private drafts, and manage your isolated subscriber workspace.';

    const whopHeadingCopy = root.querySelector('#whop-importer .panel-head p');
    if (whopHeadingCopy) whopHeadingCopy.textContent = 'This Whop account is also your paid SniperPlug sign-in. Sign out of SniperPlug to change subscriber accounts.';

    if (bulkWorkflow) {
      const title = bulkWorkflow.querySelector('summary span');
      const description = bulkWorkflow.querySelector('.bulk-publish-content > p');
      if (title) title.textContent = 'Complete resumable import workflow';
      if (description) description.textContent = 'Approve selected sources, scan guide content, preserve available media, and import private drafts. Subscriber workspaces never publish to the public SniperPlug guide site.';
    }
    if (bulkSummary) {
      const selected = root.querySelector('[data-selected-source-count]')?.textContent || '0 selected';
      bulkSummary.textContent = `${selected} · open to import drafts`;
    }
    if (bulkButton instanceof HTMLButtonElement) {
      const selected = root.querySelector('[data-selected-source-count]')?.textContent || '0 selected';
      bulkButton.textContent = selected.startsWith('0 ') ? 'Approve & import selected' : `Approve & import ${selected}`;
    }
    const publishedMetric = root.querySelector('[data-progress-published]')?.closest('span');
    if (publishedMetric) publishedMetric.hidden = true;

    if (draftStatus instanceof HTMLSelectElement) {
      const published = [...draftStatus.options].find((option) => option.value === 'published');
      if (published) {
        published.hidden = true;
        published.disabled = true;
      }
      if (draftStatus.value === 'published') {
        draftStatus.value = 'draft';
        draftStatus.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const draftPanel = root.querySelector('[data-draft-list]')?.closest('.control-panel');
    if (draftPanel) {
      const heading = draftPanel.querySelector('.panel-head h2');
      const copy = draftPanel.querySelector('.panel-head p');
      if (heading) heading.textContent = 'Review imported drafts';
      if (copy) copy.textContent = 'Open a guide and review or edit your private copy. Public SniperPlug publication is reserved for the owner account.';
    }

    for (const button of root.querySelectorAll('[data-publish-guide],[data-publish-all-ready],[data-open-inline-category]')) {
      if (button instanceof HTMLElement) button.hidden = true;
    }
  }

  function ownerCopy() {
    if (subscriberStatus instanceof HTMLElement) subscriberStatus.hidden = true;
    const publishedMetric = root.querySelector('[data-progress-published]')?.closest('span');
    if (publishedMetric) publishedMetric.hidden = false;
    if (draftStatus instanceof HTMLSelectElement) {
      const published = [...draftStatus.options].find((option) => option.value === 'published');
      if (published) {
        published.hidden = false;
        published.disabled = false;
      }
    }
  }

  function applyAccount(session) {
    const kind = String(session?.account?.kind || '');
    setAccountKind(kind);
    if (kind === 'subscriber') subscriberCopy();
    else if (kind === 'owner') ownerCopy();
  }

  async function readSession() {
    const response = await fetch('/api/control?action=session', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  }

  async function syncAccount() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      try {
        const { response, body } = await readSession();
        if (!response.ok) return;
        if (body.authenticated === true) {
          applyAccount(body);
          return;
        }
        setAccountKind('');
        if (body.subscriberBlocked) {
          setMessage(loginMessage, body.error || 'Paid subscriber access could not be verified. Sign in with Whop again.', body.retryable ? 'warning' : 'error');
        }
      } catch {
        // The authoritative v2/network gate owns connectivity failures. This helper
        // only adds account-specific presentation and must never unlock the app.
      }
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  function consumeCallbackStatus() {
    const params = new URLSearchParams(location.search);
    const subscriber = params.get('subscriber');
    if (!subscriber) return;
    const message = params.get('message');
    if (subscriber === 'error') {
      setMessage(loginMessage, message || 'Paid subscriber sign-in failed.', 'error');
    } else if (subscriber === 'connected') {
      setMessage(globalStatus, 'Paid subscriber access verified with Whop.', 'ok');
    }
    params.delete('subscriber');
    params.delete('message');
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  consumeCallbackStatus();
  syncAccount();

  root.addEventListener('sniperplug:dashboard-refreshed', () => {
    syncAccount().then(subscriberCopy);
  });
  root.addEventListener('sniperplug:selection-updated', subscriberCopy);
  root.addEventListener('sniperplug:guide-loaded', subscriberCopy);
  loginPanel?.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('[data-subscriber-login]') : null;
    if (link) setMessage(loginMessage, 'Opening Whop to verify your paid SniperPlug access…', 'ok');
  });
})();
