document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');

  if (nav) {
    const headerInner = nav.closest('.header-inner');
    const controlCenterLink = nav.querySelector('a[href="/control-center/"]');
    const mobileNavigation = window.matchMedia('(max-width: 760px)');

    if (controlCenterLink && controlCenterLink.textContent.trim().toLowerCase() === 'owner access') {
      controlCenterLink.textContent = 'Control Center';
    }

    if (headerInner && !headerInner.querySelector('.nav-toggle')) {
      if (!nav.id) nav.id = 'site-primary-navigation';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-toggle';
      toggle.setAttribute('aria-controls', nav.id);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      toggle.textContent = 'Menu';
      headerInner.insertBefore(toggle, nav);
      document.documentElement.dataset.siteNavEnhanced = 'true';

      const setOpen = (open) => {
        const next = Boolean(open) && mobileNavigation.matches;
        nav.dataset.open = next ? 'true' : 'false';
        toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
        toggle.setAttribute('aria-label', next ? 'Close navigation' : 'Open navigation');
        toggle.textContent = next ? 'Close' : 'Menu';
      };

      toggle.addEventListener('click', () => {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
      });

      nav.addEventListener('click', (event) => {
        if (event.target.closest('a')) setOpen(false);
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
          setOpen(false);
          toggle.focus();
        }
      });

      const syncViewport = () => setOpen(false);
      if (typeof mobileNavigation.addEventListener === 'function') {
        mobileNavigation.addEventListener('change', syncViewport);
      } else if (typeof mobileNavigation.addListener === 'function') {
        mobileNavigation.addListener(syncViewport);
      }
      setOpen(false);
    }
  }

  const cards = [...document.querySelectorAll('.deal-card')];
  const search = document.querySelector('[data-deal-search]');
  const store = document.querySelector('[data-store-filter]');
  const category = document.querySelector('[data-category-filter]');
  const empty = document.querySelector('[data-empty-state]');
  if (!cards.length) return;

  const indexed = cards.map((card) => ({
    card,
    text: `${card.dataset.title || ''} ${card.textContent || ''}`.toLocaleLowerCase('en-US'),
    store: card.dataset.store || '',
    category: card.dataset.category || '',
  }));
  let frame = 0;
  const apply = () => {
    frame = 0;
    const query = (search?.value || '').trim().toLocaleLowerCase('en-US');
    const storeValue = store?.value || 'all';
    const categoryValue = category?.value || 'all';
    let shown = 0;
    for (const item of indexed) {
      const visible = (!query || item.text.includes(query))
        && (storeValue === 'all' || item.store === storeValue)
        && (categoryValue === 'all' || item.category === categoryValue);
      item.card.hidden = !visible;
      if (visible) shown += 1;
    }
    if (empty) empty.hidden = shown > 0;
  };
  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };
  search?.addEventListener('input', schedule, { passive: true });
  store?.addEventListener('change', schedule);
  category?.addEventListener('change', schedule);
});