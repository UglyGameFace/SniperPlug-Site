(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const elements = {
    loginPanel: $('[data-login-panel]'),
    loginForm: $('[data-login-form]'),
    loginMessage: $('[data-login-message]'),
    app: $('[data-control-app]'),
    logout: $('[data-logout]'),
    globalStatus: $('[data-global-status]'),
    whopState: $('[data-whop-state]'),
    whopConnect: $('[data-whop-connect]'),
    whopDisconnect: $('[data-whop-disconnect]'),
    sourceOptions: $('[data-source-options]'),
    sourceForm: $('[data-source-form]'),
    sourceReview: $('[data-source-review]'),
    sourceTitle: $('[data-source-title]'),
    sourceDetail: $('[data-source-detail]'),
    sourceState: $('[data-source-state]'),
    sourceApprove: $('[data-source-approve]'),
    sourceDisapprove: $('[data-source-disapprove]'),
    sourceScan: $('[data-source-scan]'),
    discoveryStatus: $('[data-discovery-status]'),
    discoverySummary: $('[data-discovery-summary]'),
    discoveryMessage: $('[data-discovery-message]'),
    discoveryBulk: $('[data-discovery-bulk]'),
    discoveredGroups: $('[data-discovered-groups]'),
    refreshGroups: $('[data-refresh-groups]'),
    selectDefaults: $('[data-select-defaults]'),
    approveSelected: $('[data-approve-selected]'),
    disapproveSelected: $('[data-disapprove-selected]'),
    clearSelected: $('[data-clear-selected]'),
    postPanel: $('[data-post-panel]'),
    postTitle: $('[data-post-title]'),
    postSummary: $('[data-post-summary]'),
    postList: $('[data-post-list]'),
    approveAll: $('[data-approve-all]'),
    disapproveAll: $('[data-disapprove-all]'),
    resetAll: $('[data-reset-all]'),
    countApproved: $('[data-count-approved]'),
    countDisapproved: $('[data-count-disapproved]'),
    countPending: $('[data-count-pending]'),
    countBlocked: $('[data-count-blocked]'),
    importCategory: $('[data-import-category]'),
    rights: $('[data-rights-confirm]'),
    importApproved: $('[data-import-approved]'),
    categoryForm: $('[data-category-form]'),
    categoryList: $('[data-category-list]'),
    refresh: $('[data-refresh-dashboard]'),
    draftList: $('[data-draft-list]'),
    draftEmpty: $('[data-draft-empty]'),
    draftEditor: $('[data-draft-editor]'),
    editorStatus: $('[data-editor-status]'),
    editorHeading: $('[data-editor-heading]'),
    openPublic: $('[data-open-public]'),
    attachmentResolution: $('[data-attachment-resolution]'),
    markdownPreview: $('[data-markdown-preview]'),
    publishGuide: $('[data-publish-guide]'),
    rejectGuide: $('[data-reject-guide]'),
    returnDraft: $('[data-return-draft]'),
    preview: $('[data-post-preview]'),
    previewTitle: $('[data-preview-title]'),
    previewMeta: $('[data-preview-meta]'),
    previewBody: $('[data-preview-body]'),
  };

  const state = {
    dashboard: null,
    discovery: null,
    selectedSources: new Set(),
    sourceInput: '',
    source: null,
    experience: null,
    posts: [],
    selectedGuideId: null,
    busy: false,
  };

  async function api(action, options = {}) {
    const response = await fetch(`/api/control?action=${encodeURIComponent(action)}`, {
      credentials: 'same-origin',
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function discoveryApi() {
    const response = await fetch('/api/discover', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Discovery failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showStatus(message, type = 'ok') {
    elements.globalStatus.textContent = message;
    elements.globalStatus.dataset.type = type;
    elements.globalStatus.hidden = false;
  }

  function clearStatus() {
    elements.globalStatus.hidden = true;
    elements.globalStatus.textContent = '';
    delete elements.globalStatus.dataset.type;
  }

  function lock() {
    elements.loginPanel.hidden = false;
    elements.app.hidden = true;
    state.dashboard = null;
    state.discovery = null;
  }

  function unlock() {
    elements.loginPanel.hidden = true;
    elements.app.hidden = false;
  }

  function setBusy(value) {
    state.busy = value;
    updateImportButton();
    updateDiscoveryButtons();
  }

  function sourceLabel(source) {
    return source?.label || state.experience?.company?.title || state.experience?.name || 'Whop group';
  }

  function decisionText(decision) {
    if (decision === 'approved') return 'Approved';
    if (decision === 'disapproved') return 'Disapproved';
    if (decision === 'blocked') return 'Blocked';
    return 'Needs decision';
  }

  function renderWhop() {
    const connected = Boolean(state.dashboard?.whop?.connected);
    elements.whopState.dataset.state = connected ? 'connected' : 'disconnected';
    elements.whopState.textContent = connected ? 'Connected' : 'Not connected';
    elements.whopConnect.hidden = connected;
    elements.whopDisconnect.hidden = !connected;
    elements.sourceForm.querySelector('button').disabled = !connected || state.busy;
    elements.refreshGroups.disabled = !connected || state.busy;
  }

  function renderSources() {
    elements.sourceOptions.replaceChildren();
    for (const source of state.dashboard?.sources || []) {
      const chip = document.createElement('span');
      chip.className = 'source-chip';
      chip.dataset.state = source.decision || 'pending';
      const strong = document.createElement('strong');
      strong.textContent = source.label;
      const small = document.createElement('small');
      small.textContent = decisionText(source.decision);
      chip.append(strong, small);
      elements.sourceOptions.append(chip);
    }
  }

  function allDiscoveredSources() {
    return (state.discovery?.groups || []).flatMap((group) => group.sources || []);
  }

  function sourceEntryById(experienceId) {
    return allDiscoveredSources().find((entry) => entry.experience?.id === experienceId) || null;
  }

  function updateDiscoveryButtons() {
    const count = state.selectedSources.size;
    elements.approveSelected.disabled = state.busy || count === 0;
    elements.disapproveSelected.disabled = state.busy || count === 0;
    elements.clearSelected.disabled = state.busy || count === 0;
    elements.approveSelected.textContent = count ? `Approve ${count} selected` : 'Approve selected';
    elements.disapproveSelected.textContent = count ? `Disapprove ${count} selected` : 'Disapprove selected';
  }

  function toggleSourceSelection(experienceId, checked) {
    if (checked) state.selectedSources.add(experienceId);
    else state.selectedSources.delete(experienceId);
    updateDiscoveryButtons();
  }

  function setGroupSelection(group, checked) {
    for (const entry of group.sources || []) toggleSourceSelection(entry.experience.id, checked);
    renderDiscovery();
  }

  function renderDiscovery() {
    elements.discoveredGroups.replaceChildren();
    const connected = Boolean(state.dashboard?.whop?.connected);
    if (!connected) {
      elements.discoverySummary.textContent = 'Connect Whop to load groups.';
      elements.discoveryMessage.textContent = '';
      elements.discoveryBulk.hidden = true;
      return;
    }
    if (!state.discovery) {
      elements.discoverySummary.textContent = 'Finding your joined groups…';
      elements.discoveryMessage.textContent = '';
      elements.discoveryBulk.hidden = true;
      return;
    }

    const groups = state.discovery.groups || [];
    const counts = state.discovery.counts || {};
    elements.discoverySummary.textContent = `${counts.groups || 0} joined group${counts.groups === 1 ? '' : 's'} · ${counts.forums || 0} readable forum${counts.forums === 1 ? '' : 's'}`;
    elements.discoveryMessage.textContent = counts.forums ? 'Select one, several, or every default forum.' : 'No readable forums were returned.';
    elements.discoveryBulk.hidden = groups.length === 0;

    for (const group of groups) {
      const card = document.createElement('article');
      card.className = 'discovered-group';
      if (group.builtIn) card.dataset.defaultGroup = 'true';

      const header = document.createElement('header');
      const copy = document.createElement('div');
      const eyebrow = document.createElement('small');
      eyebrow.textContent = group.builtIn ? 'DEFAULT GROUP' : 'JOINED GROUP';
      const title = document.createElement('h3');
      title.textContent = group.company.title;
      const meta = document.createElement('p');
      meta.textContent = `${(group.sources || []).length} readable forum${group.sources?.length === 1 ? '' : 's'} · ${(group.company.products || []).length} membership product${group.company.products?.length === 1 ? '' : 's'}`;
      copy.append(eyebrow, title, meta);

      const groupActions = document.createElement('div');
      groupActions.className = 'button-row';
      const selectAll = document.createElement('button');
      selectAll.type = 'button';
      selectAll.className = 'btn ghost';
      selectAll.textContent = 'Select group';
      selectAll.disabled = !(group.sources || []).length;
      selectAll.addEventListener('click', () => setGroupSelection(group, true));
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn ghost';
      clear.textContent = 'Clear group';
      clear.disabled = !(group.sources || []).some((entry) => state.selectedSources.has(entry.experience.id));
      clear.addEventListener('click', () => setGroupSelection(group, false));
      groupActions.append(selectAll, clear);
      header.append(copy, groupActions);
      card.append(header);

      if (group.error) {
        const warning = document.createElement('p');
        warning.className = 'discovery-warning';
        warning.textContent = group.error;
        card.append(warning);
      }

      const list = document.createElement('div');
      list.className = 'discovered-source-list';
      for (const entry of group.sources || []) {
        const source = document.createElement('div');
        source.className = 'discovered-source';
        source.dataset.state = entry.source.decision || 'pending';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selectedSources.has(entry.experience.id);
        checkbox.setAttribute('aria-label', `Select ${entry.experience.name}`);
        checkbox.addEventListener('change', () => toggleSourceSelection(entry.experience.id, checkbox.checked));

        const sourceCopy = document.createElement('div');
        const sourceTitle = document.createElement('strong');
        sourceTitle.textContent = entry.experience.name;
        const sourceMeta = document.createElement('small');
        sourceMeta.textContent = `${entry.experience.id} · ${decisionText(entry.source.decision)}`;
        sourceCopy.append(sourceTitle, sourceMeta);

        const actions = document.createElement('div');
        actions.className = 'button-row';
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'btn ghost';
        choose.textContent = entry.source.decision === 'approved' ? 'Review posts' : 'Review source';
        choose.addEventListener('click', () => chooseDiscoveredSource(entry));
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'decision approve';
        approve.textContent = 'Approve';
        approve.disabled = state.busy || entry.source.decision === 'approved';
        approve.addEventListener('click', () => decideDiscoveredSources([entry.experience.id], 'approved'));
        const disapprove = document.createElement('button');
        disapprove.type = 'button';
        disapprove.className = 'decision disapprove';
        disapprove.textContent = 'Disapprove';
        disapprove.disabled = state.busy || entry.source.decision === 'disapproved';
        disapprove.addEventListener('click', () => decideDiscoveredSources([entry.experience.id], 'disapproved'));
        actions.append(choose, approve, disapprove);
        source.append(checkbox, sourceCopy, actions);
        list.append(source);
      }
      card.append(list);
      elements.discoveredGroups.append(card);
    }
    updateDiscoveryButtons();
  }

  async function loadDiscovery() {
    if (!state.dashboard?.whop?.connected) {
      state.discovery = null;
      renderDiscovery();
      return;
    }
    elements.discoverySummary.textContent = 'Finding your joined groups…';
    elements.discoveryMessage.textContent = '';
    elements.discoveredGroups.replaceChildren();
    try {
      state.discovery = await discoveryApi();
      const validIds = new Set(allDiscoveredSources().map((entry) => entry.experience.id));
      state.selectedSources = new Set([...state.selectedSources].filter((id) => validIds.has(id)));
      renderDiscovery();
    } catch (error) {
      state.discovery = { groups: [], counts: {} };
      elements.discoverySummary.textContent = 'Automatic discovery needs attention.';
      elements.discoveryMessage.textContent = error.message;
      elements.discoveryBulk.hidden = true;
      showStatus(error.message, 'error');
    }
  }

  async function mapLimited(values, mapper, concurrency = 4) {
    const results = new Array(values.length);
    let cursor = 0;
    async function worker() {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, values.length)) }, () => worker()));
    return results;
  }

  async function decideDiscoveredSources(experienceIds, decision) {
    const ids = [...new Set(experienceIds)].filter(Boolean);
    if (!ids.length) return;
    setBusy(true);
    clearStatus();
    try {
      await mapLimited(ids, (id) => api('source-decision', {
        method: 'POST',
        body: JSON.stringify({ experienceId: id, decision }),
      }));
      for (const id of ids) {
        const entry = sourceEntryById(id);
        if (entry) entry.source.decision = decision;
      }
      state.selectedSources = new Set([...state.selectedSources].filter((id) => !ids.includes(id)));
      await loadDashboard({ refreshDiscovery: false });
      await loadDiscovery();
      showStatus(`${ids.length} Whop source${ids.length === 1 ? '' : 's'} ${decision}.`, decision === 'approved' ? 'ok' : 'warning');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
      renderDiscovery();
    }
  }

  async function chooseDiscoveredSource(entry) {
    await checkSource(entry.experience.id);
    if (state.source?.decision === 'approved') await scanCurrent();
    elements.sourceReview.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function activeCategories() {
    return (state.dashboard?.categories || []).filter((category) => Number(category.active) === 1);
  }

  function renderCategories() {
    elements.categoryList.replaceChildren();
    for (const category of state.dashboard?.categories || []) {
      const chip = document.createElement('span');
      chip.className = 'category-chip';
      const strong = document.createElement('strong');
      strong.textContent = category.label;
      const small = document.createElement('small');
      small.textContent = Number(category.active) === 1 ? category.slug : `${category.slug} · hidden`;
      chip.append(strong, small);
      elements.categoryList.append(chip);
    }
    const selects = [elements.importCategory, elements.draftEditor?.elements?.category].filter(Boolean);
    for (const select of selects) {
      const previous = select.value;
      select.replaceChildren();
      for (const category of activeCategories()) {
        const option = document.createElement('option');
        option.value = category.slug;
        option.textContent = category.label;
        select.append(option);
      }
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    }
  }

  function renderSourceReview() {
    if (!state.source || !state.experience) {
      elements.sourceReview.hidden = true;
      return;
    }
    elements.sourceReview.hidden = false;
    elements.sourceTitle.textContent = sourceLabel(state.source);
    elements.sourceState.dataset.state = state.source.decision || 'pending';
    elements.sourceState.textContent = decisionText(state.source.decision);
    elements.sourceDetail.textContent = state.source.decision === 'approved'
      ? 'This exact forum can be scanned and imported.'
      : state.source.decision === 'disapproved'
        ? 'This exact forum is blocked until you approve it again.'
        : `${state.source.suggested ? `Recognized as ${state.source.builtInLabel}. ` : ''}Approve or disapprove this exact source.`;
    elements.sourceApprove.disabled = state.busy || state.source.decision === 'approved';
    elements.sourceDisapprove.disabled = state.busy || state.source.decision === 'disapproved';
    elements.sourceScan.hidden = state.source.decision !== 'approved';
    elements.sourceScan.disabled = state.busy || state.source.decision !== 'approved';
  }

  function postCounts() {
    const counts = { approved: 0, disapproved: 0, pending: 0, blocked: 0 };
    for (const post of state.posts) counts[post.decision] = (counts[post.decision] || 0) + 1;
    return counts;
  }

  function updateImportButton() {
    const counts = postCounts();
    elements.countApproved.textContent = counts.approved;
    elements.countDisapproved.textContent = counts.disapproved;
    elements.countPending.textContent = counts.pending;
    elements.countBlocked.textContent = counts.blocked;
    elements.importApproved.disabled = state.busy || !counts.approved || !elements.rights.checked || !elements.importCategory.value;
    elements.importApproved.textContent = counts.approved ? `Import ${counts.approved} approved draft${counts.approved === 1 ? '' : 's'}` : 'Import approved drafts';
  }

  function createDecisionButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function openPreview(post) {
    elements.previewTitle.textContent = post.title;
    elements.previewMeta.textContent = `${post.author?.username || post.author?.name || 'Unknown author'} · ${post.sourceUpdatedAt ? new Date(post.sourceUpdatedAt).toLocaleString() : 'Unknown date'}`;
    elements.previewBody.textContent = post.body || 'The exact body is loaded again during import.';
    elements.preview.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    elements.preview.hidden = true;
    document.body.style.overflow = '';
  }

  async function decidePosts(sourceKeys, decision) {
    if (!sourceKeys.length) return;
    setBusy(true);
    try {
      await api('post-decision', { method: 'POST', body: JSON.stringify({ sourceKeys, decision }) });
      const keys = new Set(sourceKeys);
      state.posts = state.posts.map((post) => keys.has(post.sourceKey) && post.decision !== 'blocked' ? { ...post, decision } : post);
      renderPosts();
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderPosts() {
    elements.postList.replaceChildren();
    for (const post of state.posts) {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.dataset.state = post.decision;
      const header = document.createElement('header');
      const copy = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = post.title;
      const meta = document.createElement('small');
      meta.textContent = `${post.author?.username || post.author?.name || 'Unknown author'}${post.sourceUpdatedAt ? ` · ${new Date(post.sourceUpdatedAt).toLocaleDateString()}` : ''}`;
      copy.append(title, meta);
      const pill = document.createElement('strong');
      pill.className = 'state-pill';
      pill.dataset.state = post.decision;
      pill.textContent = decisionText(post.decision);
      header.append(copy, pill);
      const excerpt = document.createElement('p');
      excerpt.textContent = post.integrity?.blocked ? post.integrity.error : post.excerpt || 'No preview text.';
      const diagnostics = document.createElement('div');
      diagnostics.className = 'post-diagnostics';
      diagnostics.textContent = post.integrity?.blocked ? `Blocked · ${post.integrity.code || 'format error'}` : `${post.integrity?.structure?.lines || 0} lines · ${(post.attachments || []).length} attachment${(post.attachments || []).length === 1 ? '' : 's'} · exact formatting checked`;
      const actions = document.createElement('div');
      actions.className = 'post-actions';
      const approve = createDecisionButton('Approve', 'approve', () => decidePosts([post.sourceKey], 'approved'));
      approve.disabled = post.decision === 'approved' || post.decision === 'blocked';
      const disapprove = createDecisionButton('Disapprove', 'disapprove', () => decidePosts([post.sourceKey], 'disapproved'));
      disapprove.disabled = post.decision === 'disapproved' || post.decision === 'blocked';
      const undo = createDecisionButton('Undo', '', () => decidePosts([post.sourceKey], 'pending'));
      undo.hidden = !['approved', 'disapproved'].includes(post.decision);
      const preview = createDecisionButton('Preview', '', () => openPreview(post));
      actions.append(approve, disapprove, undo, preview);
      card.append(header, excerpt, diagnostics, actions);
      elements.postList.append(card);
    }
    updateImportButton();
  }

  function renderGuides() {
    elements.draftList.replaceChildren();
    const guides = state.dashboard?.guides || [];
    for (const guide of guides) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `draft-item${guide.id === state.selectedGuideId ? ' active' : ''}`;
      const strong = document.createElement('strong');
      strong.textContent = guide.title;
      const small = document.createElement('small');
      small.textContent = `${guide.status} · ${guide.categoryLabel}${guide.attachments?.reviewCount ? ` · ${guide.attachments.reviewCount} file review` : ''}`;
      button.append(strong, small);
      button.addEventListener('click', () => selectGuide(guide.id));
      elements.draftList.append(button);
    }
    if (state.selectedGuideId && !guides.some((guide) => guide.id === state.selectedGuideId)) state.selectedGuideId = null;
    if (!state.selectedGuideId) {
      elements.draftEmpty.hidden = false;
      elements.draftEditor.hidden = true;
    }
  }

  function selectGuide(id) {
    const guide = (state.dashboard?.guides || []).find((item) => item.id === id);
    if (!guide) return;
    state.selectedGuideId = id;
    renderGuides();
    elements.draftEmpty.hidden = true;
    elements.draftEditor.hidden = false;
    const fields = elements.draftEditor.elements;
    fields.id.value = guide.id;
    fields.title.value = guide.title;
    fields.description.value = guide.description;
    fields.category.value = guide.category;
    fields.body.value = guide.body;
    fields.featured.checked = guide.featured;
    fields.attachmentsResolved.checked = false;
    elements.editorStatus.textContent = guide.status;
    elements.editorHeading.textContent = guide.title;
    elements.markdownPreview.textContent = guide.body;
    const reviewCount = Number(guide.attachments?.reviewCount || 0);
    elements.attachmentResolution.hidden = reviewCount === 0;
    elements.openPublic.hidden = guide.status !== 'published';
    elements.openPublic.href = `/guides/${encodeURIComponent(guide.slug)}/`;
    elements.publishGuide.disabled = guide.status === 'published' || reviewCount > 0;
    elements.rejectGuide.disabled = guide.status === 'rejected';
    elements.returnDraft.disabled = guide.status === 'draft';
  }

  function renderDashboard() {
    unlock();
    renderWhop();
    renderSources();
    renderCategories();
    renderGuides();
    renderDiscovery();
  }

  async function loadDashboard({ refreshDiscovery = true } = {}) {
    const data = await api('dashboard', { method: 'GET', headers: {} });
    state.dashboard = data;
    renderDashboard();
    if (refreshDiscovery) await loadDiscovery();
  }

  async function checkSource(sourceValue) {
    state.sourceInput = String(sourceValue || '').trim();
    setBusy(true);
    clearStatus();
    try {
      const output = await api('source-check', { method: 'POST', body: JSON.stringify({ source: state.sourceInput }) });
      state.source = output.source;
      state.experience = output.experience;
      state.dashboard.sources = output.sources;
      renderSources();
      renderSourceReview();
      elements.postPanel.hidden = true;
      return output;
    } catch (error) {
      showStatus(error.message, 'error');
      throw error;
    } finally {
      setBusy(false);
      renderSourceReview();
    }
  }

  async function decideSource(decision) {
    setBusy(true);
    try {
      const output = await api('source-decision', {
        method: 'POST',
        body: JSON.stringify({ source: state.sourceInput || state.experience?.id, decision }),
      });
      state.source = output.source;
      state.dashboard.sources = output.sources;
      renderSources();
      renderSourceReview();
      if (decision === 'approved') await scanCurrent();
      else elements.postPanel.hidden = true;
      await loadDiscovery();
      showStatus(`${sourceLabel(state.source)} ${decision}.`, decision === 'approved' ? 'ok' : 'warning');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
      renderSourceReview();
    }
  }

  async function scanCurrent() {
    if (!state.experience?.id) return;
    setBusy(true);
    try {
      const output = await api('scan', { method: 'POST', body: JSON.stringify({ experienceId: state.experience.id }) });
      state.posts = output.posts;
      state.source = output.source;
      elements.postPanel.hidden = false;
      elements.postTitle.textContent = `${sourceLabel(state.source)} posts`;
      elements.postSummary.textContent = `${output.counts.total} top-level posts · approve only what should become a private SniperPlug draft.`;
      renderPosts();
      elements.postPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
      renderSourceReview();
    }
  }

  async function initialize() {
    try {
      const session = await api('session', { method: 'GET', headers: {} });
      if (!session.authenticated) {
        lock();
        return;
      }
      await loadDashboard();
      const params = new URLSearchParams(location.search);
      if (params.get('whop') === 'error') showStatus(params.get('message') || 'Whop login failed.', 'error');
      else if (params.get('whop') === 'connected') showStatus('Whop connected successfully.');
    } catch (error) {
      lock();
      elements.loginMessage.textContent = error.message;
      elements.loginMessage.hidden = false;
    }
  }

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', elements.loginForm);
    button.disabled = true;
    elements.loginMessage.hidden = true;
    try {
      await api('session', { method: 'POST', body: JSON.stringify({ password: new FormData(elements.loginForm).get('password') }) });
      elements.loginForm.reset();
      await loadDashboard();
    } catch (error) {
      elements.loginMessage.textContent = error.message;
      elements.loginMessage.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  elements.logout.addEventListener('click', async () => {
    try { await api('session', { method: 'DELETE', body: '{}' }); } finally { lock(); }
  });

  elements.whopDisconnect.addEventListener('click', async () => {
    setBusy(true);
    try {
      await api('whop-disconnect', { method: 'DELETE', body: '{}' });
      await loadDashboard();
      showStatus('Whop disconnected.');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  });

  elements.refreshGroups.addEventListener('click', () => loadDiscovery());
  elements.selectDefaults.addEventListener('change', () => {
    for (const group of state.discovery?.groups || []) {
      if (group.builtIn) setGroupSelection(group, elements.selectDefaults.checked);
    }
    renderDiscovery();
  });
  elements.clearSelected.addEventListener('click', () => {
    state.selectedSources.clear();
    elements.selectDefaults.checked = false;
    renderDiscovery();
  });
  elements.approveSelected.addEventListener('click', () => decideDiscoveredSources([...state.selectedSources], 'approved'));
  elements.disapproveSelected.addEventListener('click', () => decideDiscoveredSources([...state.selectedSources], 'disapproved'));

  elements.sourceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await checkSource(new FormData(elements.sourceForm).get('source'));
  });
  elements.sourceApprove.addEventListener('click', () => decideSource('approved'));
  elements.sourceDisapprove.addEventListener('click', () => decideSource('disapproved'));
  elements.sourceScan.addEventListener('click', () => scanCurrent());

  elements.approveAll.addEventListener('click', () => decidePosts(state.posts.filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'approved'));
  elements.disapproveAll.addEventListener('click', () => decidePosts(state.posts.filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'disapproved'));
  elements.resetAll.addEventListener('click', () => decidePosts(state.posts.filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'pending'));
  elements.rights.addEventListener('change', updateImportButton);
  elements.importCategory.addEventListener('change', updateImportButton);

  elements.importApproved.addEventListener('click', async () => {
    const sourceKeys = state.posts.filter((post) => post.decision === 'approved').map((post) => post.sourceKey);
    setBusy(true);
    try {
      const output = await api('import', {
        method: 'POST',
        body: JSON.stringify({ experienceId: state.experience.id, sourceKeys, category: elements.importCategory.value, rightsConfirmed: elements.rights.checked }),
      });
      showStatus(`${output.imported} draft${output.imported === 1 ? '' : 's'} imported${output.attachmentReviews ? `; ${output.attachmentReviews} attachment${output.attachmentReviews === 1 ? '' : 's'} need review` : ''}.`);
      await loadDashboard();
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  });

  elements.categoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(elements.categoryForm);
    setBusy(true);
    try {
      const output = await api('category-save', {
        method: 'POST',
        body: JSON.stringify({ label: form.get('label'), description: form.get('description'), sortOrder: form.get('sortOrder') }),
      });
      state.dashboard.categories = output.categories;
      renderCategories();
      elements.categoryForm.reset();
      showStatus(`Category ${output.category.label} saved.`);
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  });

  elements.refresh.addEventListener('click', () => loadDashboard().then(() => showStatus('Control Center refreshed.')).catch((error) => showStatus(error.message, 'error')));
  elements.draftEditor.addEventListener('input', () => { elements.markdownPreview.textContent = elements.draftEditor.elements.body.value; });
  elements.draftEditor.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(elements.draftEditor);
    setBusy(true);
    try {
      const output = await api('guide-save', {
        method: 'POST',
        body: JSON.stringify({ id: form.get('id'), title: form.get('title'), description: form.get('description'), category: form.get('category'), body: form.get('body'), featured: form.get('featured') === 'on', attachmentsResolved: form.get('attachmentsResolved') === 'on' }),
      });
      const index = state.dashboard.guides.findIndex((guide) => guide.id === output.guide.id);
      state.dashboard.guides[index] = output.guide;
      renderGuides();
      selectGuide(output.guide.id);
      showStatus('Draft saved with exact formatting validation.');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  });

  async function changeGuideStatus(status) {
    const id = Number(elements.draftEditor.elements.id.value);
    setBusy(true);
    try {
      const output = await api('guide-status', { method: 'POST', body: JSON.stringify({ id, status }) });
      const index = state.dashboard.guides.findIndex((guide) => guide.id === output.guide.id);
      state.dashboard.guides[index] = output.guide;
      renderGuides();
      selectGuide(output.guide.id);
      showStatus(status === 'published' ? 'Guide published.' : status === 'rejected' ? 'Guide rejected and kept private.' : 'Guide returned to draft.');
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  elements.publishGuide.addEventListener('click', () => changeGuideStatus('published'));
  elements.rejectGuide.addEventListener('click', () => changeGuideStatus('rejected'));
  elements.returnDraft.addEventListener('click', () => changeGuideStatus('draft'));
  document.querySelectorAll('[data-close-preview]').forEach((button) => button.addEventListener('click', closePreview));
  elements.preview.addEventListener('click', (event) => { if (event.target === elements.preview) closePreview(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.preview.hidden) closePreview(); });

  initialize();
})();
