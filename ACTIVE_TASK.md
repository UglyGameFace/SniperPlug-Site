# Active Task

## Task
Repair and fully audit the Whop importer workflow in `UglyGameFace/SniperPlug-Site` only. Do not continue work in the separate Discord deal-bot repository during this task.

The required end-to-end path is:

Whop OAuth/session → Experience discovery → app/type routing → exact content scan → source/item decisions → import → D1 draft → course media/video enhancement → owner review → reject/remove → restore or re-import → publish to the owner-only private guide library → authenticated guide/video access.

The frontend scope includes the complete Control Center, async feedback, duplicate-submit prevention, rendering, caching, Samsung Internet compatibility, truthful recovery state, and owner-only access to imported guide content.

## Status
Active. No merge or completion claim until the real authenticated workflow passes. Static source-string checks and a green syntax build are not acceptance.

## Confirmed findings
- Whop navigation tiles are Experiences backed by apps. Discovery must remain Experience-first and route by actual app/type capability.
- The current test suite relies heavily on source-string assertions and does not prove browser → API → D1 → Whop state transitions.
- Rejected imports disappear from the normal guide queue, making recovery a separate lifecycle that must be explicit and reliable.
- The newly added recovery endpoint is not yet truly atomic: it approves source/item policy before the rebuild is proven successful.
- Import and course-media enhancement occur as separate write phases, so a guide can be rebuilt while media enhancement fails afterward.
- Published course-video playback depends on a usable owner Whop OAuth session and a fresh Whop lesson read.
- Static rendition probing can add excessive latency before adaptive playback fallback.
- Samsung Internet has shown stale immutable assets, delayed tap feedback, and rendering problems around `content-visibility`.
- Site middleware does not validate the complete Whop OAuth configuration up front.
- The branch contains many accumulated changes; duplicate, superseded, and contradictory paths require full caller inspection before cleanup.
- The guide index and guide detail routes were publicly readable and publicly cacheable.
- Copied guide media used immutable public edge caching, and published course videos could be opened without the owner Control Center session.
- The public sitemap, homepage navigation, and browser runtime exposed the guide library to visitors and reviewers.
- Customer Whop-importer sessions share the same cookie format, so guide authorization must require `kind=owner` rather than accepting any authenticated session.

## Current private-guide subtask
- Reuse the existing signed `sniperplug_admin` session and `/api/control?action=session` login instead of creating a second password or cookie.
- Require an owner session before reading guide lists, guide details, copied media, or course videos.
- Deny customer and customer-pending importer sessions from the owner guide library.
- Remove guide URLs from public navigation and the sitemap.
- Force guide pages and media to `private, no-store` with `noindex, nofollow,noarchive` at route, middleware, static-header, and crawler-policy layers.
- Keep internal `published` lifecycle state for review/recovery compatibility while explaining in the Control Center that it means available only inside the private owner library.
- Preserve authenticated internal media caching for the hard-free R2 budget while ensuring authentication runs before cache lookup and browser responses never expose public cache headers.
- Add executable owner/customer/anonymous session tests and permanent source audits.

## Private-guide implementation record
- Added one shared owner gate backed by the existing Control Center cookie and password endpoint.
- Gated guide index/detail reads before D1 access.
- Gated copied R2 media and Whop/Mux course-video routes before cache or origin access.
- Removed public guide links from the homepage, browser navigation injection, sitemap, and search metadata.
- Added no-store/noindex defenses in route responses, middleware, `_headers`, and `robots.txt`.
- Updated Control Center language so guide publishing cannot be mistaken for public website publication.
- Added permanent auth/isolation audits and updated the media free-tier regression test for authenticated cache behavior.

## Validation completed for the private-guide subtask
- Full Node 22 `npm run build` and regression suite passed on the final cleaned branch head.
- Anonymous, owner, and customer-session authorization tests passed.
- Existing Whop discovery, import, recovery, concurrency, versioning, media-limit, course-video, and paid-access regressions passed.
- A temporary GitHub Actions smoke test ran against the deployed Cloudflare branch preview and passed: anonymous guide pages returned the lock page, copied media and course videos returned 401, the homepage exposed no guide link, and the sitemap contained no guide URLs.
- The temporary smoke-test workflow was removed after validation.
- Cloudflare Pages successfully deployed the cleaned branch head.
- Pull request conflict inspection reports the branch mergeable and based directly on current `main` with no behind commits at the last comparison.

## Remaining blocker before merge
- Run the real authenticated owner workflow on the Cloudflare preview with the actual Control Center password and live Whop data.
- Complete Course discovery → exact lesson import → draft/video open → reject → restore and rejected re-import → owner-library publish.
- Repeat the interaction flow in Chrome and Samsung Internet and confirm immediate feedback with no duplicate operation.

## Audit and repair order
1. Runtime/deployment configuration, OAuth requirements, D1/R2 bindings, routes, and migrations.
2. Whop session lifecycle, Experience discovery, app/type resolution, permissions, pagination, retries, and capability caching.
3. Content scan and exact-item retrieval for Course, Forum, Chat, and unsupported/custom apps.
4. Source/item decision lifecycle and import idempotency.
5. D1 guide lifecycle: draft, published, rejected, restored, re-imported, quarantined, and deduplicated states.
6. Course video/media registration, playback, download behavior, stale records, and failure recovery.
7. Owner-only guide access, authorization, reconciliation, search/detail routes, copied media, and course-video isolation.
8. Control Center event delegation, busy state, progress, retry, stale caches, Samsung Internet, and accessibility.
9. Replace static-only checks with executable D1/API state-transition tests and browser workflow coverage.
10. Remove verified duplicate, obsolete, temporary, and conflicting Whop-importer code only after caller/reference validation.

## Required acceptance
- Connect Whop and discover the correct Experiences without contradictory connection status.
- Scan a real Course Experience and show the correct lessons and hosted-video state.
- Approve and import an exact lesson into a private draft.
- Open the draft and successfully load its course video.
- Reject/remove that guide.
- Restore it and separately prove rejected re-import works.
- Confirm failure at any recovery step does not leave source/item approvals or guide/media state partially changed.
- Publish it to the owner-only library and open the protected guide/video successfully while signed in.
- Confirm an anonymous browser and a customer importer session cannot read the guide, copied media, or course video.
- Repeat the owner workflow in Chrome and Samsung Internet with immediate visible feedback and no duplicate operation.

## Backlog after active-task acceptance
- Newegg/affiliate reviewer readiness: replace or hide every demo deal page and every sample/replacement instruction.
- Replace retailer search redirects with exact product/SKU destinations or remove the affected deal cards until exact links exist.
- Finish the privacy policy so it accurately covers analytics, affiliate tracking, cookies, Discord/Whop connections, retention, and deletion without starter-template wording.
- Audit every public deal/store/partner page for consistent claims, real timestamps, variants, sellers, fulfillment, availability, and current links before applying to Newegg.

## Scope lock
The separate `UglyGameFace/SniperPlug` Discord deal-bot audit is paused. Preserve its existing findings and commits, but make no further changes there until this Whop importer task is accepted.
