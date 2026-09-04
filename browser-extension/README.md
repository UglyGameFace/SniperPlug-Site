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

## Desktop development install

In a Chromium desktop browser:

1. Open the browser's extensions page.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select this `browser-extension` directory.
5. Open Whop and SniperPlug in the same browser profile.

## Android note

Samsung Internet supports third-party extensions only through Samsung's approved extension program / Galaxy Store distribution, so an arbitrary unpacked MV3 extension cannot simply be sideloaded into the normal Samsung Internet extension list.

For immediate Android development testing, use a browser that can load Manifest V3 extensions, or test the same extension on desktop first. The capture architecture is kept browser-standard so it can later be packaged for Samsung's extension program without changing SniperPlug's server-side capture contract.

## Host permissions

The manifest is intentionally restricted to:

- `https://*.apps.whop.com/*`
- `https://*.whop.com/*`
- `https://sniperplug.com/*`

There is no `<all_urls>` permission.
