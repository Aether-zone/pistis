# 2. JWT access tokens, opaque refresh tokens, and a row per token

- Status: Accepted
- Date: 2026-09-02

## Context

Access tokens were originally opaque random strings, stored as SHA-256 digests
and resolved by a database lookup on every request. That is simple and revokes
instantly, but it forces every resource server to call Pistis to validate every
request, which couples their availability to ours.

The alternative — self-contained JWTs — removes that call, at the cost of the
property that made the first design safe: a signed token carries its own
authority and cannot express that it has been revoked.

## Decision

Access tokens are RS256 JWTs following RFC 9068, carrying `iss`, `sub`, `aud`,
`exp`, `iat`, `jti`, `client_id` and `scope`. Resource servers validate them
offline against the JWKS at `/.well-known/jwks.json`.

Refresh tokens stay opaque. They are only ever presented back to this server,
so they gain nothing from being self-describing.

**A database row survives per access token, keyed by `jti`.** Verification
checks the signature first — a forgery costs no query — then reads the row
purely to see whether the token was revoked.

## Consequences

A resource server can validate a token with no network call to Pistis, which is
the point.

Revocation is *not* free. `oauth_access_tokens` is not an optimisation and
deleting it would silently turn `/oauth/revoke` into a no-op for access tokens.
A resource server that validates offline will honour a revocation only when the
token expires; one that must honour it immediately has to call
`/oauth/introspect`, which is authoritative.

Access token lifetime is now a security parameter: it bounds how long a revoked
token remains useful to an offline validator. The default is one hour.

Refresh tokens rotate, and presenting a rotated one revokes the whole family
descended from that authorization code. This detects a stolen token, and it
also means a client that loses the response to a refresh and retries with the
old token will sign the person out. Clients must persist the new token before
using the new access token.
