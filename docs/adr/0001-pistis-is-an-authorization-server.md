# 1. Pistis is an OAuth 2.0 authorization server

- Status: Accepted
- Date: 2026-09-02

## Context

"Add OAuth" is ambiguous. It can mean becoming a *client* — letting people sign
in with Google or GitHub — or becoming a *server* that issues tokens other
applications consume. The two share a vocabulary and almost no code.

The codebase already stored users with bcrypt-hashed passwords in its own
tables, carried an empty `IdentityModule`, and had an `AuthService.login` that
verified a password and then stopped at a `// Create token or session` comment.
Nothing pointed outward at an external identity provider.

## Decision

Pistis is the authorization server. It owns the accounts, authenticates people
itself, and issues tokens that other applications validate.

It is not an OpenID Connect provider: there is no `id_token`, no `openid`
scope, and no OIDC discovery document. The RFC 8414 metadata it publishes
describes an OAuth 2.0 authorization server only.

## Consequences

The account store is ours, so password handling, session handling and account
recovery are all our problem rather than an identity provider's.

Being a server rather than a client is what makes everything else in these
records necessary: token formats, revocation, consent, and the separation
between a session and an access token.

Applications integrate against `docs`-worthy public contracts — the discovery
document and the endpoints listed in `api/README.md` — rather than against
internals, so those are effectively API surface and cannot be changed freely.

Adding OIDC later is additive (an `id_token`, a `userinfo` shaped to the OIDC
claims, an `openid` scope) and does not invalidate this decision. Becoming a
client of an external provider as well would be a new decision, not an
extension of this one.
