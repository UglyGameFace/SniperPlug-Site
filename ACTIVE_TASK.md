# Active Task

## Active task / outcome
Fix Firefox Android Better Content Capture-all so rendered click-only Better Content guide cards are captured instead of collapsing to the directory shell, and make the in-page Capture-all progress HUD controllable/removable.

## Status
COMPLETE AND MERGED — PR #75 shipped the fix as Firefox Android extension `0.2.7`. No implementation task is currently active.

## Root cause addressed
- Capture-all only discovered href-style targets, while the live Better Content directory renders guide rows as React click controls without usable hrefs.
- That left the directory with zero discovered children, allowing the directory shell to be treated as the only page.
- The in-page HUD used `pointerEvents: none`, exposed no controls, and had no terminal dismissal timer.

## Shipped fix
- Preserved safe URL traversal as first-class behavior.
- Added bounded discovery and activation of visible safe click-only rendered guide cards.
- Added stable same-origin traversal identities plus parent-directory, label, and ordinal metadata for click-only cards.
- Kept background traversal authoritative, including return-to-parent behavior between activated cards, retry/queue persistence, and server reconciliation.
- Added same-URL SPA detail handling and unique identities so multiple guides cannot overwrite one another.
- Preserved active-target retry timeouts across duplicate/no-op snapshots.
- Expanded safe collapsed sections before discovery and included click-card children in directory classification.
- Added HUD Minimize, Stop, and Hide controls; Stop routes through the authoritative background traversal and terminal states auto-dismiss.
- Bumped the Firefox Android extension/version contract to `0.2.7`.
- Added focused click-card traversal/HUD regression coverage to the normal repository audit chain.

## Validation and merge record
- Final PR head: `39b4ea86e52e53765a3332ac0178050bc724697d`.
- Exact-head PR validation passed: Verify SniperPlug #1113, affiliate-ready preview #147, retired public deal routes #155, and Cloudflare Pages preview.
- Qodo review was externally paused because its subscription is inactive; it produced no review finding.
- Vercel preview deployment was externally blocked by the free-tier daily deployment quota, not an application failure.
- PR #75 was squash-merged to `main` as `d330aac11a2c1dc20f119ccd8f559222ff617343`.
- Post-merge `main` validation passed: Verify SniperPlug #1114, production guide privacy, retired public deal routes, production smoke, and Cloudflare Pages deployment.
- Validated Firefox Android XPI artifact: `sniperplug-firefox-android-xpi`, artifact ID `10021977793`, SHA-256 `bdb45a955fd75ea7b37c36714d4975bcdd331eb3c659ff7a24744ccb1a5d8319`.

## Safety preserved
- Rendered DOM only; no Whop cookie permission, credential forwarding, or private API probing.
- Same HTTPS app origin/experience scope and sensitive-route rejection remain authoritative.
- Existing traversal visit/retry/queue limits, server authorization/reconciliation, and private-draft review remain intact.

## Next step
No repository work remains for PR #75. Real-device confirmation should use the validated `0.2.7` XPI. Any new defect becomes a separate active task unless it is clearly a regression of this fix.
