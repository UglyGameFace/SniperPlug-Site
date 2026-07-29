(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const groupsRoot = root.querySelector('[data-discovered-groups]');
  const sourceTools = root.querySelector('[data-source-browser-tools]');
  const sourceSearch = root.querySelector('[data-source-search]');
  const sourceFilter = root.querySelector('[data-source-filter]');
  const collapseAll = root.querySelector('[data-collapse-groups]');
  const expandPriority = root.querySelector('[data-expand-priority]');
  const draftList = root.querySelector('[data-draft-list]');
  const draftSearch = root.querySelector('[data-draft-search]');
  const draftStatus = root.querySelector('[data-draft-status-filter]');
  if (!groupsRoot || !sourceTools || !sourceSearch || !sourceFilter || !draftList || !draftSearch || !draftStatus) return;

  function groupKey(group) {
    const title = group.querySelector('h3')?.textContent?.trim() || 'group';
    return `sniperplug:group:${title.toLowerCase()}`;
  }

  function setCollapsed(group, collapsed) {
    group.dataset.collapsed = collapsed ? 'true' : 'false';
    const list = group.querySelector('.discovered-source-list');
    const unsupported = group.querySelector('.unsupported-sources');
    if (list) list.hidden = collapsed;
    if (unsupported) unsupported.hidden = collapsed;
    const button = group.querySelector('[data-toggle-group]');
    if (button) {
      button.textContent = collapsed ? 'Expand' : 'Collapse';
      button.setAttribute('aria-expanded', String(!collapsed));
    }
    try { sessionStorage.setItem(groupKey(group), collapsed ? '1' : '0'); } catch { /* ignore */ }
  }

  function initialCollapsed(group) {
    try {
      const saved = sessionStorage.getItem(groupKey(group));
      if (saved !== null) return saved === '1';
    } catch { /* ignore */ }
    return group.dataset.defaultGroup !== 'true';
  }

  function prepareGroups() {
    const groups = [...groupsRoot.querySelectorAll('.discovered-group')];
    sourceTools.hidden = groups.length === 0;
    for (const group of groups) {
      if (group.dataset.hardened === 'true') continue;
      group.dataset.hardened = 'true';
      const actions = group.querySelector(':scope > header .button-row');
      if (actions) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn ghost';
        toggle.dataset.toggleGroup = 'true';
        toggle.addEventListener('click', () => setCollapsed(group, group.dataset.collapsed !== 'true'));
        actions.append(toggle);
      }
      setCollapsed(group, initialCollapsed(group));
    }
    filterSources();
  }

  function sourceMatches(source, query, filter) {
    const text = source.textContent.toLowerCase();
    const state = source.dataset.state || 'pending';
    const type = source.dataset.type || 'unknown';
    const queryMatch = !query || text.includes(query);
    const filterMatch = filter === 'all' || filter === state || filter === type;
    return queryMatch && filterMatch;
  }

  function filterSources() {
    const query = sourceSearch.value.trim().toLowerCase();
    const filter = sourceFilter.value;
    for (const group of groupsRoot.querySelectorAll('.discovered-group')) {
      const groupText = group.querySelector('h3')?.textContent?.toLowerCase() || '';
      const groupMatch = query && groupText.includes(query);
      let visible = 0;
      for (const source of group.querySelectorAll('.discovered-source')) {
        const show = sourceMatches(source, groupMatch ? '' : query, filter);
        source.hidden = !show;
        if (show) visible += 1;
      }
      const unsupported = group.querySelector('.unsupported-sources');
      const unsupportedMatch = filter === 'all' && (!query || groupMatch || unsupported?.textContent.toLowerCase().includes(query));
      if (unsupported) unsupported.dataset.filtered = unsupportedMatch ? 'visible' : 'hidden';
      group.hidden = visible === 0 && !unsupportedMatch;
      const meta = group.querySelector(':scope > header p');
      if (meta) meta.dataset.visibleCount = String(visible);
      if (query && !group.hidden) setCollapsed(group, false);
    }
  }

  function filterDrafts() {
    const query = draftSearch.value.trim().toLowerCase();
    const status = draftStatus.value;
    for (const item of draftList.querySelectorAll('.draft-item')) {
      const text = item.textContent.toLowerCase();
      const itemStatus = item.querySelector('small')?.textContent?.split('·')[0]?.trim().toLowerCase() || '';
      item.hidden = Boolean(query && !text.includes(query)) || (status !== 'all' && itemStatus !== status);
    }
  }

  sourceSearch.addEventListener('input', filterSources);
  sourceFilter.addEventListener('change', filterSources);
  draftSearch.addEventListener('input', filterDrafts);
  draftStatus.addEventListener('change', filterDrafts);
  collapseAll?.addEventListener('click', () => {
    for (const group of groupsRoot.querySelectorAll('.discovered-group:not([hidden])')) setCollapsed(group, true);
  });
  expandPriority?.addEventListener('click', () => {
    for (const group of groupsRoot.querySelectorAll('.discovered-group[data-default-group="true"]')) setCollapsed(group, false);
  });

  new MutationObserver(prepareGroups).observe(groupsRoot, { childList: true });
  new MutationObserver(filterDrafts).observe(draftList, { childList: true });
  prepareGroups();
  filterDrafts();
})();
