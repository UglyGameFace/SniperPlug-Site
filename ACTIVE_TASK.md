# Active Task

## Current state
IN PROGRESS — Better Content automatic guide traversal and capture.

## User-visible failure
SniperPlug can auto-capture only pages the user manually opens. On a Better Content directory such as **Hidden Files → Make Money Here**, the extension sees the list of guide cards but does not automatically open and capture the guide bodies behind them.

## Root cause
- `browser-extension/content-capture.js` is intentionally DOM-only and captures only the currently rendered `*.apps.whop.com` frame.
- Existing auto-capture is passive: it watches DOM/URL changes after navigation but never initiates navigation itself.
- `browser-extension/background.js` only queues captures reported by already-rendered pages and caps the queue at 25.
- The server intentionally accepts at most 25 captures per request, so simply increasing the browser queue without chunked handoff would create another failure once a source has more than 25 guides.

## Required behavior
- Add an explicit **Capture all guides** action.
- Discover only safe same-origin/same-experience Better Content links from the rendered app frame; do not use Whop cookies, browser credentials, undocumented private APIs, or cross-origin crawling.
- Traverse discovered pages automatically, survive iframe reloads/navigation, deduplicate visited targets, skip directory/index shells, and stop cleanly when traversal is complete or bounded limits are reached.
- Preserve manual Capture page and navigation-driven Auto-capture behavior.
- Allow more than 25 queued pages while keeping storage bounded.
- Send large queues to SniperPlug in server-safe chunks without weakening the server-side 25-page and byte limits.

## Execution path
1. Popup requests automatic traversal from the background worker.
2. Background resolves the verified `*.apps.whop.com` candidate for the current Whop experience and stores traversal state in extension session storage.
3. Content script discovers safe navigable page links inside the rendered content root and reports stable traversal snapshots.
4. Background serializes traversal state, queues real guide captures, and instructs the same verified frame to navigate to the next safe target.
5. Candidate registration after iframe reload reattaches the traversal session and continues automatically.
6. Sending to SniperPlug remains same-origin through the signed-in Control Center relay; the relay chunks the queue into existing server-safe browser-capture batches.

## Scope
Expected affected area:
- `browser-extension/content-capture.js`
- `browser-extension/background.js`
- `browser-extension/popup.html`
- `browser-extension/popup.js`
- `browser-extension/sniperplug-relay.js`
- `browser-extension/manifest.json`
- extension regression tests / package audit list
- extension README
- this task record

## Validation required
- New traversal regression covering directory discovery → automatic navigation → guide capture → completion and unsafe-target rejection.
- Existing Firefox frame-selection and candidate-retention regressions remain green.
- Browser-capture security regression still proves the Whop content script is DOM-only and never calls private Whop APIs.
- Full repository `npm run audit` / CI passes on the exact PR head.
- Firefox Android extension packages successfully.
- Final diff contains no unrelated changes, debug code, credential access, broad host permissions, or weakened server capture limits.

## Cleanup / conflicts
- Do not replace the canonical app-frame verification or same-origin relay path.
- Do not add a second capture implementation when the existing extractor can be extended.
- Do not silently drop older captures when the traversal queue fills.

## Blockers / risks
- Better Content may render some controls without real links. The first implementation should automate actual same-frame navigable links safely; arbitrary button clicking is out of scope unless required by observed runtime evidence.

## Next step
Implement the smallest event-driven DOM traversal on `feature/whop-auto-guide-crawl`, add regressions, run exact-head CI, inspect the final diff, and only then merge.
