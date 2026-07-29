document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  if (nav && !nav.querySelector('a[href="/guides/"]')) {
    const guideLink = document.createElement('a');
    guideLink.href = '/guides/';
    guideLink.textContent = 'Guides';
    if (location.pathname.startsWith('/guides/')) guideLink.classList.add('active');
    const partnerLink = nav.querySelector('a[href="/partners/"]');
    nav.insertBefore(guideLink, partnerLink || null);
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
