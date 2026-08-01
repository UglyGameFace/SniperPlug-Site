# Active Task

## Task
Remove every fake, demonstration, or broad-search deal path from the public SniperPlug site and make retired deal URLs fail closed before the Newegg affiliate application.

## Status
**Complete and production-validated on 2026-08-01.** PR #13 is merged. The public board is empty, known demonstration pages are absent, retired deal and click-out paths are intercepted before Pages resolution, and the dedicated Cloudflare production check passes.

## Confirmed findings
- `data/deals.json` contains zero records and no generation timestamp.
- `/deals/` displays only the verified-empty state and explicitly prohibits generic retailer searches.
- The eight known demonstration detail files are absent from `main`.
- `functions/deal/[slug].js` and `functions/go/[id].js` redirect to `/deals/` and contain no retailer destinations.
- The prior custom-domain check could receive a Cloudflare challenge, so retired-route safety is now enforced in the shared runtime rather than depending on crawler visibility.

## Implemented changes
- Added a global middleware gate for every `/deal`, `/deal/*`, `/go`, and `/go/*` request before `context.next()` or nested route resolution.
- Retired paths permanently redirect to `/deals/` with `retired-deal` or `retired-link` context.
- Retired paths receive `private, no-store` and `noindex, nofollow, noarchive` protections.
- Added matching top-priority `_redirects` rules as a second Cloudflare Pages safety layer.
- Added explicit retired-route `_headers` rules.
- Added `tools/test-retired-public-deals.mjs`, which executes middleware, proves stale content cannot reach `context.next()`, scans public HTML for known demo products and retailer search URLs, confirms the feed is empty, and verifies nested routes contain no retailer destinations.
- Added the new regression to every Node 22 build.
- Added a dedicated Cloudflare preview/production smoke for raw 308 behavior, final safe-board content, banned search destinations, and custom-domain safety.

## Validation
- PR #13 merged as `b325edbb05557187fbed55829c42232266c0a371`.
- Branch preview returned raw HTTP 308 responses for both retired `/deal/*` and `/go/*` probes on the first deployment attempt.
- Following either redirect returned the verified empty board.
- Full Node 22 regression passed.
- Existing affiliate-ready preview passed.
- Dedicated retired-route Cloudflare preview passed.
- Production `ci/sniperplug-node22` passed.
- Production `ci/sniperplug-production-guide-privacy` passed.
- Production `ci/sniperplug-production-affiliate-readiness` passed.
- Production `ci/sniperplug-production-retired-deals` passed.
- Changed-file scope, mergeability, duplicate paths, and review threads were clean before merge.

## Definition of Done
- [x] Current public deal data and known static pages inspected.
- [x] Existing nested deal and click-out functions inspected.
- [x] Fail-closed global runtime gate implemented.
- [x] Pages redirect and header fallback implemented.
- [x] Full public-surface regression test added to the Node build.
- [x] Dedicated Cloudflare deployment smoke added.
- [x] Full Node 22 regression suite passes.
- [x] Cloudflare branch preview proves raw retired routes cannot expose content.
- [x] Changed-file, conflict, and duplicate-path inspection passes.
- [x] PR is merged.
- [x] Main production passes Node, affiliate, private-guide, and retired-deal safety checks.
- [x] Custom-domain automation either reaches the safe board or exposes only a Cloudflare challenge with no deal content.

## Backlog
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Publish future deal cards only from verified records with exact official product destinations.
- Add Newegg deal cards only after approval.
- Large-video archival storage remains deferred.

## Scope lock
This task is complete. The next active task may be the Newegg application process or another explicitly selected item.
