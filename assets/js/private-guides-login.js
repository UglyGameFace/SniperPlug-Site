(() => {
  const root = document.querySelector('[data-private-guide-login]');
  const form = root?.querySelector('[data-private-guide-login-form]');
  const message = root?.querySelector('[data-private-guide-login-message]');
  if (!(form instanceof HTMLFormElement) || !(message instanceof HTMLElement)) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const password = String(new FormData(form).get('password') || '');
    message.hidden = true;
    message.textContent = '';

    if (button instanceof HTMLButtonElement) {
      button.dataset.idleLabel = button.textContent || 'Unlock private guides';
      button.textContent = 'Unlocking…';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }

    try {
      const response = await fetch('/api/control?action=session', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!response.ok) throw new Error(data.error || `SniperPlug login failed (${response.status}).`);
      form.reset();
      window.location.reload();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'The private guide library could not be unlocked.';
      message.hidden = false;
      if (button instanceof HTMLButtonElement) {
        button.textContent = button.dataset.idleLabel || 'Unlock private guides';
        button.disabled = false;
        button.removeAttribute('aria-busy');
        delete button.dataset.idleLabel;
      }
    }
  });
})();
