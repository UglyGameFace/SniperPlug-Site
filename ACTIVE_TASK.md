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
- Issue #25 is open: **Read authorized Whop Content / Better Content experiences**.
- Discovery already confirms membership and preserves external app modules, but native reader resolution only returns `forum`, `course`, `chat`, or `unsupported`.
- `whop-app-reader.js` already resolves exact public app metadata by stable app ID and safely exposes app origin, experience path, OpenAPI path, and Skills path when Whop publishes them.
- Better Content already has a real, tested browser-capture reader restricted to exact app ID `app_zv9yxan92U9fNy`; the real Android path has successfully produced private SniperPlug drafts.
- The current discovery UI can say a custom app advertises OpenAPI/Skills, but it has no canonical reader descriptor and cannot distinguish a working app-specific reader from a documented contract that still lacks a SniperPlug adapter.
- The browser-capture server and messages are hard-coded to Better Content, preventing the same safe rendered-app reader from being selected for another verified Content-family app even when Whop metadata confirms the exact app and frame origin.

## Branch-governance backlog result
- `GET /repos/UglyGameFace/SniperPlug-Site/branches/main/protection` returned 403 `Resource not accessible by integration` through the active GitHub App.
- Repository rulesets are readable and currently return an empty list.
- The connector exposes no administration write for branch protection/rulesets, so required-check governance is blocked by connector administration capability rather than silently skipped or fabricated.

## Definition of Done
- [ ] Add one canonical app-reader descriptor to `whop-app-reader.js` instead of a parallel reader registry elsewhere.
- [ ] Keep exact Better Content app ID as an explicitly supported rendered-app reader.
- [ ] Permit other Content-family rendered-app readers only when Whop resolves the exact stable app ID, marks the app verified, exposes a safe HTTPS `*.apps.whop.com` origin, and the app name matches the supported family.
- [ ] Bind browser-capture authorization to the resolved app metadata and captured frame host, not merely any `*.apps.whop.com` frame.
- [ ] Discovery must clearly distinguish `access confirmed · reader available`, `access confirmed · documented contract advertised but adapter unavailable`, and `access confirmed · reader unavailable` from actual access denial.
- [ ] Preserve explicit unsupported behavior when no authorized readable interface exists.
- [ ] Do not auto-execute arbitrary OpenAPI/Skills operations. Their presence is capability evidence only until a concrete adapter can normalize them safely.
- [ ] Add targeted tests for exact Better Content selection, verified Content-family selection, spoof/unverified rejection, frame-origin binding, metadata failure, and unsupported fallback.
- [ ] Run exact-head full Node 22 plus applicable Cloudflare checks, inspect final diff/reviews, merge, then require post-merge production validation.

## Backlog after this task
- Paid-subscriber authentication/billing onboarding with tenant-scoped real subscriber identity.
- Larger product/brand/UX redesign across the public site and Control Center.
- Required branch-check governance remains blocked until repository administration writes are available through the connection or configured outside this integration.

## Next step
Extend the existing app metadata helper into the canonical reader selector, wire that selector into discovery and browser-capture authorization, then add focused regressions before changing any other system.
