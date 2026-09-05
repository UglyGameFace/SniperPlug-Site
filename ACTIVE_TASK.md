# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover authorized experiences, and actually import useful content. The concrete target remains **Hidden Files → Make Money Here → Better Content**, through the Firefox Android rendered-DOM capture bridge because Better Content publishes no server-readable OpenAPI or Skills contract through Whop.

## Scope
1. Keep owner auth → Whop OAuth → membership/discovery/access truth authoritative.
2. Keep native Forum/Course/Chat readers authoritative.
3. For Better Content only, read rendered DOM the owner is already authorized to view.
4. Never read/forward Whop cookies, iframe JWTs, OAuth tokens, local/session storage credentials, or guessed Better Content API responses.
5. Send captures through the signed-in SniperPlug Control Center into private drafts only.
6. Require republishing-rights confirmation and manual owner review before publication.
7. Protect published, reviewed, removed, and unrelated user work from capture overwrites.
8. Stay on this task until one real Make Money Here page reaches SniperPlug as a private draft.

## Status
- PR #34 merged: membership access false-denial fix.
- PR #35 merged: Whop OAuth callback/login-loop fix.
- PR #36 merged: source-access truth/loading/fan-out fix.
- PR #37 merged: current Experiences `account_id` contract fix.
- PR #38 merged: user-OAuth-compatible custom-app metadata / reader-contract truth.
- PR #39 merged: Better Content rendered-DOM capture bridge → private draft.
- PR #41 merged: Firefox Android package support.
- PR #44 merged: v0.1.3 Firefox app-frame URL compatibility attempt.
- PR #45 merged at `47c2293513f2394e440fe8e91e44a1fead71ada2`: v0.1.4 removed the URL monkeypatch and added live all-frame recovery for already-open Whop tabs.
- Live v0.1.4 evidence: the extension successfully queued/handoff-preserved a Better Content page and opened SniperPlug Control Center, which then reported `Capture was not saved: Unexpected SniperPlug importer error. The extension kept the queued pages so you can retry without recapturing them.`
- PR #46 (`fix/browser-capture-source-row`) fixes the confirmed D1 write-model mismatch causing that server error.

## Findings / root cause
### Firefox / extension
- v0.1.4 is no longer blocked at candidate discovery. The owner reached the SniperPlug browser-capture handoff with the captured page preserved for retry.
- No new extension package is required for the D1 fix in PR #46.

### D1 draft write
- Production schema defines `FOREIGN KEY (source_key) REFERENCES whop_posts(source_key)` on `guides`.
- The browser-capture path generated a new `browser-capture:...` source key and attempted to insert the guide directly.
- Unlike native Forum/Course/Chat imports, it never materialized that source key in `whop_posts` first.
- With D1 foreign keys enabled, the first real guide insert therefore fails before a draft can exist. `handleError()` converts the raw non-Http D1 exception to the generic `Unexpected SniperPlug importer error.` seen in the live screenshot.
- This is the confirmed structural mismatch now being repaired; do not change Firefox injection again unless new live evidence points back there.

### Cross-device Whop connection
- SniperPlug's Whop OAuth tokens are intentionally server-side in D1 under the single owner identity `sniperplug-owner`.
- A browser/device that successfully unlocks the SniperPlug owner Control Center reads that same server-side owner Whop connection; it is not proof that Firefox copied the user's Whop browser cookies to the new device.
- The current UI does not explain this distinction well and makes the server connection look like a device-local Whop login.

## Execution path
`Firefox Whop tab → Better Content rendered frame → content-capture.js → background candidate/cache → extension queue → SniperPlug Control Center relay → POST /api/browser-capture → requireAdmin + requireWhopSession + exact exp_ verification + exact Better Content app ID → persist browser-capture source row in whop_posts → private D1 guide draft → manual review/publish`.

## Changes in PR #46
- Persist each Better Content browser capture as a typed `whop_posts` source row before inserting/updating the guide.
- Reuse the exact same `source_key` for the source row and foreign-keyed guide.
- Keep the rendered/sanitized body and image metadata on the source row.
- Mark the capture source approved under the existing browser-capture manual-review-only policy.
- Verify the source-row round trip (`source_key`, experience ID, fingerprint, decision) before attempting the guide insert.
- Store the same stable browser source identifier in `guides.source_post_id`; page identity remains in `sourceMeta`.
- Extend the browser-capture regression so it explicitly models the production `guides.source_key → whop_posts.source_key` foreign key and fails if the guide write moves before source persistence.

## Validation
- [x] Live v0.1.4 screenshot proves capture reached SniperPlug and the extension preserved the queue after server failure.
- [x] Production migration confirms `guides.source_key` references `whop_posts(source_key)`.
- [x] Old browser-capture service path had no `INSERT INTO whop_posts` before `INSERT INTO guides`.
- [x] PR #46 adds verified source persistence before the guide write.
- [x] PR #46 regression explicitly guards the foreign-key ordering.
- [x] PR #46 first full Node 22 build/regression suite passed on `f104f7bb7c7e5627a5ecd9ca310e67976fb64ed8`.
- [ ] Exact final-head CI after this task-record update.
- [ ] PR #46 branch/review state clean and current with main.
- [ ] PR #46 merged and post-merge main workflows green.
- [ ] Owner presses existing **Retry capture** and one queued Make Money Here page becomes a private SniperPlug draft.
- [ ] Multi-page auto-capture validated only after the one-page draft succeeds.

## Cleanup / conflicts
- No extra Whop OAuth scopes.
- No weakening of owner-cookie security.
- No guessed Better Content endpoints.
- No Whop iframe credential theft/forwarding.
- No automatic publishing.
- No database table rebuild/migration required; browser capture now satisfies the existing source foreign-key model.
- Issue #20 remains locked out while this active task is incomplete.

## Blockers / risks
- CI cannot execute against the owner's private production D1 row plus private Better Content page, so the final proof remains the existing queued capture retried after deployment.
- A source row can remain if a later guide write fails; this is safe and makes the retry idempotent because the same source key is upserted and re-verified.

## Backlog after importer is complete
- Consolidate/restructure the Control Center UI. Current cards, status explanations, and repeated sections are too verbose and visually repetitive on mobile.
- Make connection scope explicit: distinguish **SniperPlug server-connected Whop account** from **Whop signed into this browser/device** so a second authorized device does not look mysteriously logged into Whop.
- Issue #25 remains the broader custom-app reader work; Better Content is the first live adapter.
- Other third-party Whop apps remain out of scope until Better Content works end to end.

## Next step
Require green CI on the exact PR #46 final head, inspect branch/review state, merge if clean, verify post-merge main, then use the already-preserved v0.1.4 queue and press **Retry capture**. Success for this stage is the queued Make Money Here page appearing as a private SniperPlug draft without recapturing or reinstalling the extension.
