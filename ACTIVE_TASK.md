# Active Task

## Active task / outcome
Implement issue #25: make authorized Whop app-specific experiences, especially Content / Better Content, report their real reader capability and use a supported reader without inventing private endpoints.

## Scope lock
- Active scope: Whop custom-app capability metadata, reader selection, the existing browser-capture reader for rendered Whop app content, discovery truth/UX copy, and targeted regressions directly coupled to issue #25.
- Preserve existing native Course, Forum, and Chat readers and their OAuth scope requirements.
- Preserve owner membership/access checks and tenant-scoped source approval before any app-specific content becomes an importable private draft.
- Do not guess undocumented custom-app API paths. A custom app is readable only through an explicitly supported reader or a documented interface exposed by Whop/app metadata.
- Do not weaken browser-capture origin validation, private-guide publication review, recovery, media policy, or billing gates.

## Starting state / root cause
- Starting `main`: `23d1b6dbc9c21ac78b1a96a94f3b1efd02716475` after PR #58 passed post-merge Node 22, production visual/affiliate, guide-privacy, and retired-route checks.
- Working branch: `feature/whop-authorized-app-readers`.
- PR #59: **Add authorized Whop app-specific readers**.
- Issue #25 is open: **Read authorized Whop Content / Better Content experiences**.
- Discovery confirmed membership and preserved external app modules, but native reader resolution only classified Forum, Course, Chat, or unsupported.
- Public Whop app metadata could expose origin, Experience path, OpenAPI path, and Skills path, but there was no canonical app-specific reader decision shared with discovery and capture authorization.
- Better Content already had a real Android-proven rendered browser-capture path, but server authorization was hard-coded to its app ID and discovery still described all app-specific modules as reader-unavailable.

## Important compatibility finding
- Whop can render a valid Better Content Experience under an instance-specific hostname such as `mfk8y74zmein6tne8o5e.apps.whop.com` while public app metadata advertises an origin such as `better-content.apps.whop.com`.
- Therefore metadata-host equality is not a valid identity check and would break the real Android path.
- The safe boundary is now: capture must remain in HTTPS `*.apps.whop.com`; if the rendered URL exposes an `exp_...` identity it must equal the selected Experience; the server independently re-fetches the exact Experience, verifies the canonical supported reader/app identity, verifies current membership, and preserves tenant-scoped source approval before writing a private draft.
- Opaque Whop app routes that do not expose an `exp_...` segment remain compatible because the server-side Experience/app/membership verification is still authoritative.

## Branch-governance backlog result
- `GET /repos/UglyGameFace/SniperPlug-Site/branches/main/protection` returned 403 `Resource not accessible by integration` through the active GitHub App.
- Repository rulesets are readable and currently return an empty list.
- The connector exposes no administration write for branch protection/rulesets, so required-check governance is blocked by connector administration capability rather than silently skipped or fabricated.

## Definition of Done
- [x] Added one canonical app-reader descriptor in `whop-app-reader.js` instead of a parallel reader registry elsewhere.
- [x] Kept exact Better Content app ID `app_zv9yxan92U9fNy` as an explicitly supported rendered-app reader even when its public metadata lookup is temporarily unavailable.
- [x] Other Content-family rendered readers require exact stable app ID resolution, Whop verification, a safe HTTPS `*.apps.whop.com` metadata origin, and a supported Content-family app name.
- [x] Browser capture remains inside HTTPS Whop app frames; a different declared `exp_...` identity is rejected while real instance-specific Whop hosts remain valid.
- [x] Server capture authorization independently re-fetches the exact Experience, resolves the canonical reader/app identity, checks current membership, and preserves tenant-scoped source approval.
- [x] Discovery clearly distinguishes `Access confirmed · reader available`, documented OpenAPI/Skills contract advertised without an adapter, and `Access confirmed · reader unavailable` from access denial.
- [x] Explicit unsupported behavior remains when no authorized readable interface exists.
- [x] OpenAPI/Skills metadata is capability evidence only; arbitrary documented operations are not auto-executed or guessed.
- [x] Targeted regressions cover exact Better Content selection, verified Content-family selection, lookalike/unverified rejection, randomized Whop frame hosts, cross-Experience rejection when the URL declares an Experience, metadata failure, documented-contract-only state, and unsupported fallback.
- [x] Exact code head `fe68ea3854db0dda47373194f0e090cb98febad5` passed **Verify SniperPlug #1045**, including the full Node 22 audit/build suite and Firefox Android extension packaging/upload.
- [x] PR #59 is mergeable and currently has no inline review threads.
- [ ] Fresh exact-head validation after this task-record-only commit.
- [ ] Merge PR #59 only if that final head remains green and review state stays clean.
- [ ] Require post-merge Node 22 plus applicable Cloudflare production visual/affiliate, private-guide privacy, and retired-route checks before closing issue #25.

## Validation notes
- The first PR run exposed a stale legacy regression that expected Better-Content-only error wording. The implementation was kept generic and the compatibility-safe message now contains both the legacy Better Content phrase and the supported generic Whop app-frame meaning.
- A later test-only assertion expected an outdated phrase after Experience-binding copy was strengthened. The production rule was not weakened; the wording and regression now agree on exact Experience matching.
- No client-side custom API execution, guessed endpoint path, second importer state machine, or auto-publication path was added.

## Backlog after this task
- Paid-subscriber authentication/billing onboarding with tenant-scoped real subscriber identity.
- Larger product/brand/UX redesign across the public site and Control Center.
- Required branch-check governance remains blocked until repository administration writes are available through the connection or configured outside this integration.

## Next step
Require fresh CI on this exact task-record head. If it remains green and the PR diff/review state is clean, merge PR #59, verify the resulting Cloudflare production `main`, close issue #25, and move directly to paid-subscriber authentication/billing onboarding.
