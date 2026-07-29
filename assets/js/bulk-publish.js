(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const bulkButton = root.querySelector('[data-bulk-publish]');
  const bulkRights = root.querySelector('[data-bulk-rights]');
  const bulkProgress = root.querySelector('[data-bulk-progress]');
  const publishAllButton = root.querySelector('[data-publish-all-ready]');
  const publishAllProgress = root.querySelector('[data-publish-all-progress]');
  const masterDefaults = root.querySelector('[data-select-defaults]');
  if (!bulkButton || !bulkRights || !bulkProgress || !publishAllButton || !publishAllProgress) return;

  const MAX_IMPORT_CHUNK = 50;
  let running = false;
  let restoringMaster = false;

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function controlApi(action, body) {
    const response = await fetch(`/api/control?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  async function publishReady(body) {
    const response = await fetch('/api/publish-ready', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Publishing failed (${response.status}).`);
    return data;
  }

  function sourceIdFromCard(card) {
    const match = String(card?.textContent || '').match(/\bexp_[A-Za-z0-9_-]+\b/);
    return match?.[0] || '';
  }

  function sourceCheckboxes() {
    return [...root.querySelectorAll('.discovered-source input[type="checkbox"]')];
  }

  function selectedSourceIds() {
    return [...new Set(sourceCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => sourceIdFromCard(checkbox.closest('.discovered-source')))
      .filter(Boolean))];
  }

  function priorityCheckboxes() {
    return [...root.querySelectorAll('.discovered-group[data-default-group="true"] .discovered-source input[type="checkbox"]')];
  }

  function restoreMasterSelectionIfNeeded() {
    if (restoringMaster || !masterDefaults?.checked) return;
    const priority = priorityCheckboxes();
    if (!priority.length || priority.some((checkbox) => checkbox.checked)) return;
    restoringMaster = true;
    masterDefaults.dispatchEvent(new Event('change', { bubbles: true }));
    queueMicrotask(() => { restoringMaster = false; });
  }

  function syncMasterFromChildren() {
    if (!masterDefaults || restoringMaster) return;
    const priority = priorityCheckboxes();
    if (!priority.length) {
      masterDefaults.checked = false;
      masterDefaults.indeterminate = false;
      return;
    }
    const checked = priority.filter((checkbox) => checkbox.checked).length;
    masterDefaults.checked = checked === priority.length;
    masterDefaults.indeterminate = checked > 0 && checked < priority.length;
  }

  function syncButtons() {
    restoreMasterSelectionIfNeeded();
    syncMasterFromChildren();
    const count = selectedSourceIds().length;
    bulkButton.disabled = running || !bulkRights.checked || count === 0;
    bulkButton.textContent = count
      ? `Approve, import & publish ${count} selected source${count === 1 ? '' : 's'}`
      : 'Approve, import & publish selected';
    publishAllButton.disabled = running;
  }

  function chunks(values, size) {
    const output = [];
    for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
    return output;
  }

  function publishSummary(result, prefix = '') {
    const heldForFiles = result.skippedFiles?.length || 0;
    const heldForIntegrity = result.skippedIntegrity?.length || 0;
    const skippedStatus = result.skippedStatus?.length || 0;
    const alreadyPublished = result.alreadyPublished?.length || 0;
    const pieces = [`${result.published || 0} published`];
    if (heldForFiles) pieces.push(`${heldForFiles} kept as drafts for file review`);
    if (heldForIntegrity) pieces.push(`${heldForIntegrity} kept as drafts for integrity review`);
    if (skippedStatus) pieces.push(`${skippedStatus} skipped because of status`);
    if (alreadyPublished) pieces.push(`${alreadyPublished} already published`);
    return `${prefix}${pieces.join(' · ')}`;
  }

  async function runSource(experienceId, index, total) {
    bulkProgress.textContent = `Source ${index + 1} of ${total}: approving ${experienceId}…`;
    await controlApi('source-decision', { experienceId, decision: 'approved' });

    bulkProgress.textContent = `Source ${index + 1} of ${total}: scanning current content…`;
    const scan = await controlApi('scan', { experienceId });
    const readyKeys = (scan.posts || [])
      .filter((item) => item.decision !== 'blocked')
      .map((item) => item.sourceKey)
      .filter(Boolean);
    if (!readyKeys.length) {
      return { experienceId, category: scan.suggestedCategory || 'general', scanned: scan.posts?.length || 0, approved: 0, guideIds: [], blocked: scan.counts?.blocked || 0 };
    }

    bulkProgress.textContent = `Source ${index + 1} of ${total}: approving ${readyKeys.length} content item${readyKeys.length === 1 ? '' : 's'}…`;
    await controlApi('post-decision', { sourceKeys: readyKeys, decision: 'approved' });

    const guideIds = [];
    let imported = 0;
    let unchanged = 0;
    let attachmentReviews = 0;
    const category = scan.suggestedCategory || 'general';
    const batches = chunks(readyKeys, MAX_IMPORT_CHUNK);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      bulkProgress.textContent = `Source ${index + 1} of ${total}: importing batch ${batchIndex + 1} of ${batches.length} into ${category}…`;
      const output = await controlApi('import', {
        experienceId,
        sourceKeys: batches[batchIndex],
        category,
        rightsConfirmed: true,
      });
      imported += Number(output.imported || 0);
      unchanged += Number(output.unchanged || 0);
      attachmentReviews += Number(output.attachmentReviews || 0);
      for (const result of output.results || []) {
        const guideId = Number(result.guideId);
        if (Number.isFinite(guideId)) guideIds.push(guideId);
      }
    }
    return {
      experienceId,
      category,
      scanned: scan.posts?.length || 0,
      approved: readyKeys.length,
      imported,
      unchanged,
      attachmentReviews,
      guideIds,
      blocked: scan.counts?.blocked || 0,
    };
  }

  async function runBulkWorkflow() {
    if (running) return;
    const experienceIds = selectedSourceIds();
    if (!experienceIds.length) {
      bulkProgress.textContent = 'Select at least one source.';
      return;
    }
    if (!bulkRights.checked) {
      bulkProgress.textContent = 'Confirm republication rights before continuing.';
      return;
    }

    running = true;
    syncButtons();
    bulkProgress.dataset.state = 'working';
    const results = [];
    const failures = [];
    try {
      for (let index = 0; index < experienceIds.length; index += 1) {
        try {
          results.push(await runSource(experienceIds[index], index, experienceIds.length));
        } catch (error) {
          failures.push({ experienceId: experienceIds[index], error: error.message });
        }
        await sleep(150);
      }

      const guideIds = [...new Set(results.flatMap((result) => result.guideIds || []))];
      bulkProgress.textContent = guideIds.length
        ? `Publishing ${guideIds.length} safe imported guide${guideIds.length === 1 ? '' : 's'}…`
        : 'No publishable guides were imported.';
      const published = guideIds.length ? await publishReady({ guideIds }) : { published: 0, skippedFiles: [], skippedIntegrity: [], skippedStatus: [], alreadyPublished: [] };
      const scanned = results.reduce((sum, result) => sum + Number(result.scanned || 0), 0);
      const blocked = results.reduce((sum, result) => sum + Number(result.blocked || 0), 0);
      const prefix = `${experienceIds.length - failures.length}/${experienceIds.length} sources completed · ${scanned} items scanned${blocked ? ` · ${blocked} blocked` : ''} · `;
      bulkProgress.textContent = `${publishSummary(published, prefix)}${failures.length ? ` · ${failures.length} source error${failures.length === 1 ? '' : 's'}` : ''}.`;
      bulkProgress.dataset.state = failures.length ? 'warning' : 'ok';
      setTimeout(() => window.location.reload(), 3500);
    } catch (error) {
      bulkProgress.textContent = error.message;
      bulkProgress.dataset.state = 'error';
    } finally {
      running = false;
      syncButtons();
    }
  }

  async function publishAllReadyDrafts() {
    if (running) return;
    running = true;
    syncButtons();
    publishAllProgress.dataset.state = 'working';
    publishAllProgress.textContent = 'Publishing every ready imported draft…';
    try {
      const result = await publishReady({ allImported: true });
      publishAllProgress.textContent = `${publishSummary(result)}.`;
      publishAllProgress.dataset.state = 'ok';
      setTimeout(() => window.location.reload(), 2500);
    } catch (error) {
      publishAllProgress.textContent = error.message;
      publishAllProgress.dataset.state = 'error';
    } finally {
      running = false;
      syncButtons();
    }
  }

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-bulk-rights], [data-select-defaults], .discovered-source input[type="checkbox"]')) {
      setTimeout(syncButtons, 0);
    }
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-clear-selected], .discovered-group .btn')) setTimeout(syncButtons, 0);
  });
  bulkButton.addEventListener('click', runBulkWorkflow);
  publishAllButton.addEventListener('click', publishAllReadyDrafts);

  const observer = new MutationObserver(() => syncButtons());
  observer.observe(root.querySelector('[data-discovered-groups]') || root, { childList: true, subtree: true });
  syncButtons();
})();
