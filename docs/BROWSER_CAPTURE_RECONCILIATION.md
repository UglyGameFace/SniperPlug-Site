# Browser capture server reconciliation

SniperPlug's Firefox Better Content capture flow uses two layers of duplicate/change detection:

1. **Local extension history** for fast repeat scans on the same Firefox profile.
2. **Authoritative server reconciliation** before any import write, scoped to the signed-in SniperPlug tenant and re-verified connected Whop account.

The server classifies each queued capture as:

- `already-imported` / `unchanged` — the exact server-owned guide fingerprint already exists.
- `new` — no matching source or identical guide exists and a private draft may be created.
- `changed` — an existing unreviewed draft differs and may be safely updated.
- `duplicate` — identical content already exists under another/legacy source identity.
- `held` — the matching guide is published, manually reviewed, or removed/rejected and must not be overwritten automatically.

Only captures with `needsImport: true` are sent through the write path. Failed reconciliation or import leaves the extension pending queue intact. A fully successful handoff commits local extension history so subsequent scans on that Firefox profile can skip unchanged content without another server roundtrip.

Reconciliation never grants broader access. It uses the same account entitlement, connected Whop session, current membership check, supported rendered-app reader boundary, same-origin API protection, payload bounds, and private-review rules as browser capture import.
