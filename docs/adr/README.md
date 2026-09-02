# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for this project.

ADRs document significant architectural decisions, the context behind them, and their consequences.

## Decisions

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-pistis-is-an-authorization-server.md) | Pistis is an OAuth 2.0 authorization server | Accepted |
| [0002](0002-jwt-access-tokens-opaque-refresh-tokens.md) | JWT access tokens, opaque refresh tokens, and a row per token | Accepted |
| [0003](0003-sessions-are-not-access-tokens.md) | Application sessions are separate from OAuth access tokens | Accepted |
| [0004](0004-sign-jwts-with-node-crypto.md) | Sign and verify JWTs with node:crypto rather than a JWT library | Accepted |
| [0005](0005-authorization-endpoint-is-json.md) | The authorization endpoint is a JSON API, not a redirect | Accepted |
| [0006](0006-authorize-with-casl.md) | Authorize with CASL, and scope list queries in the database | Accepted |
| [0007](0007-the-browser-never-calls-the-api.md) | The browser never calls the API directly | Accepted |
| [0008](0008-shared-contract-as-typescript-source.md) | The shared contract is consumed as TypeScript source | Accepted |
| [0009](0009-sqlite-with-schema-synchronisation.md) | SQLite with schema synchronisation, for now | Accepted |

## Statuses

- Proposed — under discussion
- Accepted — decision has been made
- Rejected — decision was considered but not adopted
- Deprecated — no longer relevant
- Superseded — replaced by a newer decision

Once an ADR is accepted, its history should be preserved. If a decision changes, create a new ADR rather than rewriting the original decision.
