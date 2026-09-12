# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Architectural decisions and their consequences are recorded in
[`docs/adr/`](docs/adr/README.md). This file covers what sits below that: the
conventions and sharp edges that are not decisions so much as things to know.

## Workspace

Plain **pnpm workspace** (`@pistis/source`). There is no build orchestrator: every project declares its own `scripts`, and the root `package.json` fans out across them with `pnpm -r`. Shared configuration lives in three files at the root — `tsconfig.base.json`, `eslint.config.mjs` and `jest.preset.js` — which each project extends.

Projects (`pnpm -r exec pwd`, or read `pnpm-workspace.yaml`):

| Project | Path | What it is |
| --- | --- | --- |
| `@pistis/api` | `api/` | NestJS 11 backend, bundled with plain webpack + ts-loader |
| `@pistis/web` | `web/` | Next.js 16 App Router frontend |
| `@pistis/contract` | `contract/` | Shared DTO types, consumed by both api and web |
| `@pistis/api-e2e` | `api-e2e/` | Jest + axios e2e hitting a running api |
| `@pistis/web-e2e` | `web-e2e/` | Playwright e2e against the Next dev server |

`packages/` is empty. The two published packages that briefly lived there are
now **one** package in the **organon** repository — `@aether-zone/organon`,
which exposes the token vocabulary on its `/pistis` subpath and the Nest
resource-server guard on `/pistis-nest`. Everything in this workspace is
`private: true`; nothing here is published.

That move has one consequence worth knowing before touching the contract:

- **`@pistis/contract` re-exports the token vocabulary from
  `@aether-zone/organon/pistis`, which is an installed package now, not a
  workspace sibling.** The subpath matters: the package's root entry point and
  its `/pistis-nest` one pull in passport, which this repository has no use for
  and deliberately does not install. Importing from the root barrel instead
  would drag it in. `oauth/jwt.ts`, `oauth/userinfo.ts`, `oauth/scope.ts`
  and `organization/membership.ts` are re-export shims over it. Changing the
  shape of an access token claim therefore means releasing organon first and
  bumping the dependency here — this repository can no longer change its own
  token format in a single commit.
- It is listed as a dependency of **`api` and `web` as well as `contract`**.
  The api bundle keeps every bare specifier a real `require`, so anything the
  compiled-in contract reaches for has to be resolvable at runtime — the same
  reason `zod` is in that list. Dropping it would produce a `pnpm deploy`
  directory that is missing it and a server that dies on boot.

## Commands

Project names are scoped (`@pistis/api`) and are what `--filter` takes.

```sh
pnpm start:server                            # api, watch mode; rebuilds and restarts
pnpm start:web                               # Next dev server

pnpm lint                                    # all projects, in parallel
pnpm typecheck
pnpm test
pnpm build
pnpm e2e                                     # both e2e suites, each building first

pnpm --filter @pistis/api build              # webpack -> api/dist
pnpm --filter @pistis/web build
pnpm --filter @pistis/api test               # jest (swc transform)
pnpm --filter @pistis/web test               # jest via next/jest, jsdom
pnpm --filter @pistis/api-e2e e2e            # builds the api, then runs jest
pnpm --filter @pistis/web-e2e e2e            # builds both, then playwright
pnpm --filter @pistis/api lint
pnpm --filter @pistis/contract typecheck
```

Single test / single file:

```sh
pnpm --filter @pistis/api test -- -t "should hash the password"
pnpm --filter @pistis/api test -- src/user/password/password.service.spec.ts
pnpm --filter @pistis/web-e2e e2e -- --grep "login" --project=chromium
```

`pnpm start:server` runs `api/dev.js`: one webpack compiler in watch mode owning one child process, killed and respawned on each successful emit. Neither tool does that alone — `webpack --watch` never restarts the process and `node --watch` cannot compile TypeScript. The child runs from the **workspace root**, so TypeORM's default `db.sqlite` stays where it has always been.

