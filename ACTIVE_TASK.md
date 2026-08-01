# Active Task

## Task
Repair and fully audit the Whop importer and owner-only guide workflow in `UglyGameFace/SniperPlug-Site` on `SniperPlug.com`.

Required path:

Whop OAuth/session → live Experience discovery → exact content scan → import → D1 draft → media/video → owner review → reject/remove → restore or re-import → publish to owner-only library → authenticated guide/media access.

## Status
Active and code-clean. Owner routing, source-access truth, recovery-media truth, anonymous guide isolation, cleanup, and the complete Node 22 regression suite pass. Completion is blocked only by authenticated owner-browser acceptance and the lack of a currently readable Whop Course source for a real end-to-end lifecycle.

## Scope
- Reuse the existing Control Center password/session; no second owner credential system.
- Require `kind=owner` for guide lists, guide details, copied R2 media, and course-video routes.
- Keep private content out of public navigation, sitemap, indexing, shared caches, and static-asset fallbacks.
- Never present saved Whop decisions as current readable access.
- Never describe a Whop-backed player as a permanent copy.
- Preserve immediate, duplicate-safe behavior in Chrome and Samsung Internet.

## Confirmed findings
- PRs #2 through #5 are merged; no open pull request conflicts remain.
- `sniperplug.com` is attached to the current Cloudflare Pages production deployment and visibly shows `Owner access` without a public Guides navigation item.
- The owner Control Center password opens the private library.
- The 34 old `whop_sources` approvals are saved policy history; current live discovery returns 0 active groups and 0 readable sources.
- Older imported guide text survived in D1, but private/expiring Whop videos imported before the R2 binding were never copied permanently.
- `/course-video/...` was previously labeled durable while still re-fetching Whop/Mux on every open.
- Failed recovery could produce a false generic 500 when an unchanged rejected snapshot was already restored.
- A historical crawler result exposed the old public guide HTML, proving route-level gates alone were not enough. Global middleware previously called `context.next()` before applying the guide privacy decision.
- The current 50 MB per-object hard-free cap cannot archive many full course videos. Large-video storage remains deliberately deferred by the owner.

## Implemented changes
- Reused the signed `sniperplug_admin` owner session across Control Center and private guides.
- Protected guide, media, and course-video routes; customer importer sessions are denied.
- Removed public guide discovery links and added no-store/noindex/robots/sitemap defenses.
- Pinned `Owner access` in narrow mobile navigation.
- Separated currently readable approved sources from inactive saved approval history.
- Added recovery-media classification for permanent R2 media, live Whop-backed video, missing media copies, and text-only imports.
- Permanent R2 copies restore/play without Whop; live-only items clearly require current source access.
- Recovery returns explicit reconnect/lost-access/missing-source errors and uses idempotent rollback.
- Global Pages middleware authenticates `/guides` and every `/guides/*` URL before `context.next()`, preventing static assets or nested routes from resolving first.
- Added `_routes.json` with `/*` Function coverage while excluding only public static assets.
- Added executable routing tests proving anonymous/customer requests never reach asset/function resolution, owners continue normally, and public pages remain unaffected.
- Added a permanent production privacy workflow that checks both the raw Pages production hostname and the real custom domain on every push to `main`.

## Validation completed
- `ci/sniperplug-node22: success` on commit `3c6344507fc66e955232e1a540fe6ea2edb29fb1`.
- `ci/sniperplug-production-guide-privacy: success` on the same commit.
- `sniperplug.pages.dev/guides/` returned HTTP 401 with the real owner lock page.
- `sniperplug.com/guides/` returned HTTP 403 before private content could be read; known private-guide markers were absent.
- Existing homepage, authorization, discovery/import, quality, network, decision, scan, concurrency, versioning, recovery, paid-access, hard-free media, course-video, and resilience tests continue to pass.
- New tests prove the owner gate executes before Pages routing/static resolution, permanent R2 media is independent of Whop, live-backed media is labeled honestly, and unchanged rollback cannot become a false 500.
- Repository search found no public `/guides/` links outside protected owner templates/Control Center and no service worker or browser cache layer capable of resurrecting an old guide page.
- All relevant pull requests are merged. Remaining old branches are historical only and are not deployment targets.

## Cleanup status
- Temporary deployment diagnostics and challenge-prone one-off checks are absent.
- The legacy recovery URL remains a thin alias rather than a second implementation.
- No duplicate private-guide login system exists.
- No static private-guide path is excluded from Pages Functions.
- Main-branch build, security, route, and conflict inspections pass.

## Current blockers
- Owner-browser verification after the current deployment must show:
  - 0 currently accessible approved sources;
  - 34 previous approvals retained as inactive history;
  - removed imports labeled by their actual media state;
  - no generic recovery 500 when source access is missing.
- The connected Whop account has 0 readable sources. A genuine Course discover → import → video → reject → restore/re-import → private publish lifecycle cannot run until an authorized readable source is connected.
- Customer-session production isolation and the owner interaction flow still need one Chrome/Samsung Internet acceptance pass; executable tests already pass.
- Large-video permanence above 50 MB is deferred for a later storage decision.

## Required acceptance
- [x] Production homepage shows `Owner access` and no public Guides link.
- [x] Owner access remains visible on narrow Samsung Internet layouts.
- [x] Existing owner password opens the Control Center and private library.
- [x] Private guide routing fails closed before Pages static/function resolution.
- [x] Raw Pages production returns the owner lock to anonymous guide requests.
- [x] The custom domain prevents anonymous private-guide reads.
- [x] Full Node 22 build/regression suite passes.
- [x] Main-branch conflict, obsolete diagnostic workflow, duplicate route, and public-link inspection passes.
- [ ] Production owner UI shows 0 current approvals and 34 inactive historical approvals.
- [ ] Production recovery rows show honest media state and no generic 500.
- [ ] Customer session cannot read owner guide/media/video on production.
- [ ] Real authorized Course lifecycle passes when source access is available.
- [ ] Chrome and Samsung Internet owner flow acceptance passes.

## Backlog after active-task acceptance
- Newegg/affiliate readiness: remove or hide every demo/sample deal and replacement instruction.
- Replace broad retailer-search destinations with exact product/SKU destinations or remove the cards.
- Replace the starter privacy policy with an accurate final policy.
- Audit every public deal, store, legal, and partner page before applying.
- Decide and implement large-video archival storage beyond the current 50 MB R2 cap.

## Scope lock
Do not start the Newegg cleanup, Discord deal-bot work, or another implementation task until this owner/Whop task satisfies acceptance, unless the owner sends the exact FORCE SWITCH instruction.
