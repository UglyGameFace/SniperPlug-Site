from pathlib import Path

path = Path('assets/js/control-center-v2.js')
text = path.read_text()
old = """  function renderGroupSources(group, groupCard, { more = false } = {}) {
    const list = $('.discovered-source-list', groupCard);
    if (!list) return;
    const key = groupKey(group);
    const current = state.sourceRenderLimits.get(key) || SOURCE_PAGE_SIZE;
    const limit = more ? current + SOURCE_PAGE_SIZE : current;
    state.sourceRenderLimits.set(key, limit);
    const query = elements.sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = elements.sourceFilter.value;
    const entries = group.sources || [];
    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice(0, limit)) {
      const card = createSourceCard(entry);
      card.hidden = !sourceMatches(entry, query, filter);
      fragment.append(card);
    }
    if (limit < entries.length) {
      const moreButton = document.createElement('button');
      moreButton.type = 'button';
      moreButton.className = 'btn ghost source-load-more';
      moreButton.dataset.action = 'source-load-more';
      moreButton.textContent = `Load ${Math.min(SOURCE_PAGE_SIZE, entries.length - limit)} more · ${entries.length - limit} remaining`;
      fragment.append(moreButton);
    }
    list.replaceChildren(fragment);
    list.dataset.rendered = 'true';
  }
"""
new = """  function renderGroupSources(group, groupCard, { more = false } = {}) {
    const list = $('.discovered-source-list', groupCard);
    if (!list) return;
    const key = groupKey(group);
    const query = elements.sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = elements.sourceFilter.value;
    const filterKey = `${query}\n${filter}`;
    const filterChanged = list.dataset.filterKey !== filterKey;
    const current = filterChanged ? SOURCE_PAGE_SIZE : state.sourceRenderLimits.get(key) || SOURCE_PAGE_SIZE;
    const limit = more ? current + SOURCE_PAGE_SIZE : current;
    state.sourceRenderLimits.set(key, limit);
    list.dataset.filterKey = filterKey;
    const entries = group.sources || [];
    const matchingEntries = entries.filter((entry) => sourceMatches(entry, query, filter));
    for (const entry of entries) state.sourceCards.delete(sourceId(entry));
    const fragment = document.createDocumentFragment();
    for (const entry of matchingEntries.slice(0, limit)) fragment.append(createSourceCard(entry));
    if (limit < matchingEntries.length) {
      const moreButton = document.createElement('button');
      moreButton.type = 'button';
      moreButton.className = 'btn ghost source-load-more';
      moreButton.dataset.action = 'source-load-more';
      moreButton.textContent = `Load ${Math.min(SOURCE_PAGE_SIZE, matchingEntries.length - limit)} more · ${matchingEntries.length - limit} remaining`;
      fragment.append(moreButton);
    }
    list.replaceChildren(fragment);
    list.dataset.rendered = 'true';
  }
"""
if old not in text:
    raise SystemExit('renderGroupSources anchor missing')
text = text.replace(old, new, 1)
old = """      const list = $('.discovered-source-list', card);
      if (list?.dataset.rendered === 'true') {
        for (const entry of group.sources || []) {
          const sourceCard = state.sourceCards.get(sourceId(entry));
          if (sourceCard) sourceCard.hidden = !sourceMatches(entry, query, filter);
        }
      }
"""
new = """      const list = $('.discovered-source-list', card);
      if (list?.dataset.rendered === 'true') renderGroupSources(group, card);
"""
if old not in text:
    raise SystemExit('filterSources anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)

audit_path = Path('tools/audit-control-mobile-flow.mjs')
audit = audit_path.read_text()
anchor = "assert.ok(control.includes(\"dataset.action = 'source-load-more'\"));\n"
addition = anchor + "assert.ok(control.includes('const matchingEntries = entries.filter') && control.includes('list.dataset.filterKey = filterKey'));\nassert.ok(control.includes('for (const entry of entries) state.sourceCards.delete(sourceId(entry))'));\n"
if anchor not in audit:
    raise SystemExit('mobile audit source pagination anchor missing')
audit = audit.replace(anchor, addition, 1)
audit_path.write_text(audit)
