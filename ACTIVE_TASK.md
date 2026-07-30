# Active Task

## Task
Perform a complete execution-path audit of both SniperPlug repositories—`UglyGameFace/SniperPlug` and `UglyGameFace/SniperPlug-Site`—then repair every confirmed discrepancy without starting unrelated work. The audit covers bot startup, providers, scanning, caching, storage, Discord interactions, Cloudflare configuration, Whop discovery/import, D1 lifecycle, media/video, publishing, public routes, frontend state, Samsung Browser behavior, tests, deployment, and the bot/site integration contract.

## Status
Audit active. No merge or completion claim is allowed until both repositories have been inventoried, callers and duplicate implementations inspected, real state transitions validated, obsolete/conflicting code cleaned up, and browser/runtime acceptance completed.

## Confirmed findings so far
- SniperPlug is split across a Discord bot repository and a Cloudflare site repository; prior work audited only the site branch.
- The website build currently consists of source-string audit scripts rather than a true browser/API/D1 end-to-end suite.
- Rejected imports disappear from the normal dashboard and the previous restore path was buried inside bulk history; a dedicated atomic recovery path is being introduced.
- The bot defines Walmart credentials and an enable flag but startup registers `WalmartProvider(configured=False)`, so configuration and runtime wiring disagree.
- The bot repository contains multiple scanner/auto-scan implementations while only `native_auto_scan_runner` is registered at startup; duplicate and obsolete execution paths require caller/reference inspection.
- Bot CI compiles and smoke-imports modules but does not execute the full pytest suite or runtime state-transition tests.
- Startup performs storage maintenance synchronously before the bot becomes ready.
- Setup self-heal marks itself complete before the repair succeeds, so a failed repair is not retried until restart.
- Site middleware validates only part of the required OAuth/runtime configuration; missing Whop client configuration can survive startup and fail later.

## Audit order
1. Repository inventory, entry points, deployment configuration, environment contract.
2. Bot startup, database, providers, scanner selection, autoscan, posting, interaction locks.
3. Site authentication, Whop Experience discovery, scan/import decisions, recovery lifecycle, media/video, publishing.
4. Frontend event delegation, async operation feedback, rendering, caching, Samsung Browser compatibility.
5. Bot/site data and API contract, deployment targets, stale Vercel/Cloudflare wiring.
6. Tests: replace static-only assertions with executable unit, integration, D1, and browser workflow coverage.
7. Cleanup: remove or integrate duplicate, obsolete, temporary, conflicting, and partially implemented code after reference verification.
8. Full regression, compile/static validation, and authenticated acceptance.

## Backlog
None. This full SniperPlug audit is the single active task.