TypeScript project references are maintained by hand. After adding an import that crosses a project boundary, add the matching entry to the importing project's `references`; `pnpm typecheck` fails without it.

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
  OAUTH_JWT_PRIVATE_KEY="$(cat oauth-signing.pem)" pnpm start:server
  ```

  The `kid` is the RFC 7638 thumbprint of the public key, so it is derived from the key rather than configured.

**To bootstrap a fresh database, seed an admin and a client** (`OAUTH_DEV_SEED=true`). Once signed in, the dashboard can create everything else. It is off by default, refuses to run under `NODE_ENV=production`, and *converges* the seeded account on each boot rather than skipping it when present — a database seeded by an older build otherwise keeps a demo account that is not an admin, leaving the dashboard unreachable. It logs the credentials it created:

```sh
OAUTH_DEV_SEED=true \
OAUTH_DEV_SEED_REDIRECT_URIS=http://localhost:3002/callback \
PORT=3001 pnpm start:server
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
pnpm start:server   # reads api/.env
pnpm start:web      # reads web/.env.local
```

`/dashboard` is the management UI: sign in at `/login` with an admin account and it lists clients, users and tokens with forms to change them. Two conventions there are load-bearing:

- **`ActionForm` takes plain children, never a render prop.** It is a client component, and a function cannot cross the server/client boundary — doing so fails at runtime with "Functions cannot be passed directly to Client Components", not at build time. Buttons read pending state from `useFormStatus` inside the form instead.
- **Destructive actions report through `?notice=`, not form state.** Deleting a client or revoking a token removes the row its form lives in, so a message held in that form's state is unmounted before anyone can read it. One-time client secrets stay in form state deliberately: a secret must never enter a URL.

## Gotchas / current state

- **Port collision:** the api and the Next dev server both default to `3000`. The root `start:server`/`start:web` scripts move them to 3001 and 3002; running either binary directly needs `PORT` set. Both e2e suites use their own dedicated ports (3100/3101 for web-e2e, 3102 for api-e2e) and are unaffected.
- `POST /api/users` still cannot set a password — use `POST /api/admin/users` or the dashboard. The two user-creation paths should probably be reconciled.
- `/api/users` is still unauthenticated, unlike `/api/organizations`, which is now behind `PoliciesGuard`.
- The dashboard mirrors the CASL rules to decide which controls to show. The api remains the authority, but the two can drift — a rule change needs both.
- Sessions cannot be revoked server-side: signing out clears the cookie, but the JWT stays valid until it expires (`SESSION_TTL`, default 12h). A session table, like `oauth_access_tokens`, would fix it.
- The api is still scaffolding in places: `AuthService.login` verifies credentials but returns nothing (`// Create token or session`) — the reusable half is `AuthService.verifyCredentials`, which OAuth uses. `IdentityModule` is empty.
- Both e2e projects declare their `types` explicitly (`node`, and `jest` for api-e2e). `tsconfig.base.json` sets none, so without that they typecheck against no globals at all — the generated configs omitted it and neither project had ever been typechecked.
- `User.updatedAt` maps to a column literally named `udpated_at` (typo is in the entity and therefore in the sqlite schema).
- `UserController.getUsers` still reads `PageRequestDTO` from `@Param()` rather than `@Query()` and never validates it, so `pageNumber`/`perPage` arrive undefined. `OrganizationController.getOrganizations` shows the fixed shape.
- `UserService.getUsers` puts entities into a `Pageable<UserDTO>` without mapping them, so that endpoint leaks the entity shape.

## Containers and CI

Three Dockerfiles — `api/Dockerfile`, `web/Dockerfile` and a combined `Dockerfile`
— all built from the repository root. Points that are not obvious:

- **The api image installs its runtime dependencies in the builder, not the
  runner.** `pnpm deploy --filter @pistis/api --prod /deploy` resolves the api's
  production dependencies out of the workspace lockfile and writes a
  self-contained directory, node_modules and all — the replacement for
  `nx prune`. better-sqlite3 and bcrypt are compiled there, where a toolchain
  exists, and copied to a runner on the same base so the bindings match. The
  deploy directory also carries the api's source, which the runtime has no use
  for, so the runner copies `node_modules` and `package.json` from it and the
  bundle from `api/dist`.
- **The web image installs with `--ignore-scripts`.** A pnpm workspace install
  resolves every project's dependencies, so the web build would otherwise try to
  compile the api's better-sqlite3 and bcrypt and fail for want of a toolchain
  it has no other use for.
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

