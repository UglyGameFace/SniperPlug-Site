(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const elements = {
    loginPanel: $('[data-login-panel]'), loginForm: $('[data-login-form]'), loginMessage: $('[data-login-message]'),
    app: $('[data-control-app]'), logout: $('[data-logout]'), globalStatus: $('[data-global-status]'),
    whopState: $('[data-whop-state]'), whopConnect: $('[data-whop-connect]'), whopDisconnect: $('[data-whop-disconnect]'),
    sourceOptions: $('[data-source-options]'), sourceForm: $('[data-source-form]'), sourceReview: $('[data-source-review]'),
    sourceTitle: $('[data-source-title]'), sourceDetail: $('[data-source-detail]'), sourceState: $('[data-source-state]'),
    sourceApprove: $('[data-source-approve]'), sourceDisapprove: $('[data-source-disapprove]'),
    postPanel: $('[data-post-panel]'), postTitle: $('[data-post-title]'), postSummary: $('[data-post-summary]'), postList: $('[data-post-list]'),
    approveAll: $('[data-approve-all]'), disapproveAll: $('[data-disapprove-all]'), resetAll: $('[data-reset-all]'),
    countApproved: $('[data-count-approved]'), countDisapproved: $('[data-count-disapproved]'), countPending: $('[data-count-pending]'), countBlocked: $('[data-count-blocked]'),
    importCategory: $('[data-import-category]'), rights: $('[data-rights-confirm]'), importApproved: $('[data-import-approved]'),
    categoryForm: $('[data-category-form]'), categoryList: $('[data-category-list]'), refresh: $('[data-refresh-dashboard]'),
    draftList: $('[data-draft-list]'), draftEmpty: $('[data-draft-empty]'), draftEditor: $('[data-draft-editor]'), editorStatus: $('[data-editor-status]'),
    editorHeading: $('[data-editor-heading]'), openPublic: $('[data-open-public]'), attachmentResolution: $('[data-attachment-resolution]'), markdownPreview: $('[data-markdown-preview]'),
    publishGuide: $('[data-publish-guide]'), rejectGuide: $('[data-reject-guide]'), returnDraft: $('[data-return-draft]'),
    preview: $('[data-post-preview]'), previewTitle: $('[data-preview-title]'), previewMeta: $('[data-preview-meta]'), previewBody: $('[data-preview-body]'),
  };
  const state = { dashboard: null, sourceInput: '', source: null, experience: null, posts: [], selectedGuideId: null, busy: false };

  async function api(action, options = {}) {
    const response = await fetch(`/api/control?action=${encodeURIComponent(action)}`, {
      credentials: 'same-origin', ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function showStatus(message, type = 'ok') {
    elements.globalStatus.textContent = message; elements.globalStatus.dataset.type = type; elements.globalStatus.hidden = false;
  }
  function clearStatus() { elements.globalStatus.hidden = true; elements.globalStatus.textContent = ''; delete elements.globalStatus.dataset.type; }
  function lock() { elements.loginPanel.hidden = false; elements.app.hidden = true; state.dashboard = null; }
  function unlock() { elements.loginPanel.hidden = true; elements.app.hidden = false; }
  function setBusy(value) { state.busy = value; updateImportButton(); }
  function sourceLabel(source) { return source?.label || state.experience?.company?.title || state.experience?.name || 'Whop group'; }
  function decisionText(decision) { return decision === 'approved' ? 'Approved' : decision === 'disapproved' ? 'Disapproved' : decision === 'blocked' ? 'Blocked' : 'Needs decision'; }

  function renderWhop() {
    const connected = Boolean(state.dashboard?.whop?.connected);
    elements.whopState.dataset.state = connected ? 'connected' : 'disconnected';
    elements.whopState.textContent = connected ? 'Connected' : 'Not connected';
    elements.whopConnect.hidden = connected;
    elements.whopDisconnect.hidden = !connected;
    elements.sourceForm.querySelector('button').disabled = !connected || state.busy;
  }
  function renderSources() {
    elements.sourceOptions.replaceChildren();
    for (const source of state.dashboard?.sources || []) {
      const chip = document.createElement('span'); chip.className = 'source-chip'; chip.dataset.state = source.decision || 'pending';
      const strong = document.createElement('strong'); strong.textContent = source.label;
      const small = document.createElement('small'); small.textContent = decisionText(source.decision);
      chip.append(strong, small); elements.sourceOptions.append(chip);
    }
  }
  function activeCategories() { return (state.dashboard?.categories || []).filter((category) => Number(category.active) === 1); }
  function renderCategories() {
    elements.categoryList.replaceChildren();
    for (const category of state.dashboard?.categories || []) {
      const chip = document.createElement('span'); chip.className = 'category-chip';
      const strong = document.createElement('strong'); strong.textContent = category.label;
      const small = document.createElement('small'); small.textContent = Number(category.active) === 1 ? category.slug : `${category.slug} · hidden`;
      chip.append(strong, small); elements.categoryList.append(chip);
    }
    const selects = [elements.importCategory, elements.draftEditor?.elements?.category].filter(Boolean);
    for (const select of selects) {
      const previous = select.value; select.replaceChildren();
      for (const category of activeCategories()) {
        const option = document.createElement('option'); option.value = category.slug; option.textContent = category.label; select.append(option);
      }
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    }
  }
  function renderSourceReview() {
    if (!state.source || !state.experience) { elements.sourceReview.hidden = true; return; }
    elements.sourceReview.hidden = false;
    elements.sourceTitle.textContent = sourceLabel(state.source);
    elements.sourceState.dataset.state = state.source.decision || 'pending';
    elements.sourceState.textContent = decisionText(state.source.decision);
    elements.sourceDetail.textContent = state.source.decision === 'approved'
      ? 'This exact experience ID can be scanned and imported.'
      : state.source.decision === 'disapproved'
        ? 'This exact experience ID is blocked until you approve it again.'
        : `${state.source.suggested ? `Recognized as ${state.source.builtInLabel}. ` : ''}Approve or disapprove this exact source.`;
    elements.sourceApprove.disabled = state.busy || state.source.decision === 'approved';
    elements.sourceDisapprove.disabled = state.busy || state.source.decision === 'disapproved';
  }
  function postCounts() {
    const counts = { approved: 0, disapproved: 0, pending: 0, blocked: 0 };
    for (const post of state.posts) counts[post.decision] = (counts[post.decision] || 0) + 1;
    return counts;
  }
  function updateImportButton() {
    const counts = postCounts();
    elements.countApproved.textContent = counts.approved; elements.countDisapproved.textContent = counts.disapproved;
    elements.countPending.textContent = counts.pending; elements.countBlocked.textContent = counts.blocked;
    elements.importApproved.disabled = state.busy || !counts.approved || !elements.rights.checked || !elements.importCategory.value;
    elements.importApproved.textContent = counts.approved ? `Import ${counts.approved} approved draft${counts.approved === 1 ? '' : 's'}` : 'Import approved drafts';
  }
  function createDecisionButton(label, className, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.addEventListener('click', handler); return button;
  }
  function openPreview(post) {
    elements.previewTitle.textContent = post.title; elements.previewMeta.textContent = `${post.author?.username || post.author?.name || 'Unknown author'} · ${post.sourceUpdatedAt ? new Date(post.sourceUpdatedAt).toLocaleString() : 'Unknown date'}`;
    elements.previewBody.textContent = post.body || 'The exact body is loaded again during import. Scan metadata is shown here.';
    elements.preview.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closePreview() { elements.preview.hidden = true; document.body.style.overflow = ''; }
  async function decidePosts(sourceKeys, decision) {
    setBusy(true);
    try {
      await api('post-decision', { method: 'POST', body: JSON.stringify({ sourceKeys, decision }) });
      const keys = new Set(sourceKeys); state.posts = state.posts.map((post) => keys.has(post.sourceKey) && post.decision !== 'blocked' ? { ...post, decision } : post); renderPosts();
    } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); }
  }
  function renderPosts() {
    elements.postList.replaceChildren();
    for (const post of state.posts) {
      const card = document.createElement('article'); card.className = 'post-card'; card.dataset.state = post.decision;
      const header = document.createElement('header'); const copy = document.createElement('div'); const title = document.createElement('h3'); title.textContent = post.title;
      const meta = document.createElement('small'); meta.textContent = `${post.author?.username || post.author?.name || 'Unknown author'}${post.sourceUpdatedAt ? ` · ${new Date(post.sourceUpdatedAt).toLocaleDateString()}` : ''}`;
      copy.append(title, meta); const pill = document.createElement('strong'); pill.className = 'state-pill'; pill.dataset.state = post.decision; pill.textContent = decisionText(post.decision); header.append(copy, pill);
      const excerpt = document.createElement('p'); excerpt.textContent = post.integrity?.blocked ? post.integrity.error : post.excerpt || 'No preview text.';
      const diagnostics = document.createElement('div'); diagnostics.className = 'post-diagnostics'; diagnostics.textContent = post.integrity?.blocked ? `Blocked · ${post.integrity.code || 'format error'}` : `${post.integrity?.structure?.lines || 0} lines · ${(post.attachments || []).length} attachment${(post.attachments || []).length === 1 ? '' : 's'} · exact formatting checked`;
      const actions = document.createElement('div'); actions.className = 'post-actions';
      const approve = createDecisionButton('Approve', 'approve', () => decidePosts([post.sourceKey], 'approved')); approve.disabled = post.decision === 'approved' || post.decision === 'blocked';
      const disapprove = createDecisionButton('Disapprove', 'disapprove', () => decidePosts([post.sourceKey], 'disapproved')); disapprove.disabled = post.decision === 'disapproved' || post.decision === 'blocked';
      const undo = createDecisionButton('Undo', '', () => decidePosts([post.sourceKey], 'pending')); undo.hidden = !['approved', 'disapproved'].includes(post.decision);
      const preview = createDecisionButton('Preview', '', () => openPreview(post)); actions.append(approve, disapprove, undo, preview);
      card.append(header, excerpt, diagnostics, actions); elements.postList.append(card);
    }
    updateImportButton();
  }
  function renderGuides() {
    elements.draftList.replaceChildren();
    const guides = state.dashboard?.guides || [];
    for (const guide of guides) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `draft-item${guide.id === state.selectedGuideId ? ' active' : ''}`;
      const strong = document.createElement('strong'); strong.textContent = guide.title; const small = document.createElement('small'); small.textContent = `${guide.status} · ${guide.categoryLabel}${guide.attachments?.reviewCount ? ` · ${guide.attachments.reviewCount} file review` : ''}`;
      button.append(strong, small); button.addEventListener('click', () => selectGuide(guide.id)); elements.draftList.append(button);
    }
    if (state.selectedGuideId && !guides.some((guide) => guide.id === state.selectedGuideId)) state.selectedGuideId = null;
    if (!state.selectedGuideId) { elements.draftEmpty.hidden = false; elements.draftEditor.hidden = true; }
  }
  function selectGuide(id) {
    const guide = (state.dashboard?.guides || []).find((item) => item.id === id); if (!guide) return;
    state.selectedGuideId = id; renderGuides(); elements.draftEmpty.hidden = true; elements.draftEditor.hidden = false;
    const fields = elements.draftEditor.elements; fields.id.value = guide.id; fields.title.value = guide.title; fields.description.value = guide.description; fields.category.value = guide.category; fields.body.value = guide.body; fields.featured.checked = guide.featured; fields.attachmentsResolved.checked = false;
    elements.editorStatus.textContent = guide.status; elements.editorHeading.textContent = guide.title; elements.markdownPreview.textContent = guide.body;
    const reviewCount = Number(guide.attachments?.reviewCount || 0); elements.attachmentResolution.hidden = reviewCount === 0;
    elements.openPublic.hidden = guide.status !== 'published'; elements.openPublic.href = `/guides/${encodeURIComponent(guide.slug)}/`;
    elements.publishGuide.disabled = guide.status === 'published' || reviewCount > 0; elements.rejectGuide.disabled = guide.status === 'rejected'; elements.returnDraft.disabled = guide.status === 'draft';
  }
  function renderDashboard() { unlock(); renderWhop(); renderSources(); renderCategories(); renderGuides(); }
  async function loadDashboard() {
    const data = await api('dashboard', { method: 'GET', headers: {} }); state.dashboard = data; renderDashboard();
  }
  async function initialize() {
    try {
      const session = await api('session', { method: 'GET', headers: {} });
      if (!session.authenticated) { lock(); return; }
      await loadDashboard();
      const params = new URLSearchParams(location.search); if (params.get('whop') === 'error') showStatus(params.get('message') || 'Whop login failed.', 'error'); else if (params.get('whop') === 'connected') showStatus('Whop connected successfully.');
    } catch (error) { lock(); elements.loginMessage.textContent = error.message; elements.loginMessage.hidden = false; }
  }
  elements.loginForm.addEventListener('submit', async (event) => { event.preventDefault(); const button = $('button[type="submit"]', elements.loginForm); button.disabled = true; elements.loginMessage.hidden = true; try { await api('session', { method: 'POST', body: JSON.stringify({ password: new FormData(elements.loginForm).get('password') }) }); elements.loginForm.reset(); await loadDashboard(); } catch (error) { elements.loginMessage.textContent = error.message; elements.loginMessage.hidden = false; } finally { button.disabled = false; } });
  elements.logout.addEventListener('click', async () => { try { await api('session', { method: 'DELETE', body: '{}' }); } finally { lock(); } });
  elements.whopDisconnect.addEventListener('click', async () => { setBusy(true); try { await api('whop-disconnect', { method: 'DELETE', body: '{}' }); await loadDashboard(); showStatus('Whop disconnected.'); } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); } });
  elements.sourceForm.addEventListener('submit', async (event) => { event.preventDefault(); state.sourceInput = String(new FormData(elements.sourceForm).get('source') || '').trim(); setBusy(true); clearStatus(); try { const output = await api('source-check', { method: 'POST', body: JSON.stringify({ source: state.sourceInput }) }); state.source = output.source; state.experience = output.experience; state.dashboard.sources = output.sources; renderSources(); renderSourceReview(); elements.postPanel.hidden = true; } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); renderSourceReview(); } });
  async function decideSource(decision) { setBusy(true); try { const output = await api('source-decision', { method: 'POST', body: JSON.stringify({ source: state.sourceInput || state.experience?.id, decision }) }); state.source = output.source; state.dashboard.sources = output.sources; renderSources(); renderSourceReview(); if (decision === 'approved') await scanCurrent(); else elements.postPanel.hidden = true; showStatus(`${sourceLabel(state.source)} ${decision}.`, decision === 'approved' ? 'ok' : 'warning'); } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); renderSourceReview(); } }
  elements.sourceApprove.addEventListener('click', () => decideSource('approved')); elements.sourceDisapprove.addEventListener('click', () => decideSource('disapproved'));
  async function scanCurrent() { const output = await api('scan', { method: 'POST', body: JSON.stringify({ experienceId: state.experience.id }) }); state.posts = output.posts; state.source = output.source; elements.postPanel.hidden = false; elements.postTitle.textContent = `${sourceLabel(state.source)} posts`; elements.postSummary.textContent = `${output.counts.total} top-level posts · approve only what should become a private SniperPlug draft.`; renderPosts(); }
  elements.approveAll.addEventListener('click', () => decidePosts(state.posts.filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'approved')); elements.disapproveAll.addEventListener('click', () => decidePosts(state.posts.filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'disapproved')); elements.resetAll.addEventListener('click', () => decidePosts(state.posts.filter((post) => post.decision !== 'blocked').map((post) => post.sourceKey), 'pending'));
  elements.rights.addEventListener('change', updateImportButton); elements.importCategory.addEventListener('change', updateImportButton);
  elements.importApproved.addEventListener('click', async () => { const sourceKeys = state.posts.filter((post) => post.decision === 'approved').map((post) => post.sourceKey); setBusy(true); try { const output = await api('import', { method: 'POST', body: JSON.stringify({ experienceId: state.experience.id, sourceKeys, category: elements.importCategory.value, rightsConfirmed: elements.rights.checked }) }); showStatus(`${output.imported} draft${output.imported === 1 ? '' : 's'} imported${output.attachmentReviews ? `; ${output.attachmentReviews} attachment${output.attachmentReviews === 1 ? '' : 's'} need review` : ''}.`); await loadDashboard(); } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); } });
  elements.categoryForm.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(elements.categoryForm); setBusy(true); try { const output = await api('category-save', { method: 'POST', body: JSON.stringify({ label: form.get('label'), description: form.get('description'), sortOrder: form.get('sortOrder') }) }); state.dashboard.categories = output.categories; renderCategories(); elements.categoryForm.reset(); showStatus(`Category ${output.category.label} saved.`); } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); } });
  elements.refresh.addEventListener('click', () => loadDashboard().then(() => showStatus('Control Center refreshed.')).catch((error) => showStatus(error.message, 'error')));
  elements.draftEditor.addEventListener('input', () => { elements.markdownPreview.textContent = elements.draftEditor.elements.body.value; });
  elements.draftEditor.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(elements.draftEditor); setBusy(true); try { const output = await api('guide-save', { method: 'POST', body: JSON.stringify({ id: form.get('id'), title: form.get('title'), description: form.get('description'), category: form.get('category'), body: form.get('body'), featured: form.get('featured') === 'on', attachmentsResolved: form.get('attachmentsResolved') === 'on' }) }); const index = state.dashboard.guides.findIndex((guide) => guide.id === output.guide.id); state.dashboard.guides[index] = output.guide; renderGuides(); selectGuide(output.guide.id); showStatus('Draft saved with exact formatting validation.'); } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); } });
  async function changeGuideStatus(status) { const id = Number(elements.draftEditor.elements.id.value); setBusy(true); try { const output = await api('guide-status', { method: 'POST', body: JSON.stringify({ id, status }) }); const index = state.dashboard.guides.findIndex((guide) => guide.id === output.guide.id); state.dashboard.guides[index] = output.guide; renderGuides(); selectGuide(output.guide.id); showStatus(status === 'published' ? 'Guide published.' : status === 'rejected' ? 'Guide rejected and kept private.' : 'Guide returned to draft.'); } catch (error) { showStatus(error.message, 'error'); } finally { setBusy(false); } }
  elements.publishGuide.addEventListener('click', () => changeGuideStatus('published')); elements.rejectGuide.addEventListener('click', () => changeGuideStatus('rejected')); elements.returnDraft.addEventListener('click', () => changeGuideStatus('draft'));
  document.querySelectorAll('[data-close-preview]').forEach((button) => button.addEventListener('click', closePreview)); elements.preview.addEventListener('click', (event) => { if (event.target === elements.preview) closePreview(); }); document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.preview.hidden) closePreview(); });
  initialize();
})();
