# SniperPlug UX Architecture

This document is the product/UX map for the public site and Control Center. It exists to keep future work inside the same information architecture instead of growing another layer beside it.

## Route groups

### Discovery and marketing
- `/` — public value proposition, current board status, verification model, retailer coverage, partner entry.
- `/about/` — what SniperPlug is, what it publishes, and how verification works.
- `/partners/` — retailer, affiliate-network, catalog, API, and data-provider context.
- `/contact/` — support, correction, legal, and partnership contact paths.

### Retailer and deal browsing
- `/deals/` — authoritative public board status plus the publication standard.
- `/deals/walmart/`
- `/deals/lowes/`
- `/deals/best-buy/`
- `/deals/home-depot/`
- `/deals/amazon/`

Retailer pages explain store-specific verification requirements. They are not placeholder deal feeds. A public deal card requires a current exact-product record and official destination.

### Trust and legal
- `/affiliate-disclosure/`
- `/privacy/`
- `/terms/`
- `/404.html`

### Account and importer access
- `/control-center/` — one entry for owner password access and paid-subscriber Whop access.
- `/api/subscriber/oauth/start` and Whop callback routes — subscriber identity/entitlement bootstrap, not a second Control Center.

### Private owner surfaces
- `/guides/` and `/guides/:slug/` — owner-only reviewed guide library.
- `/media/*` and `/course-video/*` — authenticated private media/recovery surfaces where required.

## Primary user journeys

### First-time visitor
1. Understand what SniperPlug verifies.
2. See the truthful current public board state.
3. Browse retailer coverage or learn how verification works.
4. Follow an exact retailer destination only when a verified deal exists.

### Retailer/deal browser
1. Open `/deals/`.
2. See whether verified public cards are currently active.
3. Choose a retailer coverage page.
4. Understand the identity, seller, fulfillment, location, promotion, and condition checks required for that retailer.

### Owner
1. Open Control Center.
2. Unlock with the owner password.
3. Connect/verify Whop.
4. Choose approved sources.
5. Review source content.
6. Import approved drafts.
7. Review/edit guides.
8. Save before publishing.
9. Publish/unpublish through the one canonical guide lifecycle.
10. Use Safety & recovery only when backup, restore, or safe reset is needed.

### Paid subscriber
1. Open Control Center.
2. Sign in with Whop.
3. SniperPlug verifies the exact configured product entitlement.
4. Use the isolated subscriber importer workspace.
5. Choose sources, review content, and import/review private drafts.
6. Owner-only publishing, shared categories, and Private Guides remain unavailable.

### Failure recovery
1. Show one concise primary status close to the action that failed.
2. Keep technical details secondary when they are useful for recovery.
3. Never retry a write blindly.
4. Refresh authoritative saved state before repeating an unconfirmed mutation.
5. Use the Safety & recovery surface for backup/restore/reset rather than adding another recovery implementation.

## Control Center hierarchy

The primary workflow is fixed:

1. **Connect Whop**
2. **Choose sources**
3. **Review content**
4. **Review guides**

**Safety & recovery** is secondary and progressively disclosed. **Guide categories** are optional owner setup.

The following runtimes remain authoritative:
- `control-center-v2.js` — normal data reads, mutations, bulk state, and canonical rendering.
- `control-center-network-guard.js` — request/version protection and no-blind-retry behavior.
- `control-center-lifecycle.js` — dirty-draft protection, editor lifecycle, and local action feedback.
- `control-center-subscriber.js` — bounded account-specific presentation only.
- `control-center-whop-backups.js` — backup/recovery workflow.
- `control-center-integrity-fix.js` — preview compatibility and media repair only.

No second renderer or parallel mutation path should be added for any of these concerns.

## Shared UI language

### Status vocabulary
- **Ready** — action can proceed.
- **Working** — request is in progress.
- **Saved** — server-confirmed private state.
- **Published** — server-confirmed owner Private Guides state.
- **Needs review** — private draft awaiting a decision.
- **Held safely** — intentionally not published/imported because a safety or integrity gate blocked it.
- **Unavailable** — required access or dependency is not currently usable.
- **Error** — the attempted action failed and requires a user recovery step.

Avoid using multiple nearby surfaces to report the same state. Long quota IDs, API codes, and implementation details belong in secondary diagnostics, not the primary instruction.

## Shared visual foundation

- `site-base.css` remains the foundational typography/layout/component layer.
- `site-shell.css` owns the global shell, exact logo rendering, focus treatment, shared state cards, common touch-target rules, and responsive navigation.
- `homepage.css` owns public marketing/coverage composition only.
- Control Center feature CSS may style its own canonical component, but browser runtimes must not inject competing style blocks.
- Shared status colors use success/info/warning/error semantics consistently.

## Responsive acceptance

- Touch targets are at least 44 px.
- Shared navigation becomes an explicit progressive menu at 760 px and below.
- Control Center two-column/task grids collapse before they can create horizontal scrolling.
- Guide body editing is bounded on coarse pointers/tablets and smaller again on phones so actions remain reachable.
- Sticky editor actions stay above safe-area insets and must not overlap content.
- Reduced-motion preferences disable decorative transitions/animations where motion is not required for meaning.

## Accessibility baseline

Every user-facing surface should preserve:
- a skip link where a full page shell exists;
- semantic `main`, `nav`, headings, labels, and dialogs;
- visible `:focus-visible` state;
- labelled inputs and controls;
- `aria-live`/status announcements for asynchronous outcomes;
- keyboard-close behavior for progressive navigation/dialogs;
- readable contrast and non-color-only state labels;
- no inline event handlers or duplicate DOM IDs.
