# Whop OAuth status truth

SniperPlug treats the server-confirmed dashboard connection as the current source of truth after an OAuth redirect.

- Whop OIDC userinfo identifies the authenticated user with `sub` (`user_...`).
- Customer OAuth begins inside an isolated pending session that cannot call normal Control Center APIs.
- Successful customer OAuth promotes that pending session to the exact `whop-user:user_...` session only after the user identity is valid.
- Failed customer OAuth removes the pending Whop session and clears the pending browser session.
- `whop` and `message` redirect parameters are one-shot status data. The Control Center consumes and removes them before the main runtime starts so refresh cannot replay an old error.
- If a callback error and a currently verified Whop dashboard disagree, the live verified dashboard wins. If Whop remains disconnected, the callback error remains visible.

This status handling does not change source approval, paid-access entitlement checks, backup scope, restore behavior, or the owner-only private guide boundary.
