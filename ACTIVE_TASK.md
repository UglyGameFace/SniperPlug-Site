# Active Task

## Task
Repair and fully audit the Whop importer and owner-only guide workflow in `UglyGameFace/SniperPlug-Site`. The active production target is `SniperPlug.com`, not the separate 420 Lobby Hack site and not the Discord deal-bot repository.

Required path:

Whop OAuth/session → Experience discovery → exact content scan → import → D1 draft → course media/video → owner review → reject/remove → restore or re-import → publish to owner-only guide library → authenticated guide/video access.

## Status
Active. Do not claim the production task complete until `SniperPlug.com` itself serves the current Cloudflare Pages production project and the real authenticated owner workflow passes there.

## Scope
- One visible `Owner access` entry on the SniperPlug homepage.
- Existing Control Center password/session reused; no second credential system.
- Private guide list, guide details, copied media, and course video restricted to `kind=owner`.
- Public navigation, sitemap, crawler metadata, and shared caches must not expose private guides.
- Chrome and Samsung Internet behavior must remain responsive and duplicate-safe.

## Confirmed findings
- PR #4 and PR #5 are merged into `main`.
- `https://sniperplug.pages.dev` and the current production deployment URL serve the current homepage with `Owner access` and no direct public Guides link.
- Cloudflare branch previews also serve the protected owner flow correctly.
- Cloudflare dashboard checks confirmed:
  - `sniperplug.com` is Active on the `sniperplug-site` Pages project;
  - the apex CNAME points to `sniperplug.pages.dev` and is proxied;
  - no Page Rules exist;
  - no Cache Rules or Cache Response Rules exist;
  - no zone Worker Routes exist;
  - Trace shows no Snippets or Cloud Connector match and ends with HTTP 200;
  - the current successful production deployment from `main` explicitly lists `sniperplug.com` as its alias.
- A full zone cache purge did not resolve the previously observed old public Guides navigation on the custom domain.
- External diagnostics receive a Cloudflare managed challenge on `SniperPlug.com`, while Pages deployment URLs return the current site normally.
- The mobile header uses a horizontally scrollable nav. On Samsung Internet, `Owner access` could slide completely off-screen even though it existed in the page source.
- No `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN` exists in GitHub secrets, so the repository cannot inspect or change Pages custom domains through the Cloudflare API.
- Vercel deployment checks are unrelated to the Cloudflare Pages production target.

## Implemented changes
- Reused the signed `sniperplug_admin` Control Center session and `/api/control?action=session` login.
- Required owner authorization before guide data, copied R2 media, or Whop/Mux video access.
- Removed direct private-guide links from public navigation, runtime injection, sitemap, and canonical/search metadata.
- Added `Owner access` on the SniperPlug homepage; the protected Control Center contains `Private guides`.
- Added private/no-store and noindex defenses at route, middleware, static-header, and crawler-policy layers.
- Added a dedicated `PrivateGuideAuthError` so missing owner access is not confused with expired Whop authentication.
- Made the private-guide fallback form POST to the existing session endpoint, preventing password leakage into URLs when JavaScript fails.
- Corrected course-video recovery: owner failures point to Owner access; actual Whop authentication failures point to reconnect Whop.
- Pinned `Owner access` inside the mobile horizontal navigation so it cannot scroll off-screen on Samsung Internet or other narrow browsers.
- Added permanent authorization, media, homepage, recovery, private-guide, and mobile Owner-access audits.

## Validation completed
- Full Node 22 build and regression suite passed after both owner-access merges.
- Anonymous, owner, and customer-session authorization tests passed.
- Existing Whop discovery, import, recovery, concurrency, versioning, course-video, hard-free media, and paid-access regressions passed.
- Deployed Cloudflare branch smoke tests verified:
  - visible Owner access;
  - no direct public Guides link;
  - secure POST private-guide lock form with a safe no-JavaScript path;
  - anonymous course-video access points to Owner access rather than Whop reconnect;
  - private guide URLs are absent from the sitemap.
- The mobile Owner-access pin and permanent homepage audit were committed to `main`; deployment verification is pending.
- Temporary preview and Cloudflare API diagnostic workflows were removed after use.
- The challenge-blocked production polling workflow was removed so it cannot create permanent false failures on future commits.

## Current blocker
Obtain a fresh user-browser comparison using the actual `https://sniperplug.com/` address after the cache purge and latest deployment. The screenshots received so far both used the deployment URL, so they prove the deployment is current but do not yet prove the custom-domain alias is current.

## Required acceptance
- `SniperPlug.com` visibly shows `Owner access` and no public Guides link.
- `Owner access` remains visible in the narrow Samsung Internet header while the remaining navigation can scroll.
- Owner login on `SniperPlug.com` uses the existing Control Center password and opens `Private guides`.
- Anonymous and customer-importer sessions cannot read a guide, copied media, or course video.
- A real Course flow passes on the production domain: discover → exact lesson import → draft/video open → reject → restore and rejected re-import → private-library publish.
- Repeat the owner flow in Chrome and Samsung Internet with immediate feedback and no duplicate operation.
- Final conflict, obsolete-code, temporary-file, and redundant-path inspection passes.

## Backlog after active-task acceptance
- Newegg/affiliate reviewer readiness: replace or hide all demo deals and sample/replacement instructions.
- Replace retailer-search redirects with exact product/SKU destinations or remove affected cards.
- Finish the privacy policy for analytics, affiliate tracking, cookies, Discord/Whop connections, retention, and deletion.
- Audit every public deal, store, and partner page before applying to Newegg.

## Scope lock
The separate `UglyGameFace/SniperPlug` Discord deal-bot audit remains paused. Do not start the Newegg cleanup or another implementation task until this production owner-access task satisfies its acceptance criteria, unless the user sends the exact FORCE SWITCH instruction.
