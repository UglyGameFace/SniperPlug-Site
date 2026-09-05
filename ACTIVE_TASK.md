# Active Task

## Active task / outcome
Repair the Whop importer end to end so it can become a safe subscription product, while preserving the concrete live target **Hidden Files → Make Money Here → Better Content** through the Firefox Android rendered-DOM capture bridge.

The task is not complete until both conditions hold:
1. one real Make Money Here page reaches SniperPlug as a private draft through the existing v0.1.4 queue/retry path; and
2. importer connection/workspace data is isolated by the authenticated SniperPlug account principal so future subscribers cannot read, overwrite, disconnect, or purge one another.

## Scope
1. Keep application auth → Whop OAuth → membership/discovery/access truth authoritative.
2. Keep native Forum/Course/Chat readers authoritative.
3. For Better Content only, read rendered DOM the authenticated user is already authorized to view.
4. Never read/forward Whop cookies, iframe JWTs, OAuth tokens, local/session storage credentials, or guessed Better Content API responses.
5. Keep browser login-session identity separate from stable SniperPlug account/principal identity.
6. Whop connections must be account-scoped so one subscriber can use multiple devices without reconnecting, while different subscribers remain isolated.
7. Tenant-scope importer workspace data before subscription accounts are enabled.
8. Require republishing-rights confirmation and manual review before publication.
9. Protect published, reviewed, removed, and unrelated user work from capture overwrites.
10. Keep Issue #20 and unrelated UI work locked out until this importer/security task is complete.

## Status
- PR #34 merged: membership access false-denial fix.
- PR #35 merged: Whop OAuth callback/login-loop fix.
- PR #36 merged: source-access truth/loading/fan-out fix.
- PR #37 merged: current Experiences `account_id` contract fix.
- PR #38 merged: user-OAuth-compatible custom-app metadata / reader-contract truth.
- PR #39 merged: Better Content rendered-DOM capture bridge → private draft.
- PR #41 merged: Firefox Android package support.
- PR #44 merged: v0.1.3 Firefox app-frame URL compatibility attempt.
- PR #45 merged: v0.1.4 live all-frame recovery for already-open Whop tabs.
- Live v0.1.4 evidence: Better Content capture reached SniperPlug and was preserved for retry after the server draft write failed.
- PR #46 merged at `68e9f42e008ac03982368da6be1f97f840fad95e`: browser capture now materializes/verifies its `whop_posts` source row before the foreign-keyed guide draft write. Post-merge Node 22 verification passed.
- Subscription requirement exposed a separate architectural risk: every account currently collapses onto the one principal/storage key `sniperplug-owner`, and legacy purge paths can delete any Whop session not matching that key.
- PR #47 (`fix/whop-session-isolation`) is the current implementation stage: explicit account principal vs browser login session, plus principal-scoped Whop connection lifecycle.

## Findings / root cause
### Better Content capture
- Firefox v0.1.4 is no longer blocked at candidate discovery or handoff.
- The live generic importer error was caused by `guides.source_key → whop_posts.source_key` foreign-key enforcement; PR #46 repaired that structural mismatch.
- No extension reinstall is required for the PR #46 server-side fix. The preserved queue remains the live validation path.

### Subscription / identity isolation
- Existing owner auth uses `sniperplug-owner` simultaneously as application identity and Whop connection key.
- Existing `purgeLegacyWhopSessions()` deletes every `whop_sessions`, `whop_oauth_states`, and `whop_refresh_leases` row whose key is not the one owner constant.
- Login, OAuth start/callback, disconnect, and reset paths historically invoked that global cleanup. In a subscription launch, one account could therefore destroy another subscriber's Whop connection.
- Correct SaaS model is **browser session ≠ SniperPlug account principal ≠ external Whop credential**, with the Whop credential attached to the account principal.
- Same subscriber on phone/tablet should see the same account-level Whop connection. Different subscribers must never share it.
- `whop_sources`, `whop_posts`, and the current import/publishing workspace remain globally keyed today. Connection isolation alone is therefore necessary but not sufficient for subscriptions.

## Current execution paths
### OAuth / connection
`browser login cookie → account principal → OAuth pending state principal → Whop token stored under that principal → requireWhopSession(current principal)`