CI runs the root scripts in order — `pnpm lint`, `typecheck`, `test`, `build`,
then `pnpm e2e` in a second job. There is no affected-graph computation and so
no `fetch-depth: 0`: every job does the whole workspace.

**Every project must be listed in `pnpm-workspace.yaml`.** `web-e2e` once was
not, and nothing ran its `package.json` at all; the suite passed locally only
because `api/dist` happened to exist from an earlier build. A project missing
from that file is invisible to `pnpm -r` and to `--filter`, silently, so it is
the first thing to check when a target seems not to run.

**Both e2e suites start their own servers on dedicated ports** (3100/3101 for
web-e2e, 3102 for api-e2e) and stop them by pid. Neither uses the watch-mode
dev server: it outlives the suite and rebuilds `api/dist` underneath whatever
runs next. Each suite's `e2e` script builds what it needs first, rather than
building inside Playwright's `webServer`, so a stale bundle can never be what
gets tested. `api-e2e`'s teardown stops the process it spawned by pid; the
generated version called `killPort`, which stops whatever holds a port — on a
developer's machine as likely to be a server they are using.

`api-e2e/.spec.swcrc` targets es2022: at es2017 SWC downlevels `??` and its
nullish-coalescing transform panics on the support files.

## Build and test plumbing

Three non-obvious pieces of configuration that will look removable and are not:

- **`transformIgnorePatterns` in `api/jest.config.cts`.** `@nestjs/typeorm` v12 is published as pure ESM with no `require` condition, so CJS Jest cannot load it. That one package is transformed by SWC; the negative lookahead spans both separators (`@nestjs+typeorm` and `@nestjs/typeorm`) to cope with pnpm's doubled path. Both `.spec.swcrc` files emit `commonjs` for the same reason.
- **The `externals` function in `api/webpack.config.js`.** Every bare specifier stays a real `require`; only this project's own source and `@pistis/contract` are bundled. Deciding by request *shape* rather than by scanning a `node_modules` directory is the point: under pnpm, `better-sqlite3`, `bcrypt` and `typeorm` live in `api/node_modules`, and the scan-based approach fed the *workspace root* directory and missed them. Bundled, the native loaders look for their `.node` binaries under `api/dist` and the server dies on boot with `No native build was found`; typeorm additionally loads drivers via `require(computedName)`, which webpack cannot resolve. The bundle's requires are therefore exactly `api/package.json`'s dependencies — `zod` is in that list because `@pistis/contract` is compiled in and brings it.
- **`api/tsconfig.webpack.json` is separate from `tsconfig.app.json` on purpose.** ts-loader compiles `@pistis/contract`'s source into the bundle, which `rootDir: "src"` rejects with TS6059 on every contract file; the webpack config reaches `rootDir` up to the workspace root and turns the declaration emit off. `tsconfig.app.json` still describes the typecheck build, which is a different job. `resolve.extensionAlias` in the same file maps `./x.js` → `./x.ts`, because contract is ESM under `nodenext`.
- **`moduleNameMapper` in `jest.preset.js`** does that same `.js` → `.ts` mapping for Jest, for every project. It used to come from the Nx jest resolver, which each project inherited through the preset. `web/jest.config.cts` additionally maps the `@/*` alias, which SWC is explicitly told not to resolve.

## Style

Prettier with `singleQuote: true`. The Nest code in `api/src` currently uses 4-space indent and double quotes in imports (not Prettier-formatted); the code elsewhere is Prettier-formatted at 2 spaces. Match the file you are editing.

`eslint.config.mjs` at the root keeps the rule severities the Nx ESLint plugin used to supply — `no-explicit-any`, `no-unused-vars` and `no-non-null-assertion` are warnings, `no-require-imports` is off. `contract/src` depends on the second of those: it keeps zod schemas module-private and exports only `z.infer` of them, which the rule reads as "assigned a value but only used as a type". `eslint-config-prettier` is deliberately not applied — the pinned 10.0.0 ships no `main` and no `exports`, so it never loaded under Nx either, and importing it now would turn a silent no-op into a crash.
