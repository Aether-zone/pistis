# 5. The authorization endpoint is a JSON API, not a redirect

- Status: Accepted
- Date: 2026-09-02

## Context

RFC 6749 describes `/authorize` as a browser endpoint: the user agent arrives,
the server authenticates the person, asks for consent, and answers with a 302
to the client's redirect URI.

That shape assumes the authorization server renders HTML and owns a login
session. Pistis's API renders nothing, and when this was built it had no
session concept at all.

## Decision

Split the endpoint in two, both returning JSON:

- `GET /api/oauth/authorize` validates the request and *describes* it — the
  client's name, the scopes being requested — so a consent screen can render
  it. Nothing is issued.
- `POST /api/oauth/authorize` carries the resource owner's credentials and
  their answer, and returns the URL to send the user agent to. That URL already
  carries `code` and `state`, or `error=access_denied`.

The web app's `/login` route is that consent screen and performs the redirect.

## Consequences

Validation happens before anyone types a password: an unknown client or an
unregistered redirect URI is refused by `GET`, so credentials are never
collected for a request that could not succeed.

The consent UI is replaceable — anything that can call two JSON endpoints can
be one — and the API stays renderer-free.

The cost is that the flow is not the one an off-the-shelf OAuth client library
expects at `/authorize`. Integrators are pointed at the web app's `/login`
instead, which is documented in `api/README.md`. A client that hard-codes the
authorization endpoint from the discovery document and expects a 302 will not
work without the consent screen in front of it.

RFC 6749 §4.1.2.1's distinction is preserved: a bad `client_id` or redirect URI
is an error *to the caller*, never a redirect to an unverified target, while a
denial by the resource owner is a redirect carrying `access_denied`.
