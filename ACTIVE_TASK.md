# Active Task

## Active task / outcome
Redesign and simplify the entire SniperPlug experience from the public site through the Control Center so the information architecture, navigation, hierarchy, mobile behavior, status language, accessibility, and task flows feel like one deliberate product instead of accumulated feature layers.

## Scope lock
- Active scope: public route architecture and navigation, shared visual/design tokens, homepage and marketing pages, retailer/deal surfaces, legal/error shells, Control Center information architecture, owner/subscriber entry states, source/import/review/publish/recovery flows, loading/empty/error/success states, mobile/tablet layouts, accessibility, terminology, action hierarchy, and removal of redundant presentation/runtime code discovered during the redesign.
- Preserve all proven security and data boundaries from the importer work: tenant isolation, owner-only public publishing/shared categories/private-guide library, exact Whop entitlement checks, same-origin protections, versioned writes, no blind retries, private media rules, and fail-closed publication gates.
- Do not create duplicate renderers, duplicate event handlers, second API implementations, or a parallel design system. Improve the existing canonical runtimes and shared CSS layers.
- Do not change backend behavior merely to make screenshots look cleaner. Backend changes require a concrete UX or correctness reason and matching regressions.
- Mobile/tablet is a first-class acceptance target, not a later CSS patch.

## Completed previous task
- PR #61 **Enable paid subscriber Control Center onboarding** merged into `main` as `fce18eb6dc212e7b6bd5dd5b805044c31025f426`.
- Final PR head `68919473a953ef05ccead150cb55366f37f7f3d9` passed **Verify SniperPlug #1057**, affiliate-ready preview #123, retired public route #124, Firefox Android extension packaging/upload, and had no review threads or submitted reviews.
- Post-merge `main` passed **Verify SniperPlug #1058**, **Verify production guide privacy #88**, **Verify affiliate-ready production #84**, and **Verify retired public deal routes #125**.
- Issue #60 closed automatically as completed.
- Paid subscriber access now uses verified Whop OIDC identity plus exact `WHOP_IMPORTER_PRODUCT_ID` entitlement, while owner-global operations remain owner-only.

## Starting architecture observations
- Public styling is layered through `assets/css/site-base.css`, `site-shell.css`, and page-specific files such as `homepage.css`; the Control Center has its own base plus several feature-specific CSS files.
- `site-base.css` currently owns both foundational tokens and a large collection of component/page rules, which makes global changes easy to overreach.
- The public header uses horizontally scrolling pill navigation on narrow screens instead of a deliberate mobile navigation pattern.
- Control Center functionality is intentionally consolidated in canonical runtimes, but the page has accumulated many feature panels and specialized style layers. The redesign must improve hierarchy without reintroducing duplicate state machines.
- The existing regression suite already protects route safety, public-theme consistency, importer behavior, mobile Control Center behavior, publication lifecycle, security, media, tenant ownership, and site-integrity constraints. The redesign should extend those audits rather than bypass them.

## Definition of Done
- [ ] Map every user-facing route and group routes by purpose: discovery/marketing, trust/legal, retailer/deal browsing, owner/subscriber access, private guides/media, and error/recovery surfaces.
- [ ] Audit shared tokens, typography, spacing, radii, controls, cards, status colors, responsive breakpoints, and duplicated component rules before changing visual code.
- [ ] Map the key journeys: first-time visitor, deal/retailer browser, owner sign-in, paid subscriber sign-in, Whop connection, source discovery, import, review/edit, publish/unpublish, bulk completion, backup/recovery, and failure recovery.
- [ ] Define one clearer navigation and page hierarchy for desktop, tablet, and phone without hiding important owner/subscriber actions.
- [ ] Refactor shared visual foundations so global tokens/components are authoritative and page-specific CSS stops compensating for one another.
- [ ] Improve homepage and public pages for clearer value proposition, trust, primary actions, scanability, and consistent empty/no-live-deal states.
- [ ] Rework Control Center hierarchy so account/connection state, source selection, import work, review/publish, bulk progress, and recovery are visually and conceptually distinct.
- [ ] Simplify status and error language so one state has one message surface and technical detail is progressive rather than dumped into the primary workflow.
- [ ] Make mobile/tablet controls reachable, non-overlapping, appropriately sized, and ordered by task priority; prevent giant text areas/panels from taking over the viewport.
- [ ] Improve accessibility: visible focus, semantic headings/landmarks, form labels, status announcements, contrast, touch targets, reduced-motion support, and keyboard navigation.
- [ ] Remove redundant CSS/JS/markup discovered during the redesign only after proving the canonical replacement covers the same behavior.
- [ ] Add/extend automated UX integrity checks for navigation ownership, duplicate controls, responsive hierarchy, accessibility markers, and canonical asset/runtime loading.
- [ ] Run exact-head Node 22/full regression plus applicable Cloudflare preview checks, inspect the final diff/review state, merge, then require post-merge production validation.

## Branch-governance backlog
- `main` remains unprotected through the connected GitHub surface and no repository rulesets are visible.
- The GitHub App connection still lacks repository-administration write access required to configure mandatory checks, so this remains a separate blocked administrative item.

## Next step
Finish architecture/token/journey inspection on current `main`, then create the redesign branch and make the first structural pass against shared navigation and design foundations before touching individual page cosmetics.
