# Active Task

## Active task / outcome
Fix Firefox Android Better Content Capture-all so the real Make Money Here directory captures every accessible rendered guide instead of queueing only the directory shell, and make the in-page Capture-all progress HUD controllable/removable.

## Status
IMPLEMENTED — PR #75 (`fix/capture-all-card-activation-hud`) now contains the runtime fix as Firefox Android extension `0.2.7`. Exact-head repository validation and final review are the remaining merge gates.

## Runtime evidence
- On extension `0.2.6`, the rendered Make Money Here directory visibly contains many guide cards while Capture-all reports `1 of 1 known pages checked` and queues only `Content`.
- The popup simultaneously reports that no capturable guide pages were found, confirming that the directory shell, not its children, was queued.
- The in-page `SniperPlug Capture-all` HUD remains pinned after completion and has no minimize, stop, or hide control.

## Root cause
- Existing discovery recognized href-style targets only (`a[href]`, role=link+href, `data-href`, `data-url`).
- This Better Content directory renders guide rows as React click controls without a usable href in the reader, so the crawler discovered zero children.
- With no child targets, the directory shell could be classified/queued as the only page and traversal immediately completed.
- The foreground HUD used `pointerEvents: none`, exposed no controls, and had no terminal dismissal timer.

## Implemented fix
- URL traversal remains first-class.
- Added bounded discovery of visible safe click-only guide controls, including role-link, role-button, keyboard-interactive, and cursor-pointer cards.
- Click-only cards receive stable same-origin traversal identities while retaining their verified parent directory URL/title, label, and occurrence ordinal.
- Background remains authoritative: it returns to the parent directory between click-only guides, activates the exact rendered card, waits for the detail render, then continues through the existing persistent retry/queue machinery.
- Same-URL SPA detail views are distinguished from their parent directory using rendered directory state rather than URL alone.
- Activated guides receive unique page identities and local stable keys so multiple same-URL guides cannot overwrite each other; stable keys survive queue deduplication and Firefox tab migration.
- Duplicate/no-op snapshots no longer cancel the bounded active-target timeout, and an unchanged activation explicitly keeps its retry timeout armed.
- Safe collapsed `aria-expanded=false` sections are expanded before discovery, and click-card children participate in directory classification.
- HUD now has Minimize, Stop, and Hide controls. Stop routes through the authoritative background traversal. Terminal HUD states auto-dismiss after a short result display.
- Firefox Android extension/version contract is `0.2.7`.
- Added `test-browser-click-card-traversal.mjs` to the normal audit chain, covering click-card discovery/activation, same-URL state/identity handling, retry preservation, and HUD controls.

## Safety preserved
- Rendered DOM only; no Whop cookie permission, credential forwarding, or private API probing.
- Same HTTPS app origin/experience scope and sensitive-route rejection remain authoritative.
- Click activators reject forms, dangerous labels, href-backed controls, tabs/popups, disabled/disclosure controls, huge containers, tiny/icon controls, and generic action buttons.
- Existing traversal visit/retry/queue limits, server authorization/reconciliation, and private-draft review remain intact.

## Next step
Run the complete repository regression/package gate on this exact PR head, inspect the final diff and review threads, merge only if green, validate `main`, then hand off the validated `0.2.7` XPI for real-device confirmation.