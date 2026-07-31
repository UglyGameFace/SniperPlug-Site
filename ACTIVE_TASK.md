# Active Task

## Task
Repair and fully audit the Whop importer and owner-only guide workflow in `UglyGameFace/SniperPlug-Site`. The active production target is `SniperPlug.com`, not the separate 420 Lobby Hack site and not the Discord deal-bot repository.

Required path:

Whop OAuth/session → Experience discovery → exact content scan → import → D1 draft → course media/video → owner review → reject/remove → restore or re-import → publish to owner-only guide library → authenticated guide/video access.

## Status
Active. Production routing, owner login, source-access truth, and recovery-media code are implemented and the latest full Node 22 build passes. Do not claim the task complete until the new recovery UI is production-browser verified, anonymous/customer isolation is rechecked on production, a real live Course lifecycle can run again, and final cleanup passes.

## Scope
- One visible `Owner access` entry on the SniperPlug homepage.
- Existing Control Center password/session reused; no second credential system.
- Private guide list, guide details, copied media, and course video restricted to `kind=owner`.
- Public navigation, sitemap, crawler metadata, and shared caches must not expose private guides.
- Saved source decisions must never be presented as current readable Whop access.
- A Whop-backed player must never be described or treated as a permanent media copy.
- Chrome and Samsung Internet behavior must remain responsive and duplicate-safe.

## Confirmed findings
- PR #4 and PR #5 are merged into `main`.
- `sniperplug.com` serves the current Cloudflare Pages production project and visibly exposes `Owner access` without a public Guides link.
- The owner used the existing Control Center password on `SniperPlug.com`; the Control Center opened and exposed `Private guides`.
- The Control Center previously labeled 34 persisted `whop_sources` approvals as current even though live Whop verification returned 0 active groups and 0 readable sources. Those 34 rows are historical policy decisions only.
- The draft shown on July 31, 2026 was imported before `SNIPERPLUG_MEDIA` was connected. Its text and metadata were saved in D1, but its private/expiring hosted video was never copied into R2.
- A registered `/course-video/...` player was marked durable in attachment metadata even though the route still fetched the live Whop lesson and Mux playback data on every open. Losing Whop source access therefore broke playback.
- Existing permanent R2 archives, when present, were not preferred by the course-video route; the route contacted Whop first.
- `Restore & re-import` returned a generic 500 when failed recovery rolled back an unchanged rejected guide. D1 could report zero changed rows for an already-restored snapshot, which the old rollback treated as failure.
- The connected Whop account currently has 0 readable sources. Old videos that were never copied to R2 cannot be reconstructed from D1 text or the saved course-video key alone.
- The existing 50 MB per-object hard-free copy cap remains a separate limitation for large course videos and must not be represented as universal permanent-video support.
- Vercel build-rate-limit failures are unrelated to the Cloudflare Pages production target. `ci/sniperplug-node22` is the authoritative build status.

## Implemented changes
- Reused the signed `sniperplug_admin` Control Center session and protected guide, copied-media, and course-video routes with owner authorization.
- Removed private-guide links from public discovery surfaces and added private/no-store/noindex defenses.
- Pinned `Owner access` in the narrow mobile header.
- Added source-access truth that separates currently readable approved sources from inactive saved decisions.
- Added shared `recovery-media` truth helpers that distinguish:
  - permanent R2 media;
  - live-source Whop video;
  - text imported without a media copy;
  - text-only imports.
- The recovery list now explains each item’s actual media state and labels its action as either `Restore saved R2 copy` or `Re-import from Whop`.
- Permanent R2 copies can return a rejected guide to the draft queue without contacting Whop.
- Course-video playback now checks for an owner-only permanent R2 archive before making any Whop request and plays the R2 copy directly when present.
- Live-only playback and media repair now return explicit reconnect, lost-access, or missing-source messages instead of a generic importer error.
- Lost or missing sources leave the recovery action disabled as `Source access required` instead of inviting repeated failing requests.
- Recovery rollback is idempotent: an unchanged guide that already matches its rejected snapshot counts as successfully restored rather than producing a false rollback 500.
- Added executable recovery-media truth tests to the full Node 22 build chain.

## Validation completed
- Existing homepage, private-guide authorization, Whop discovery/import, hardening, quality, network, decision, scan, concurrency, versioning, recovery ownership, paid access, hard-free media, course-video, and resilience audits continue to pass.
- New tests prove:
  - a Whop-backed player is not a permanent copy;
  - permanent R2 media restores without Whop;
  - the course-video request path checks R2 before Whop;
  - missing/lost Whop access returns the real reason;
  - unchanged recovery rollback cannot become a false 500;
  - unavailable recovery buttons remain disabled.
- The latest authoritative GitHub Actions result is `ci/sniperplug-node22: success` on commit `b590c4220d836bbc002005538f3fedf3f46b2f8b`.

## Current blockers
- Production browser verification is required after the latest Cloudflare deployment. The current removed import should say that its text was saved but its media was not copied, and a failed retry should explain that current Whop source access is required rather than show `Recovery request failed (500)`.
- Production must show 0 currently accessible approved sources and identify the 34 previous approvals as inactive history for the current no-access account.
- The connected account currently has no readable Course source, so the old missing video cannot be recovered and a complete new live Course import → R2/archive or live playback → reject → restore/re-import → private publish flow cannot be executed yet.
- Large-video permanence beyond the existing 50 MB per-object hard-free cap still needs a deliberate storage/transfer design before universal permanent course-video support can be claimed.

## Required acceptance
- [x] `SniperPlug.com` visibly shows `Owner access` and no public Guides link.
- [x] Owner access remains visible in the narrow Samsung Internet header.
- [x] Owner login uses the existing Control Center password and opens `Private guides`.
- [x] Latest full Node 22 GitHub Actions build passes with source-access and recovery-media truth repairs.
- [ ] Production shows 0 currently accessible approved sources and 34 inactive previous approvals.
- [ ] Production recovery rows distinguish permanent R2 copies from Whop-dependent or missing media.
- [ ] The observed removed import no longer returns a generic recovery 500.
- [ ] Anonymous and customer-importer sessions cannot read a guide, copied media, or course video on production.
- [ ] A real live Course flow passes end to end when an authorized readable source is available.
- [ ] Repeat the owner flow in Chrome and Samsung Internet with immediate feedback and no duplicate operation.
- [ ] Final conflict, obsolete-code, temporary-file, and redundant-path inspection passes.

## Backlog after active-task acceptance
- Newegg/affiliate reviewer readiness: replace or hide all demo deals and sample/replacement instructions.
- Replace retailer-search redirects with exact product/SKU destinations or remove affected cards.
- Finish the privacy policy for analytics, affiliate tracking, cookies, Discord/Whop connections, retention, and deletion.
- Audit every public deal, store, and partner page before applying to Newegg.

## Scope lock
The separate `UglyGameFace/SniperPlug` Discord deal-bot audit remains paused. Do not start the Newegg cleanup or another implementation task until this production owner-access task satisfies its acceptance criteria, unless the user sends the exact FORCE SWITCH instruction.
