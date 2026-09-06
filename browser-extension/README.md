# SniperPlug Better Content Sync

This Manifest V3 extension is SniperPlug's rendered-reader fallback for Whop experiences powered by **Better Content** (and other explicitly approved Content-family readers) when no server-readable contract can provide the page body.

## Security boundary

The extension does **not** request cookie access, read `document.cookie`, inspect Whop local/session storage, forward Whop credentials, or call Whop/Better Content private APIs. It has no `<all_urls>` permission.

It reads and navigates only the rendered HTTPS `*.apps.whop.com` frame the signed-in user can already access. The top-level `whop.com` page supplies browser/tab context and the current `exp_...` identity, but it is never eligible as captured guide content.

Traversal fails closed when a target:

- leaves the exact rendered app origin;
- identifies a different Whop experience;
- falls outside the selected section scope;
- points at auth/account/admin/billing/checkout/support routes; or
- contains credential-like query keys or token-shaped values.

Captured pages still go through SniperPlug's authenticated `/api/browser-capture` endpoint, current Whop access verification, reader/origin verification, formatting/integrity checks, and **private draft/manual review** policy. Published, reviewed, rejected, or removed work is not silently overwritten.

## Capture modes

### Capture all guides

This is the normal sync mode. Open **Hidden Files → Make Money Here** (or the relevant Better Content directory), open the extension, choose a scope, and press **Capture all guides**.

The sync engine:

1. prepares the rendered directory by opening safe `<details>` blocks, using bounded “show/load/read more” controls, scrolling to trigger lazy rendering, waiting for visible images, and reading bounded tab panels;
2. discovers visible same-origin/same-experience page links, including links revealed in safe tab panels;
3. recursively walks directories, categories, subcategories, and guide pages;
4. skips directory/index shells instead of importing them as guides;
5. retries slow/blank navigation up to three times, then records the exact skipped page and continues;
6. persists traversal state and captured pages in extension local storage so Firefox Android tab/browser interruption can resume on the same authorized experience;
7. fingerprints rendered content and compares it with the last successfully imported sync so unchanged pages are skipped while new/changed pages are queued;
8. deduplicates repeat URLs and duplicate rendered content;
9. exposes live discovered/remaining/new/changed/unchanged/duplicate/retry/failure progress in the popup;
10. can stop safely and resume later without discarding already captured pages;
11. optionally hands the changed/new queue to SniperPlug automatically after capture completes, once the republishing-rights checkbox is confirmed.

The extension queue remains bounded at 120 pages / 4 million body characters. The server's stricter 25-page request limit remains unchanged. The SniperPlug relay automatically splits a large queue into safe sequential batches and retries only transient 429/5xx failures.

### Scope

- **Entire experience** follows safe links anywhere under the same `exp_...` experience.
- **This section only** confines traversal to the current rendered path and descendants.

### Capture page

Prepares and captures only the current rendered page. This remains useful for one-off pages and diagnostics.

### Capture as I browse

Passively prepares and captures pages you open manually. It is automatically suspended while Capture all guides is running so a directory shell cannot race the crawler into the queue.

## Change detection

After a complete successful handoff, the extension stores only sanitized page identity, content fingerprint, title, page URL, and import time. No Whop credential is stored. On the next sync:

- a new stable page key is **new**;
- the same page key with a different rendered fingerprint is **changed**;
- the same page key with the same fingerprint is **unchanged** and not re-sent;
- identical rendered content already represented elsewhere in the sync is **duplicate** and not re-sent.

History is committed only after every relay batch succeeds. A failed/partial handoff leaves the queue intact for safe retry.

## Interruption and retry behavior

Traversal state is persisted for up to 24 hours. If Firefox Android kills the tab or the browser is reopened, opening the same authorized Whop experience reattaches the crawler and resumes its saved queue. Explicit **Stop capture-all** preserves progress for manual resume.

A page navigation/render gets at most three bounded retries. Failures are shown in the popup rather than being silently counted as success.

## Extension version awareness

The popup compares the installed manifest version with `https://sniperplug.com/browser-extension-version.json` using the already-approved SniperPlug host permission. This check never contacts Whop and is cached for six hours.

## Android development install

1. Install **Firefox Nightly** on Android.
2. Open `about:config` and set `xpinstall.signatures.required` to `false` for this development build.
3. Open **Settings → About Firefox Nightly** and tap the Firefox logo repeatedly until developer options unlock.
4. Return to Settings and choose **Install Extension from File**.
5. Remove an older development build first, then install the new `.xpi` package.
6. Sign into Whop and unlock `https://sniperplug.com/control-center/` in the same Firefox profile.
7. Open Hidden Files → Make Money Here, open the rendered directory, then use **Capture all guides**.

Normal Firefox release/beta requires Mozilla signing for self-distribution. Samsung Internet does not permit arbitrary development extension sideloading outside its approved extension distribution path.

## Desktop development install

In Chromium:

1. Open the extensions page.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select `browser-extension`.
5. Open Whop and SniperPlug in the same browser profile.

## Host permissions

- `https://whop.com/*`
- `https://*.whop.com/*`
- `https://*.apps.whop.com/*`
- `https://sniperplug.com/*`

Only supported HTTPS `*.apps.whop.com` frames can supply rendered guide captures.
