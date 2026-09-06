# Active Task

## Active task / outcome
Implement issue #60: enable paid subscribers to sign in with Whop, prove current product entitlement, and receive their own tenant-isolated SniperPlug importer workspace without sharing the owner password.

## Scope lock
- Active scope: application account authentication for subscribers, subscriber Whop OAuth bootstrap/callback, exact paid-product entitlement verification, stable principal issuance, Control Center login/account-state UX, importer endpoint authorization, and targeted regressions directly coupled to paid onboarding.
- Keep the existing owner password login and owner post-login Whop connection flow intact.
- Reuse the tenant isolation already deployed for sources, posts, guides, browser capture, bulk jobs, recovery, history, and backups. Do not create a second workspace implementation.
- Keep owner-global actions owner-only, including public-site publication and shared category management.
- Do not resurrect the removed `customer-pending` authorization model, the deleted `paid-access.js` implementation, the deleted `/api/importer-login` route, global Whop-session adoption, or the old Discord-guild coupling.
- Subscriber identity must come from verified Whop OIDC identity and exact product entitlement, never email, mutable membership ID, or browser-local state.
- Fail closed on OAuth correlation failure, missing billing configuration, missing/expired entitlement, or temporary entitlement-verification failure.

## Completed previous task
- PR #59 **Add authorized Whop app-specific readers** merged into `main` as `4a560c20bcb79cbc3381a9470450b01d24263482`.
- Exact PR head passed the full Node 22 suite and Firefox Android extension packaging/upload.
- Post-merge `main` passed **Verify SniperPlug #1047**, Cloudflare production affiliate/visual verification, and production private-guide privacy verification.
- Issue #25 closed automatically as completed.

## Starting state / root cause
- Starting `main`: `4a560c20bcb79cbc3381a9470450b01d24263482`.
- Working branch: `feature/paid-subscriber-onboarding`.
- Issue #60: **Enable paid subscriber Control Center onboarding**.
- PR #47 already separated stable account `principalId` from per-browser `browserSid` and made Whop connections account-scoped.
- PR #48 already tenant-scoped importer source/post/guide/bulk/recovery state and prevents subscriber workspaces from publishing into the owner's public guide catalog.
- `auth.js` deliberately accepted only owner sessions because the earlier unsafe customer auth model was removed in PR #32.
- `/api/control?action=login` was password-only, and importer API routes still called the owner-only `requireAdmin()` gate even though their underlying workspace operations were already principal-scoped.
- Whop OAuth start required an existing owner application session. The callback correctly stored the OAuth connection under the principal recorded in the one-time state row, but could not bootstrap a previously unauthenticated paid subscriber because their stable principal is not known until Whop returns verified user identity.
- Historical paid-access code mixed product access with Discord-guild requirements and used `customer-pending`; both were intentionally removed and were not restored.

## Implementation / Definition of Done
- [x] Introduce one canonical account-session reader that can validate both owner and paid-subscriber application sessions while retaining an explicit owner-only wrapper.
- [x] Derive subscriber principal only from exact Whop user identity (`sub` / compatible verified user ID), with a stable principal namespace that remains the same across devices.
- [x] Add a dedicated unauthenticated subscriber OAuth bootstrap using PKCE + server state + narrow SameSite=Lax callback correlation without treating pending OAuth as an authenticated app session.
- [x] Verify current membership for the exact configured `WHOP_IMPORTER_PRODUCT_ID` before issuing a subscriber application cookie or moving OAuth tokens under the subscriber principal.
- [x] Use the existing membership-status/access semantics consistently and fail closed on missing configuration, denied membership, or transient Whop failure.
- [x] Keep owner OAuth start/callback behavior unchanged and keep owner Whop switching/disconnect principal-scoped.
- [x] Persist the verified subscriber Whop connection under the stable subscriber principal so multiple signed-in devices share one account-scoped connection without sharing browser-session identity.
- [x] Change only importer/workspace routes to accept authenticated subscriber accounts; owner-global routes/actions still require the owner principal.
- [x] Update Control Center login UX so owner password unlock and paid-subscriber Whop sign-in are visibly distinct and do not masquerade as the same credential flow.
- [x] Ensure subscriber logout clears only the browser application session; explicit Whop disconnect remains principal-scoped and cannot delete another principal's connection.
- [x] Add executable regressions for state correlation, stable identity, product entitlement, denied/expired access, multi-device account sessions, cross-principal isolation, owner compatibility, and owner-only publishing/category enforcement.
- [x] Update runtime configuration example for the exact paid product ID without exposing secrets.
- [x] Exact-head **Verify SniperPlug #1055**, affiliate-ready preview #121, and retired public deal routes #122 passed on `1528e85ce3628748fb19c4808e4b7c39c9d2e17e` with no review threads or submitted reviews.
- [ ] Mark PR #61 ready, merge, then require post-merge production validation before closing issue #60.

## Validation evidence
- Paid subscriber onboarding regression passes stable Whop identity, exact product entitlement, separate OAuth callback correlation, importer/capture/recovery/backup/bulk authorization, and owner-only public publishing.
- Tenant workspace regression passes deterministic per-principal source/post/guide/browser-capture/bulk/history/backup/recovery isolation.
- Existing Better Content capture, publish/unpublish, mobile Control Center, bulk completion, guide versioning, recovery ownership, backup/reset/restore, network safety, media, and site-integrity audits remain green on the exact PR head.
- Affiliate-ready preview and retired public route checks are green on the exact PR head.

## Branch-governance backlog
- The repository currently reports `main` as unprotected and has no repository rulesets through the connected GitHub surface.
- The GitHub App still does not expose the repository-administration write needed to configure required checks from this chat, so governance remains a separate blocked administrative item rather than a fabricated code fix.

## Backlog after this task
- Larger product/brand/UX redesign across the public site and Control Center.
- Required branch-check governance when repository administration write access is available.

## Next step
Finish PR #61's merge gate, run the post-merge Cloudflare production checks, close issue #60 only after those pass, then transition the active task to the full-site UX/product redesign.
