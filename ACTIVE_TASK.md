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
- PR #61 **Enable paid subscriber Control Center onboarding** merged into `main` as `fce18eb6dc212e7b6bd5dd5b805044c31025f426`.
- Final PR head `68919473a953ef05ccead150cb55366f37f7f3d9` passed **Verify SniperPlug #1057**, affiliate-ready preview #123, retired public route #124, Firefox Android extension packaging/upload, and had no review threads or submitted reviews.
- Post-merge `main` passed **Verify SniperPlug #1058**, **Verify production guide privacy #88**, **Verify affiliate-ready production #84**, and **Verify retired public deal routes #125**.
- Issue #60 closed automatically as completed.
- Paid subscriber access now uses verified Whop OIDC identity plus exact `WHOP_IMPORTER_PRODUCT_ID` entitlement, while owner-global operations remain owner-only.

## Redesign progress already merged
- PR #62 **Improve shared navigation foundation** merged as `42b92fdbe38896bd68dcc82d5f0cc6c828d43830`.
  - Replaced the narrow-screen horizontal pill-scroller / sticky-owner-link workaround with one progressive mobile menu.
  - Added visible keyboard focus, 44px touch targets, Escape-to-close behavior, reduced-motion support, and a no-JavaScript navigation fallback.
  - Kept the SniperPlug wordmark visible on mobile and normalized the old `Owner access` label to the now-correct `Control Center` destination.
  - Exact head passed full Node 22 + Firefox Android packaging and Cloudflare preview checks before merge.
- PR #63 **Clarify the Control Center journey** merged as `f80d7def8b811d60c05b93bf55d1f94f34e99e19`.
  - Added one presentation-only workflow navigator: Connect Whop → Choose sources → Review content → Review guides.
  - Moved Safety & recovery out of the primary task path conceptually without replacing its canonical runtime.
  - Clarified owner versus paid-subscriber language and made owner-only publishing boundaries explicit.
  - Marked category management as optional setup instead of a primary workflow step.
  - Added responsive, touch-sized, keyboard-visible journey styling and a dedicated journey audit.
  - Exact head passed full Node 22, Firefox Android packaging, Cloudflare preview, retired-route validation, and had no outstanding review threads.
- Post-merge production validation for the latest Control Center journey pass is green for production guide privacy and affiliate-ready production.

## Architecture observations
- Public styling is layered through `assets/css/site-base.css`, `site-shell.css`, and page-specific files such as `homepage.css`; the Control Center has its own base plus several feature-specific CSS files.
- `site-base.css` currently owns both foundational tokens and a large collection of component/page rules, which makes global changes easy to overreach.
- Public mobile navigation is now a deliberate progressive menu rather than a horizontally scrolling pill row.
- Control Center functionality remains consolidated in canonical runtimes; the redesign is changing hierarchy and presentation without creating another state machine.
- The existing regression suite protects route safety, public-theme consistency, importer behavior, mobile Control Center behavior, publication lifecycle, security, media, tenant ownership, and site-integrity constraints. New UX audits are being added alongside those checks instead of bypassing them.

## Definition of Done
- [ ] Map every user-facing route and group routes by purpose: discovery/marketing, trust/legal, retailer/deal browsing, owner/subscriber access, private guides/media, and error/recovery surfaces.
- [ ] Audit shared tokens, typography, spacing, radii, controls, cards, status colors, responsive breakpoints, and duplicated component rules before changing visual code.
- [ ] Map the key journeys: first-time visitor, deal/retailer browser, owner sign-in, paid subscriber sign-in, Whop connection, source discovery, import, review/edit, publish/unpublish, bulk completion, backup/recovery, and failure recovery.
- [x] Define one clearer navigation and page hierarchy for desktop, tablet, and phone without hiding important owner/subscriber actions.
- [ ] Refactor shared visual foundations so global tokens/components are authoritative and page-specific CSS stops compensating for one another.
- [ ] Improve homepage and public pages for clearer value proposition, trust, primary actions, scanability, and consistent empty/no-live-deal states.
- [x] Rework the first Control Center hierarchy pass so account/connection state, source selection, content review, guide review, and recovery are conceptually distinct.
- [ ] Simplify status and error language so one state has one message surface and technical detail is progressive rather than dumped into the primary workflow.
- [ ] Make mobile/tablet controls reachable, non-overlapping, appropriately sized, and ordered by task priority; prevent giant text areas/panels from taking over the viewport.
- [ ] Improve accessibility: visible focus, semantic headings/landmarks, form labels, status announcements, contrast, touch targets, reduced-motion support, and keyboard navigation.
- [ ] Remove redundant CSS/JS/markup discovered during the redesign only after proving the canonical replacement covers the same behavior.
- [ ] Add/extend automated UX integrity checks for navigation ownership, duplicate controls, responsive hierarchy, accessibility markers, and canonical asset/runtime loading.
- [ ] Run exact-head Node 22/full regression plus applicable Cloudflare preview checks, inspect the final diff/review state, merge, then require post-merge production validation for the complete redesign.

## Branch-governance backlog
- `main` remains unprotected through the connected GitHub surface and no repository rulesets are visible.
- The GitHub App connection still lacks repository-administration write access required to configure mandatory checks, so this remains a separate blocked administrative item.

## Next step
Continue with the public-site and shared-design-system pass: normalize Control Center/public terminology, audit the homepage and retailer pages for duplicated or weak hierarchy, simplify shared tokens/components without adding another CSS layer, then tackle status/error presentation and the remaining tablet/mobile edge cases.
