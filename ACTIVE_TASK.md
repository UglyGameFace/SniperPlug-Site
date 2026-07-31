# Active Task

## Task
Repair and fully audit the Whop importer and owner-only guide workflow in `UglyGameFace/SniperPlug-Site`. The active production target is `SniperPlug.com`, not the separate 420 Lobby Hack site and not the Discord deal-bot repository.

Required path:

Whop OAuth/session → Experience discovery → exact content scan → import → D1 draft → course media/video → owner review → reject/remove → restore or re-import → publish to owner-only guide library → authenticated guide/video access.

## Status
Active. Production routing, owner login, implementation, and the latest full Node 22 build are verified, but do not claim the task complete until the source-access truth repair is production-browser verified, the real content lifecycle can run with current Whop access, browser/isolation regressions pass, and final cleanup is complete.

## Scope
- One visible `Owner access` entry on the SniperPlug homepage.
- Existing Control Center password/session reused; no second credential system.
- Private guide list, guide details, copied media, and course video restricted to `kind=owner`.
- Public navigation, sitemap, crawler metadata, and shared caches must not expose private guides.
- Saved source decisions must never be presented as current readable Whop access.
- Chrome and Samsung Internet behavior must remain responsive and duplicate-safe.

## Confirmed findings
- PR #4 and PR #5 are merged into `main`.
- `https://sniperplug.pages.dev`, deployment previews, the current production deployment URL, and the real `https://sniperplug.com/` domain serve the current homepage.
- A fresh Samsung Internet screenshot on July 31, 2026 shows `sniperplug.com` in the address bar, a visible `Owner access` entry, and no public Guides entry.
- The owner used the existing Control Center password on `SniperPlug.com`; the Control Center opened and exposed `Private guides`.
- Cloudflare dashboard checks confirmed:
  - `sniperplug.com` is Active on the `sniperplug-site` Pages project;
  - the apex CNAME points to `sniperplug.pages.dev` and is proxied;
  - no Page Rules exist;
  - no Cache Rules or Cache Response Rules exist;
  - no zone Worker Routes exist;
  - Trace shows no Snippets or Cloud Connector match and ends with HTTP 200;
  - the current successful production deployment from `main` explicitly lists `sniperplug.com` as its alias.
- The prior old public navigation was a stale custom-domain/browser delivery state rather than a second repository, bad DNS target, Worker route, or cache rule.
- The mobile header uses a horizontally scrollable nav. On Samsung Internet, `Owner access` could previously slide completely off-screen even though it existed in the page source.
- The Control Center dashboard loaded every persisted `whop_sources` decision and labeled 34 old approvals as `approved sources`, while the live Whop membership/member verification correctly returned 0 active groups and 0 readable sources.
- The 34 rows are historical policy decisions, not proof of current access. Source check, scan, import, and bulk processing still perform live Whop retrieval and hold or reject inaccessible items, but the summary copy was misleading.
- Automatically deleting the 34 decisions would destroy useful owner history and create churn if access returns. They must remain saved but be labeled inactive and unusable whenever absent from verified live discovery.
- No `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN` exists in GitHub secrets, so automated Cloudflare configuration inspection remains unavailable.
- Vercel deployment checks are unrelated to the Cloudflare Pages production target and can fail solely because of the Vercel free-plan build limit.

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
- Added a cache-versioned Control Center source-access runtime that captures the saved dashboard decisions and the separately verified `/api/discover` result before rendering the summary.
- The source summary now distinguishes currently accessible approved sources from previous approvals retained as inactive history and states that inaccessible sources cannot be scanned or imported.
- Built-in placeholders, malformed IDs, and duplicate saved rows are excluded from saved-decision totals.
- Applied Control Center no-store/noindex handling to both `/control-center` and `/control-center/` while injecting the new runtime before existing deferred Control Center scripts.
- Added an executable source-access truth regression test to the full Node 22 build chain.
- Made the permanent GitHub Actions workflow publish `ci/sniperplug-node22` as the authoritative build/regression status, independent of unrelated Vercel rate limits.
- Added permanent authorization, media, homepage, recovery, private-guide, mobile Owner-access, and source-access truth audits.

