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

  const apply = () => {
    const query = (search?.value || '').trim().toLowerCase();
    const storeValue = store?.value || 'all';
    const categoryValue = category?.value || 'all';
    let shown = 0;
    cards.forEach((card) => {
      const matchesQuery = !query || (card.dataset.title || '').includes(query) || card.textContent.toLowerCase().includes(query);
      const matchesStore = storeValue === 'all' || card.dataset.store === storeValue;
      const matchesCategory = categoryValue === 'all' || card.dataset.category === categoryValue;
      const visible = matchesQuery && matchesStore && matchesCategory;
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (empty) empty.style.display = shown ? 'none' : 'block';
  };
  search?.addEventListener('input', apply);
  store?.addEventListener('change', apply);
  category?.addEventListener('change', apply);
});
