import { readAdminSession } from './auth.js';
import { html, HttpError } from './http.js';

function privateGuideLockPage(message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Private Guide Library | SniperPlug</title>
  <meta name="description" content="Owner-only SniperPlug guide library.">
  <meta name="theme-color" content="#0b0f17">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/styles.css">
  <link rel="stylesheet" href="/assets/css/control-center.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="SniperPlug home"><span class="brand-mark">SP</span><span>SniperPlug</span></a>
      <nav class="nav" aria-label="Private guide navigation"><a href="/">Home</a><a href="/deals/">Deals</a><a href="/control-center/">Control Center</a></nav>
    </div>
  </header>
  <main id="main" class="control-shell" data-private-guide-login>
    <section class="control-login container">
      <span class="eyebrow">🔒 Owner-only library</span>
      <h1>Unlock the private guides.</h1>
      <p>${message}</p>
      <form data-private-guide-login-form>
        <label><span>Control Center password</span><input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary" type="submit">Unlock private guides</button>
      </form>
      <p class="control-message" data-private-guide-login-message role="alert" hidden></p>
      <p><a class="btn ghost" href="/control-center/">Open the full Control Center</a></p>
    </section>
  </main>
  <script src="/assets/js/private-guides-login.js" defer></script>
</body>
</html>`;
}

export async function requirePrivateGuideOwner(request, env) {
  const session = await readAdminSession(request, env);
  if (!session) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
  if (session.kind !== 'owner') {
    throw new HttpError(403, 'The private guide library requires the owner Control Center password.');
  }
  return session;
}

export async function privateGuidePageGate(request, env) {
  try {
    await requirePrivateGuideOwner(request, env);
    return null;
  } catch (error) {
    if (!(error instanceof HttpError) || ![401, 403].includes(error.status)) throw error;
    const message = error.status === 403
      ? 'This browser is using a customer importer session. Enter the owner Control Center password to replace it and open the private library.'
      : 'Use the same password you already use for the SniperPlug Control Center. One successful unlock opens both areas for this browser session.';
    return html(privateGuideLockPage(message), error.status, {
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    });
  }
}
