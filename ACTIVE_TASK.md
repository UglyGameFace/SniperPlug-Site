# Active Task

## Task
Make the public `SniperPlug.com` website credible and complete for a Newegg affiliate-program review.

## Status
Active. The previous Whop/owner workflow is closed for now after the owner cleared the unrecoverable removed import and asked to move on. This task is limited to public affiliate-review readiness.

## Root causes confirmed
- Eight static deal pages and every store board publish invented example prices, discounts, timestamps, and availability language as though they are current offers.
- The click-out route sends those cards to broad retailer search-result pages instead of exact product/SKU destinations.
- `data/deals.json` explicitly says the public data is launch/example content that must be replaced before launch.
- The privacy page calls itself a starter policy and omits necessary details about operational logs, owner/customer sessions, OAuth connections, affiliate click-outs, third-party processors, retention, and user choices.
- The homepage preview contains a specific example price even though it is not a verified live offer.
- The sitemap still advertises every demo deal page.

## Scope
- Remove every public demo/sample deal, fake price, fake discount, fake timestamp, and replacement instruction.
- Remove broad retailer-search click-outs and old deal-detail URLs from public discovery.
- Preserve useful retailer coverage pages without pretending that unverified deal cards are live.
- Finish privacy, affiliate disclosure, terms, about, contact, and partner positioning.
- Keep the private Control Center and Whop implementation unchanged.
- Add permanent reviewer-readiness tests to the Node 22 build.
- Verify the Cloudflare preview and the public custom domain before recommending application submission.

## Official review facts
- Newegg states that the affiliate program is free to join, applications are reviewed, and a website is required and inspected.
- Newegg promotes deep-linking to direct product pages and a product catalog updated multiple times daily.
- SniperPlug must therefore show a legitimate publishing model, transparent disclosures, and exact retailer destinations rather than fabricated inventory or generic search links.

## Required acceptance
- [ ] No demo/sample/launch-placeholder language remains on public pages or public data.
- [ ] No public price, discount, availability, or last-checked claim exists without a verified exact product destination.
- [ ] Demo deal pages are removed from the sitemap and retired safely.
- [ ] The deal board and store pages truthfully show the current publishing state.
- [ ] Privacy policy accurately describes current data handling and contact choices.
- [ ] Affiliate disclosure and terms are complete and consistent with the site behavior.
- [ ] Homepage, about, partners, contact, legal pages, and retailer pages pass a reviewer-style audit.
- [ ] Node 22 build, targeted tests, conflict inspection, and cleanup pass.
- [ ] Cloudflare preview and `SniperPlug.com` are visually checked on mobile and desktop.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
