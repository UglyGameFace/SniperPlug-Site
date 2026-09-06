# Paid subscriber Control Center access

Paid SniperPlug subscribers can enter the importer without knowing the owner Control Center password. Subscriber access uses Whop OAuth/OIDC for identity plus a live entitlement check for one exact configured Whop product.

## Runtime configuration

Set the paid importer product ID in Cloudflare Preview and Production:

```text
WHOP_IMPORTER_PRODUCT_ID=prod_xxxxxxxxxxxxx
```

Use the exact Whop product ID that grants SniperPlug importer access. This value is an identifier, not a secret, but it still belongs in runtime configuration so Preview and Production can be changed without editing authorization code.

The existing private runtime requirements remain unchanged:

- `SNIPERPLUG_DB`
- `SNIPERPLUG_ADMIN_PASSWORD`
- `SNIPERPLUG_SESSION_SECRET`
- `WHOP_TOKEN_SECRET`

The Whop OAuth client ID/scopes and exact callback hosts remain configured through the existing SniperPlug Whop integration. `SNIPERPLUG_MEDIA` remains optional for text-only imports and required for permanent private-media copying.

If `WHOP_IMPORTER_PRODUCT_ID` is missing, malformed, cannot be verified, or the signed-in Whop user no longer has current access to that exact product, subscriber access fails closed. Owner password access remains available independently.

## Identity and session model

Subscriber identity comes from the verified Whop OIDC user identity. SniperPlug derives a stable account principal from that `user_...` identity and never uses email, mutable membership IDs, or a browser-local value as the tenant boundary.

Each browser still receives its own application session. Multiple devices signed into the same Whop user map to the same tenant principal without sharing browser-session identity.

The subscriber OAuth bootstrap has its own one-time server state, PKCE verifier, and narrowly scoped SameSite=Lax callback-correlation cookie. The pending OAuth flow is not an authenticated SniperPlug session.

After the Whop callback, SniperPlug verifies the returned Whop identity and current product entitlement before issuing the subscriber application session and moving the encrypted Whop connection under the stable subscriber principal.

## What subscribers can access

A currently entitled subscriber can use tenant-safe importer workspace operations such as:

- source discovery and source decisions
- Forum, Course, Chat, and authorized rendered-app capture
- draft import and safe draft editing
- Better Content browser-capture handoff
- bulk importer jobs that remain inside the subscriber tenant
- backup, restore, recovery, recent-action, and media-repair paths scoped to that tenant

Each protected subscriber request revalidates current application-account access. Temporary entitlement-verification failures deny access rather than silently trusting stale paid status.

## What remains owner-only

Subscriber access does not turn a paid customer into the SniperPlug site owner. The following remain owner-only:

- publishing guides into the public SniperPlug catalog
- shared/global guide-category mutation
- the owner Private Guides library and owner-only guide/media routes
- owner password/account controls
- owner-specific Whop connection bootstrap where explicitly required

Subscriber imports therefore cannot leak into, overwrite, or publish through the owner's workspace.

## Sign-in flow

On `/control-center/`, the login screen exposes two distinct entry paths:

1. **Owner access** uses the existing SniperPlug owner password.
2. **Paid subscriber access** starts the dedicated Whop subscriber OAuth flow.

These are intentionally separate credential paths. Subscriber sign-in never asks for or learns the owner password.

Subscriber logout clears only that browser's SniperPlug application session. Explicit Whop disconnect is principal-scoped and cannot delete another subscriber's or the owner's Whop connection.

## Safety guarantees

- Exact Whop product entitlement is required.
- OAuth state/callback correlation failures fail closed.
- Missing billing configuration fails closed for subscribers while preserving owner access.
- Cross-principal source, post, guide, backup, recovery, history, and bulk-job access is rejected.
- Public publishing and shared category changes remain owner-only.
- The removed `customer-pending`, old `paid-access.js`, old `/api/importer-login`, Discord-guild requirements, and global Whop-session adoption are not part of this design.

The normal `npm run build` regression chain includes subscriber identity, entitlement, OAuth flow, route-boundary, tenant-isolation, Better Content, publishing, backup, bulk, recovery, and site-integrity checks.
