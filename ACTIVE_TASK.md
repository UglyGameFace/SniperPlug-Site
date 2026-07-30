# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so rejected or manually removed imports can be restored/re-imported, old media errors are replaced, every async action gives immediate persistent feedback, and Samsung Browser follows the same reliable interaction path as Chrome.

## Status
Active on `agent/whop-guide-importer`, draft PR #2. Do not merge until exact-head CI, Cloudflare deployment, conflict inspection, and authenticated Samsung Browser acceptance pass.

## Root causes
- Rejected imported guides keep their source row. The importer checked matching fingerprints before checking `status = rejected`, so re-import returned `unchanged` and never rebuilt the guide.
- Recent-action Undo only accepted currently published bulk results. Rejected imported guides were invisible and could not be restored.
- Busy state was attached only to the original button node. A rerender could replace that node while the request was active, removing visible feedback and permitting another tap.
- Press feedback was cleared after two animation frames instead of following the pointer lifecycle, which is less reliable in Samsung Browser.
- Chrome appeared better partly because it loaded the newest assets in a fresh browser cache.

## Changes in validation
- Rejected guides bypass the unchanged fingerprint shortcut and are rebuilt as drafts.
- Recent rejected imported guides are included in the 48-hour reversible history and restore to draft with their source decision reset to pending.
- Async operations use stable operation keys, paint feedback before network work, and reject duplicate taps even if a card rerenders.
- Pointer press feedback uses capture-phase pointerdown/pointerup/pointercancel handling.
- Control Center assets receive a new immutable version.

## Validation required
- Full Node 22 build and regression suite.
- Rejected-guide re-import test.
- Undo published and rejected actions.
- No duplicate operation submission after node replacement.
- Existing Whop video, R2, publishing, discovery, responsive, and security regressions pass.
- Temporary write workflow removed after validated commit.
- Cloudflare deploys exact cleaned head.

## Backlog
None. Stay on this task until Definition of Done passes.
