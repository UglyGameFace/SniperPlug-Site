# SniperPlug Better Content Capture

This Manifest V3 extension is the fallback reader for Whop experiences powered by **Better Content** when the app publishes no server-readable OpenAPI or Skills contract.

## Security model

The extension deliberately does **not** request the `cookies` permission, does not read `document.cookie`, does not inspect browser storage for Whop credentials, and never forwards a Whop token to SniperPlug.

It only reads the rendered DOM of an HTTPS `*.apps.whop.com` app frame the owner can already see. The top-level `whop.com` page is used only as browser/tab context so the current `exp_...` identity can be attached to the real Better Content frame; it is never eligible as captured guide content. Captures are queued in extension session storage and then handed to a content script running on `https://sniperplug.com/control-center/`. That SniperPlug-side content script performs normal same-origin POSTs to `/api/browser-capture`, so the existing owner session and connected Whop session remain the authority.

The server then:

1. verifies the Control Center owner session;
2. verifies the connected Whop OAuth session;
3. rejects any browser capture whose rendered page URL is not HTTPS `*.apps.whop.com`;
4. retrieves the exact `exp_...` experience through Whop;
5. requires an authorized rendered-app reader for the exact Whop app/experience;
6. confirms current membership access when Whop exposes the company/product relationship;
7. runs SniperPlug formatting/integrity checks;
8. creates or updates a **private draft only**;
9. never auto-publishes browser-captured content.

Previously reviewed, published, or removed guides are never silently overwritten by a later capture. Old or invalid queued shell captures are discarded rather than handed to SniperPlug.

## Firefox Android frame recovery

The real Better Content app frame is the only capture candidate. Opening the extension verifies a known-good candidate first, then uses Firefox frame inventory to target the exact `*.apps.whop.com` frame when recovery is needed. If the app iframe itself does not expose the `exp_...` ID, the background page uses the current top-level Whop tab URL for that identity while keeping the rendered body tied to the app frame.

This prevents the top-level Whop shell, extension UI text, stale frame records, or a previously queued shell payload from being mistaken for a Better Content guide.

## Capture all guides

Version **0.1.7** adds bounded, rendered-DOM traversal so a Better Content directory can be captured without opening every guide by hand.

1. Open **Hidden Files → Make Money Here** inside Whop in Firefox Nightly and leave the Better Content directory visible.
2. Open the SniperPlug extension.
3. Confirm the card shows the real `*.apps.whop.com` frame and the expected `exp_...` experience.
4. Press **Capture all guides**.
5. Keep the Whop tab open. SniperPlug discovers safe rendered guide links, opens them one at a time inside the same verified app frame, waits for each page to render, captures real guide bodies, deduplicates visited targets, and stops when no safe targets remain.
6. Directory/index shells are skipped instead of becoming fake guides.
7. The popup reports captured, remaining, and discovered counts. Press **Stop capture-all** at any time; pages already queued are kept.
8. Confirm the rights checkbox, then press **Send queued pages to SniperPlug**.
9. Large queues are split into server-safe batches during the same-origin Control Center handoff. The server's existing 25-page request limit and capture-size limits are not weakened.
10. Captured pages appear in the normal private SniperPlug draft/review queue.

Capture-all remains deliberately DOM/navigation driven. It follows only HTTPS links that stay on the same rendered app origin and the same Whop experience when the target exposes an `exp_...` ID. It rejects account, authentication, billing, checkout, admin, support, and other unrelated routes. It does not call Better Content private APIs, scrape Whop credentials, or broaden extension host permissions.

The traversal is bounded to protect Firefox Android and extension session storage. A single run will stop rather than silently discard pages if it reaches the traversal or queue limit.

## Manual capture modes

**Capture page** still captures only the currently rendered guide.

**Capture as I browse** is the old navigation-driven auto-capture mode: you choose pages manually and SniperPlug queues each stable rendered page as you browse. It is separate from **Capture all guides**, which performs the safe link traversal for you.

## Android development install

Firefox for Android supports installing an extension from a local file. The same MV3 package includes both Chromium's service-worker background and Firefox's background-script fallback.

For immediate mobile-only development testing:

1. Install **Firefox Nightly** on Android.
2. Open `about:config` and set `xpinstall.signatures.required` to `false` for this development build.
3. In Firefox Nightly, open **Settings → About Firefox Nightly** and tap the Firefox logo repeatedly until the hidden developer options unlock.
4. Return to Settings and choose **Install Extension from File**.
5. For a clean development upgrade, remove the older SniperPlug Better Content Capture build first, then install the new `.xpi` package.
6. Sign into Whop and unlock `https://sniperplug.com/control-center/` in that same Firefox profile.
7. Open **Hidden Files → Make Money Here**, leave its Better Content directory visible, then open SniperPlug Capture and press **Capture all guides**.

A normal Firefox release/beta build requires Mozilla signing for a self-distributed extension. The Nightly route exists specifically so development testing can stay entirely on Android without waiting for store review.

Samsung Internet still requires third-party extension distribution through Samsung's approved extension program / Galaxy Store, so arbitrary development extensions cannot simply be sideloaded into normal Samsung Internet.

## Desktop development install

In a Chromium desktop browser:

1. Open the browser's extensions page.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select this `browser-extension` directory.
5. Open Whop and SniperPlug in the same browser profile.

## Host permissions

The manifest is intentionally restricted to:

- `https://whop.com/*`
- `https://*.whop.com/*`
- `https://*.apps.whop.com/*`
- `https://sniperplug.com/*`

Only `https://*.apps.whop.com/*` is eligible for rendered guide extraction. There is no `<all_urls>` permission.