## Validation completed
- Full Node 22 build and regression suite passed after both owner-access merges.
- Anonymous, owner, and customer-session authorization tests passed.
- Existing Whop discovery, import, recovery, concurrency, versioning, course-video, hard-free media, and paid-access regressions passed before the source-summary repair.
- Deployed Cloudflare branch smoke tests verified:
  - visible Owner access;
  - no direct public Guides link;
  - secure POST private-guide lock form with a safe no-JavaScript path;
  - anonymous course-video access points to Owner access rather than Whop reconnect;
  - private guide URLs are absent from the sitemap.
- The real production domain visibly shows `Owner access` with no public Guides link in Samsung Internet.
- Owner login with the existing password opened the production Control Center and exposed the private-library navigation.
- The source-access truth test covers the observed case exactly: 34 saved approvals plus a completed live discovery with zero groups produces 0 current approvals and 34 inactive historical approvals.
- The source-access test also covers mixed live/inactive decisions, pending live sources, duplicate rows, malformed IDs, built-in placeholders, production runtime injection, and protection against legacy summary overwrites.
- Source check/save/scan endpoints require a live Whop session and retrieve the exact experience; bulk processing also retrieves the exact live experience and holds permission/access failures instead of trusting the saved approval alone.
- The latest authoritative GitHub Actions status is `ci/sniperplug-node22: success` on commit `487dddc8037c85f1d2e9592ff201b234899baeea`, confirming the complete Node 22 build and regression suite passed with the source-access truth repair included.
- Temporary preview and Cloudflare API diagnostic workflows were removed after use.
- The challenge-blocked production polling workflow was removed so it cannot create permanent false failures on future commits.

## Current blockers
- Production browser verification is required after the latest Cloudflare deployment. With the current connected account and no readable membership access, the summary must show 0 currently accessible approved sources and identify the 34 previous approvals as inactive history.
- The connected Whop account currently has 0 active groups and 0 readable sources, so a real Course import → video → reject → restore/re-import → private publish lifecycle cannot be completed until the owner account regains access to at least one authorized readable source.

## Required acceptance
- [x] `SniperPlug.com` visibly shows `Owner access` and no public Guides link.
- [x] `Owner access` remains visible in the narrow Samsung Internet header while the remaining navigation can scroll.
- [x] Owner login on `SniperPlug.com` uses the existing Control Center password and opens `Private guides`.
- [ ] Production shows 0 currently accessible approved sources and 34 inactive previous approvals for the current no-access Whop account.
- [ ] Anonymous and customer-importer sessions cannot read a guide, copied media, or course video on production.
- [ ] A real Course flow passes on the production domain: discover → exact lesson import → draft/video open → reject → restore and rejected re-import → private-library publish.
- [ ] Repeat the owner flow in Chrome and Samsung Internet with immediate feedback and no duplicate operation.
- [x] Latest full Node 22 GitHub Actions build passes after the source-access truth repair.
- [ ] Final conflict, obsolete-code, temporary-file, and redundant-path inspection passes.

## Backlog after active-task acceptance
- Newegg/affiliate reviewer readiness: replace or hide all demo deals and sample/replacement instructions.
- Replace retailer-search redirects with exact product/SKU destinations or remove affected cards.
- Finish the privacy policy for analytics, affiliate tracking, cookies, Discord/Whop connections, retention, and deletion.
- Audit every public deal, store, and partner page before applying to Newegg.

## Scope lock
The separate `UglyGameFace/SniperPlug` Discord deal-bot audit remains paused. Do not start the Newegg cleanup or another implementation task until this production owner-access task satisfies its acceptance criteria, unless the user sends the exact FORCE SWITCH instruction.
