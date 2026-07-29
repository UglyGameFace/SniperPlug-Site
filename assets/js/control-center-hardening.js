(() => {
  if (!document.querySelector('script[src="/assets/js/control-center-performance.js"]')) {
    const runtime = document.createElement('script');
    runtime.src = '/assets/js/control-center-performance.js';
    runtime.defer = true;
    document.head.append(runtime);
  }

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
  const discoveryMessage = root.querySelector('[data-discovery-message]');
  if (!groupsRoot || !sourceTools || !sourceSearch || !sourceFilter || !draftList || !draftSearch || !draftStatus) return;

  if (![...sourceFilter.options].some((option) => option.value === 'external')) {
    const option = document.createElement('option');
    option.value = 'external';
    option.textContent = 'External app modules';
    sourceFilter.append(option);
  }

  let groupRecords = [];
  let sourceFilterFrame = 0;
  let draftFilterFrame = 0;
  let prepareFrame = 0;

  function groupKey(group) {
    const title = group.querySelector('h3')?.textContent?.trim() || 'group';
    return `sniperplug:group:${title.toLowerCase()}`;
  }

  function setHidden(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function setCollapsed(group, collapsed) {
    const next = collapsed ? 'true' : 'false';
    if (group.dataset.collapsed === next) return;
    group.dataset.collapsed = next;
    const list = group.querySelector('.discovered-source-list');
    const external = group.querySelector('.unsupported-sources,.external-apps');
    setHidden(list, collapsed);
    if (external) setHidden(external, collapsed || external.dataset.filtered === 'hidden');
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

  function explainExternalApps(group) {
    const wrapper = group.querySelector('.unsupported-sources');
    if (!wrapper || wrapper.dataset.explained === 'true') return;
    wrapper.dataset.explained = 'true';
    wrapper.classList.add('external-apps');
    const existing = [...wrapper.querySelectorAll('p')];
    wrapper.replaceChildren();

    const heading = document.createElement('strong');
    heading.textContent = 'External app content';
    const intro = document.createElement('p');
    intro.className = 'external-app-intro';
    intro.textContent = 'Your membership access is valid. These modules open another service, so Whop does not provide their posts, files, pictures, or videos through the standard Whop content API.';
    wrapper.append(heading, intro);

    for (const paragraph of existing) {
      const raw = paragraph.textContent.trim();
      const [namePart, appPart = 'External app'] = raw.split(' · ');
      const appName = appPart.split('.')[0].trim() || 'External app';
      const card = document.createElement('article');
      card.className = 'external-app-card';
      const title = document.createElement('strong');
      title.textContent = namePart || 'External module';
      const label = document.createElement('span');
      label.textContent = `${appName} · Separate connection required`;
      const detail = document.createElement('p');
      detail.textContent = `SniperPlug can detect this module, but automatic import requires a dedicated ${appName} API connection. It is not a missing Whop permission.`;
      card.append(title, label, detail);
      wrapper.append(card);
    }
  }

  function buildRecord(group) {
    const title = group.querySelector('h3')?.textContent?.trim() || '';
    const sources = [...group.querySelectorAll('.discovered-source')].map((source) => ({
      element: source,
      text: source.textContent.toLocaleLowerCase('en-US'),
      state: source.dataset.state || 'pending',
      type: source.dataset.type || 'unknown',
    }));
    const external = group.querySelector('.unsupported-sources,.external-apps');
    return {
      group,
      title: title.toLocaleLowerCase('en-US'),
      sources,
      external,
      externalText: external?.textContent?.toLocaleLowerCase('en-US') || '',
    };
  }

  function prepareGroupsNow() {
    prepareFrame = 0;
    const groups = [...groupsRoot.querySelectorAll('.discovered-group')];
    sourceTools.hidden = groups.length === 0;
    for (const group of groups) {
      explainExternalApps(group);
      if (group.dataset.hardened === 'true') continue;
      group.dataset.hardened = 'true';
      const actions = group.querySelector(':scope > header .button-row');
      if (actions) {
        const [selectButton, clearButton] = actions.querySelectorAll('button');
        if (selectButton) selectButton.dataset.fastGroupSelect = 'true';
        if (clearButton) clearButton.dataset.fastGroupClear = 'true';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn ghost';
        toggle.dataset.toggleGroup = 'true';
        toggle.textContent = 'Collapse';
        toggle.setAttribute('aria-expanded', 'true');
        actions.append(toggle);
      }
      const collapsed = initialCollapsed(group);
      group.dataset.collapsed = collapsed ? 'false' : 'true';
      setCollapsed(group, collapsed);
    }
    groupRecords = groups.map(buildRecord);
    if (discoveryMessage) discoveryMessage.textContent = discoveryMessage.textContent.replace(/unsupported app module/gi, 'external app module');
    filterSourcesNow();
  }

  function schedulePrepare() {
    if (prepareFrame) return;
    prepareFrame = requestAnimationFrame(prepareGroupsNow);
  }

  function filterSourcesNow() {
    sourceFilterFrame = 0;
    const query = sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = sourceFilter.value;
    for (const record of groupRecords) {
      const groupMatch = Boolean(query && record.title.includes(query));
      let visible = 0;
      for (const source of record.sources) {
        const queryMatch = !query || groupMatch || source.text.includes(query);
        const filterMatch = filter === 'all' || filter === source.state || filter === source.type;
        const show = queryMatch && filterMatch;
        setHidden(source.element, !show);
        if (show) visible += 1;
      }
      const externalMatch = filter === 'all' || filter === 'external';
      const externalVisible = Boolean(record.external && externalMatch && (!query || groupMatch || record.externalText.includes(query)));
      if (record.external) {
        record.external.dataset.filtered = externalVisible ? 'visible' : 'hidden';
        setHidden(record.external, record.group.dataset.collapsed === 'true' || !externalVisible);
      }
      setHidden(record.group, visible === 0 && !externalVisible);
      const meta = record.group.querySelector(':scope > header p');
      if (meta) meta.dataset.visibleCount = String(visible);
      if (query && !record.group.hidden) setCollapsed(record.group, false);
    }
  }

  function scheduleSourceFilter() {
    if (sourceFilterFrame) cancelAnimationFrame(sourceFilterFrame);
    sourceFilterFrame = requestAnimationFrame(filterSourcesNow);
  }

  function filterDraftsNow() {
    draftFilterFrame = 0;
    const query = draftSearch.value.trim().toLocaleLowerCase('en-US');
    const status = draftStatus.value;
    for (const item of draftList.querySelectorAll('.draft-item')) {
      if (!item.dataset.filterText) item.dataset.filterText = item.textContent.toLocaleLowerCase('en-US');
      if (!item.dataset.filterStatus) item.dataset.filterStatus = item.querySelector('small')?.textContent?.split('·')[0]?.trim().toLocaleLowerCase('en-US') || '';
      const hidden = Boolean(query && !item.dataset.filterText.includes(query)) || (status !== 'all' && item.dataset.filterStatus !== status);
      setHidden(item, hidden);
    }
  }

  function scheduleDraftFilter() {
    if (draftFilterFrame) cancelAnimationFrame(draftFilterFrame);
    draftFilterFrame = requestAnimationFrame(filterDraftsNow);
  }

  groupsRoot.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-group]');
    if (!toggle) return;
    const group = toggle.closest('.discovered-group');
    if (group) setCollapsed(group, group.dataset.collapsed !== 'true');
  });

  sourceSearch.addEventListener('input', scheduleSourceFilter, { passive: true });
  sourceFilter.addEventListener('change', scheduleSourceFilter);
  draftSearch.addEventListener('input', scheduleDraftFilter, { passive: true });
  draftStatus.addEventListener('change', scheduleDraftFilter);
  collapseAll?.addEventListener('click', () => {
    for (const record of groupRecords) if (!record.group.hidden) setCollapsed(record.group, true);
  });
  expandPriority?.addEventListener('click', () => {
    for (const record of groupRecords) if (record.group.dataset.defaultGroup === 'true') setCollapsed(record.group, false);
  });

  new MutationObserver(schedulePrepare).observe(groupsRoot, { childList: true });
  new MutationObserver(scheduleDraftFilter).observe(draftList, { childList: true });
  schedulePrepare();
  scheduleDraftFilter();
})();
