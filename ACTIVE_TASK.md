# Active Task

## Active task / outcome
Firefox Android Better Content capture reliability follow-up to PRs #71 and #72. Device testing showed Capture-as-I-browse worked while Capture page / Capture-all could stall when the rendered Whop frame was backgrounded or the first traversal snapshot timer never fired.

## Status
COMPLETE AND MERGED — PR #73 shipped the unified Firefox Android capture reliability fix in extension `0.2.5`. No implementation task is currently active.

## Root cause
- Capture-all still depended on a 900 ms content-frame timer for its first seed-page snapshot.
- Before a first snapshot there is no `currentTarget`, so the existing navigation watchdog could not repair a lost/throttled startup timer.
- Firefox Android can throttle the short waits used by full rendered-page preparation when the Whop frame is backgrounded behind the extension UI.
- Capture-as-I-browse worked because Whop remained foreground while the user navigated.

## Shipped fix
- A genuine Capture-all attach starts the seed snapshot immediately; the 900 ms scheduler remains only for follow-up DOM mutations.
- Background can force `traversal-snapshot-now` and uses a 5-second startup watchdog with at most three bounded repair attempts.
- Startup fails visibly after bounded recovery instead of showing infinite `Settling…`.
- Per-document identity prevents same-document candidate churn from repeatedly reattaching the crawler while preserving real reload/reinjection recovery.
- Starting/resuming Capture-all foregrounds the Whop tab so rendered-page work stays alive on Firefox Android.
- Capture-all progress is also shown in-page while Whop is foreground.
- Manual Capture page remains available during Capture-all and foregrounds Whop before using the existing full rendered-page capture primitive.
- Capture-as-I-browse remains unchanged because it is the device-proven working path.
- Firefox Android extension/version contract advanced to `0.2.5`.

## Safety preserved
- Rendered-DOM-only reading in the verified Whop app frame.
- Same-origin/same-experience traversal and sensitive-route rejection remain enforced.
- Existing queue/retry limits and server authorization remain intact.
- No cookie permission, credential/token forwarding, private Whop API probing, or second crawler was introduced.

## Validation / results
Final PR head `75c1b5ad0d75868c2afc1759cd02ab2ef8844e83`:
- Verify SniperPlug #1104 passed, including the full repository regression suite and Firefox Android XPI packaging.
- Cloudflare Pages preview passed.
- Preview/retired-route checks passed.
- Vercel preview feedback reported 0 unresolved items.
- No inline review threads or submitted review findings were outstanding.

Merged `main` commit `85d8cc13b3dfa204c5bfdf57be4a5cc66a4c5265`:
- Verify SniperPlug #1105 passed, including full regression validation, package creation, and artifact upload.
- Verify production guide privacy #110 passed.
- Verify affiliate-ready production #106 passed.
- Verify retired public deal routes #149 passed.
- Cloudflare Pages deployment passed on the exact merge commit.
- Production artifact `sniperplug-firefox-android-xpi` ID `10012465099`, digest `sha256:d3b9a64226755f657b586e37f9c738be08564b207a10b503b36f2581266a2cca`.

## Remaining runtime confirmation
The code task is complete. Device testing must use the newly packaged `0.2.5` extension before judging this fix; older `0.2.4` installs do not contain the foreground/startup-watchdog changes. Any failure reproduced on `0.2.5` is a regression continuation of this capture task; otherwise the next unrelated coding request is a separate active task.
