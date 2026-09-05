(() => {
  const panel = document.querySelector('[data-bulk-job-panel]');
  const workflow = document.querySelector('[data-bulk-workflow]');
  const status = document.querySelector('[data-bulk-progress]');
  if (!(panel instanceof HTMLElement)) return;

  const row = panel.querySelector('.button-row') || panel;
  const summaryBlock = panel.firstElementChild;

  const outcome = document.createElement('section');
  outcome.className = 'control-status bulk-job-outcome';
  outcome.dataset.bulkJobOutcome = '';
  outcome.setAttribute('role', 'status');
  outcome.setAttribute('aria-live', 'polite');
  outcome.hidden = true;

  const outcomeTitle = document.createElement('strong');
  const outcomeCopy = document.createElement('span');
  const outcomeBreakdown = document.createElement('small');
  outcome.append(outcomeTitle, outcomeCopy, outcomeBreakdown);
  if (summaryBlock instanceof HTMLElement && summaryBlock !== row) summaryBlock.after(outcome);
  else panel.prepend(outcome);

  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'btn ghost';
  control.dataset.bulkReset = '';
  control.hidden = true;
  row.append(control);

  let current = null;
  let busy = false;

  async function request(body = null) {
    const response = await fetch(body ? '/api/bulk-job-reset' : '/api/bulk-jobs', {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Workflow request failed (${response.status}).`);
    return data;
  }

  function issueBreakdown(job) {
    const summary = job?.summary || {};
    const counts = [
      ['source failures', Number(job?.failures?.length || 0)],
      ['item failures', Number(summary.itemFailures || 0)],
      ['files held', Number(summary.heldFiles || 0)],
      ['integrity/policy holds', Number(summary.heldIntegrity || 0)],
      ['link holds', Number(summary.heldLinks || 0)],
      ['permission holds', Number(summary.heldPermissions || 0)],
    ].filter(([, count]) => count > 0);
    return counts.map(([label, count]) => `${count} ${label}`).join(' · ');
  }

  function renderOutcome(job) {
    if (!job || job.status !== 'completed') {
      outcome.hidden = true;
      outcome.removeAttribute('data-state');
      outcomeTitle.textContent = '';
      outcomeCopy.textContent = '';
      outcomeBreakdown.textContent = '';
      return;
    }

    const issueCount = Math.max(0, Number(job.issueCount || 0));
    const hasIssues = job.outcome === 'completed-with-issues' || issueCount > 0;
    outcome.hidden = false;
    outcome.dataset.state = hasIssues ? 'warning' : 'ok';

    if (hasIssues) {
      outcomeTitle.textContent = `Completed with ${issueCount || 'some'} issue${issueCount === 1 ? '' : 's'}.`;
      outcomeCopy.textContent = ' Successful publications remain published. Held or failed items were kept out of the live result and need review; nothing was silently treated as a clean success.';
      outcomeBreakdown.textContent = issueBreakdown(job) || 'Review the held and failed counts above before clearing this finished workflow.';
      return;
    }

    outcomeTitle.textContent = 'Completed successfully.';
    outcomeCopy.textContent = ' Every processed source finished without held or failed items.';
    outcomeBreakdown.textContent = 'The finished workflow can be cleared when you no longer need this completion card.';
  }

  function render(job) {
    current = job || null;
    control.hidden = !current;
    renderOutcome(current);
    if (!current) return;
    const active = current.status === 'active';
    control.textContent = active ? 'Stop current job' : 'Clear finished job';
    control.className = active ? 'decision disapprove' : 'btn ghost';
    control.disabled = busy;
    control.removeAttribute('aria-busy');
  }

  async function refresh() {
    try {
      const data = await request();
      render(data.job || null);
    } catch (error) {
      if (status instanceof HTMLElement) {
        status.textContent = error.message;
        status.dataset.state = 'error';
      }
    }
  }

  control.addEventListener('click', async () => {
    if (!current || busy) return;
    const active = current.status === 'active';
    const message = active
      ? 'Stop this workflow now? Finished publications stay available in undo and recovery history.'
      : 'Clear this finished workflow card and start fresh? Published and removed guides are not deleted.';
    if (!window.confirm(message)) return;

    busy = true;
    control.disabled = true;
    control.setAttribute('aria-busy', 'true');
    control.textContent = active ? 'Stopping…' : 'Clearing…';
    if (status instanceof HTMLElement) {
      status.textContent = active ? 'Stopping the current workflow safely…' : 'Clearing the finished workflow state…';
      status.dataset.state = 'working';
    }

    try {
      await request({ action: active ? 'stop' : 'clear' });
      if (status instanceof HTMLElement) {
        status.textContent = active
          ? 'Workflow stopped. Reloading the server-confirmed canceled state…'
          : 'Finished workflow cleared. Reloading a clean Control Center…';
        status.dataset.state = 'ok';
      }
      window.location.replace(`${window.location.pathname}?fresh=${Date.now()}`);
    } catch (error) {
      if (status instanceof HTMLElement) {
        status.textContent = error.message;
        status.dataset.state = 'error';
      }
      busy = false;
      render(current);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('pageshow', refresh);
  workflow?.addEventListener('toggle', refresh);
  refresh();
})();
