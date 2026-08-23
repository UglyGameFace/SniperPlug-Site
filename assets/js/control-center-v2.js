(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;

  const $ = (selector, parent = root) => parent.querySelector(selector);
  const $$ = (selector, parent = root) => [...parent.querySelectorAll(selector)];
  const idle = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback, { timeout: 120 })
    : (callback) => setTimeout(() => callback({ timeRemaining: () => 8, didTimeout: true }), 0);
  const MOBILE_QUERY = window.matchMedia('(max-width: 720px), (pointer: coarse)');
  const GUIDE_PAGE_SIZE = MOBILE_QUERY.matches ? 8 : 24;
  const POST_PAGE_SIZE = MOBILE_QUERY.matches ? 4 : 10;
  const SOURCE_PAGE_SIZE = MOBILE_QUERY.matches ? 6 : 12;

  const elements = {
    loginPanel: $('[data-login-panel]'),
    loginForm: $('[data-login-form]'),
    loginMessage: $('[data-login-message]'),
    app: $('[data-control-app]'),
    logout: $('[data-logout]'),
    globalStatus: $('[data-global-status]'),
    whopState: $('[data-whop-state]'),
    whopConnect: $('[data-whop-connect]'),
    whopSwitch: $('[data-whop-switch]'),
    whopDisconnect: $('[data-whop-disconnect]'),
    whopSwitchHelp: $('[data-whop-switch-help]'),
    whopConnectionDetail: $('[data-whop-connection-detail]'),
    scopeWarning: $('[data-scope-warning]'),
    sourceOptions: $('[data-source-options]'),
    sourceForm: $('[data-source-form]'),
    sourceReview: $('[data-source-review]'),
    sourceTitle: $('[data-source-title]'),
    sourceDetail: $('[data-source-detail]'),
    sourceState: $('[data-source-state]'),
    sourceApprove: $('[data-source-approve]'),
    sourceDisapprove: $('[data-source-disapprove]'),
    sourceScan: $('[data-source-scan]'),
    discoverySummary: $('[data-discovery-summary]'),
    discoveryMessage: $('[data-discovery-message]'),
    discoveryBulk: $('[data-discovery-bulk]'),
    discoveredGroups: $('[data-discovered-groups]'),
    refreshGroups: $('[data-refresh-groups]'),
    selectDefaults: $('[data-select-defaults]'),
    selectedSourceCount: $('[data-selected-source-count]'),
    approveSelected: $('[data-approve-selected]'),
    disapproveSelected: $('[data-disapprove-selected]'),
    clearSelected: $('[data-clear-selected]'),
    sourceTools: $('[data-source-browser-tools]'),
    sourceSearch: $('[data-source-search]'),
    sourceFilter: $('[data-source-filter]'),
    expandPriority: $('[data-expand-priority]'),
    collapseGroups: $('[data-collapse-groups]'),
    bulkWorkflow: $('[data-bulk-workflow]'),
    bulkWorkflowSummary: $('[data-bulk-workflow-summary]'),
    bulkRights: $('[data-bulk-rights]'),
    bulkPublish: $('[data-bulk-publish]'),
    bulkProgress: $('[data-bulk-progress]'),
    bulkJobPanel: $('[data-bulk-job-panel]'),
    bulkJobTitle: $('[data-bulk-job-title]'),
    bulkJobSummary: $('[data-bulk-job-summary]'),
    resumeBulk: $('[data-resume-bulk-job]'),
    cancelBulk: $('[data-cancel-bulk-job]'),
    progressVisual: $('[data-bulk-progress-visual]'),
    progressStage: $('[data-progress-stage]'),
    progressPercent: $('[data-progress-percent]'),
    progressBar: $('[data-progress-bar]'),
    progressSources: $('[data-progress-sources]'),
    progressScanned: $('[data-progress-scanned]'),
    progressPublished: $('[data-progress-published]'),
    progressHeld: $('[data-progress-held]'),
    progressTimeline: $('[data-progress-timeline]'),
    recentActions: $('[data-recent-actions]'),
    recentList: $('[data-recent-action-list]'),
    recentStatus: $('[data-recent-action-status]'),
    selectRecent: $('[data-select-recent-actions]'),
    clearRecent: $('[data-clear-recent-actions]'),
    undoSelected: $('[data-undo-selected-actions]'),
    undoAll: $('[data-undo-all-actions]'),
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
    inlineCategoryForm: $('[data-inline-category-form]'),
    cancelInlineCategory: $('[data-cancel-inline-category]'),
    categoryForm: $('[data-category-form]'),
    categoryList: $('[data-category-list]'),
    refresh: $('[data-refresh-dashboard]'),
    publishAllReady: $('[data-publish-all-ready]'),
    publishAllProgress: $('[data-publish-all-progress]'),
    draftList: $('[data-draft-list]'),
    draftEmpty: $('[data-draft-empty]'),
    draftEditor: $('[data-draft-editor]'),
    draftSearch: $('[data-draft-search]'),
    draftStatusFilter: $('[data-draft-status-filter]'),
    editorStatus: $('[data-editor-status]'),
    editorHeading: $('[data-editor-heading]'),
    openPublic: $('[data-open-public]'),
    attachmentResolution: $('[data-attachment-resolution]'),
    markdownPreview: $('[data-markdown-preview]'),
    publishGuide: $('[data-publish-guide]'),
    rejectGuide: $('[data-reject-guide]'),
    returnDraft: $('[data-return-draft]'),
    preview: $('[data-post-preview]', document),
    previewTitle: $('[data-preview-title]', document),
    previewMeta: $('[data-preview-meta]', document),
    previewBody: $('[data-preview-body]', document),
    mediaReadiness: $('[data-media-readiness]'),
    mediaUsage: $('[data-media-usage]'),
    mediaUsageLabel: $('[data-media-usage-label]'),
    mediaUsageObjects: $('[data-media-usage-objects]'),
    mediaUsageOperations: $('[data-media-usage-operations]'),
    mediaUsageProgress: $('[data-media-usage-progress]'),
  };

  const state = {
    dashboard: null,
    discovery: null,
    discoveryRequestToken: 0,
    discoveryAutoPasses: 0,
    discoveryTimer: null,
    selectedSources: new Set(),
    expandedGroups: new Set(),
    sourceCards: new Map(),
    source: null,
    experience: null,
    posts: new Map(),
    postOrder: [],
    postRenderToken: 0,
    postRenderLimit: POST_PAGE_SIZE,
    sourceRenderLimits: new Map(),
    guides: new Map(),
    guideDetails: new Map(),
    guideOrder: [],
    guideRenderLimit: GUIDE_PAGE_SIZE,
    guideRequestToken: 0,
    selectedGuideId: null,
    categoryTarget: 'import',
    bulkJob: null,
    bulkRunning: false,
    recent: null,
    recentSelection: new Set(),
    deferredHistoryLoaded: false,
    previewPostKey: null,
    activeOperations: 0,
    activeOperationKeys: new Set(),
  };

  const operationBar = document.createElement('div');
  operationBar.className = 'control-operation-bar';
  operationBar.hidden = true;
  operationBar.setAttribute('role', 'status');
  operationBar.setAttribute('aria-live', 'polite');
  operationBar.innerHTML = '<div class="control-operation-track"><span></span></div><strong>Working…</strong>';
  document.body.append(operationBar);
  const discoveryIntro = elements.discoverySummary?.closest('.control-panel')?.querySelector('.panel-head p');
  if (discoveryIntro) discoveryIntro.textContent = 'Nothing scans automatically. Press Load sources, open one group, then review only the source you choose.';

  async function requestJson(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...options,
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
      });
    } catch (cause) {
      const error = new Error('The network request did not reach SniperPlug. Retrying is safe.');
      error.status = 0;
      error.code = 'NETWORK_ERROR';
      error.retryable = true;
      error.cause = cause;
      throw error;
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) {
      const error = new Error(data.error || `SniperPlug request failed (${response.status}).`);
      error.status = response.status;
      error.code = data.code || 'REQUEST_FAILED';
      error.retryable = Boolean(data.retryable || [408, 425, 429, 500, 502, 503, 504].includes(response.status));
      error.data = data;
      throw error;
    }
    return data;
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const nextRenderFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  function isTransientClientError(error) {
    return Boolean(error?.retryable || [0, 408, 425, 429, 500, 502, 503, 504].includes(Number(error?.status || 0)));
  }

  function api(action, options = {}) {
    return requestJson(`/api/control?action=${encodeURIComponent(action)}`, options);
  }

  function jobApi(body = null) {
    return requestJson('/api/bulk-jobs', {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
    }).then((data) => data.job || null);
  }

  function recentApi(body = null) {
    return requestJson('/api/recent-actions', {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  function publishReady(body) {
    return requestJson('/api/publish-ready', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  function showStatus(message, type = 'ok') {
    if (!elements.globalStatus) return;
    elements.globalStatus.textContent = String(message || '');
    elements.globalStatus.dataset.type = type;
    elements.globalStatus.hidden = !message;
  }

  function clearStatus() {
    showStatus('', 'ok');
  }

  function setWorking(button, working, label = '') {
    if (!(button instanceof HTMLButtonElement)) return;
    if (working) {
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
      if (!Object.prototype.hasOwnProperty.call(button.dataset, 'idleDisabled')) button.dataset.idleDisabled = String(button.disabled);
      if (label) button.textContent = label;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
      if (Object.prototype.hasOwnProperty.call(button.dataset, 'idleDisabled')) button.disabled = button.dataset.idleDisabled === 'true';
      delete button.dataset.idleLabel;
      delete button.dataset.idleDisabled;
      button.removeAttribute('aria-busy');
    }
  }

  function setOperationWorking(working, label = 'Working…') {
    state.activeOperations = Math.max(0, state.activeOperations + (working ? 1 : -1));
    operationBar.hidden = state.activeOperations === 0;
    operationBar.dataset.active = state.activeOperations > 0 ? 'true' : 'false';
    const copy = operationBar.querySelector('strong');
    if (copy && working) copy.textContent = label || 'Working…';
    root.setAttribute('aria-busy', state.activeOperations > 0 ? 'true' : 'false');
  }

  function operationKey(button, label) {
    if (!(button instanceof HTMLElement)) return String(label || 'operation');
    return [button.dataset.action, button.dataset.guideId, button.dataset.experienceId, button.getAttribute('data-logout') !== null ? 'logout' : '', label].filter(Boolean).join(':') || 'operation';
  }

  async function withButton(button, label, work) {
    const key = operationKey(button, label);
    if (state.activeOperationKeys.has(key) || (button instanceof HTMLButtonElement && button.getAttribute('aria-busy') === 'true')) return;
    state.activeOperationKeys.add(key);
    setWorking(button, true, label);
    setOperationWorking(true, label);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      return await work();
    } finally {
      state.activeOperationKeys.delete(key);
      setWorking(button, false);
      setOperationWorking(false);
      syncButtons();
    }
  }

  function lock() {
    elements.loginPanel.hidden = false;
    elements.app.hidden = true;
    state.dashboard = null;
    state.discovery = null;
    state.discoveryRequestToken += 1;
    clearTimeout(state.discoveryTimer);
    state.discoveryTimer = null;
  }

  function unlock() {
    elements.loginPanel.hidden = true;
    elements.app.hidden = false;
  }

  function decisionText(decision) {
    if (decision === 'approved') return 'Approved';
    if (decision === 'disapproved') return 'Disapproved';
    if (decision === 'blocked') return 'Blocked';
    return 'Needs decision';
  }

  function typeLabel(type) {
    if (type === 'course') return 'Course';
    if (type === 'chat') return 'Chat';
    if (type === 'forum') return 'Forum';
    return 'External app';
  }

  function sourceId(entry) {
    return String(entry?.experience?.id || '').trim();
  }

  function allSourceEntries() {
    return (state.discovery?.groups || []).flatMap((group) => group.sources || []);
  }

  function sourceEntry(id) {
    return allSourceEntries().find((entry) => sourceId(entry) === id) || null;
  }

  function groupKey(group) {
    return String(group?.company?.id || group?.company?.title || 'group');
  }

  function activeCategories() {
    return (state.dashboard?.categories || []).filter((category) => Number(category.active) === 1);
  }

  function formatStorageBytes(value) {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(bytes >= 10_000_000_000 ? 0 : 2)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${Math.round(bytes)} B`;
  }

  function renderMediaReadiness() {
    if (!elements.mediaReadiness || !state.dashboard) return;
    const heading = $('strong', elements.mediaReadiness);
    const detail = $('p', elements.mediaReadiness);
    const usage = state.dashboard.capabilities?.mediaStorageUsage || {};
    const ready = Boolean(state.dashboard.capabilities?.mediaStorage && usage.connected !== false);
    const hardStopped = ready && usage.hardStopped === true;
    const percent = Math.max(0, Math.min(100, Number(usage.usagePercent || 0)));
    const objectPercent = Math.min(100, (Number(usage.objectCount || 0) / Math.max(1, Number(usage.maxObjects || 25_000))) * 100);
    const monthlyCopyPercent = Math.min(100, (Number(usage.copiesThisMonth || 0) / Math.max(1, Number(usage.maxCopiesPerMonth || 50_000))) * 100);
    const dailyCopyPercent = Math.min(100, (Number(usage.copiesToday || 0) / Math.max(1, Number(usage.maxCopiesPerDay || 2_000))) * 100);
    const readPercent = Math.min(100, (Number(usage.originReadsToday || 0) / Math.max(1, Number(usage.maxOriginReadsPerDay || 10_000))) * 100);
    const warning = Math.max(percent, objectPercent, monthlyCopyPercent, dailyCopyPercent, readPercent) >= 80;
    const stateName = !ready ? 'missing' : hardStopped ? 'stopped' : warning ? 'warning' : 'ready';
    const stoppedDetails = {
      'storage-cap': 'The 8 GB application cap is protecting the free tier. New private media stays in draft review until automatic cleanup frees space.',
      'object-cap': 'The 25,000-file safety cap is protecting free operations. New private media stays in draft review until cleanup removes unused files.',
      'monthly-copy-cap': 'The 50,000-copy monthly safety cap is protecting free Class A operations. New copies resume after the UTC monthly window resets.',
      'daily-copy-cap': 'The 2,000-copy daily safety cap is protecting the D1 Free-plan write allowance used for strict quota accounting. New copies resume after the UTC daily reset.',
      'daily-origin-read-cap': 'The 10,000 uncached-read daily safety cap is protecting free Class B and D1 usage. Cached media still works; uncached reads resume after the UTC daily reset.',
      'accounting-unavailable': 'The media budget ledger is temporarily unavailable, so new copies are fail-closed in private draft review instead of risking billable usage.',
    };
    elements.mediaReadiness.dataset.state = stateName;
    if (heading) heading.textContent = !ready
      ? 'Private media storage not connected'
      : hardStopped
        ? 'R2 free-tier guard active'
        : 'Private media hard-free mode ready';
    if (detail) detail.textContent = !ready
      ? 'Public media imports normally. Private or expiring media stays in draft review until SNIPERPLUG_MEDIA is connected.'
      : hardStopped
        ? stoppedDetails[usage.stopReason] || 'A hard-free safety limit is active. New private media stays in draft review instead of creating billable usage.'
        : 'Copies stop at 50 MB per file, 8 GB total, 25,000 files, 2,000 daily or 50,000 monthly copy attempts, and 10,000 uncached reads per day. Unused files receive a 7-day safety window before deletion.';
    if (elements.mediaUsage) elements.mediaUsage.hidden = !ready;
    if (elements.mediaUsageLabel) {
      elements.mediaUsageLabel.textContent = `${formatStorageBytes(usage.totalCommittedBytes || usage.usedBytes)} of ${formatStorageBytes(usage.limitBytes || 8_000_000_000)} used · ${formatStorageBytes(usage.remainingBytes)} free`;
    }
    if (elements.mediaUsageObjects) {
      const count = Math.max(0, Number(usage.objectCount || 0));
      elements.mediaUsageObjects.textContent = `${count.toLocaleString('en-US')} / ${Number(usage.maxObjects || 25_000).toLocaleString('en-US')} stored files`;
    }
    if (elements.mediaUsageOperations) {
      const reads = Math.max(0, Number(usage.originReadsToday || 0));
      const maxReads = Math.max(1, Number(usage.maxOriginReadsPerDay || 10_000));
      const copiesToday = Math.max(0, Number(usage.copiesToday || 0));
      const maxCopiesToday = Math.max(1, Number(usage.maxCopiesPerDay || 2_000));
      const copiesThisMonth = Math.max(0, Number(usage.copiesThisMonth || 0));
      const maxCopiesThisMonth = Math.max(1, Number(usage.maxCopiesPerMonth || 50_000));
      elements.mediaUsageOperations.textContent = `${reads.toLocaleString('en-US')} / ${maxReads.toLocaleString('en-US')} uncached reads today · ${copiesToday.toLocaleString('en-US')} / ${maxCopiesToday.toLocaleString('en-US')} copy attempts today · ${copiesThisMonth.toLocaleString('en-US')} / ${maxCopiesThisMonth.toLocaleString('en-US')} this month`;
    }
    if (elements.mediaUsageProgress) {
      elements.mediaUsageProgress.value = percent;
      elements.mediaUsageProgress.textContent = `${percent}%`;
      elements.mediaUsageProgress.setAttribute('aria-label', `SniperPlug media storage is ${percent}% full`);
    }
  }

  function renderWhop() {
    const whop = state.dashboard?.whop || {};
    const connected = whop.connected === true;
    const verified = connected && whop.verified === true;
    const checking = connected && !verified;
    elements.whopState.dataset.state = verified ? 'connected' : checking ? 'checking' : 'disconnected';
    elements.whopState.textContent = verified ? 'Connected & verified' : checking ? 'Checking connection' : 'Not connected';
    const switchReady = sessionStorage.getItem('sniperplug:whop-switch-ready') === '1';
    if (verified) sessionStorage.removeItem('sniperplug:whop-switch-ready');
    elements.whopConnect.hidden = connected;
    elements.whopSwitch.hidden = !connected;
    elements.whopDisconnect.hidden = !connected;
    if (elements.whopSwitchHelp) elements.whopSwitchHelp.hidden = connected || !switchReady;
    elements.refreshGroups.disabled = !verified;
    if (elements.whopConnectionDetail) {
      const verifiedAt = whop.session?.verifiedAt ? new Date(whop.session.verifiedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      elements.whopConnectionDetail.dataset.state = verified ? 'ok' : checking ? 'working' : 'idle';
      elements.whopConnectionDetail.textContent = verified
        ? `Connection verified${verifiedAt ? ` at ${verifiedAt}` : ''}. Source access is enabled.`
        : checking
          ? whop.message || 'A saved Whop connection exists. Live verification is retrying before source access is enabled.'
          : 'Connect Whop before loading private memberships, lessons, or media.';
    }
    const scopes = new Set(whop.session?.scopes || []);
    const required = ['forum:read', 'courses:read', 'chat:read', 'member:basic:read', 'member:email:read'];
    const missing = required.filter((scope) => !scopes.has(scope));
    elements.scopeWarning.hidden = !verified || missing.length === 0;
    elements.scopeWarning.textContent = missing.length
      ? `Reconnect Whop after enabling: ${missing.join(', ')}.`
      : '';
    renderMediaReadiness();
  }

  function renderSourceSummary() {
    const sources = state.dashboard?.sources || [];
    const counts = { approved: 0, disapproved: 0 };
    for (const source of sources) counts[source.decision] = Number(counts[source.decision] || 0) + 1;
    elements.sourceOptions.replaceChildren();
    if (!sources.length) return;
    const copy = document.createElement('div');
    copy.className = 'source-summary-copy';
    const strong = document.createElement('strong');
    strong.textContent = `${counts.approved || 0} approved source${counts.approved === 1 ? '' : 's'}`;
    const detail = document.createElement('span');
    detail.textContent = `${sources.length} saved decision${sources.length === 1 ? '' : 's'} · ${counts.disapproved || 0} disapproved`;
    copy.append(strong, detail);
    const manage = document.createElement('a');
    manage.className = 'btn ghost source-summary-action';
    manage.href = '#source-browser';
    manage.textContent = 'Manage sources';
    elements.sourceOptions.className = 'source-summary';
    elements.sourceOptions.append(copy, manage);
  }

  function fillCategorySelect(select, includeAuto = false) {
    if (!(select instanceof HTMLSelectElement)) return;
    const previous = select.value;
    const fragment = document.createDocumentFragment();
    if (includeAuto) {
      const auto = document.createElement('option');
      auto.value = '__auto__';
      auto.textContent = 'Auto-fit each guide';
      fragment.append(auto);
    }
    for (const category of activeCategories()) {
      const option = document.createElement('option');
      option.value = category.slug;
      option.textContent = category.label;
      fragment.append(option);
    }
    select.replaceChildren(fragment);
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    else if (includeAuto) select.value = '__auto__';
  }

  function renderCategories() {
    const fragment = document.createDocumentFragment();
    for (const category of state.dashboard?.categories || []) {
      const chip = document.createElement('span');
      chip.className = 'category-chip';
      const strong = document.createElement('strong');
      strong.textContent = category.label;
      const small = document.createElement('small');
      small.textContent = Number(category.active) === 1 ? category.slug : `${category.slug} · hidden`;
      chip.append(strong, small);
      fragment.append(chip);
    }
    elements.categoryList.replaceChildren(fragment);
    fillCategorySelect(elements.importCategory, true);
    fillCategorySelect(elements.draftEditor?.elements?.category, false);
  }

  function updateGroupSelectionCards() {
    for (const group of state.discovery?.groups || []) {
      const card = elements.discoveredGroups.querySelector(`[data-group-key="${CSS.escape(groupKey(group))}"]`);
      if (!card) continue;
      const ids = (group.sources || []).map(sourceId).filter(Boolean);
      const selected = ids.filter((id) => state.selectedSources.has(id)).length;
      card.dataset.selection = selected === 0 ? 'none' : selected === ids.length ? 'all' : 'partial';
      const count = $('[data-group-selection-count]', card);
      const select = $('[data-action="group-select"]', card);
      const clear = $('[data-action="group-clear"]', card);
      if (count) count.textContent = `${selected}/${ids.length} selected`;
      if (select) {
        select.textContent = selected === ids.length && ids.length ? 'Group selected' : selected ? `Select remaining ${ids.length - selected}` : 'Select group';
        select.disabled = !ids.length || selected === ids.length;
      }
      if (clear) clear.disabled = selected === 0;
    }
  }

  function syncSourceSelection() {
    const count = state.selectedSources.size;
    elements.selectedSourceCount.textContent = `${count} selected`;
    elements.approveSelected.disabled = count === 0;
    elements.disapproveSelected.disabled = count === 0;
    elements.clearSelected.disabled = count === 0;
    elements.approveSelected.textContent = count ? `Approve ${count} selected` : 'Approve selected';
    elements.disapproveSelected.textContent = count ? `Disapprove ${count} selected` : 'Disapprove selected';
    const defaults = (state.discovery?.groups || []).filter((group) => group.builtIn).flatMap((group) => group.sources || []).map(sourceId).filter(Boolean);
    const checked = defaults.filter((id) => state.selectedSources.has(id)).length;
    elements.selectDefaults.checked = defaults.length > 0 && checked === defaults.length;
    elements.selectDefaults.indeterminate = checked > 0 && checked < defaults.length;
    elements.bulkWorkflowSummary.textContent = count
      ? `${count} source${count === 1 ? '' : 's'} selected · open to publish`
      : 'Open when ready to import and publish';
    if (elements.bulkWorkflow) elements.bulkWorkflow.dataset.hasSelection = String(count > 0);
    updateGroupSelectionCards();
    syncBulkButtons();
  }

  function updateVisibleSourceCheckboxes(ids = null) {
    const target = ids ? new Set(ids) : null;
    for (const checkbox of $$('.discovered-source input[type="checkbox"]', elements.discoveredGroups)) {
      const id = checkbox.closest('.discovered-source')?.dataset.experienceId || '';
      if (!target || target.has(id)) checkbox.checked = state.selectedSources.has(id);
    }
  }

  function setSelected(ids, checked) {
    for (const id of ids) {
      if (checked) state.selectedSources.add(id);
      else state.selectedSources.delete(id);
    }
    updateVisibleSourceCheckboxes(ids);
    syncSourceSelection();
    root.dispatchEvent(new CustomEvent('sniperplug:selection-updated'));
  }

  function sourceMatches(entry, query, filter) {
    const capability = entry.capability || {};
    const text = `${entry.experience?.name || ''} ${entry.experience?.id || ''} ${capability.appName || ''} ${capability.sourceType || ''}`.toLocaleLowerCase('en-US');
    const queryMatch = !query || text.includes(query);
    const stateMatch = filter === 'all'
      || filter === entry.source?.decision
      || filter === capability.sourceType;
    return queryMatch && stateMatch;
  }

  function createSourceCard(entry) {
    const id = sourceId(entry);
    const card = document.createElement('article');
    card.className = 'discovered-source';
    card.dataset.experienceId = id;
    card.dataset.state = entry.source?.decision || 'pending';
    card.dataset.type = entry.capability?.sourceType || 'unknown';
    card.style.contentVisibility = 'auto';
    card.style.containIntrinsicSize = '1px 180px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedSources.has(id);
    checkbox.dataset.action = 'source-select';
    checkbox.setAttribute('aria-label', `Select ${entry.experience?.name || id}`);

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.experience?.name || id;
    const meta = document.createElement('small');
    meta.dataset.sourceMeta = 'true';
    meta.textContent = `${typeLabel(entry.capability?.sourceType)} · ${id} · ${decisionText(entry.source?.decision)}`;
    copy.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'button-row';
    const review = document.createElement('button');
    review.type = 'button';
    review.className = 'btn ghost';
    review.dataset.action = 'source-review';
    review.textContent = entry.source?.decision === 'approved' ? 'Review content' : 'Review source';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'decision approve';
    approve.dataset.action = 'source-approve';
    approve.textContent = 'Approve';
    approve.disabled = entry.source?.decision === 'approved';
    const disapprove = document.createElement('button');
    disapprove.type = 'button';
    disapprove.className = 'decision disapprove';
    disapprove.dataset.action = 'source-disapprove';
    disapprove.textContent = 'Disapprove';
    disapprove.disabled = entry.source?.decision === 'disapproved';
    actions.append(review, approve, disapprove);
    card.append(checkbox, copy, actions);
    state.sourceCards.set(id, card);
    return card;
  }

  function renderGroupSources(group, groupCard, { more = false } = {}) {
    const list = $('.discovered-source-list', groupCard);
    if (!list) return;
    const key = groupKey(group);
    const query = elements.sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = elements.sourceFilter.value;
    const filterKey = `${query}
${filter}`;
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

  function setGroupExpanded(group, card, expanded) {
    const key = groupKey(group);
    if (expanded) state.expandedGroups.add(key);
    else state.expandedGroups.delete(key);
    card.dataset.collapsed = expanded ? 'false' : 'true';
    const list = $('.discovered-source-list', card);
    const external = $('.external-apps', card);
    const toggle = $('[data-action="group-toggle"]', card);
    if (expanded) renderGroupSources(group, card);
    if (list) list.hidden = !expanded;
    if (external) external.hidden = !expanded;
    if (toggle) {
      toggle.textContent = expanded ? 'Collapse' : 'Expand';
      toggle.setAttribute('aria-expanded', String(expanded));
    }
  }

  function createExternalModules(group) {
    if (!(group.unsupported || []).length) return null;
    const wrapper = document.createElement('section');
    wrapper.className = 'external-apps';
    const heading = document.createElement('strong');
    heading.textContent = 'App-specific content';
    const intro = document.createElement('p');
    intro.className = 'external-app-intro';
    intro.textContent = 'SniperPlug checked Whop’s native Course, Forum, and Chat endpoints first. Items listed here are powered by a separate app and need that app’s documented read interface—not a guessed endpoint.';
    wrapper.append(heading, intro);
    for (const entry of group.unsupported) {
      const card = document.createElement('article');
      card.className = 'external-app-card';
      const title = document.createElement('strong');
      title.textContent = entry.experience?.name || 'External module';
      const label = document.createElement('span');
      const app = entry.capability?.app;
      const probeState = entry.capability?.probeDeferred
        ? entry.capability?.probeFailed ? 'Capability check retrying' : 'Capability check queued'
        : 'Native API probe completed';
      label.textContent = `${entry.capability?.appName || 'Whop app'} · ${probeState}${app?.hasOpenapiView ? ' · App advertises OpenAPI' : ''}`;
      const detail = document.createElement('p');
      detail.textContent = entry.capability?.reason || 'No readable native Whop content endpoint returned items for this module.';
      card.append(title, label, detail);
      wrapper.append(card);
    }
    return wrapper;
  }

  function createGroupCard(group) {
    const card = document.createElement('article');
    card.className = 'discovered-group';
    card.dataset.groupKey = groupKey(group);
    if (group.builtIn) card.dataset.defaultGroup = 'true';
    card.style.contentVisibility = 'auto';
    card.style.containIntrinsicSize = '1px 360px';

    const header = document.createElement('header');
    const copy = document.createElement('div');
    const eyebrow = document.createElement('small');
    eyebrow.textContent = group.builtIn ? 'PRIORITY GROUP' : 'ACTIVE GROUP';
    const title = document.createElement('h3');
    title.textContent = group.company?.title || 'Whop group';
    const meta = document.createElement('p');
    meta.textContent = `${(group.sources || []).length} readable source${group.sources?.length === 1 ? '' : 's'} · ${(group.company?.products || []).length} membership product${group.company?.products?.length === 1 ? '' : 's'}`;
    const selectedCount = document.createElement('strong');
    selectedCount.className = 'group-selection-count';
    selectedCount.dataset.groupSelectionCount = 'true';
    selectedCount.setAttribute('aria-live', 'polite');
    selectedCount.textContent = `0/${(group.sources || []).length} selected`;
    copy.append(eyebrow, title, meta, selectedCount);

    const actions = document.createElement('div');
    actions.className = 'button-row';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'btn ghost';
    select.dataset.action = 'group-select';
    select.textContent = 'Select group';
    select.disabled = !(group.sources || []).length;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn ghost';
    clear.dataset.action = 'group-clear';
    clear.textContent = 'Clear group';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn ghost';
    toggle.dataset.action = 'group-toggle';
    toggle.textContent = 'Expand';
    toggle.setAttribute('aria-expanded', 'false');
    actions.append(select, clear, toggle);
    header.append(copy, actions);
    card.append(header);

    if (group.error) {
      const warning = document.createElement('p');
      warning.className = 'discovery-warning';
      warning.textContent = group.error;
      card.append(warning);
    }

    const list = document.createElement('div');
    list.className = 'discovered-source-list';
    list.hidden = true;
    card.append(list);
    const external = createExternalModules(group);
    if (external) {
      external.hidden = true;
      card.append(external);
    }
    return card;
  }

  function renderDiscovery() {
    state.sourceCards.clear();
    if (elements.refreshGroups) elements.refreshGroups.textContent = state.discovery ? 'Refresh sources' : 'Load sources';
    const whop = state.dashboard?.whop || {};
    const connected = Boolean(whop.connected && whop.verified);
    if (!connected) {
      elements.discoverySummary.textContent = whop.connected ? 'Waiting for Whop verification…' : 'Connect Whop to load sources.';
      elements.discoveryMessage.textContent = whop.connected ? 'The saved connection exists, but source access is paused until verification succeeds.' : '';
      elements.discoveryBulk.hidden = true;
      elements.sourceTools.hidden = true;
      elements.discoveredGroups.replaceChildren();
      return;
    }
    if (!state.discovery) {
      elements.discoverySummary.textContent = 'Finding your active Whop content…';
      elements.discoveryMessage.textContent = '';
      return;
    }
    const groups = state.discovery.groups || [];
    const counts = state.discovery.counts || {};
    elements.discoverySummary.textContent = `${counts.groups || 0} active group${counts.groups === 1 ? '' : 's'} · ${counts.sources || 0} readable source${counts.sources === 1 ? '' : 's'}`;
    elements.discoveryMessage.textContent = `${counts.forums || 0} Forum · ${counts.courses || 0} Course · ${counts.chats || 0} Chat${counts.unsupported ? ` · ${counts.unsupported} external app module${counts.unsupported === 1 ? '' : 's'}` : ''}`;
    elements.discoveryBulk.hidden = groups.length === 0;
    elements.sourceTools.hidden = groups.length === 0;
    const validIds = new Set(groups.flatMap((group) => group.sources || []).map(sourceId));
    state.selectedSources = new Set([...state.selectedSources].filter((id) => validIds.has(id)));

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const card = createGroupCard(group);
      fragment.append(card);
    }
    elements.discoveredGroups.replaceChildren(fragment);

    for (const group of groups) {
      const card = elements.discoveredGroups.querySelector(`[data-group-key="${CSS.escape(groupKey(group))}"]`);
      if (!card) continue;
      const shouldExpand = state.expandedGroups.has(groupKey(group));
      setGroupExpanded(group, card, shouldExpand);
    }
    filterSources();
    syncSourceSelection();
  }

  function filterSources() {
    if (!state.discovery) return;
    const query = elements.sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = elements.sourceFilter.value;
    for (const group of state.discovery.groups || []) {
      const card = elements.discoveredGroups.querySelector(`[data-group-key="${CSS.escape(groupKey(group))}"]`);
      if (!card) continue;
      const groupText = String(group.company?.title || '').toLocaleLowerCase('en-US');
      const sourceMatch = (group.sources || []).some((entry) => sourceMatches(entry, query, filter));
      const externalMatch = filter === 'all' || filter === 'external';
      const hasExternal = Boolean((group.unsupported || []).length && externalMatch && (!query || groupText.includes(query) || (group.unsupported || []).some((entry) => String(entry.experience?.name || '').toLocaleLowerCase('en-US').includes(query))));
      card.hidden = !sourceMatch && !hasExternal;
      if (query && !card.hidden) setGroupExpanded(group, card, true);
      const list = $('.discovered-source-list', card);
      if (list?.dataset.rendered === 'true') renderGroupSources(group, card);
      const external = $('.external-apps', card);
      if (external) external.hidden = card.dataset.collapsed === 'true' || !hasExternal;
    }
  }

  function discoveryStatusText(data) {
    const counts = data?.counts || {};
    const probe = data?.capabilityProbe || {};
    if (Number(probe.pending || 0) > 0) {
      return `${counts.forums || 0} Forum · ${counts.courses || 0} Course · ${counts.chats || 0} Chat · checking ${probe.pending} app-specific module${probe.pending === 1 ? '' : 's'} in bounded background passes`;
    }
    return `${counts.forums || 0} Forum · ${counts.courses || 0} Course · ${counts.chats || 0} Chat${counts.unsupported ? ` · ${counts.unsupported} app-specific module${counts.unsupported === 1 ? '' : 's'} checked` : ''}`;
  }

  function scheduleDiscoveryContinuation(data) {
    clearTimeout(state.discoveryTimer);
    state.discoveryTimer = null;
    const pending = Number(data?.capabilityProbe?.pending || 0);
    if (pending > 0) {
      elements.discoveryMessage.textContent = `${discoveryStatusText(data)} · press Refresh sources to run another bounded pass.`;
    }
  }

  async function loadDiscovery({ background = false, manual = false } = {}) {
    const whop = state.dashboard?.whop || {};
    if (!whop.connected || !whop.verified) {
      state.discovery = null;
      renderDiscovery();
      elements.discoverySummary.textContent = whop.connected ? 'Waiting for Whop verification…' : 'Connect Whop to load sources.';
      elements.discoveryMessage.textContent = whop.connected
        ? 'The saved connection exists, but private source access stays disabled until live verification succeeds.'
        : '';
      return false;
    }
    if (manual) state.discoveryAutoPasses = 0;
    const token = ++state.discoveryRequestToken;
    const previous = state.discovery;
    if (!background || !previous) {
      elements.discoverySummary.textContent = previous ? 'Refreshing your active Whop content…' : 'Finding your active Whop content…';
      elements.discoveryMessage.textContent = 'Whop is connected and verified. Source discovery is running separately.';
    }

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await requestJson('/api/discover');
        if (token !== state.discoveryRequestToken) return false;
        state.discovery = data;
        renderDiscovery();
        elements.discoveryMessage.textContent = discoveryStatusText(data);
        scheduleDiscoveryContinuation(data);
        return true;
      } catch (error) {
        lastError = error;
        if (token !== state.discoveryRequestToken) return false;
        if (!isTransientClientError(error) || attempt === 2) break;
        elements.discoverySummary.textContent = 'Whop connected · source refresh retrying…';
        elements.discoveryMessage.textContent = `The connection is valid. A temporary source-discovery request failed; retry ${attempt + 1} of 2 is automatic.`;
        await wait(450 * (attempt + 1));
      }
    }

    if (token !== state.discoveryRequestToken) return false;
    if (previous) state.discovery = previous;
    else state.discovery = { groups: [], counts: {} };
    renderDiscovery();
    const connectionStillVerified = Boolean(state.dashboard?.whop?.connected && state.dashboard?.whop?.verified);
    elements.discoverySummary.textContent = connectionStillVerified
      ? 'Whop connected · source refresh paused'
      : 'Whop connection needs verification';
    elements.discoveryMessage.textContent = connectionStillVerified
      ? `${lastError?.message || 'Source discovery could not refresh.'} Your saved sources and the rest of the Control Center remain available.`
      : 'Source loading is disabled until the Whop connection is verified again.';
    return false;
  }

  function updateSourceDecision(id, decision) {
    const entry = sourceEntry(id);
    if (entry) entry.source.decision = decision;
    const card = state.sourceCards.get(id);
    if (!card) return;
    card.dataset.state = decision;
    const meta = $('[data-source-meta]', card);
    if (meta && entry) meta.textContent = `${typeLabel(entry.capability?.sourceType)} · ${id} · ${decisionText(decision)}`;
    const review = $('[data-action="source-review"]', card);
    const approve = $('[data-action="source-approve"]', card);
    const disapprove = $('[data-action="source-disapprove"]', card);
    if (review) review.textContent = decision === 'approved' ? 'Review content' : 'Review source';
    if (approve) approve.disabled = decision === 'approved';
    if (disapprove) disapprove.disabled = decision === 'disapproved';
  }

  async function decideSources(ids, decision, button = null) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return;
    await withButton(button, `${decision === 'approved' ? 'Approving' : 'Disapproving'} ${unique.length}…`, async () => {
      clearStatus();
      const output = await api('source-decision', {
        method: 'POST',
        body: JSON.stringify({ experienceIds: unique, decision }),
      });
      for (const id of unique) updateSourceDecision(id, decision);
      state.dashboard.sources = output.sources || state.dashboard.sources;
      renderSourceSummary();
      if (decision === 'disapproved') setSelected(unique, false);
      showStatus(`${unique.length} source${unique.length === 1 ? '' : 's'} ${decision}.`, decision === 'approved' ? 'ok' : 'warning');
    }).catch((error) => showStatus(error.message, 'error'));
  }

  function renderSourceReview() {
    if (!state.source || !state.experience) {
      elements.sourceReview.hidden = true;
      return;
    }
    elements.sourceReview.hidden = false;
    elements.sourceTitle.textContent = state.experience.name || state.source.label || 'Whop source';
    elements.sourceState.dataset.state = state.source.decision || 'pending';
    elements.sourceState.textContent = decisionText(state.source.decision);
    const appName = state.experience?.app?.name || 'Whop app';
    elements.sourceDetail.textContent = state.source.decision === 'approved'
      ? `This exact ${appName} source is approved. Review its current guide-worthy content below.`
      : state.source.decision === 'disapproved'
        ? `This exact ${appName} source is blocked until you approve it again.`
        : `Approve or disapprove this exact ${appName} source.`;
    elements.sourceApprove.disabled = state.source.decision === 'approved';
    elements.sourceDisapprove.disabled = state.source.decision === 'disapproved';
    elements.sourceScan.hidden = state.source.decision !== 'approved';
  }

  async function checkSource(value, { scanIfApproved = false } = {}) {
    const output = await api('source-check', {
      method: 'POST',
      body: JSON.stringify({ source: value }),
    });
    state.source = output.source;
    state.experience = output.experience;
    state.dashboard.sources = output.sources || state.dashboard.sources;
    renderSourceSummary();
    renderSourceReview();
    if (scanIfApproved && state.source?.decision === 'approved') await scanCurrent();
    return output;
  }

  function postCounts() {
    const counts = { approved: 0, disapproved: 0, pending: 0, blocked: 0 };
    for (const post of state.posts.values()) counts[post.decision] = Number(counts[post.decision] || 0) + 1;
    return counts;
  }

  function syncPostControls() {
    const counts = postCounts();
    elements.countApproved.textContent = counts.approved;
    elements.countDisapproved.textContent = counts.disapproved;
    elements.countPending.textContent = counts.pending;
    elements.countBlocked.textContent = counts.blocked;
    const category = elements.importCategory.value;
    elements.importApproved.disabled = !counts.approved || !elements.rights.checked || !category;
    elements.importApproved.textContent = counts.approved ? `Import ${counts.approved} approved draft${counts.approved === 1 ? '' : 's'}` : 'Import approved drafts';
  }

  function policyText(post) {
    const policy = post.integrity?.policy || post.integrity?.sourceMeta?.importPolicy;
    if (post.integrity?.blocked) return `Blocked · ${post.integrity.code || 'content policy'} · ${post.integrity.error || ''}`;
    if (post.integrity?.autoPublishEligible === true) {
      const count = Number(post.attachmentCount ?? (post.attachments || []).length);
      return `Ready for automatic publishing · ${typeLabel(post.contentType)} · ${count} file${count === 1 ? '' : 's'}`;
    }
    return `Manual review only · ${policy?.reason || 'This item was not automatically classified as a durable guide.'}`;
  }

  function createPostCard(post) {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.dataset.sourceKey = post.sourceKey;
    card.dataset.state = post.decision;
    card.dataset.type = post.contentType || 'forum';

    const header = document.createElement('header');
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = post.title;
    const meta = document.createElement('small');
    meta.textContent = `${typeLabel(post.contentType)}${post.author?.username || post.author?.name ? ` · ${post.author.username || post.author.name}` : ''}${post.sourceUpdatedAt ? ` · ${new Date(post.sourceUpdatedAt).toLocaleDateString()}` : ''}`;
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
    diagnostics.textContent = policyText(post);
    const mediaFiles = (post.attachments || []).filter((file) => ['course-thumbnail', 'hosted-video'].includes(file.role));
    const media = document.createElement('div');
    media.className = 'post-media-summary';
    media.hidden = mediaFiles.length === 0;
    const thumbnail = mediaFiles.find((file) => file.role === 'course-thumbnail' && file.url);
    if (thumbnail) {
      const image = document.createElement('img');
      image.src = thumbnail.url;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      media.append(image);
    }
    const hostedVideo = mediaFiles.find((file) => file.role === 'hosted-video');
    if (hostedVideo) {
      const copy = document.createElement('div');
      const heading = document.createElement('strong');
      const seconds = Number(hostedVideo.durationSeconds || 0);
      const minutes = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
      heading.textContent = minutes ? `Video detected · ${minutes} min` : 'Video detected';
      const detail = document.createElement('span');
      detail.textContent = hostedVideo.uploadStatus && hostedVideo.uploadStatus !== 'ready'
        ? `Whop status: ${hostedVideo.uploadStatus}`
        : 'Source-quality playback will be attached during import.';
      copy.append(heading, detail);
      media.append(copy);
    }
    const actions = document.createElement('div');
    actions.className = 'post-actions';
    for (const [action, label, className] of [
      ['post-approve', 'Approve', 'approve'],
      ['post-disapprove', 'Disapprove', 'disapprove'],
      ['post-undo', 'Undo', ''],
      ['post-preview', 'Preview links & formatting', ''],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action;
      button.className = className;
      button.textContent = label;
      actions.append(button);
    }
    card.append(header, excerpt, media, diagnostics, actions);
    updatePostCard(card, post);
    return card;
  }

  function updatePostCard(card, post) {
    if (!card || !post) return;
    card.dataset.state = post.decision;
    const pill = $('.state-pill', card);
    if (pill) {
      pill.dataset.state = post.decision;
      pill.textContent = decisionText(post.decision);
    }
    const approve = $('[data-action="post-approve"]', card);
    const disapprove = $('[data-action="post-disapprove"]', card);
    const undo = $('[data-action="post-undo"]', card);
    if (approve) approve.disabled = post.decision === 'approved' || post.decision === 'blocked';
    if (disapprove) disapprove.disabled = post.decision === 'disapproved' || post.decision === 'blocked';
    if (undo) undo.hidden = !['approved', 'disapproved'].includes(post.decision);
  }

  function renderPosts() {
    state.postRenderToken += 1;
    const fragment = document.createDocumentFragment();
    const visibleKeys = state.postOrder.slice(0, state.postRenderLimit);
    for (const key of visibleKeys) {
      const post = state.posts.get(key);
      if (post) fragment.append(createPostCard(post));
    }
    if (visibleKeys.length < state.postOrder.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn ghost post-load-more';
      more.dataset.action = 'post-load-more';
      more.textContent = `Load ${Math.min(POST_PAGE_SIZE, state.postOrder.length - visibleKeys.length)} more · ${state.postOrder.length - visibleKeys.length} remaining`;
      fragment.append(more);
    }
    elements.postList.replaceChildren(fragment);
    syncPostControls();
  }

  function afterLayoutPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  async function decidePosts(keys, decision, button = null) {
    const unique = [...new Set(keys)].filter((key) => state.posts.has(key) && state.posts.get(key).decision !== 'blocked');
    if (!unique.length) return;
    await withButton(button, `${decision === 'approved' ? 'Approving' : decision === 'disapproved' ? 'Disapproving' : 'Resetting'} ${unique.length}…`, async () => {
      await api('post-decision', {
        method: 'POST',
        body: JSON.stringify({ sourceKeys: unique, decision }),
      });
      for (const key of unique) {
        const post = state.posts.get(key);
        post.decision = decision;
        const card = elements.postList.querySelector(`[data-source-key="${CSS.escape(key)}"]`);
        updatePostCard(card, post);
      }
      syncPostControls();
    }).catch((error) => showStatus(error.message, 'error'));
  }

  async function replacePostsForReview(posts) {
    state.posts = new Map();
    state.postOrder = [];
    state.postRenderLimit = POST_PAGE_SIZE;
    const items = Array.isArray(posts) ? posts : [];
    const chunkSize = MOBILE_QUERY.matches ? 40 : 200;
    for (let index = 0; index < items.length; index += chunkSize) {
      for (const post of items.slice(index, index + chunkSize)) {
        state.posts.set(post.sourceKey, post);
        state.postOrder.push(post.sourceKey);
      }
      if (index + chunkSize < items.length) await nextRenderFrame();
    }
  }

  async function scanCurrent(button = null) {
    if (!state.experience?.id) return;
    await withButton(button, 'Scanning current content…', async () => {
      const output = await api('scan', {
        method: 'POST',
        body: JSON.stringify({ experienceId: state.experience.id }),
      });
      state.source = output.source;
      await replacePostsForReview(output.posts || []);
      renderSourceReview();
      elements.postPanel.hidden = false;
      elements.postTitle.textContent = `${state.experience.name || 'Whop source'} · ${typeLabel(output.sourceType)} content`;
      const ready = (output.posts || []).filter((post) => post.integrity?.autoPublishEligible === true).length;
      const manual = (output.posts || []).filter((post) => post.decision !== 'blocked' && post.integrity?.autoPublishEligible !== true).length;
      elements.postSummary.textContent = `${output.counts.total} top-level item${output.counts.total === 1 ? '' : 's'} · ${ready} automatic-ready · ${manual} manual review · replies, junk, and expired picks are blocked.`;
      renderPosts();
      await afterLayoutPaint();
      elements.postPanel.scrollIntoView({ behavior: MOBILE_QUERY.matches ? 'auto' : 'smooth', block: 'start' });
    }).catch((error) => showStatus(error.message, 'error'));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function linkifyPreview(value) {
    const escaped = escapeHtml(value);
    return escaped.replace(/(https?:\/\/[^\s<]+)/gi, (raw) => {
      let target = raw;
      let suffix = '';
      while (/[.,!?;:]$/.test(target)) {
        suffix = target.slice(-1) + suffix;
        target = target.slice(0, -1);
      }
      return `<a href="${target}" target="_blank" rel="noopener noreferrer nofollow">${target}</a>${suffix}`;
    }).replace(/\n/g, '<br>');
  }

  async function openPreview(post) {
    if (!post) return;
    let exact = post;
    if (typeof exact.body !== 'string') {
      const output = await requestJson(`/api/control?action=post-detail&sourceKey=${encodeURIComponent(post.sourceKey)}`, { method: 'GET' });
      exact = { ...post, ...output.post };
      state.posts.set(post.sourceKey, exact);
    }
    state.previewPostKey = exact.sourceKey;
    elements.previewTitle.textContent = exact.title;
    elements.previewMeta.textContent = `${typeLabel(exact.contentType)} · ${exact.author?.username || exact.author?.name || 'No named author'} · ${exact.sourceUpdatedAt ? new Date(exact.sourceUpdatedAt).toLocaleString() : 'Unknown date'}`;
    elements.previewBody.innerHTML = linkifyPreview(exact.body || 'No exact body was returned for this item.');
    elements.preview.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    elements.preview.hidden = true;
    elements.previewBody.replaceChildren();
    document.body.style.overflow = '';
    state.previewPostKey = null;
  }

  function guideListItem(guide) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `draft-item${guide.id === state.selectedGuideId ? ' active' : ''}`;
    button.dataset.action = 'guide-select';
    button.dataset.guideId = String(guide.id);
    button.style.contentVisibility = 'auto';
    button.style.containIntrinsicSize = '1px 70px';
    const strong = document.createElement('strong');
    strong.textContent = guide.title;
    const small = document.createElement('small');
    small.textContent = `${guide.status} · ${guide.categoryLabel}${guide.attachments?.reviewCount ? ` · ${guide.attachments.reviewCount} file review` : ''}`;
    button.append(strong, small);
    return button;
  }

  function filteredGuideIds() {
    const query = elements.draftSearch.value.trim().toLocaleLowerCase('en-US');
    const status = elements.draftStatusFilter.value;
    return state.guideOrder.filter((id) => {
      const guide = state.guides.get(id);
      if (!guide) return false;
      const text = `${guide.title} ${guide.categoryLabel || guide.category}`.toLocaleLowerCase('en-US');
      return (!query || text.includes(query)) && (status === 'all' || guide.status === status);
    });
  }

  function renderGuides({ reset = false } = {}) {
    if (reset) state.guideRenderLimit = GUIDE_PAGE_SIZE;
    const matching = filteredGuideIds();
    const visible = matching.slice(0, state.guideRenderLimit);
    const fragment = document.createDocumentFragment();
    for (const id of visible) {
      const guide = state.guides.get(id);
      if (guide) fragment.append(guideListItem(guide));
    }
    if (visible.length < matching.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn ghost draft-load-more';
      more.dataset.action = 'guide-load-more';
      more.textContent = `Load ${Math.min(GUIDE_PAGE_SIZE, matching.length - visible.length)} more · ${matching.length - visible.length} remaining`;
      fragment.append(more);
    }
    elements.draftList.replaceChildren(fragment);
    if (state.selectedGuideId && !state.guides.has(state.selectedGuideId)) state.selectedGuideId = null;
    if (!state.selectedGuideId) {
      elements.draftEmpty.hidden = false;
      elements.draftEditor.hidden = true;
    }
  }

  function updateGuideListItem(guide) {
    state.guides.set(Number(guide.id), { ...(state.guides.get(Number(guide.id)) || {}), ...guide });
    state.guideDetails.set(Number(guide.id), guide);
    renderGuides();
  }

  function renderGuideEditor(guide, mode = 'select') {
    const guideId = Number(guide?.id);
    if (!Number.isFinite(guideId) || guideId <= 0 || typeof guide?.body !== 'string') return false;
    const previous = elements.draftList.querySelector('.draft-item.active');
    if (previous) previous.classList.remove('active');
    const current = elements.draftList.querySelector(`[data-guide-id="${guide.id}"]`);
    if (current) {
      current.classList.add('active');
      current.removeAttribute('aria-busy');
    }
    state.selectedGuideId = Number(guide.id);
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
    root.dispatchEvent(new CustomEvent('sniperplug:guide-loaded', { detail: { id: guide.id, mode } }));
    return true;
  }

  root.addEventListener('sniperplug:guide-media-repaired', (event) => {
    const guide = event.detail?.guide;
    const guideId = Number(guide?.id);
    if (!Number.isFinite(guideId) || guideId <= 0 || typeof guide?.body !== 'string') return;
    try {
      if (!renderGuideEditor(guide, 'saved')) return;
      updateGuideListItem(guide);
      event.detail.handled = true;
    } catch (error) {
      event.detail.handled = false;
      console.error('SniperPlug could not apply repaired guide state.', error);
    }
  });

  async function selectGuide(id) {
    const requestToken = ++state.guideRequestToken;
    const numericId = Number(id);
    const summary = state.guides.get(numericId);
    if (!summary) return;
    state.selectedGuideId = numericId;
    const previous = elements.draftList.querySelector('.draft-item.active');
    if (previous) previous.classList.remove('active');
    const current = elements.draftList.querySelector(`[data-guide-id="${numericId}"]`);
    if (current) {
      current.classList.add('active');
      current.setAttribute('aria-busy', 'true');
    }
    elements.draftEmpty.hidden = false;
    elements.draftEmpty.innerHTML = '<strong>Loading guide…</strong><p>Fetching the exact content only for this guide.</p>';
    elements.draftEditor.hidden = true;
    try {
      let guide = state.guideDetails.get(numericId);
      if (!guide || guide.updatedAt !== summary.updatedAt) {
        const output = await requestJson(`/api/control?action=guide-detail&id=${encodeURIComponent(numericId)}`, { method: 'GET' });
        guide = output.guide;
        state.guideDetails.set(numericId, guide);
        state.guides.set(numericId, { ...summary, ...guide });
      }
      if (requestToken !== state.guideRequestToken || state.selectedGuideId !== numericId) return;
      renderGuideEditor(guide, 'select');
    } catch (error) {
      if (requestToken !== state.guideRequestToken) return;
      if (current) current.removeAttribute('aria-busy');
      elements.draftEmpty.hidden = false;
      elements.draftEmpty.innerHTML = '<strong>Guide could not load</strong><p>Try again. The rest of the queue remains usable.</p>';
      showStatus(error.message, 'error');
    }
  }

  function filterGuides() {
    renderGuides({ reset: true });
  }

  async function ingestDashboard(data) {
    state.dashboard = data;
    const summaries = data.guides || [];
    state.guides = new Map();
    state.guideOrder = [];
    const chunkSize = MOBILE_QUERY.matches ? 60 : 250;
    for (let index = 0; index < summaries.length; index += chunkSize) {
      for (const summary of summaries.slice(index, index + chunkSize)) {
        const numericId = Number(summary.id);
        const cached = state.guideDetails.get(numericId);
        const guide = cached?.updatedAt === summary.updatedAt ? { ...summary, ...cached } : summary;
        if (cached && cached.updatedAt !== summary.updatedAt) state.guideDetails.delete(numericId);
        state.guides.set(numericId, guide);
        state.guideOrder.push(numericId);
      }
      if (index + chunkSize < summaries.length) await nextRenderFrame();
    }
    unlock();
    renderWhop();
    await nextRenderFrame();
    renderSourceSummary();
    renderCategories();
    await nextRenderFrame();
    renderGuides({ reset: true });
    root.dispatchEvent(new CustomEvent('sniperplug:dashboard-refreshed'));
  }

  async function loadDashboard({ discovery = false } = {}) {
    const data = await api('dashboard', { method: 'GET' });
    await ingestDashboard(data);
    await nextRenderFrame();
    renderDiscovery();
    if (discovery && data.whop?.connected && data.whop?.verified) await loadDiscovery();
    return data;
  }

  async function verifyWhopUntilSettled() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const whop = state.dashboard?.whop || {};
      if (!whop.connected || whop.verified) return whop;
      await wait(700 * (attempt + 1));
      try {
        const data = await loadDashboard({ discovery: false });
        if (data.whop?.verified) {
          elements.discoverySummary.textContent = 'Whop connected. Press Load sources when you are ready.';
          elements.discoveryMessage.textContent = 'Source discovery is manual so the Control Center stays responsive.';
          return data.whop;
        }
      } catch (error) {
        if (!isTransientClientError(error)) throw error;
      }
    }
    return state.dashboard?.whop || {};
  }

  function syncBulkButtons() {
    const active = state.bulkJob?.status === 'active';
    const count = state.selectedSources.size;
    elements.bulkPublish.disabled = state.bulkRunning || active || !elements.bulkRights.checked || count === 0;
    elements.bulkPublish.textContent = active
      ? 'Finish or cancel the active bulk job first'
      : count
        ? `Approve, import & publish ${count} selected source${count === 1 ? '' : 's'}`
        : 'Approve, import & publish selected';
    elements.resumeBulk.disabled = state.bulkRunning;
    elements.cancelBulk.disabled = state.bulkRunning;
    elements.publishAllReady.disabled = state.bulkRunning || active;
  }

  function progressSummary(job) {
    const summary = job?.summary || {};
    const held = Number(summary.heldFiles || 0) + Number(summary.heldLinks || 0) + Number(summary.heldIntegrity || 0) + Number(summary.manualReview || 0) + Number(summary.expired || 0);
    return {
      completed: Number(job?.completedSources || 0),
      total: Number(job?.totalSources || 0),
      percent: Number(job?.percent || 0),
      scanned: Number(summary.scanned || 0),
      published: Number(summary.published || 0),
      held,
    };
  }

  function renderTimeline(job) {
    const entries = [];
    for (const result of job?.results || []) entries.push({ state: 'done', title: result.title || result.experienceId, detail: `${result.published?.published || 0} published · ${result.manualReview || 0} manual · ${result.expired || 0} expired` });
    for (const failure of job?.failures || []) entries.push({ state: 'error', title: failure.experienceId, detail: failure.message });
    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice(-8).reverse()) {
      const item = document.createElement('li');
      item.dataset.state = entry.state;
      const dot = document.createElement('i');
      const title = document.createElement('span');
      title.textContent = entry.title;
      const detail = document.createElement('small');
      detail.textContent = entry.detail;
      item.append(dot, title, detail);
      fragment.append(item);
    }
    elements.progressTimeline.replaceChildren(fragment);
  }

  function renderJob(job) {
    state.bulkJob = job;
    elements.bulkJobPanel.hidden = !job;
    elements.progressVisual.hidden = !job;
    if (!job) {
      syncBulkButtons();
      return;
    }
    const progress = progressSummary(job);
    elements.bulkJobTitle.textContent = job.status === 'active' ? 'Bulk job ready to continue' : job.status === 'completed' ? 'Bulk job completed' : 'Bulk job canceled';
    elements.bulkJobSummary.textContent = `${progress.completed}/${progress.total} sources · ${progress.scanned} scanned · ${progress.published} published · ${progress.held} held safely`;
    elements.resumeBulk.hidden = job.status !== 'active';
    elements.cancelBulk.hidden = job.status !== 'active';
    elements.progressStage.textContent = job.status === 'active'
      ? `Processing source ${Math.min(job.sourceIndex + 1, job.totalSources)} of ${job.totalSources}`
      : job.status === 'completed' ? 'Complete' : 'Canceled';
    elements.progressPercent.textContent = `${progress.percent}%`;
    elements.progressBar.value = progress.percent;
    elements.progressSources.textContent = `${progress.completed}/${progress.total}`;
    elements.progressScanned.textContent = String(progress.scanned);
    elements.progressPublished.textContent = String(progress.published);
    elements.progressHeld.textContent = String(progress.held);
    renderTimeline(job);
    if (job.status === 'active') elements.bulkWorkflow.open = true;
    syncBulkButtons();
  }

  async function runBulkJob(job) {
    if (!job || job.status !== 'active' || state.bulkRunning) return;
    state.bulkRunning = true;
    syncBulkButtons();
    elements.bulkProgress.dataset.state = 'working';
    try {
      let next = job;
      while (next?.status === 'active') {
        renderJob(next);
        elements.bulkProgress.textContent = `Scanning and publishing source ${Math.min(next.sourceIndex + 1, next.totalSources)} of ${next.totalSources}. Progress is saved after every source.`;
        try {
          next = await jobApi({ action: 'step', jobId: next.id });
        } catch (error) {
          if (error.status === 409) {
            await new Promise((resolve) => setTimeout(resolve, 900));
            next = await jobApi();
            continue;
          }
          throw error;
        }
        renderJob(next);
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      elements.bulkProgress.textContent = next?.status === 'completed'
        ? 'Bulk job complete. Only durable guide content was published; replies, junk, expired picks, unresolved files, and unsafe links stayed private.'
        : 'Bulk job canceled. Completed work was preserved and can be reversed below.';
      elements.bulkProgress.dataset.state = next?.status === 'completed' && !next.failures?.length ? 'ok' : 'warning';
      await Promise.all([loadDashboard({ discovery: false }), loadRecentActions()]);
    } catch (error) {
      elements.bulkProgress.textContent = `${error.message} Progress is saved; press Resume when the connection is stable.`;
      elements.bulkProgress.dataset.state = 'error';
      try { renderJob(await jobApi()); } catch { /* retain last state */ }
    } finally {
      state.bulkRunning = false;
      syncBulkButtons();
    }
  }

  async function startBulkJob(button) {
    const ids = [...state.selectedSources];
    if (!ids.length) return showStatus('Select at least one source.', 'warning');
    if (!elements.bulkRights.checked) return showStatus('Confirm republication rights before continuing.', 'warning');
    await withButton(button, 'Creating resumable job…', async () => {
      const job = await jobApi({ action: 'start', sourceIds: ids, rightsConfirmed: true });
      renderJob(job);
      await runBulkJob(job);
    }).catch((error) => {
      elements.bulkProgress.textContent = error.message;
      elements.bulkProgress.dataset.state = 'error';
    });
  }

  async function cancelBulkJob(button) {
    if (!state.bulkJob || state.bulkJob.status !== 'active') return;
    await withButton(button, 'Canceling…', async () => {
      const job = await jobApi({ action: 'cancel', jobId: state.bulkJob.id });
      renderJob(job);
      elements.bulkProgress.textContent = 'Bulk job canceled. Completed actions are still listed in the 48-hour undo panel.';
      elements.bulkProgress.dataset.state = 'warning';
      await loadRecentActions();
    }).catch((error) => showStatus(error.message, 'error'));
  }

  async function loadBulkJob() {
    try {
      const job = await jobApi();
      renderJob(job);
      if (job?.status === 'active') {
        elements.bulkProgress.textContent = 'A resumable bulk job is paused. Press Resume to continue.';
        elements.bulkProgress.dataset.state = 'warning';
      }
    } catch (error) {
      if (error.status !== 401) elements.bulkProgress.textContent = error.message;
    }
  }

  function renderRecentActions() {
    const actions = state.recent?.actions || [];
    const fragment = document.createDocumentFragment();
    for (const action of actions) {
      const row = document.createElement('label');
      row.className = 'recent-action';
      row.dataset.reversible = String(Boolean(action.reversible));
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.action = 'recent-select';
      checkbox.dataset.actionId = action.actionId;
      checkbox.checked = state.recentSelection.has(action.actionId);
      checkbox.disabled = !action.reversible;
      const copy = document.createElement('span');
      copy.className = 'recent-action-copy';
      const title = document.createElement('strong');
      title.textContent = action.title;
      const meta = document.createElement('small');
      meta.textContent = `${action.sourceTitle} · ${action.categoryLabel} · ${action.publishedAt ? new Date(action.publishedAt).toLocaleString() : 'not currently public'}`;
      copy.append(title, meta);
      const status = document.createElement('span');
      status.className = 'recent-action-status';
      status.textContent = action.status === 'rejected' ? 'Rejected · can restore' : action.status === 'published' ? 'Published · can undo' : action.status;
      row.append(checkbox, copy, status);
      fragment.append(row);
    }
    elements.recentList.replaceChildren(fragment);
    if (!actions.length) {
      const empty = document.createElement('p');
      empty.className = 'recent-actions-empty';
      empty.textContent = 'No reversible published or rejected imported guides from the last 48 hours.';
      elements.recentList.append(empty);
    }
    const selected = [...state.recentSelection].filter((id) => actions.some((action) => action.actionId === id && action.reversible)).length;
    elements.undoSelected.disabled = selected === 0;
    elements.undoSelected.textContent = selected ? `Undo ${selected} selected` : 'Undo selected';
    elements.undoAll.disabled = !actions.some((action) => action.reversible);
  }

  async function loadRecentActions() {
    try {
      state.recent = await recentApi();
      const valid = new Set((state.recent.actions || []).filter((action) => action.reversible).map((action) => action.actionId));
      state.recentSelection = new Set([...state.recentSelection].filter((id) => valid.has(id)));
      renderRecentActions();
    } catch (error) {
      if (error.status !== 401) elements.recentStatus.textContent = error.message;
    }
  }

  async function undoActions({ all = false, button = null } = {}) {
    const actionIds = all ? [] : [...state.recentSelection];
    if (!all && !actionIds.length) return;
    if (all && !window.confirm('Restore every reversible published or rejected imported guide from the last 48 hours? They will return to private drafts and any active bulk job will be canceled.')) return;
    await withButton(button, all ? 'Undoing all…' : `Undoing ${actionIds.length}…`, async () => {
      const output = await recentApi({ all, actionIds, cancelActive: all });
      state.recent = output.history;
      state.recentSelection.clear();
      renderRecentActions();
      elements.recentStatus.textContent = `${output.undone} guide${output.undone === 1 ? '' : 's'} returned to private drafts.`;
      elements.recentStatus.dataset.state = 'ok';
      await Promise.all([loadDashboard({ discovery: false }), loadBulkJob()]);
    }).catch((error) => {
      elements.recentStatus.textContent = error.message;
      elements.recentStatus.dataset.state = 'error';
    });
  }

  async function publishAllReady(button) {
    await withButton(button, 'Auditing and publishing…', async () => {
      elements.publishAllProgress.dataset.state = 'working';
      elements.publishAllProgress.textContent = 'Auditing links, integrity, media, and freshness…';
      const result = await publishReady({ allImported: true });
      const held = (result.skippedFiles?.length || 0) + (result.skippedLinks?.length || 0) + (result.skippedIntegrity?.length || 0);
      elements.publishAllProgress.textContent = `${result.published || 0} published · ${held} held safely for review.`;
      elements.publishAllProgress.dataset.state = held ? 'warning' : 'ok';
      await Promise.all([loadDashboard({ discovery: false }), loadRecentActions()]);
    }).catch((error) => {
      elements.publishAllProgress.textContent = error.message;
      elements.publishAllProgress.dataset.state = 'error';
    });
  }

  function openInlineCategory(target) {
    state.categoryTarget = target || 'import';
    elements.inlineCategoryForm.hidden = false;
    elements.inlineCategoryForm.querySelector('input[name="label"]')?.focus();
    elements.inlineCategoryForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeInlineCategory() {
    elements.inlineCategoryForm.hidden = true;
    elements.inlineCategoryForm.reset();
  }

  function syncButtons() {
    syncSourceSelection();
    syncPostControls();
    syncBulkButtons();
  }

  async function initialize() {
    try {
      const session = await api('session', { method: 'GET' });
      if (!session.authenticated) return lock();
      const dashboard = await loadDashboard({ discovery: false });
      const background = [];
      if (dashboard.whop?.verified) {
        elements.discoverySummary.textContent = 'Whop connected. Press Load sources when you are ready.';
        elements.discoveryMessage.textContent = 'Nothing scans automatically on page load.';
      } else if (dashboard.whop?.connected) background.push(verifyWhopUntilSettled());
      await Promise.allSettled(background);
      const params = new URLSearchParams(location.search);
      if (params.get('whop') === 'error') showStatus(params.get('message') || 'Whop login failed.', 'error');
      else if (params.get('whop') === 'connected' && state.dashboard?.whop?.verified) showStatus('Whop connected and verified successfully.');
    } catch (error) {
      if (error.status === 401) {
        lock();
        elements.loginMessage.textContent = 'Your Control Center session expired. Unlock it again.';
        elements.loginMessage.hidden = false;
        return;
      }
      unlock();
      showStatus(isTransientClientError(error)
        ? 'SniperPlug is temporarily retrying its startup services. Your saved data has not been disconnected.'
        : error.message, isTransientClientError(error) ? 'warning' : 'error');
    }
  }

  root.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const button = form.querySelector('button[type="submit"]');
    if (form === elements.loginForm) {
      elements.loginMessage.hidden = true;
      await withButton(button, 'Unlocking…', async () => {
        await api('session', { method: 'POST', body: JSON.stringify({ password: new FormData(form).get('password') }) });
        form.reset();
        const dashboard = await loadDashboard({ discovery: false });
        const background = [];
        if (dashboard.whop?.verified) {
          elements.discoverySummary.textContent = 'Whop connected. Press Load sources when you are ready.';
          elements.discoveryMessage.textContent = 'Nothing scans automatically after unlock.';
        } else if (dashboard.whop?.connected) background.push(verifyWhopUntilSettled());
        await Promise.allSettled(background);
      }).catch((error) => {
        elements.loginMessage.textContent = error.message;
        elements.loginMessage.hidden = false;
      });
      return;
    }
    if (form === elements.sourceForm) {
      await withButton(button, 'Checking source…', async () => {
        await checkSource(new FormData(form).get('source'), { scanIfApproved: false });
        elements.sourceReview.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if (form === elements.inlineCategoryForm || form === elements.categoryForm) {
      const data = new FormData(form);
      await withButton(button, 'Saving category…', async () => {
        const output = await api('category-save', {
          method: 'POST',
          body: JSON.stringify({ label: data.get('label'), description: data.get('description'), sortOrder: data.get('sortOrder') }),
        });
        state.dashboard.categories = output.categories;
        renderCategories();
        if (form === elements.inlineCategoryForm) {
          const select = state.categoryTarget === 'draft' ? elements.draftEditor.elements.category : elements.importCategory;
          select.value = output.category.slug;
          closeInlineCategory();
        } else form.reset();
        showStatus(`Category ${output.category.label} saved.`);
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if (form === elements.draftEditor) {
      const data = new FormData(form);
      await withButton(button, 'Saving draft…', async () => {
        const output = await api('guide-save', {
          method: 'POST',
          body: JSON.stringify({
            id: data.get('id'),
            title: data.get('title'),
            description: data.get('description'),
            category: data.get('category'),
            body: data.get('body'),
            featured: data.get('featured') === 'on',
            attachmentsResolved: data.get('attachmentsResolved') === 'on',
          }),
        });
        updateGuideListItem(output.guide);
        renderGuideEditor(output.guide, 'saved');
        showStatus('Draft saved with exact formatting validation.');
      }).catch((error) => showStatus(error.message, 'error'));
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('[data-action="source-select"]')) {
      const id = target.closest('.discovered-source')?.dataset.experienceId;
      if (id) setSelected([id], target.checked);
    } else if (target === elements.selectDefaults) {
      const ids = (state.discovery?.groups || []).filter((group) => group.builtIn).flatMap((group) => group.sources || []).map(sourceId).filter(Boolean);
      setSelected(ids, target.checked);
    } else if (target === elements.sourceFilter) filterSources();
    else if (target === elements.rights || target === elements.importCategory) syncPostControls();
    else if (target === elements.bulkRights) syncBulkButtons();
    else if (target.matches('[data-action="recent-select"]')) {
      const id = target.dataset.actionId;
      if (target.checked) state.recentSelection.add(id);
      else state.recentSelection.delete(id);
      renderRecentActions();
    } else if (target === elements.draftStatusFilter) filterGuides();
  });

  let searchFrame = 0;
  let draftFrame = 0;
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target === elements.sourceSearch) {
      cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(filterSources);
    } else if (target === elements.draftSearch) {
      cancelAnimationFrame(draftFrame);
      draftFrame = requestAnimationFrame(filterGuides);
    } else if (target === elements.draftEditor?.elements?.body) {
      cancelAnimationFrame(draftFrame);
      draftFrame = requestAnimationFrame(() => { elements.markdownPreview.textContent = target.value; });
    }
  }, { passive: true });

  root.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button,.btn,[data-action]') : null;
    if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-busy') === 'true') return;
    target.dataset.pressed = 'true';
  }, { passive: true, capture: true });
  const releasePressed = (event) => {
    const target = event.target instanceof Element ? event.target.closest('button,.btn,[data-action]') : null;
    if (!target) return;
    requestAnimationFrame(() => { delete target.dataset.pressed; });
  };
  root.addEventListener('pointerup', releasePressed, { passive: true, capture: true });
  root.addEventListener('pointercancel', releasePressed, { passive: true, capture: true });

  root.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest('button,[data-action]');
    const action = button?.dataset?.action;

    if (button === elements.logout) {
      await withButton(button, 'Signing out…', async () => {
        await api('session', { method: 'DELETE', body: '{}' }).catch(() => null);
        lock();
      });
      return;
    }
    if (button === elements.whopSwitch) {
      await withButton(button, 'Preparing account switch…', async () => {
        await requestJson('/api/whop-switch', { method: 'POST', body: '{}' });
        sessionStorage.setItem('sniperplug:whop-switch-ready', '1');
        state.discovery = null;
        state.source = null;
        state.experience = null;
        await loadDashboard({ discovery: false });
        if (elements.whopSwitchHelp) elements.whopSwitchHelp.hidden = false;
        showStatus('Whop disconnected from SniperPlug. Switch accounts on Whop.com, then press Continue with Whop.', 'ok');
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if (button === elements.whopDisconnect) {
      await withButton(button, 'Disconnecting…', async () => {
        await requestJson('/api/whop-disconnect', { method: 'POST', body: '{}' });
        sessionStorage.removeItem('sniperplug:whop-switch-ready');
        state.discovery = null;
        state.source = null;
        state.experience = null;
        await loadDashboard({ discovery: false });
        showStatus('Whop disconnected from SniperPlug.');
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if (button === elements.refreshGroups) {
      await withButton(button, 'Refreshing sources…', () => loadDiscovery({ manual: true }));
      return;
    }
    if (button === elements.approveSelected) return decideSources([...state.selectedSources], 'approved', button);
    if (button === elements.disapproveSelected) return decideSources([...state.selectedSources], 'disapproved', button);
    if (button === elements.clearSelected) return setSelected([...state.selectedSources], false);
    if (button === elements.expandPriority) {
      for (const group of state.discovery?.groups || []) {
        if (!group.builtIn) continue;
        const card = elements.discoveredGroups.querySelector(`[data-group-key="${CSS.escape(groupKey(group))}"]`);
        if (card) setGroupExpanded(group, card, true);
      }
      return;
    }
    if (button === elements.collapseGroups) {
      for (const group of state.discovery?.groups || []) {
        const card = elements.discoveredGroups.querySelector(`[data-group-key="${CSS.escape(groupKey(group))}"]`);
        if (card) setGroupExpanded(group, card, false);
      }
      return;
    }
    if (action === 'source-load-more') {
      const card = button.closest('.discovered-group');
      const group = (state.discovery?.groups || []).find((item) => groupKey(item) === card?.dataset.groupKey);
      if (group && card) renderGroupSources(group, card, { more: true });
      return;
    }
    if (action === 'post-load-more') {
      state.postRenderLimit += POST_PAGE_SIZE;
      renderPosts();
      return;
    }
    if (action?.startsWith('group-')) {
      const card = button.closest('.discovered-group');
      const group = (state.discovery?.groups || []).find((item) => groupKey(item) === card?.dataset.groupKey);
      if (!group) return;
      if (action === 'group-toggle') setGroupExpanded(group, card, card.dataset.collapsed === 'true');
      else setSelected((group.sources || []).map(sourceId).filter(Boolean), action === 'group-select');
      return;
    }
    if (action?.startsWith('source-')) {
      const id = button.closest('.discovered-source')?.dataset.experienceId;
      if (!id) return;
      if (action === 'source-approve') return decideSources([id], 'approved', button);
      if (action === 'source-disapprove') return decideSources([id], 'disapproved', button);
      if (action === 'source-review') {
        await withButton(button, 'Loading…', async () => {
          await checkSource(id, { scanIfApproved: false });
          elements.sourceReview.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch((error) => showStatus(error.message, 'error'));
      }
      return;
    }
    if (button === elements.sourceApprove || button === elements.sourceDisapprove) {
      const decision = button === elements.sourceApprove ? 'approved' : 'disapproved';
      const id = state.experience?.id;
      if (!id) return;
      await decideSources([id], decision, button);
      const saved = (state.dashboard.sources || []).find((item) => item.experienceId === id || item.experience_id === id);
      if (saved) state.source = saved;
      else if (state.source) state.source.decision = decision;
      renderSourceReview();
      if (decision === 'approved') showStatus('Source approved. Press Review content when you are ready to scan it.');
      return;
    }
    if (button === elements.sourceScan) return scanCurrent(button);
    if (action?.startsWith('post-')) {
      const key = button.closest('.post-card')?.dataset.sourceKey;
      const post = state.posts.get(key);
      if (!post) return;
      if (action === 'post-preview') {
        return withButton(button, 'Loading preview…', () => openPreview(post)).catch((error) => showStatus(error.message, 'error'));
      }
      const decision = action === 'post-approve' ? 'approved' : action === 'post-disapprove' ? 'disapproved' : 'pending';
      return decidePosts([key], decision, button);
    }
    if (button === elements.approveAll) return decidePosts([...state.posts.values()].filter((post) => post.decision !== 'blocked' && post.integrity?.autoPublishEligible === true).map((post) => post.sourceKey), 'approved', button);
    if (button === elements.disapproveAll) return decidePosts([...state.posts.values()].filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'disapproved', button);
    if (button === elements.resetAll) return decidePosts([...state.posts.values()].filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'pending', button);
    if (button === elements.importApproved) {
      const sourceKeys = [...state.posts.values()].filter((post) => post.decision === 'approved').map((post) => post.sourceKey);
      await withButton(button, 'Importing drafts…', async () => {
        const auto = elements.importCategory.value === '__auto__';
        const output = await api('import', {
          method: 'POST',
          body: JSON.stringify({
            experienceId: state.experience.id,
            sourceKeys,
            category: auto ? '' : elements.importCategory.value,
            autoCategorize: auto,
            rightsConfirmed: elements.rights.checked,
          }),
        });
        showStatus(`${output.imported} draft${output.imported === 1 ? '' : 's'} imported${output.attachmentReviews ? `; ${output.attachmentReviews} file${output.attachmentReviews === 1 ? '' : 's'} need review` : ''}.`);
        await loadDashboard({ discovery: false });
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if (button?.matches('[data-open-inline-category]')) return openInlineCategory(button.dataset.categoryTarget);
    if (button === elements.cancelInlineCategory) return closeInlineCategory();
    if (action === 'guide-select') return selectGuide(Number(button.dataset.guideId));
    if (action === 'guide-load-more') {
      state.guideRenderLimit += GUIDE_PAGE_SIZE;
      renderGuides();
      return;
    }
    if (button === elements.refresh) {
      await withButton(button, 'Refreshing…', async () => {
        await loadDashboard({ discovery: false });
        showStatus('Control Center refreshed.');
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if ([elements.publishGuide, elements.rejectGuide, elements.returnDraft].includes(button)) {
      const status = button === elements.publishGuide ? 'published' : button === elements.rejectGuide ? 'rejected' : 'draft';
      const id = Number(elements.draftEditor.elements.id.value);
      await withButton(button, status === 'published' ? 'Publishing…' : 'Updating…', async () => {
        const output = await api('guide-status', { method: 'POST', body: JSON.stringify({ id, status }) });
        if (status === 'rejected') {
          state.guides.delete(Number(output.guide.id));
          state.guideDetails.delete(Number(output.guide.id));
          state.guideOrder = state.guideOrder.filter((guideId) => guideId !== Number(output.guide.id));
          state.selectedGuideId = null;
          elements.draftEditor.hidden = true;
          elements.draftEmpty.hidden = false;
          elements.draftEmpty.innerHTML = '<strong>Guide rejected</strong><p>It is private and removed from the normal review queue.</p>';
          renderGuides();
          root.dispatchEvent(new CustomEvent('sniperplug:guide-loaded', { detail: { id: output.guide.id, mode: 'status' } }));
        } else {
          updateGuideListItem(output.guide);
          renderGuideEditor(output.guide, 'status');
        }
        showStatus(status === 'published' ? 'Guide published.' : status === 'rejected' ? 'Guide rejected and kept private.' : 'Guide returned to draft.');
      }).catch((error) => showStatus(error.message, 'error'));
      return;
    }
    if (button === elements.bulkPublish) return startBulkJob(button);
    if (button === elements.resumeBulk) return runBulkJob(state.bulkJob);
    if (button === elements.cancelBulk) return cancelBulkJob(button);
    if (button === elements.publishAllReady) return publishAllReady(button);
    if (button === elements.selectRecent) {
      state.recentSelection = new Set((state.recent?.actions || []).filter((item) => item.reversible).map((item) => item.actionId));
      return renderRecentActions();
    }
    if (button === elements.clearRecent) {
      state.recentSelection.clear();
      return renderRecentActions();
    }
    if (button === elements.undoSelected) return undoActions({ all: false, button });
    if (button === elements.undoAll) return undoActions({ all: true, button });
    if (button?.matches('[data-close-preview]')) return closePreview();
  });

  elements.bulkWorkflow?.addEventListener('toggle', () => {
    if (!elements.bulkWorkflow.open || state.deferredHistoryLoaded) return;
    state.deferredHistoryLoaded = true;
    Promise.allSettled([loadBulkJob(), loadRecentActions()]).catch(() => null);
  });

  elements.preview.addEventListener('click', (event) => {
    if (event.target === elements.preview) closePreview();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.preview.hidden) closePreview();
  });

  initialize();
})();
