# SniperPlug Better Content Capture

This Manifest V3 extension is the fallback reader for Whop experiences powered by **Better Content** when the app publishes no server-readable OpenAPI or Skills contract.

## Security model

The extension deliberately does **not** request the `cookies` permission, does not read `document.cookie`, does not inspect browser storage for Whop credentials, and never forwards a Whop token to SniperPlug.

It only reads the rendered DOM of a Whop app frame the owner can already see. Captures are queued in extension session storage and then handed to a content script running on `https://sniperplug.com/control-center/`. That SniperPlug-side content script performs a normal same-origin POST to `/api/browser-capture`, so the existing owner session and connected Whop session remain the authority.

The server then:

1. verifies the Control Center owner session;
2. verifies the connected Whop OAuth session;
3. retrieves the exact `exp_...` experience through Whop;
4. requires the exact Better Content app ID (`app_zv9yxan92U9fNy`);
5. confirms current membership access when Whop exposes the company/product relationship;
6. runs SniperPlug formatting/integrity checks;
7. creates or updates a **private draft only**;
8. never auto-publishes browser-captured content.

Previously reviewed, published, or removed guides are never silently overwritten by a later capture.

## Capturing Make Money Here

1. Open **Hidden Files → Make Money Here** inside Whop.
2. Open an individual Better Content page.
3. Open the extension.
4. Press **Capture page**, or enable **Auto-capture** and click through the pages you want.
5. The popup shows how many pages are queued.
6. Confirm the rights checkbox.
7. Press **Send queued pages to SniperPlug**.
8. The extension opens/focuses the SniperPlug Control Center and sends the captured pages through the signed-in SniperPlug page.
9. The resulting pages appear in the normal private SniperPlug draft/review queue.

Auto-capture is intentionally navigation-driven. It captures pages as they actually render in the authorized Better Content UI instead of guessing Better Content's private backend endpoints.

## Android development install

Firefox for Android supports installing an extension from a local file. The same MV3 package includes both Chromium's service-worker background and Firefox's background-script fallback.

For immediate mobile-only development testing:

1. Install **Firefox Nightly** on Android.
2. Open `about:config` and set `xpinstall.signatures.required` to `false` for this development build.
3. In Firefox Nightly, open **Settings → About Firefox Nightly** and tap the Firefox logo repeatedly until the hidden developer options unlock.
4. Return to Settings and choose **Install Extension from File**.
5. Select the SniperPlug `.xpi` package.
6. Sign into Whop and unlock `https://sniperplug.com/control-center/` in that same Firefox profile.
7. Open **Hidden Files → Make Money Here**, open one Better Content guide, then use the SniperPlug extension action to capture it.

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

- `https://*.apps.whop.com/*`
- `https://*.whop.com/*`
- `https://sniperplug.com/*`

There is no `<all_urls>` permission.
