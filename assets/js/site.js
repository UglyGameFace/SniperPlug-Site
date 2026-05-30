
(function(){
  const search = document.querySelector('[data-deal-search]');
  const store = document.querySelector('[data-store-filter]');
  const category = document.querySelector('[data-category-filter]');
  const cards = Array.from(document.querySelectorAll('.deal-card'));
  const empty = document.querySelector('[data-empty-state]');
  function applyFilters(){
    if(!cards.length) return;
    const q = (search && search.value || '').trim().toLowerCase();
    const s = store && store.value || 'all';
    const c = category && category.value || 'all';
    let visible = 0;
    cards.forEach(card => {
      const matchesQ = !q || (card.dataset.title || '').includes(q);
      const matchesS = s === 'all' || card.dataset.store === s;
      const matchesC = c === 'all' || card.dataset.category === c;
      const show = matchesQ && matchesS && matchesC;
      card.style.display = show ? '' : 'none';
      if(show) visible++;
    });
    if(empty) empty.style.display = visible ? 'none' : 'block';
  }
  [search, store, category].filter(Boolean).forEach(el => el.addEventListener('input', applyFilters));
})();