### Better Content capture
`Firefox Whop tab → Better Content rendered frame → content-capture.js → extension queue → SniperPlug Control Center relay → POST /api/browser-capture → application principal + Whop session + exact exp_ + exact Better Content app → whop_posts source row → private draft → manual review/publish`

## Changes in PR #47
- Auth session v4 introduces explicit `principalId` and independent random `browserSid`.
- Existing owner principal remains `sniperplug-owner` for backward-compatible owner data; browser logins no longer masquerade as the account identity conceptually.
- Legacy v1-v3 owner cookies remain valid until normal expiry and normalize onto the owner principal.
- Application login no longer purges other Whop principals.
- OAuth start/callback no longer hard-code or purge the canonical owner connection.
- New `whop-connection.js` resolves the authenticated principal and revokes/deletes only that principal's Whop token, pending OAuth states, and refresh lease.
- Disconnect, Switch Whop, invalid-session cleanup, and backup-reset disconnect use the principal-scoped service.
- Session/dashboard responses expose the current principal identity as groundwork for real subscriber authentication.
- Runtime regression creates multiple browser logins for one principal, then simulates principal A and B and proves disconnecting A leaves every B Whop artifact untouched.

## Validation
- [x] Live v0.1.4 screenshot proves Better Content capture reached SniperPlug and queue preservation works.
- [x] PR #46 browser-capture source-row fix merged; post-merge Node 22 build passed.
- [x] PR #47 regression proves multiple browser sessions can share one stable account principal.
- [x] PR #47 regression proves principal A disconnect cannot delete principal B's Whop session, OAuth state, or refresh lease.
- [x] OAuth callback regression now requires the authenticated principal to survive through the D1 pending-state row instead of being replaced by one global owner constant.
- [x] Global purge calls removed from application login and OAuth start/callback in PR #47.
- [x] Destructive Whop routes are same-origin POST and use principal-scoped disconnect.
- [ ] Full Node 22 build green on current PR #47 head after updating legacy single-owner assertions.
- [ ] PR #47 branch/review state clean and current with main.
- [ ] PR #47 merged and post-merge main workflows green.
- [ ] Tenant-scope saved importer source/post/private-workspace data behind `principalId` with lossless owner backfill and cross-tenant regression coverage.
- [ ] Owner presses existing **Retry capture** and one queued Make Money Here page becomes a private SniperPlug draft.
- [ ] Multi-page auto-capture validated only after the one-page draft succeeds.

## Cleanup / conflicts
- No extra Whop OAuth scopes.
- No weakening of Strict application-cookie security or OAuth callback state verification.
- No guessed Better Content endpoints or Whop iframe credential theft/forwarding.
- No automatic publishing.
- No global delete is allowed in the new principal-scoped disconnect service.
- Existing global legacy helper remains temporarily for compatibility/recovery code but is no longer permitted on normal account login/connect/disconnect/switch paths.
- UI redesign remains backlog until tenant safety and the live capture gate are complete.

## Blockers / risks
- CI cannot exercise the owner's private production Better Content page; final content proof remains the preserved live capture retry.
- Current owner-only workspace tables are not subscription-safe yet. Do not enable paid subscriber accounts before tenant scoping is complete.
- Public guide publishing and subscriber-private import workspace currently share parts of one data model. Tenant scoping must preserve public owner guides while preventing subscriber drafts/sources from colliding with them.

## Backlog after importer/security is complete
- Consolidate/restructure the Control Center UI. Current cards/status explanations are too verbose and repetitive on mobile.
- Make connection wording explicit: **Whop connected to this SniperPlug account**, not "this device is signed into Whop."
- Issue #25 remains broader custom-app reader work after Better Content.
- Other third-party Whop apps remain out of scope until Better Content works end to end.

## Next step
Get PR #47 fully green and merge it. Then stay on this same active task and inspect every `whop_sources`, `whop_posts`, private draft/import, backup/recovery, and browser-capture read/write path before introducing the tenant workspace key and lossless owner backfill. Do not enable subscription accounts until cross-principal workspace isolation is executable-tested. The existing v0.1.4 queued Make Money Here capture remains the live end-to-end validation gate after server-side isolation changes deploy.
