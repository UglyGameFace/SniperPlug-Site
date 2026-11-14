// Same-origin owner login only. The existing Control Center endpoint owns
// passwords, throttling, session cookies, and server-side validation.
const form = document.getElementById('operations-login');
const output = document.getElementById('operations-error');

if (form instanceof HTMLFormElement && output) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const passwordInput = form.querySelector('input[name="password"]');
    if (!(passwordInput instanceof HTMLInputElement) || !passwordInput.value) return;
    if (button) button.disabled = true;
    output.textContent = 'Checking owner access…';
    try {
      const response = await fetch('/api/control?action=session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ password: passwordInput.value }),
      });
      const result = await response.json();
      passwordInput.value = '';
      if (!response.ok || !result.authenticated || result.account?.kind !== 'owner') {
        output.textContent = String(result.error || 'Owner authentication failed.').slice(0, 240);
        return;
      }
      window.location.replace('/operations/');
    } catch {
      passwordInput.value = '';
      output.textContent = 'Sign-in connection unavailable. Try opening the site in your regular browser.';
    } finally {
      if (button) button.disabled = false;
    }
  });
}
