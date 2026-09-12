# Pistis

An OAuth 2.0 authorization server with a management dashboard.

Pistis issues tokens rather than consuming them: applications register as OAuth
clients, send people here to sign in, and receive JWT access tokens they can
validate offline. It also carries the things an authorization server needs to be
useful on its own — users, organizations with role-based membership, and a web
UI to administer all of it.

| Project | Path | What it is |
| --- | --- | --- |
| `@pistis/api` | [`api/`](api/README.md) | NestJS authorization server and management API |
| `@pistis/web` | [`web/`](web/README.md) | Next.js sign-in, consent screen and dashboard |
| `@pistis/contract` | [`contract/`](contract/README.md) | Types and schemas shared by both |
| `@pistis/api-e2e` | `api-e2e/` | Jest + axios end-to-end tests against a running api |
| `@pistis/web-e2e` | `web-e2e/` | Playwright end-to-end tests against the web app |

## Getting started

```sh
pnpm install
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

Both apps default to port 3000, so one of them has to move. The example files
put the api on 3001 and expect the web app on 3002:

```sh
pnpm start:server   # http://localhost:3001/api
pnpm start:web      # http://localhost:3002
```

A fresh database has no accounts, and nothing in the app can create the first
one. `OAUTH_DEV_SEED=true` — already set in `api/.env.example` — creates an
admin and a demo OAuth client at boot and logs the credentials:

```
demo@example.com / demo-password
```

Open <http://localhost:3002>, sign in, and the dashboard lists clients, users,
tokens and your organizations.

> The seed refuses to run under `NODE_ENV=production`. It is a development
> affordance, not a provisioning story.

## Commands

This is a plain pnpm workspace: every project owns its own scripts, and the
root ones fan out across them with `pnpm -r`. Projects are addressed by their
scoped name.

```sh
pnpm start:server                    # api, watch mode (rebuild + restart)
pnpm start:web                       # web, watch mode

pnpm lint                            # every project
pnpm typecheck
pnpm test
pnpm build
pnpm e2e                             # builds first, then both e2e suites

pnpm --filter @pistis/api build      # webpack -> api/dist
pnpm --filter @pistis/api test       # jest
pnpm --filter @pistis/api lint
pnpm --filter @pistis/contract typecheck
```

A single test, or a single file:

```sh
pnpm --filter @pistis/api test -- -t "revokes the issued tokens when a code is replayed"
pnpm --filter @pistis/api test -- src/oauth/pkce.spec.ts
```

TypeScript project references are maintained by hand. After adding an import
that crosses a project boundary, add the matching `references` entry to the
importing project's tsconfig; `pnpm typecheck` fails if it is missing.

## How the pieces fit

```
                    ┌───────────────────────────┐
   your app ───────▶│  @pistis/api              │
   (OAuth client)   │  /api/oauth/*   tokens    │
                    │  /api/admin/*   management│
                    │  /api/organizations/*     │
                    └───────────┬───────────────┘
                                │ shares types
                    ┌───────────┴───────────────┐
                    │  @pistis/contract         │
                    └───────────┬───────────────┘
                                │
                    ┌───────────┴───────────────┐
   a person  ──────▶│  @pistis/web              │
                    │  /login     sign in       │
                    │  /dashboard management UI │
                    └───────────────────────────┘
```

The browser never calls the api directly. Every request from the web app goes
through a server component or a server action, which is why the api needs no
CORS configuration.

To integrate an application with Pistis, see
[**Implementing OAuth against Pistis**](api/README.md#implementing-oauth-against-pistis).

## Containers

Three images. All three build **from the repository root** — they need the
lockfile and every workspace manifest — so the Dockerfile is passed with `-f`:

```sh
docker build -f api/Dockerfile -t aether-zone/pistis-api .
docker build -f web/Dockerfile -t aether-zone/pistis-web .
docker build -t aether-zone/pistis .            # both, in one container
```

> Docker image references cannot begin with `@` — it separates a digest — so the
> `@aether-zone/…` form is not a legal tag. These use `aether-zone/…`, published
> by CI as `ghcr.io/<owner>/pistis-api`, `…/pistis-web` and `…/pistis`.

Running the two-container pair:

```sh
docker network create pistis
docker run -d --name api --network pistis -v pistis-data:/data   -e OAUTH_ISSUER=http://localhost:3001 -e OAUTH_DEV_SEED=true   -p 3001:3000 aether-zone/pistis-api
docker run -d --name web --network pistis   -e PISTIS_API_URL=http://api:3000 -p 3000:3000 aether-zone/pistis-web
```

Or the single container, which runs both and publishes only the web port:

```sh
docker run --rm -p 3000:3000 -v pistis-data:/data aether-zone/pistis
```

Prefer the separate images where you can — they restart and scale
independently. In the combined image both processes share a fate: if either
exits, the container exits, so an orchestrator sees an unhealthy container
rather than one serving half the application.

**The database is a file.** `DATABASE_PATH` defaults to `/data/pistis.sqlite` in
the images, and `/data` is a volume; without mounting it the database is lost on
every restart. **Set `OAUTH_JWT_PRIVATE_KEY`** too, or tokens are signed with a
key generated at boot and do not survive a restart.

## Continuous integration

`.github/workflows/ci.yml` runs lint, typecheck, test and build on every push
and pull request, then the end-to-end suites.

`.github/workflows/docker.yml` builds all three images and publishes them to
GHCR **when a release is published**, tagged with the release version
(`1.4.2`, `1.4`, `1`) and, for a full release, `latest`. Pushes to `main`
publish a `main` tag, and every build is addressable by commit sha. Pull
requests build without publishing, so an untrusted fork cannot push an image
under these names.

`latest` deliberately follows the newest full release rather than `main`:
pulling it should not hand anyone unreleased code. Prereleases publish only
their exact version, so `v2.0.0-rc.1` never moves `2.0`, `2` or `latest`.

## Architecture notes

The decisions that shaped this — token formats, how sessions differ from access
tokens, why the browser never calls the API — are recorded as
[Architecture Decision Records](docs/adr/README.md), each with the consequences
it carries.

`CLAUDE.md` at the repository root carries the working notes that sit below
that level: layering rules, the reasoning behind code that looks arbitrary, and
the current sharp edges. Read it before changing the OAuth, authorization or
dashboard code.

## Licence

MIT.
