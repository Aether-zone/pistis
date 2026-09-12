# 10. A client may be bound to an organization

- Status: Accepted
- Date: 2026-09-12

## Context

The `orgs` claim carries the organizations a token may act in, and it was
resolved from one place: the subject's memberships, read fresh on every issue so
that a role change lands on the client's next refresh.

The client credentials grant has no subject. `resolveOrganizations` said so and
returned nothing — *"no user means the client credentials grant, where the
subject is the client itself and memberships are meaningless"* — which is true
as far as it goes. A client belongs to no organization, because belonging is
something people do.

The consequence was not intended. Every organization-scoped route in the
workspace is `/organizations/:organizationId/…` behind a guard that reads that
claim, and an absent `orgs` is indistinguishable from an empty one: the request
may act in no organization at all. So **no headless credential could reach any
of them.** mneme reads objects out of loculus today only because loculus
deliberately authorizes by `client_id` rather than by organization; the moment
anything automated needed to write a resource for a tenant, there was no
credential in the system that could.

Two shapes were available. A separate API key, presented directly to resource
servers, would have meant every one of them learning a second credential type
and calling here to introspect on every request — undoing ADR 0002, whose whole
point is offline validation. Or the credential stays an OAuth client and the
*claim* learns a second source.

## Decision

A client may be registered with an organization and a role. The client
credentials grant resolves it on every issue and puts it in `orgs`, in exactly
the shape a user-delegated token carries.

**The binding is a grant, not a membership.** There is no membership row to read
a role from, so the role is stored beside the id on the client. Registration
refuses a binding unless the client also holds the `organizations` scope: this
server's own contract says the claim is present only when that scope was
granted, and a resource server is entitled to rely on it.

**A resource server cannot tell the two apart, and must not try.** The claim says
what the caller may do in an organization, not how it came by it. That is what
keeps the *behaviour* of this change inside this repository — `orgs` was already
optional in the published claim schema, so there is no wire change and no guard
anywhere that needs touching.

Redirect URIs became required only for the authorization code grant, which is
the only grant with a browser to send back. A service client needs none.

## Consequences

A headless credential can now act in one tenant. That is the gap this closes,
and it is the whole reason to accept it.

**Revocation follows the existing staleness budget rather than adding a new
one.** The binding is read on every issue, exactly as memberships are, so
removing it takes effect on the client's next token — not at expiry, and not
only on a restart. A deleted organization stops producing a claim rather than
naming a tenant that is gone.

**The shared contract now describes this wrongly.** `accessTokenClaimsSchema`
says `orgs` is *"present only when the `organizations` scope was granted, and
never for the client credentials grant, where the subject is a client and
belongs to nothing"*. The first half still holds and is enforced at
registration; the second half is what this decision reverses. The schema itself
needs no change, so nothing breaks — but the sentence a resource server's author
reads is misleading until organon is released with it corrected.

**`orgs` no longer means "the subject's memberships".** It means what the bearer
may do in an organization. Anything reasoning about the claim as evidence that a
*person* belongs somewhere is now wrong, and `sub` is the client for these
tokens, so provenance recorded from a token will sometimes be a client id where
a service expected a person.

**One client is one organization.** An integration serving three tenants needs
three registered clients, each with its own secret. There is no request
parameter to choose among several, deliberately: a token that could name its own
tenant would move the decision from registration to run time.

**A binding cannot be changed.** The management API offers create, delete and
rotate-secret, so correcting a mistyped organization means registering the
client again and issuing a new secret. This is not new — scopes have always been
fixed at registration — but a binding is easier to get wrong than a scope list,
and this is where that cost will be felt.

**This is not per-organization API keys.** An administrator here is still the
issuer; an organization's own owner cannot mint a credential for their
organization. If that becomes the requirement, it extends this rather than
replacing it: the same resolution, with the binding read from a key row instead
of the client row.
