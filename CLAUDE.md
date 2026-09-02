# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace

Nx 23 monorepo (`@pistis/source`) using **pnpm workspaces**, package-manager-based projects (no `project.json` — Nx targets live inline under the `nx` key of each project's `package.json`, everything else is inferred by Nx plugins for TS/Next/webpack/eslint/jest/playwright).

Projects (`npx nx show projects`):

| Project | Path | What it is |
| --- | --- | --- |
| `@pistis/api` | `api/` | NestJS 11 backend, bundled with webpack (`NxAppWebpackPlugin`, `compiler: 'tsc'`) |
| `@pistis/web` | `web/` | Next.js 16 App Router frontend |
| `@pistis/contract` | `contract/` | Shared DTO types, consumed by both api and web |
| `@pistis/api-e2e` | `api-e2e/` | Jest + axios e2e hitting a running api |
| `@pistis/web-e2e` | `web-e2e/` | Playwright e2e against the Next dev server |

`packages/` exists for future publishable libs but is empty.

## Commands

Project names are scoped (`@pistis/api`); Nx also resolves the bare directory name (`api`).

```sh
pnpm start:server                       # nx serve api
npx nx serve @pistis/api                # NestJS on :3000, global prefix /api
npx nx dev @pistis/web                  # Next dev server, also :3000 (see gotchas)
npx nx build @pistis/api                # webpack -> api/dist
npx nx build @pistis/web

npx nx test @pistis/api                 # jest (swc transform)
npx nx test @pistis/web                 # jest via next/jest, jsdom
npx nx e2e @pistis/api-e2e              # builds + serves api first, then runs jest
npx nx e2e @pistis/web-e2e              # playwright; boots `nx run @pistis/web:dev` itself

npx nx lint @pistis/api
npx nx typecheck @pistis/contract
npx nx run-many -t lint test build      # all projects
npx nx affected -t lint test build      # only what changed
```

Single test / single file:

```sh
npx nx test @pistis/api -- -t "should hash the password"
npx nx test @pistis/api -- src/user/password/password.service.spec.ts
npx nx e2e @pistis/web-e2e -- --grep "login" --project=chromium
```

TypeScript project references are maintained by Nx; run `npx nx sync` after adding a cross-project import (`npx nx sync:check` in CI).

## Architecture

### `@pistis/contract` — the shared boundary

The API/web contract lives here and is the only shared code. Two things make it unusual:

- **It is consumed as TypeScript source, not built output.** `package.json` `main`/`types`/`exports` all point at `./src/index.ts`. There is no build step to run before consumers can use it; edits are picked up directly.
- **It is ESM (`"type": "module"`) under `nodenext`**, so every relative import inside `contract/src` must carry a `.js` extension (`export * from './lib/user.js'`). Follow that when adding files.

Two export conventions live side by side here:

- **`user`, `credentials`, `page`** declare zod schemas but export only the *inferred types*; the schemas stay module-private, so nothing validates these at runtime. `UserDTO`, `CreateUserDTO`, `CredentialsDTO` and `PageRequestDTO` are erased at compile time, so NestJS controllers must import them with `import { type X } from '@pistis/contract'` or `emitDecoratorMetadata` will try to emit a value reference for the parameter type and break the build.
- **`oauth`** exports the schemas *as well as* the types, because the OAuth endpoints validate untrusted input at runtime (`SchemaValidationPipe` in `api/src/oauth`). Follow this pattern for anything else that has to be checked at the edge. `AccessTokenClaimsDTO` and the JWKS types live here too, so a future resource server can share them.

`Pageable<T>` is a real class (has `Pageable.of(...)`) and is imported normally. It defines `toJSON()` because getters are not own enumerable properties: serialising it without one emits the backing fields (`_items`, `_totalNumberOfElements`) and drops the computed `totalNumberOfPages`.

Note that zod's `.omit()` takes a **mask object**, not an array of keys — the array form throws `Unrecognized key: "0"` the moment the schema is evaluated and infers `never` for every surviving field.

### `@pistis/api` — NestJS

`main.ts` → `configureApp` → `AppModule` → `UserModule` + `AuthModule` + `OAuthModule`. Global route prefix is `api` (so `/api/users`, `/api/auth`, `/api/oauth`), with the RFC 8414 discovery document excluded from it. `configureApp` holds that routing setup so `main.ts` and the integration tests share one definition.

Persistence is TypeORM over **better-sqlite3**, configured in `app.module.ts` with `autoLoadEntities: true` and `synchronize: true` writing to `db.sqlite` in the process CWD. Schema is derived from entity decorators; there are no migrations.

Layering convention inside a feature folder (see `src/user/`):

- `user.ts` — TypeORM entity (`@Entity({ name: 'users' })`, snake_case column names)
- `user.mapper.ts` — injectable entity↔DTO mapper; services never leak entities past their own boundary
- `user.service.ts` — repository access, throws Nest HTTP exceptions (`NotFoundException`, `UnauthorizedException`)
- `user.controller.ts` — thin, returns the service promise directly; validate input with `SchemaValidationPipe` from `src/common/`, which takes an error factory so OAuth routes keep their RFC-shaped body while everything else raises ordinary Nest exceptions
- `user.module.ts` — `TypeOrmModule.forFeature([...])` plus sub-modules

Passwords live in a separate `passwords` table linked by `userId`, never on `User`. `PasswordService` handles storage/verification and `PasswordEncoder` wraps bcrypt (12 rounds). `AuthService.login` looks the user up by email, then delegates the comparison to `PasswordService`.

### OAuth 2.0 authorization server — `api/src/oauth/`

Pistis is the authorization server, not a client of one. Endpoints (all under the `api` prefix except discovery):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/oauth/authorize` | Validates a pending request and returns it for a consent screen |
| `POST /api/oauth/authorize` | Records the owner's answer; returns the redirect URL carrying `code` or `error` |
| `POST /api/oauth/token` | `authorization_code` (with PKCE), `refresh_token`, `client_credentials` |
| `POST /api/oauth/introspect` | RFC 7662, client-authenticated |
| `POST /api/oauth/revoke` | RFC 7009, idempotent, client-authenticated |
| `GET /api/oauth/userinfo` | Bearer-authenticated; requires the `profile` scope |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata |
| `GET /.well-known/jwks.json` | Public signing key, for resource servers |

Design decisions worth knowing before changing anything here:

- **The authorization endpoint is JSON, not a redirect.** There is no session or login page in this app, so `GET` describes the pending request and `POST` carries the owner's credentials plus `approved`, returning the URL to navigate to rather than a 302. Whoever builds the consent UI drives both.
- **Access tokens are RS256 JWTs (RFC 9068); refresh tokens stay opaque.** A resource server validates an access token offline against `/.well-known/jwks.json`. Refresh tokens are only ever presented to this server, so they gain nothing from being self-describing and stay revocable by construction.
- **The database row survives JWT adoption, and must.** A signed token cannot express its own revocation, so `oauth_access_tokens` still holds one row per token keyed by `jti`. `verifyAccessToken` checks the signature first (a forgery costs no query) and then reads the row purely to see whether it was revoked. Deleting that table would silently make `/oauth/revoke` a no-op for access tokens.
- **Signing lives in `api/src/oauth/jwt/`, built on `node:crypto` with no JWT dependency.** `jose` and `@nestjs/jwt` are both pure ESM (and `@nestjs/jwt` v12 wants Nest 12), which this CJS-Jest workspace pays for twice over. `verifyJwt` pins the algorithm to a constant and never dispatches on the token's own `alg`, which is what closes `alg: none` and RSA→HMAC algorithm confusion; `jwt.spec.ts` asserts both attacks are refused. Be very careful relaxing anything in that function.
- **Secrets are never stored in the clear.** Authorization codes and refresh tokens are persisted as SHA-256 digests (`TokenHash`) — they are 256-bit CSPRNG values, so no work factor is needed and lookup stays an indexed equality check. Client secrets go through bcrypt (`PasswordEncoder`, shared with user passwords).
- **Codes and refresh tokens are single-use.** Replaying either revokes the whole family descended from the same authorization code, per RFC 6749 §4.1.2 — the honest client's tokens are collateral, because the server cannot tell the two parties apart.
- **PKCE is mandatory for public clients** (those registered without a secret) and optional for confidential ones; `OAUTH_REQUIRE_PKCE=true` makes it mandatory for everyone.
- **`OAuthException` + `OAuthExceptionFilter`** render the flat `{ error, error_description }` body the spec requires instead of Nest's `{ statusCode, message, error }` envelope. Throw `OAuthException`, never `HttpException`, anywhere under `api/src/oauth`. The filter is registered globally in `configureApp` because OAuth services are reused elsewhere — the admin API registers clients through `ClientService` — so their errors must render wherever they surface.
- **Two error shapes therefore exist on the wire, and both carry an `error` field.** Nest puts the status name there (`"Conflict"`), so `web/src/lib/api.ts` discriminates on `statusCode`, which only Nest sends. Reading `error` first surfaces the word "Conflict" instead of the reason.
- Config comes from env with defaults: `OAUTH_ISSUER`, `OAUTH_ACCESS_TOKEN_TTL` (3600s), `OAUTH_REFRESH_TOKEN_TTL` (30d), `OAUTH_AUTHORIZATION_CODE_TTL` (600s), `OAUTH_REQUIRE_PKCE`, `OAUTH_JWT_PRIVATE_KEY` (PEM; `\n` escapes are accepted), `OAUTH_JWT_AUDIENCE` (defaults to the issuer).
- **With no `OAUTH_JWT_PRIVATE_KEY` the server generates a key pair at boot and logs a warning.** Tokens then die with the process and two instances reject each other's tokens. Fine locally, never for a deployment:

  ```sh
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out oauth-signing.pem
  OAUTH_JWT_PRIVATE_KEY="$(cat oauth-signing.pem)" npx nx serve @pistis/api
  ```

  The `kid` is the RFC 7638 thumbprint of the public key, so it is derived from the key rather than configured.

**To bootstrap a fresh database, seed an admin and a client** (`OAUTH_DEV_SEED=true`). Once signed in, the dashboard can create everything else. It is off by default, refuses to run under `NODE_ENV=production`, and *converges* the seeded account on each boot rather than skipping it when present — a database seeded by an older build otherwise keeps a demo account that is not an admin, leaving the dashboard unreachable. It logs the credentials it created:

```sh
OAUTH_DEV_SEED=true \
OAUTH_DEV_SEED_REDIRECT_URIS=http://localhost:3002/callback \
PORT=3001 npx nx serve @pistis/api
# client_id="demo-client" client_secret="demo-secret"
# login="demo@example.com" password="demo-password"
```

It is a development affordance, not a provisioning story — a real one still wants an authenticated admin API.

Clients are otherwise **not** registerable over HTTP — unauthenticated client registration would be a hole. Provision them through the exported `ClientService.register(...)`:

```ts
await app.get(ClientService).register({
  clientId: 'my-client',
  clientSecret: 's3cret',        // omit for a public client (PKCE required)
  name: 'My Client',
  redirectUris: ['https://my-client.example/callback'],
  grantTypes: ['authorization_code', 'refresh_token'],
  scopes: ['profile', 'email'],
});
```

### `api/src/organization/` — the reference feature module

Plain CRUD over `/api/organizations`, and the cleanest example of the layering convention above (entity → mapper → service → thin controller → module). Worth copying from rather than `src/user/`, which predates a few fixes:

- `slug` is the stable URL-safe key, `name` the display label, so renaming does not invalidate references. `GET /api/organizations/slug/:slug` resolves by it.
- Uniqueness is **checked in the service**, not left to the unique index — the index surfaces as an opaque 500 from the driver. An update may keep its own slug.
- The controller validates with `SchemaValidationPipe`, so the zod defaults actually run. `pageRequestDtoSchema` coerces, because query strings are text and `z.number()` alone rejects every request.

**`membership/` nests inside it**, serving `/api/organizations/:organizationId/members` — the user↔organization join, with a `role` of `owner`/`admin`/`member`.

- Members are addressed by **user id**, not membership id: a user has at most one membership per organization, so the pair already identifies it and callers hold user ids anyway.
- `MembershipMapper.toDTO` takes the user as an argument instead of resolving it. Listing a page fetches every user in one `getUsersByIds` call; a mapper that looked them up itself would be a query per row.
- **One invariant: an organization always keeps at least one owner.** The last owner can be neither demoted nor removed (409). Nothing else is enforced — there is no check that the caller may edit the membership, because the organization endpoints are unauthenticated (see below).
- `MembershipModule` is imported *by* `OrganizationModule` and does not import it back; the organization existence check goes through the repository, which keeps the pair from forming a cycle.
- Deleting an organization removes its memberships first. The association is plain FK columns with no database cascade, so they would otherwise outlive the organization.

Organizations still have no link to OAuth clients or tokens.

### Authorization — `api/src/authorization/`

CASL, wired the way the Nest authorization guide describes. `PoliciesGuard` runs `SessionGuard`, builds an `AppAbility` from the user's memberships, exposes it on the request, and evaluates any `@CheckPolicies(...)` handlers.

- Rules are keyed on **organization id**, so `organizationRef(id)` answers "may this user touch that organization" without loading anything. That is why an unknown id and someone else's organization give the same 403 — deliberately no existence oracle.
- A global `admin` gets `can(manage, 'all')`. Otherwise: members read, owners and admins update and delete, and only owners may touch another owner.
- **Guards run before pipes**, so a malformed uuid is refused by policy (403) rather than validated (400).
- **List scoping is a `where` clause, not a CASL filter over fetched rows.** Filtering a page after the query would count other people's organizations in `totalNumberOfElements` and return short pages.
- `AuthorizationModule` re-exports `AuthModule`, because `@UseGuards(PoliciesGuard)` instantiates the guard in the *consuming* module's context, so `SessionGuard` must resolve there too.

### Management API — `api/src/admin/`

`/api/admin/*`, every route behind `AdminGuard`: clients (list, register, rotate secret, delete), users (list, create with a password, reset password), and issued tokens (list, revoke).

- **Sessions are not access tokens.** Both are signed by the same key, but a session carries `typ: session+jwt` and an `aud` of `<issuer>/session`, and `verifyJwt` pins the type. That separation is the whole defence: without it any client able to run the client credentials grant could reach the management API. `admin.spec.ts` asserts an access token is refused here.
- `POST /api/auth` now returns a real `SessionDTO` rather than nothing. `AuthService.verifyCredentials` remains the reusable half that OAuth's consent step uses.
- Client secrets are **generated**, never accepted from the caller, and returned exactly once — only a bcrypt hash is stored.
- Deleting a client revokes its tokens first; they would otherwise keep validating against a client that no longer exists.
- Admin is a plain `admin` boolean on `User`. There are no roles or scopes on the management API — if that grows, it wants a real authorization model rather than more booleans.

### `@pistis/web` — Next.js

App Router under `web/src/app/`, CSS Modules, path alias `@/*` → `./src/*` (mapped for Jest in `web/jest.config.cts`).

`/` is a signpost: it redirects to `/dashboard` when a session cookie is present and `/login` otherwise.

`/dashboard` is an application shell — toolbar across the top, sidebar down the left, section in `main` — with authentication checked once in its layout so no section repeats it. Sections are `/dashboard` (overview), `/organizations`, `/organizations/[id]`, `/clients`, `/users`, `/tokens`. Three conventions there are load-bearing:

- **`ActionForm` takes plain children, never a render prop.** It is a client component, and a function cannot cross the server/client boundary — that fails at *runtime* with "Functions cannot be passed directly to Client Components", not at build time. Buttons read pending state from `useFormStatus` inside the form.
- **Anything that re-renders the row it lives in reports through `?notice=`, not form state.** Removing a member, revoking a token, deleting a client, changing a role — the form holding the message is replaced before it can be read. One-time client secrets stay in form state deliberately: a secret must never enter a URL.
- **`.inlineForm` is `inline-flex`, not `inline`.** Its controls use `.input`, which is 100% wide; inline let a select fill the cell and pushed its button over the next column, where it silently intercepted clicks.

`/login` is the OAuth consent screen for the Nest authorization server — the only sign-in path that currently does anything, since `POST /api/auth` still returns no token or session. The page reads the authorization request from its query string, asks the API to describe it (which validates the client and redirect URI *before* anyone types a password), and renders the form; submitting posts the owner's answer and follows the `redirect_uri` the API returns.

**The browser never talks to the Nest API.** Both calls go through a server component and a server action, so the API needs no CORS configuration and its URL stays server-side in `PISTIS_API_URL`. Keep it that way — moving a call client-side means opening CORS on the API.

**`PISTIS_API_URL` must almost always be set.** It defaults to `http://localhost:3000`, which is wrong whenever the api has been moved off 3000 to dodge the port collision — i.e. usually. Pointing it at something that is not the api is the single most likely reason login "does not work", so `callApi` in `web/src/lib/api.ts` names the URL it tried in every failure message. Do not reduce those messages to a generic "could not reach the server": an earlier version parsed the response body before checking the status, so any non-JSON reply (a stray service answering 401 on port 3000) surfaced as a connection failure and hid the real cause.

Configure it in `web/.env.local` (copy `web/.env.example`); `api/.env` does the same job for the api, loaded by `main.ts` through Node's own `process.loadEnvFile`, so no dotenv dependency is involved. Inline variables beat both.

```sh
npx nx serve @pistis/api      # reads api/.env
npx nx dev @pistis/web        # reads web/.env.local
```

`/dashboard` is the management UI: sign in at `/login` with an admin account and it lists clients, users and tokens with forms to change them. Two conventions there are load-bearing:

- **`ActionForm` takes plain children, never a render prop.** It is a client component, and a function cannot cross the server/client boundary — doing so fails at runtime with "Functions cannot be passed directly to Client Components", not at build time. Buttons read pending state from `useFormStatus` inside the form instead.
- **Destructive actions report through `?notice=`, not form state.** Deleting a client or revoking a token removes the row its form lives in, so a message held in that form's state is unmounted before anyone can read it. One-time client secrets stay in form state deliberately: a secret must never enter a URL.

## Gotchas / current state

- **Port collision:** both `nx serve @pistis/api` and `nx dev @pistis/web` default to `3000`. Set `PORT` when running them together (`PORT=3001 npx nx serve @pistis/api`) — but note `api-e2e` and the Playwright config both hardcode/`3000`-default, so e2e runs assume the default.
- `POST /api/users` still cannot set a password — use `POST /api/admin/users` or the dashboard. The two user-creation paths should probably be reconciled.
- `/api/users` is still unauthenticated, unlike `/api/organizations`, which is now behind `PoliciesGuard`.
- The dashboard mirrors the CASL rules to decide which controls to show. The api remains the authority, but the two can drift — a rule change needs both.
- Sessions cannot be revoked server-side: signing out clears the cookie, but the JWT stays valid until it expires (`SESSION_TTL`, default 12h). A session table, like `oauth_access_tokens`, would fix it.
- The api is still scaffolding in places: `AuthService.login` verifies credentials but returns nothing (`// Create token or session`) — the reusable half is `AuthService.verifyCredentials`, which OAuth uses. `IdentityModule` is empty.
- `web-e2e:typecheck` fails on `playwright.config.mts` (`process.env`, `import.meta.dirname`) because the project's tsconfig pulls in no `node` types. CI does not run it.
- `api-e2e`'s generated teardown calls `killPort`, so pointing it at a port someone else is serving on will kill that server. It assumes it owns the api it talks to.
- `User.updatedAt` maps to a column literally named `udpated_at` (typo is in the entity and therefore in the sqlite schema).
- `UserController.getUsers` still reads `PageRequestDTO` from `@Param()` rather than `@Query()` and never validates it, so `pageNumber`/`perPage` arrive undefined. `OrganizationController.getOrganizations` shows the fixed shape.
- `UserService.getUsers` puts entities into a `Pageable<UserDTO>` without mapping them, so that endpoint leaks the entity shape.

## Containers and CI

Three Dockerfiles — `api/Dockerfile`, `web/Dockerfile` and a combined `Dockerfile`
— all built from the repository root. Points that are not obvious:

- **The api image installs its runtime dependencies in the builder, not the
  runner.** `nx prune @pistis/api` writes `api/dist/package.json` plus a matching
  lockfile, with `@pistis/contract` rewritten to a `file:` reference under
  `workspace_modules`. better-sqlite3 and bcrypt are compiled there, where a
  toolchain exists, and copied to a runner on the same base so the bindings match.
- **The web image uses Next's standalone output**, which needs
  `outputFileTracingRoot` set to the workspace root — otherwise tracing misses
  pnpm's hoisted `node_modules` and the server cannot start. Standalone mirrors
  the workspace layout, so the entry point is `web/server.js` and static assets
  must be copied separately.
- **`docker/entrypoint.sh` is POSIX sh with a poll loop, not `wait -n`.** That
  builtin needs bash 4.3+ while Debian's `/bin/sh` is dash, so the convenient
  version fails exactly where it cannot be tested.
- `dumb-init` is PID 1 in every image: signals with a default action are ignored
  by PID 1, so `node` started directly would not stop on a deployment's SIGTERM.
- Image names use `aether-zone/…`. A Docker reference cannot begin with `@`.

Images publish on `release: [published]` — not `created`, which does not fire
when a draft is published, and no longer on tag pushes, which would race the
release build for the same tags. `latest` tracks the newest full release rather
than `main`.

`nx affected` in CI needs `fetch-depth: 0` and `nrwl/nx-set-shas`. `web-e2e`
builds through the target's `dependsOn` rather than inside Playwright's
`webServer`, because a nested `nx` invocation races the outer one for the
project graph.

## Build and test plumbing

Three non-obvious pieces of configuration that will look removable and are not:

- **`transformIgnorePatterns` in `api/jest.config.cts`.** `@nestjs/typeorm` v12 is published as pure ESM with no `require` condition, so CJS Jest cannot load it. That one package is transformed by SWC; the negative lookahead spans both separators (`@nestjs+typeorm` and `@nestjs/typeorm`) to cope with pnpm's doubled path. Both `.spec.swcrc` files emit `commonjs` for the same reason.
- **`externals` + `mergeExternals` in `api/webpack.config.js`.** Nx's default `externalDependencies: 'all'` feeds `webpack-node-externals` the *workspace root* `node_modules`, but pnpm installs `better-sqlite3`, `bcrypt` and `typeorm` into `api/node_modules`, where it cannot see them. Bundled, the native loaders look for their `.node` binaries under `api/dist` and the server dies on boot with `No native build was found`; typeorm additionally loads drivers via `require(computedName)`, which webpack cannot resolve. `mergeExternals: true` keeps Nx's default and adds these three on top.
- `contract/jest.config.cts` maps `./x.js` → `./x` so Jest can resolve the `.js` extensions that `nodenext` requires in the ESM source, and `web/jest.config.cts` maps the `@/*` alias, which SWC is explicitly told not to resolve.

## Style

Prettier with `singleQuote: true`. The Nest code in `api/src` currently uses 4-space indent and double quotes in imports (not Prettier-formatted); the generated Nx code elsewhere is Prettier-formatted at 2 spaces. Match the file you are editing.
