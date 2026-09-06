# Active Task

## Active task / outcome
Redesign and simplify the entire SniperPlug experience from the public site through the Control Center so the information architecture, navigation, hierarchy, mobile behavior, status language, accessibility, and task flows feel like one deliberate product instead of accumulated feature layers.

## Scope lock
- Active scope: public route architecture and navigation, shared visual/design tokens, homepage and marketing pages, retailer/deal surfaces, legal/error shells, Control Center information architecture, owner/subscriber entry states, source/import/review/publish/recovery flows, loading/empty/error/success states, mobile/tablet layouts, accessibility, terminology, action hierarchy, and removal of redundant presentation/runtime code discovered during the redesign.
- Preserve all proven security and data boundaries from the importer work: tenant isolation, owner-only public publishing/shared categories/private-guide library, exact Whop entitlement checks, same-origin protections, versioned writes, no blind retries, private media rules, and fail-closed publication gates.
- Do not create duplicate renderers, duplicate event handlers, second API implementations, or a parallel design system. Improve the existing canonical runtimes and shared CSS layers.
- Do not change backend behavior merely to make screenshots look cleaner. Backend changes require a concrete UX or correctness reason and matching regressions.
- Mobile/tablet is a first-class acceptance target, not a later CSS patch.

## Completed prerequisite
- PR #61 **Enable paid subscriber Control Center onboarding** merged as `fce18eb6dc212e7b6bd5dd5b805044c31025f426` and passed exact-head plus post-merge production validation.
- Paid subscriber access uses verified Whop OIDC identity plus exact `WHOP_IMPORTER_PRODUCT_ID` entitlement, while owner-global operations remain owner-only.

## Redesign progress already merged
- PR #62 **Improve shared navigation foundation** merged as `42b92fdbe38896bd68dcc82d5f0cc6c828d43830`.
  - Replaced the narrow-screen horizontal pill/sticky-owner workaround with one progressive mobile menu.
  - Added visible keyboard focus, 44px touch targets, Escape-to-close, reduced-motion support, and a no-JavaScript wrapped fallback.
- PR #63 **Clarify the Control Center journey** merged as `f80d7def8b811d60c05b93bf55d1f94f34e99e19`.
  - Established Connect Whop → Choose sources → Review content → Review guides as the primary workflow.
  - Separated Safety & recovery and optional category setup from the primary task hierarchy.
  - Clarified owner versus subscriber publication boundaries without changing canonical data/mutation ownership.

## Final completion pass on `ux/complete-full-site-redesign`
- Added `docs/UX_ARCHITECTURE.md` as the route, journey, status-language, responsive, accessibility, and runtime-ownership map.
- Added shared semantic surface/status/touch tokens in `site-shell.css` without creating another design-system stylesheet.
- Reworked the homepage value proposition around exact-offer understanding and added a truthful, prominent no-live-deals state.
- Reworked `/deals/` around one authoritative empty state, retailer coverage, and the exact publication standard instead of duplicating status cards.
- Simplified Control Center copy so implementation details do not dominate primary instructions.
- Moved detailed media-operation counters behind progressive `Usage details` disclosure.
- Fixed a real accessibility defect where the publishing evidence container was `aria-hidden` while containing a focusable Private Guides link; only the decorative track is hidden now.
- Added an accessible name to the guide list.
- Bounded the guide body editor more tightly on tablets/coarse pointers and phones while keeping sticky actions safe-area aware.
- Removed runtime-injected CSS from both `control-center-lifecycle.js` and `control-center-subscriber.js`; canonical static Control Center styles now own those presentation rules.
- Kept `control-center-v2.js`, the network guard, lifecycle, subscriber helper, backup runtime, and integrity compatibility layer in their existing singular responsibilities.
- Extended existing regressions and added `tools/audit-ux-completion.mjs` to prevent route/journey drift, duplicate presentation ownership, inaccessible publishing evidence, lost responsive bounds, or dishonest public empty states.

## Definition of Done
- [x] Map every user-facing route and group routes by purpose: discovery/marketing, trust/legal, retailer/deal browsing, owner/subscriber access, private guides/media, and error/recovery surfaces.
- [x] Audit shared tokens, typography, spacing, radii, controls, cards, status colors, responsive breakpoints, and duplicated component rules before changing visual code.
- [x] Map the key journeys: first-time visitor, deal/retailer browser, owner sign-in, paid subscriber sign-in, Whop connection, source discovery, import, review/edit, publish/unpublish, bulk completion, backup/recovery, and failure recovery.
- [x] Define one clearer navigation and page hierarchy for desktop, tablet, and phone without hiding important owner/subscriber actions.
- [x] Refactor shared visual foundations so global tokens/components are authoritative and page-specific CSS stops compensating for one another.
- [x] Improve homepage and public pages for clearer value proposition, trust, primary actions, scanability, and consistent empty/no-live-deal states.
- [x] Rework Control Center hierarchy so account/connection state, source selection, content review, guide review, and recovery are conceptually distinct.
- [x] Simplify status and error language so one state has one message surface and technical detail is progressive rather than dumped into the primary workflow.
- [x] Make mobile/tablet controls reachable, non-overlapping, appropriately sized, and ordered by task priority; prevent giant text areas/panels from taking over the viewport.
- [x] Improve accessibility: visible focus, semantic headings/landmarks, form labels, status announcements, contrast, touch targets, reduced-motion support, and keyboard navigation.
- [x] Remove redundant CSS/JS/markup discovered during the redesign only after proving the canonical replacement covers the same behavior.
- [x] Add/extend automated UX integrity checks for navigation ownership, duplicate controls, responsive hierarchy, accessibility markers, and canonical asset/runtime loading.
- [ ] Run exact-head Node 22/full regression plus applicable Cloudflare preview checks, inspect the final diff/review state, merge, then require post-merge production validation for the complete redesign.

## Branch-governance backlog
- `main` remains unprotected through the connected GitHub surface and no repository rulesets are visible.
- The GitHub App connection still lacks repository-administration write access required to configure mandatory checks, so this remains a separate blocked administrative item.

## Final gate
Open the completion PR, require the exact branch head to pass the complete Node 22 regression suite, Firefox Android packaging, applicable Cloudflare preview checks, and clean review state. Merge only that exact head, then require post-merge `main` production guide privacy, affiliate-ready production, retired-route, and full verification checks before closing this redesign.
