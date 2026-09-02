# 3. Application sessions are separate from OAuth access tokens

- Status: Accepted
- Date: 2026-09-02

## Context

The management dashboard needs to know who is using it. An OAuth access token
looks like it would do: it identifies a user, it is already issued, and it is
already validated.

It would not do. An access token says what a *third-party client* may do on a
user's behalf. Any registered client can obtain one — the client credentials
grant needs no user at all. Accepting access tokens on the management API would
mean anyone who can register a client can administer the server.

## Decision

A session is a distinct credential. It is signed with the same key as access
tokens but carries `typ: session+jwt` in its JWT header and an audience of
`<issuer>/session`, and `verifyJwt` pins the expected type.

`SessionGuard` accepts only session tokens; `AdminGuard` builds on it and adds
the administrator check. `POST /api/auth` issues sessions; the OAuth endpoints
never do.

## Consequences

An access token presented to the management API is rejected, and there is a
test asserting it. That single line — pinning `typ` — is the whole defence, so
relaxing verification to be "more permissive" would remove it.

Sharing one signing key keeps key management simple and means the published
JWKS covers both. The cost is that the separation lives entirely in claim
validation rather than in cryptography.

`SessionGuard` resolves the user from the database rather than trusting the
claims, so a session stops working the moment its account is deleted rather
than at expiry. That is one query per authenticated request.

Sessions cannot currently be revoked server-side: signing out clears the
cookie, but the token stays valid until `SESSION_TTL`. Fixing that needs a
session table, in the same shape as the access token one.
