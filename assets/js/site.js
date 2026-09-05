document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const ownerLink = nav?.querySelector('a[href="/control-center/"]');
  const mobileNavigation = window.matchMedia('(max-width: 620px)');
  const pinnedProperties = ['position', 'left', 'z-index', 'background', 'color', 'box-shadow'];

  const syncOwnerAccess = () => {
    if (!nav || !ownerLink) return;

    if (mobileNavigation.matches) {
      ownerLink.dataset.mobilePinned = 'true';
      ownerLink.style.position = 'sticky';
      ownerLink.style.left = '0';
      ownerLink.style.zIndex = '2';
      ownerLink.style.background = 'var(--brand)';
      ownerLink.style.color = '#06100a';
      ownerLink.style.boxShadow = '10px 0 18px rgba(11,15,23,.95)';
      return;
    }

    delete ownerLink.dataset.mobilePinned;
    for (const property of pinnedProperties) ownerLink.style.removeProperty(property);
  };

  syncOwnerAccess();
  if (typeof mobileNavigation.addEventListener === 'function') {
    mobileNavigation.addEventListener('change', syncOwnerAccess);
  } else if (typeof mobileNavigation.addListener === 'function') {
    mobileNavigation.addListener(syncOwnerAccess);
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