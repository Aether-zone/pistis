# @pistis/web

Next.js App Router front end for Pistis: the sign-in and OAuth consent screen,
and the management dashboard.

```sh
cp .env.example .env.local     # point PISTIS_API_URL at the running api
PORT=3002 npx nx dev @pistis/web
```

## Routes

| Route | |
| --- | --- |
| `/` | Redirects to `/dashboard` or `/login` |
| `/login` | Sign in, and the OAuth consent screen |
| `/dashboard` | Overview |
| `/dashboard/organizations`, `/dashboard/organizations/[id]` | Organizations and their members |
| `/dashboard/clients`, `/dashboard/users`, `/dashboard/tokens` | Management, admin only |

### `/login` has two modes

Opened directly it is a plain sign-in that stores a session and continues to the
dashboard. Opened with an authorization request in the query string
(`client_id`, `redirect_uri`, `code_challenge`, …) it becomes the OAuth consent
screen: it asks the api to describe the request — which validates the client and
redirect URI before anyone types a password — shows what is being asked for, and
on submission redirects to the URL the api returns.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `PISTIS_API_URL` | `http://localhost:3000` | Base URL of the Nest api |

**This almost always needs setting.** The api and this app both default to port
3000, so one of them is normally moved, and the default is then wrong. Pointing
it at something that is not the api is the most common reason sign-in fails —
which is why every failure message names the URL it tried.

It is not a `NEXT_PUBLIC_` variable, and must not become one: the browser never
talks to the api.

## How it talks to the api

Every request goes through a server component or a server action. Nothing
reaches the api from the browser, which has two consequences worth preserving:

- **The api needs no CORS configuration.** Moving a call client-side means
  opening CORS on the api.
- **The session token is never exposed to client JavaScript.** It lives in an
  httpOnly cookie, read only on the server (`src/lib/session.ts`).

`src/lib/api.ts` wraps fetch and returns either the parsed body or a message
worth showing. `src/lib/session-api.ts` adds the session token and returns
`null` when there is no usable session, which callers turn into a redirect to
`/login` rather than an error.

## Conventions that are load-bearing

These three look like style and are not. Each one caused a bug.

**`ActionForm` takes plain children, never a render prop.** It is a client
component, and a function cannot cross the server/client boundary. Passing one
fails at runtime — "Functions cannot be passed directly to Client Components" —
not at build time. Buttons read their pending state from `useFormStatus` inside
the form.

**Anything that re-renders the row it lives in reports through `?notice=`.**
Removing a member, revoking a token, deleting a client, changing a role: the
form holding the message is unmounted before anyone can read it. One-time client
secrets stay in form state deliberately — a secret must never enter a URL.

**`.inlineForm` is `inline-flex`, not `inline`.** Its controls use `.input`,
which is 100% wide; as an inline form a select filled its table cell and pushed
the button over the next column, where it silently intercepted clicks.

## Layout

```
src/
  app/
    layout.tsx            html shell
    page.tsx              redirect signpost
    login/                sign-in and consent
    dashboard/
      layout.tsx          toolbar, sidebar, main
      actions.ts          every server action
      action-form.tsx     form wrapper and SubmitButton
      clients/ users/ tokens/ organizations/
  lib/                    api, session, session-api
```

The dashboard is an application shell: the toolbar spans the top, the sidebar
runs down the left, and each section renders into `main`. Authentication is
checked once in `dashboard/layout.tsx`, so no section repeats it.

## Testing

```sh
npx nx test @pistis/web    # jest, jsdom
npx nx e2e @pistis/web-e2e # playwright; starts the dev server itself
```

Unit tests cover the server actions and the pure helpers. Anything that depends
on the browser actually navigating — redirects, consent, the dashboard forms —
belongs in the Playwright suite, since a server action that calls `redirect()`
cannot be observed from jsdom.
