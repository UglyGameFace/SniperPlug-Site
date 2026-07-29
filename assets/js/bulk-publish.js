(() => {
  const root = document.querySelector('[data-control-root]');
  if (!root) return;

  const bulkButton = root.querySelector('[data-bulk-publish]');
  const bulkRights = root.querySelector('[data-bulk-rights]');
  const bulkProgress = root.querySelector('[data-bulk-progress]');
  const publishAllButton = root.querySelector('[data-publish-all-ready]');
  const publishAllProgress = root.querySelector('[data-publish-all-progress]');
  const masterDefaults = root.querySelector('[data-select-defaults]');
  const groupsRoot = root.querySelector('[data-discovered-groups]');
  const jobPanel = root.querySelector('[data-bulk-job-panel]');
  const jobTitle = root.querySelector('[data-bulk-job-title]');
  const jobSummary = root.querySelector('[data-bulk-job-summary]');
  const resumeButton = root.querySelector('[data-resume-bulk-job]');
  const cancelButton = root.querySelector('[data-cancel-bulk-job]');
  if (!bulkButton || !bulkRights || !bulkProgress || !publishAllButton || !publishAllProgress || !groupsRoot || !jobPanel || !resumeButton || !cancelButton) return;

  let running = false;
  let restoringMaster = false;
  let currentJob = null;
  let syncFrame = 0;

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function jobApi(body = null) {
    const response = await fetch('/api/bulk-jobs', {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Bulk job request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data.job || null;
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

  function sourceIdFromCheckbox(checkbox) {
    const direct = String(checkbox?.dataset?.sourceId || '').trim();
    if (/^exp_[A-Za-z0-9_-]+$/.test(direct)) return direct;
    const match = String(checkbox?.closest('.discovered-source')?.textContent || '').match(/\bexp_[A-Za-z0-9_-]+\b/);
    return match?.[0] || '';
  }

  function sourceCheckboxes() {
    return [...groupsRoot.querySelectorAll('.discovered-source input[type="checkbox"]')];
  }

  function selectedSourceIds() {
    return [...new Set(sourceCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map(sourceIdFromCheckbox)
      .filter(Boolean))];
  }

  function priorityCheckboxes() {
    return [...groupsRoot.querySelectorAll('.discovered-group[data-default-group="true"] .discovered-source input[type="checkbox"]')];
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

  function jobSummaryText(job) {
    const summary = job?.summary || {};
    const pieces = [
      `${job?.completedSources || 0}/${job?.totalSources || 0} sources`,
      `${Number(summary.scanned || 0)} items scanned`,
      `${Number(summary.published || 0)} published`,
    ];
    if (Number(summary.mirroredMedia || 0)) pieces.push(`${summary.mirroredMedia} media files copied`);
    if (Number(summary.heldFiles || 0)) pieces.push(`${summary.heldFiles} held for file review`);
    if (Number(summary.heldLinks || 0)) pieces.push(`${summary.heldLinks} held for link replacement`);
    if (Number(summary.heldIntegrity || 0)) pieces.push(`${summary.heldIntegrity} held for integrity review`);
    if (job?.failures?.length) pieces.push(`${job.failures.length} source error${job.failures.length === 1 ? '' : 's'}`);
    return pieces.join(' · ');
  }

  function renderJob(job) {
    currentJob = job;
    const visible = Boolean(job);
    jobPanel.hidden = !visible;
    if (!visible) return;
    jobTitle.textContent = job.status === 'active' ? 'Bulk job paused or running' : job.status === 'completed' ? 'Bulk job completed' : 'Bulk job canceled';
    jobSummary.textContent = jobSummaryText(job);
    resumeButton.hidden = job.status !== 'active';
    cancelButton.hidden = job.status !== 'active';
    resumeButton.disabled = running;
    cancelButton.disabled = running;
  }

  function syncButtonsNow() {
    syncFrame = 0;
    restoreMasterSelectionIfNeeded();
    syncMasterFromChildren();
    const count = selectedSourceIds().length;
    const activeJob = currentJob?.status === 'active';
    bulkButton.disabled = running || activeJob || !bulkRights.checked || count === 0;
    bulkButton.textContent = activeJob
      ? 'Finish or cancel the active bulk job first'
      : count
        ? `Start resumable workflow for ${count} source${count === 1 ? '' : 's'}`
        : 'Start bulk workflow';
    publishAllButton.disabled = running;
    resumeButton.disabled = running;
    cancelButton.disabled = running;
  }

  function scheduleSyncButtons() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(syncButtonsNow);
  }

  function publishSummary(result, prefix = '') {
    const heldForFiles = result.skippedFiles?.length || 0;
    const heldForIntegrity = result.skippedIntegrity?.length || 0;
    const heldForLinks = result.skippedLinks?.length || 0;
    const skippedStatus = result.skippedStatus?.length || 0;
    const alreadyPublished = result.alreadyPublished?.length || 0;
    const pieces = [`${result.published || 0} published`];
    if (heldForFiles) pieces.push(`${heldForFiles} kept as drafts for file review`);
    if (heldForLinks) pieces.push(`${heldForLinks} kept as drafts for Whop-link replacement`);
    if (heldForIntegrity) pieces.push(`${heldForIntegrity} kept as drafts for integrity review`);
    if (skippedStatus) pieces.push(`${skippedStatus} skipped because of status`);
    if (alreadyPublished) pieces.push(`${alreadyPublished} already published`);
    return `${prefix}${pieces.join(' · ')}`;
  }

  async function runJob(job) {
    if (!job || job.status !== 'active' || running) return;
    running = true;
    bulkProgress.dataset.state = 'working';
    renderJob(job);
    scheduleSyncButtons();
    try {
      let next = job;
      while (next?.status === 'active') {
        bulkProgress.textContent = `Processing source ${Math.min(next.sourceIndex + 1, next.totalSources)} of ${next.totalSources}${next.currentSourceId ? ` · ${next.currentSourceId}` : ''}…`;
        try {
          next = await jobApi({ action: 'step', jobId: next.id });
        } catch (error) {
          if (error.status === 409) {
            await sleep(1200);
            next = await jobApi();
            continue;
          }
          throw error;
        }
        renderJob(next);
        await sleep(100);
      }
      bulkProgress.textContent = next?.status === 'completed'
        ? `${jobSummaryText(next)}. Unsafe links or unresolved files stayed private.`
        : 'Bulk job canceled. Completed source work was kept.';
      bulkProgress.dataset.state = next?.status === 'completed' && !next.failures?.length ? 'ok' : 'warning';
      setTimeout(() => window.location.reload(), 1600);
    } catch (error) {
      bulkProgress.textContent = `${error.message} Progress is saved; press Resume when the connection is stable.`;
      bulkProgress.dataset.state = 'error';
      try { renderJob(await jobApi()); } catch { /* keep last known job */ }
    } finally {
      running = false;
      scheduleSyncButtons();
    }
  }

  async function startBulkWorkflow() {
    if (running) return;
    const ids = selectedSourceIds();
    if (!ids.length) {
      bulkProgress.textContent = 'Select at least one source.';
      return;
    }
    if (!bulkRights.checked) {
      bulkProgress.textContent = 'Confirm republication rights before continuing.';
      return;
    }
    bulkProgress.textContent = 'Creating a resumable D1 bulk job…';
    bulkProgress.dataset.state = 'working';
    try {
      const job = await jobApi({ action: 'start', sourceIds: ids, rightsConfirmed: true });
      renderJob(job);
      await runJob(job);
    } catch (error) {
      bulkProgress.textContent = error.message;
      bulkProgress.dataset.state = 'error';
    }
  }

  async function publishAllReadyDrafts() {
    if (running) return;
    running = true;
    scheduleSyncButtons();
    publishAllProgress.dataset.state = 'working';
    publishAllProgress.textContent = 'Auditing links and publishing every ready imported draft…';
    try {
      const result = await publishReady({ allImported: true });
      publishAllProgress.textContent = `${publishSummary(result)}.`;
      publishAllProgress.dataset.state = (result.skippedFiles?.length || result.skippedLinks?.length || result.skippedIntegrity?.length) ? 'warning' : 'ok';
      setTimeout(() => window.location.reload(), 1800);
    } catch (error) {
      publishAllProgress.textContent = error.message;
      publishAllProgress.dataset.state = 'error';
    } finally {
      running = false;
      scheduleSyncButtons();
    }
  }

  async function cancelCurrentJob() {
    if (!currentJob || currentJob.status !== 'active' || running) return;
    running = true;
    scheduleSyncButtons();
    try {
      renderJob(await jobApi({ action: 'cancel', jobId: currentJob.id }));
      bulkProgress.textContent = 'Bulk job canceled. Any completed imports and publications were preserved.';
      bulkProgress.dataset.state = 'warning';
    } catch (error) {
      bulkProgress.textContent = error.message;
      bulkProgress.dataset.state = 'error';
    } finally {
      running = false;
      scheduleSyncButtons();
    }
  }

  async function loadJob() {
    try {
      const job = await jobApi();
      renderJob(job);
      if (job?.status === 'active') {
        bulkProgress.textContent = `${jobSummaryText(job)}. Press Resume to continue.`;
        bulkProgress.dataset.state = 'warning';
      }
    } catch (error) {
      bulkProgress.textContent = error.status === 401 ? '' : error.message;
    } finally {
      scheduleSyncButtons();
    }
  }

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-bulk-rights]')) scheduleSyncButtons();
    if (!window.__sniperplugSelectionBatch && event.target.matches('[data-select-defaults], .discovered-source input[type="checkbox"]')) scheduleSyncButtons();
  });
  root.addEventListener('sniperplug:selection-updated', scheduleSyncButtons);
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-clear-selected], .discovered-group .btn')) scheduleSyncButtons();
  });
  bulkButton.addEventListener('click', startBulkWorkflow);
  resumeButton.addEventListener('click', () => runJob(currentJob));
  cancelButton.addEventListener('click', cancelCurrentJob);
  publishAllButton.addEventListener('click', publishAllReadyDrafts);

  new MutationObserver(scheduleSyncButtons).observe(groupsRoot, { childList: true, subtree: true });
  loadJob();
})();
