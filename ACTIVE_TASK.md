# Active Task

## Active task / outcome
Fix Firefox Android Better Content Capture-all so the real Make Money Here directory captures every accessible rendered guide instead of queueing only the directory shell, and make the in-page Capture-all progress HUD controllable/removable.

## Status
IN PROGRESS — runtime regression reproduced on extension 0.2.6. Branch: `fix/capture-all-card-activation-hud`.

## Runtime evidence
- The rendered Make Money Here directory visibly contains many guide cards, but Capture-all reports `1 of 1 known pages checked` and queues only `Content`.
- That proves the current URL-only target discovery is not seeing Whop's rendered card navigation.
- The in-page `SniperPlug Capture-all` HUD remains pinned over the page after the crawl ends and has no minimize, stop, or close controls.

## Root cause
- `discoverTraversalTargets()` only recognizes anchors/href-style DOM targets (`a[href]`, role=link+href, data-href, data-url).
- The live Better Content directory uses rendered clickable card controls for at least this view; those cards do not expose an href through the current reader, so the crawler discovers zero children.
- With no child targets, the directory itself is misclassified/captured as the only page and the traversal immediately completes.
- The foreground HUD was intentionally created with `pointerEvents: none` and no controls, and terminal states had no dismissal timer.

## Fix in this task
- Keep URL traversal as the first-class path.
- Add bounded rendered click-card discovery for visible non-form, non-dangerous card controls that lack safe hrefs, including cursor-pointer React cards.
- Give every click-only card a same-origin synthetic traversal identity while retaining its verified parent directory URL, title, label, and ordinal.
- Background remains the authoritative crawler: it returns to the parent directory between click-only guides, activates the exact rendered card, waits for the rendered detail state, then resumes the same queue/retry/persistence machinery.
- Expand safe collapsed sections (`aria-expanded=false`) before discovering cards.
- Directory shells with click-only children are classified as directories rather than queued as guides.
- Add HUD minimize, stop, and hide controls; Stop routes through background traversal authority; completed/error/stopped HUDs auto-dismiss after a short result display.
- Bump Firefox Android extension/version contract to 0.2.7.
- Add regression coverage for click-only card traversal and HUD controls.

## Safety preserved
- Rendered DOM only; no Whop cookie permission, credential forwarding, or private API probing.
- Same HTTPS app origin/experience scope and sensitive-route rejection remain authoritative.
- Click activators are limited to visible rendered controls inside the selected content root; forms, dangerous labels, href-backed controls, tabs, popups, disabled controls, tiny/icon controls, and generic action buttons are rejected.
- Existing traversal visit/retry/queue limits, server authorization, reconciliation, and private-draft review path remain intact.

## Next step
Run the complete repository regression/package gate on the exact implementation head, inspect the final diff/reviews, merge if green, validate `main`, then hand off the validated 0.2.7 XPI for real-device confirmation.
