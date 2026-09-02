import { Membership } from "../organization/membership/membership";
import { Organization } from "../organization/organization";

/**
 * Minimal instances to evaluate rules against.
 *
 * CASL detects a subject's type from its constructor, so a real instance is
 * needed — but only the fields the rules mention have to be populated. That is
 * what lets a route be refused before anything is loaded from the database.
 */
export function organizationRef(id: string): Organization {
    const organization: Organization = new Organization();
    organization.id = id;

    return organization;
}

export function membershipRef(organizationId: string, role?: string): Membership {
    const membership: Membership = new Membership();
    membership.organizationId = organizationId;

    if (role !== undefined) {
        membership.role = role;
    }

    return membership;
}
