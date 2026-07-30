(() => {
  const root = document.querySelector('[data-control-root]');
  const panel = document.querySelector('[data-bulk-job-panel]');
  const title = document.querySelector('[data-bulk-job-title]');
  const summaryCopy = document.querySelector('[data-bulk-job-summary]');
  const progress = document.querySelector('[data-bulk-progress]');
  const stage = document.querySelector('[data-progress-stage]');
  const heldCounter = document.querySelector('[data-progress-held]');
  if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

  const REQUEST_TIMEOUT_MS = 15_000;
  let requestToken = 0;
  let timer = null;
  let stopped = false;

  function number(value) {
    return Math.max(0, Number(value || 0));
  }

  function counts(job) {
    const saved = job?.summary || {};
    const sourceFailures = Array.isArray(job?.failures) ? job.failures.length : 0;
    const itemFailures = number(saved.itemFailures);
    const permissions = number(saved.heldPermissions);
    const files = number(saved.heldFiles);
    const links = number(saved.heldLinks);
    const integrity = number(saved.heldIntegrity);
    const manual = number(saved.manualReview);
    const expired = number(saved.expired);
    const held = files + links + integrity + permissions + manual + expired + itemFailures + sourceFailures;
    return { sourceFailures, itemFailures, permissions, files, links, integrity, manual, expired, held };
  }

  function issueParts(value) {
    const parts = [];
    if (value.sourceFailures) parts.push(`${value.sourceFailures} source failure${value.sourceFailures === 1 ? '' : 's'}`);
    if (value.itemFailures) parts.push(`${value.itemFailures} item failure${value.itemFailures === 1 ? '' : 's'}`);
    if (value.permissions) parts.push(`${value.permissions} permission hold${value.permissions === 1 ? '' : 's'}`);
    if (value.files) parts.push(`${value.files} file hold${value.files === 1 ? '' : 's'}`);
    if (value.links) parts.push(`${value.links} link hold${value.links === 1 ? '' : 's'}`);
    if (value.integrity) parts.push(`${value.integrity} policy/integrity hold${value.integrity === 1 ? '' : 's'}`);
    if (value.manual) parts.push(`${value.manual} manual-review item${value.manual === 1 ? '' : 's'}`);
    if (value.expired) parts.push(`${value.expired} expired item${value.expired === 1 ? '' : 's'}`);
    return parts;
  }

  function apply(job) {
    if (!job || job.status !== 'completed') return;
    const value = counts(job);
    const hasIssues = job.outcome === 'completed-with-issues' || number(job.issueCount) > 0 || value.held > 0;
    const completed = number(job.completedSources);
    const total = number(job.totalSources);
    const scanned = number(job.summary?.scanned);
    const published = number(job.summary?.published);

    if (title) title.textContent = hasIssues ? 'Bulk job completed with review items' : 'Bulk job completed successfully';
    if (summaryCopy) {
      const base = `${completed}/${total} sources · ${scanned} scanned · ${published} published`;
      summaryCopy.textContent = hasIssues ? `${base} · ${issueParts(value).join(' · ') || `${number(job.issueCount)} held safely`}` : `${base} · no failures or holds`;
    }
    if (stage) stage.textContent = hasIssues ? `Complete · ${number(job.issueCount) || value.held} item${(number(job.issueCount) || value.held) === 1 ? '' : 's'} need attention` : 'Complete · all eligible items confirmed';
    if (heldCounter) heldCounter.textContent = String(value.held);
    if (progress) {
      progress.dataset.state = hasIssues ? 'warning' : 'ok';
      progress.textContent = hasIssues
        ? `Bulk processing finished, but it was not a clean success. ${issueParts(value).join('; ') || `${number(job.issueCount)} item(s) require review`}. Published items remain live; held and failed items stayed private.`
        : 'Bulk job completed successfully. Every eligible selected item was confirmed and no failures or safety holds were recorded.';
    }
    panel.dataset.outcome = hasIssues ? 'completed-with-issues' : 'completed-successfully';
  }

  async function load() {
    if (stopped || document.hidden) return;
    const token = ++requestToken;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/bulk-jobs', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok || token !== requestToken) return;
      const output = await response.json();
      if (token === requestToken) apply(output?.job || null);
    } catch {
      // The primary Control Center owns network error display. This layer only
      // corrects authoritative completion status when the read succeeds.
    } finally {
      clearTimeout(timeout);
    }
  }

  function schedule(delay = 80) {
    clearTimeout(timer);
    timer = setTimeout(load, delay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(panel, { subtree: true, childList: true, characterData: true, attributes: true });
  root.addEventListener('sniperplug:dashboard-refreshed', () => schedule());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-bulk-publish],[data-resume-bulk-job],[data-cancel-bulk-job]') : null;
    if (target) schedule(600);
  }, true);
  window.addEventListener('pagehide', () => {
    stopped = true;
    requestToken += 1;
    clearTimeout(timer);
    observer.disconnect();
  }, { once: true });

  schedule(0);
})();