(() => {
  const panel = document.querySelector('[data-bulk-job-panel]');
  const workflow = document.querySelector('[data-bulk-workflow]');
  const status = document.querySelector('[data-bulk-progress]');
  if (!(panel instanceof HTMLElement)) return;

  const row = panel.querySelector('.button-row') || panel;
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

  function render(job) {
    current = job || null;
    control.hidden = !current;
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
