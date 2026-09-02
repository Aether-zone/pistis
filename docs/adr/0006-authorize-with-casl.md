# 6. Authorize with CASL, and scope list queries in the database

- Status: Accepted
- Date: 2026-09-02

## Context

Organizations introduced the first rules that depend on the relationship
between a user and a record rather than on a global flag: a member may read an
organization, an owner or admin may change it, and only an owner may act on
another owner.

Expressing that with guards and inline checks spreads the same conditions
across every controller, where they drift apart.

## Decision

Use CASL, wired as the NestJS authorization guide describes. `PoliciesGuard`
establishes the session, builds an `AppAbility` from the user's memberships,
exposes it on the request, and evaluates the `@CheckPolicies(...)` handlers a
route declares.

Rules are keyed on the organization's **id**, so a bare reference —
`organizationRef(id)` — is enough to answer them. A request is refused before
anything is loaded.

**List endpoints are scoped in the query, not by filtering results.**
`GET /organizations` restricts on the set of organization ids the caller
belongs to.

## Consequences

The rules live in one file and read like the policy they implement.

Scoping in the query is not an optimisation. Filtering a fetched page would
count other people's organizations in `totalNumberOfElements` and return short
pages, so paging would be visibly wrong. The trade-off is that this scoping is
expressed twice — once as a CASL rule and once as a `where` clause — and the
two must agree.

Because policies run before anything is loaded, an unknown id and an
organization belonging to someone else answer identically with 403. That is
deliberate: the endpoint is not an oracle for which organizations exist. It
also means guards run before validation pipes, so a malformed uuid is refused
as 403 rather than 400.

The dashboard mirrors these rules to decide which controls to show. The API
remains the authority, but the two can drift; a rule change needs both.

Abilities are rebuilt per request from the database, which costs a query. There
is no caching, and adding one would need care around membership changes.
