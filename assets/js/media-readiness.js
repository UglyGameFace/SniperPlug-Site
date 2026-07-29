(() => {
  const root = document.querySelector('[data-control-root]');
  const app = root?.querySelector('[data-control-app]');
  const capabilityNote = root?.querySelector('.source-capability-note');
  if (!root || !app || !capabilityNote) return;

  let card = capabilityNote.querySelector('[data-media-readiness]');
  if (!card) {
    card = document.createElement('div');
    card.dataset.mediaReadiness = 'true';
    const heading = document.createElement('strong');
    heading.textContent = 'Private media storage';
    const detail = document.createElement('p');
    detail.textContent = 'Checking whether private Whop pictures, videos, audio, PDFs, and files can be copied permanently…';
    card.append(heading, detail);
    capabilityNote.append(card);
  }

  const heading = card.querySelector('strong');
  const detail = card.querySelector('p');
  let loading = false;

  function show(state, title, message) {
    card.dataset.state = state;
    heading.textContent = title;
    detail.textContent = message;
  }

  async function refresh() {
    if (app.hidden || loading) return;
    loading = true;
    show('checking', 'Private media storage', 'Checking whether private Whop media can be copied permanently…');
    try {
      const response = await fetch('/api/control?action=dashboard', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (response.status === 401) return;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Media readiness check failed (${response.status}).`);
      if (data.capabilities?.mediaStorage) {
        show(
          'ready',
          'Private media storage ready',
          'Public and signed Whop pictures, videos, audio, PDFs, and files can be copied into SniperPlug-owned storage during import.',
        );
      } else {
        show(
          'missing',
          'Private media storage not connected',
          'Public media still imports. Private or expiring Whop media stays in draft review until the Cloudflare R2 binding SNIPERPLUG_MEDIA is connected.',
        );
      }
    } catch (error) {
      show('warning', 'Media readiness could not be checked', String(error?.message || 'Refresh the Control Center and try again.'));
    } finally {
      loading = false;
    }
  }

  new MutationObserver(refresh).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  root.addEventListener('sniperplug:dashboard-refreshed', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  refresh();
})();
