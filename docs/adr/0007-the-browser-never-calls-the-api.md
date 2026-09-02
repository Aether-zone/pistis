# 7. The browser never calls the API directly

- Status: Accepted
- Date: 2026-09-02

## Context

The web app and the API are separate origins. The conventional arrangement is
for the browser to call the API and for the API to allow that origin with CORS,
which means the API must publish a CORS policy, and any credential the browser
holds is reachable by client-side JavaScript.

Next's App Router offers another option: server components and server actions
run on the web app's own server, which can call the API without involving the
browser at all.

## Decision

Every call from the web app to the API goes through a server component or a
server action. No component fetches the API from the browser.

Two things follow directly and are the reason for the decision:

- **The API needs no CORS configuration.** It is never called cross-origin.
- **The session token is never exposed to client-side JavaScript.** It lives in
  an httpOnly cookie, read only on the server.

`PISTIS_API_URL` is therefore a server-side variable, and must not become
`NEXT_PUBLIC_`.

## Consequences

Interactivity that needs the API goes through a server action rather than a
client-side fetch, which is a different shape from a typical SPA: forms rather
than XHR, and `revalidatePath` rather than client-side cache invalidation.

Anything genuinely interactive that would need to poll or stream from the API
would have to break this rule, and doing so means opening CORS on the API and
finding a way to authenticate that is not the httpOnly cookie. That is a new
decision, not an implementation detail.

The web app's server becomes a required hop. It must be able to reach the API,
and `PISTIS_API_URL` being wrong is the most likely reason signing in fails —
which is why failures name the URL they tried.

Testing splits accordingly: server actions are unit-testable with a mocked
fetch, but anything depending on the browser navigating belongs in Playwright,
because a server action that calls `redirect()` cannot be observed from jsdom.
