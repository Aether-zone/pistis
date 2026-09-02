# 9. SQLite with schema synchronisation, for now

- Status: Accepted
- Date: 2026-09-02

## Context

Persistence arrived with the original scaffold: TypeORM over `better-sqlite3`,
with `synchronize: true` and the database written to a file in the working
directory. Everything since — clients, codes, tokens, organizations,
memberships — has been built on it.

It is worth recording as a decision rather than an inheritance, because it is
load-bearing and has consequences a reader will otherwise discover the hard way.

## Decision

Keep SQLite with `synchronize: true` for now. The schema follows the entity
decorators; there are no migrations.

The file's location is configurable through `DATABASE_PATH`, which defaults to
the working directory and is set to a mounted volume in the container images.

## Consequences

Development is frictionless: no database to run, and the schema follows the
code.

The costs are the reason this is "for now":

- **There are no migrations.** `synchronize` will make additive changes, but a
  rename or a type change is a data-loss event, and there is no record of what
  the schema was.
- **One writer.** SQLite does not support the concurrent write load of more
  than one API instance against the same file, so the server does not scale
  horizontally as it stands.
- **The database is a file**, so a container without a mounted volume loses
  everything on restart. `DATABASE_PATH` and the `/data` volume exist because
  of this.

Nothing above the repositories assumes SQLite — the entities and services are
ordinary TypeORM — so moving to Postgres is a configuration change plus a
migration story, not a rewrite. Doing so should supersede this record.

Until then, treat the schema as disposable: it is reproduced from the entities
on every boot, and no deployment should hold data it cannot afford to lose.
