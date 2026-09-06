# Whop OAuth and account switching

SniperPlug has application-owned Control Center sessions for the private owner workspace and paid subscriber workspaces. Whop OAuth is a separate data connection attached to the authenticated SniperPlug principal.

- Whop OAuth never creates the owner Control Center password session.
- Durable Whop OAuth rows are principal-scoped: the owner uses `admin_session_id = sniperplug-owner`, while paid subscriber workspaces use their stable Whop-user principal.
- Owner OAuth starts at `/api/whop/oauth/start`; subscriber bootstrap starts at `/api/subscriber/oauth/start`; both return only to `/api/whop/oauth/callback` and are separated by one-time browser correlation cookies.
- Old `/api/control?action=oauth-*`, customer/pending owner sessions, and the former paid-access owner login are retired.
- Disconnect and switch are authenticated, same-origin POST actions. They revoke the refresh token best-effort and remove only that principal's local OAuth session/state/refresh-lease data.
- Whop can keep its own browser login after SniperPlug revokes its token. SniperPlug therefore does not pretend it can force an account picker with undocumented OAuth parameters.
- A deliberate **Switch Whop account** now records the Whop user identity being left in a signed, short-lived, callback-scoped browser intent before disconnecting.
- If Whop's browser SSO returns that exact same user during the switch, SniperPlug rejects the callback, revokes/deletes the newly returned connection, and keeps the workspace disconnected. A switch only succeeds when Whop actually returns a different user identity.
- To complete a switch, open Whop.com and sign out or change to the desired Whop account, then continue the standard OAuth flow. If Whop still reuses the old browser account, SniperPlug will refuse to silently reconnect it.
- OAuth callback status parameters are one-shot UI status only; the server-confirmed dashboard connection remains the source of truth.

This design does not change source approvals, recovery backups, publishing, private-guide authorization, or subscriber entitlement checks.
