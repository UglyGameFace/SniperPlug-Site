# Whop OAuth and account switching

SniperPlug has one Control Center login: the private Control Center password. Whop OAuth is only a data connection attached to that already-authenticated owner session.

- Whop OAuth never creates a SniperPlug browser/admin session.
- The only durable Whop OAuth row used by the importer is `admin_session_id = sniperplug-owner`.
- OAuth starts at `/api/whop/oauth/start` and returns only to `/api/whop/oauth/callback`.
- Old `/api/control?action=oauth-*`, customer/pending sessions, and the former paid-access Control Center login are retired.
- Disconnect and switch are owner-authenticated, same-origin POST actions. They revoke the refresh token best-effort and always remove local OAuth session/state/refresh-lease data.
- Whop can keep its own browser login after SniperPlug revokes its token. SniperPlug therefore does not pretend it can force an account picker with undocumented OAuth parameters.
- To switch Whop users, SniperPlug disconnects first and shows an explicit two-step flow: open Whop.com and sign out/sign into the desired account, then return and continue the standard OAuth flow.
- OAuth callback status parameters are one-shot UI status only; the server-confirmed dashboard connection remains the source of truth.

This design does not change source approvals, recovery backups, publishing, or private-guide authorization.
