# Active Task

## Task
Remove every fake, demonstration, or broad-search deal path from the public SniperPlug site and make retired deal URLs fail closed before the Newegg affiliate application.

## Status
Active on `fix/fail-closed-public-deals`. The repository’s current board is already empty, the known static demo pages are absent, and nested `/deal/*` and `/go/*` functions redirect to the verified board. The remaining issue is that the earlier production acceptance did not prove what a normal custom-domain browser could receive because GitHub Actions was challenged with HTTP 403. A runtime-level fail-closed gate and dedicated deployment smoke are being completed before readiness is restored.

## Confirmed findings
- `data/deals.json` contains zero records and no generation timestamp.
- `/deals/` displays only the verified-empty state and explicitly prohibits generic retailer searches.
- The eight known demonstration detail files are absent from `main`.
- `functions/deal/[slug].js` and `functions/go/[id].js` already redirect to `/deals/` and contain no retailer destinations.
- The previous production workflow followed one retired Pages URL to the safe board, but the custom domain returned a Cloudflare bot challenge, so it did not directly inspect the custom-domain retired URL.
- A stale static artifact or mixed deployment should never be allowed to win route resolution before the redirect.

## Changes on the active branch
- Added a global middleware gate for every `/deal`, `/deal/*`, `/go`, and `/go/*` request before `context.next()` or nested route resolution.
- The gate permanently redirects to `/deals/` with `retired-deal` or `retired-link` context.
- Retired paths receive `private, no-store` and `noindex, nofollow, noarchive` headers.
- Added matching top-priority `_redirects` rules as a second Cloudflare Pages safety layer.
- Added explicit retired-route `_headers` rules.
- Added `tools/test-retired-public-deals.mjs`, which executes middleware, proves `context.next()` cannot expose stale content, scans public HTML for known demo products/search URLs, confirms the feed is empty, and verifies nested routes contain no retailer destinations.
- Added the new test to every Node 22 build.
- Added a dedicated Cloudflare PR/production smoke for raw 308 behavior, final safe-board content, banned search destinations, and custom-domain safety.

## Required acceptance
- [x] Current public deal data and known static pages inspected.
- [x] Existing nested deal and click-out functions inspected.
- [x] Fail-closed global runtime gate implemented.
- [x] Pages redirect and header fallback implemented.
- [x] Full public-surface regression test added to the Node build.
- [x] Dedicated Cloudflare deployment smoke added.
- [ ] Full Node 22 regression suite passes.
- [ ] Cloudflare branch preview proves raw retired routes cannot expose content.
- [ ] Changed-file, conflict, and duplicate-path inspection passes.
- [ ] PR is merged.
- [ ] Main production passes Node, affiliate, private-guide, and retired-deal safety checks.
- [ ] Custom domain either serves the safe board or exposes only a Cloudflare challenge with no deal content.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Publish future deal cards only from verified records with exact official product destinations.
- Add Newegg deal cards only after approval.
- Large-video archival storage remains deferred.

## Scope lock
Do not start another SniperPlug or Discord-bot feature until this public-deal safety task meets its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
