import { Injectable } from "@nestjs/common";
import { type MembershipRole, type UserDTO } from "@pistis/contract";
import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";

import { Membership } from "../organization/membership/membership";
import { Organization } from "../organization/organization";
import { Action } from "./action";

export type Subjects =
    | typeof Organization
    | typeof Membership
    | Organization
    | Membership
    | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

// Subject detection is left at CASL's default, which reads `constructor` —
// correct here because organizations and memberships are plain classes.

/** What the current user belongs to, and as what. */
export interface Memberships {
    [organizationId: string]: MembershipRole;
}

@Injectable()
export class CaslAbilityFactory {

    /**
     * Rules are expressed against the *organization id*, so a single ability
     * answers "may this user touch that organization" without another query.
     * The caller supplies the memberships because the ability itself must stay
     * synchronous — CASL evaluates conditions in memory.
     */
    createForUser(user: UserDTO, memberships: Memberships, admin: boolean): AppAbility {
        const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

        if (admin) {
            can(Action.Manage, 'all');

            return build();
        }

        // Anyone signed in may start an organization; they become its owner.
        can(Action.Create, Organization);

        const ids = (...roles: MembershipRole[]): string[] =>
            Object.keys(memberships).filter((id) => roles.includes(memberships[id]));

        const belongsTo: string[] = Object.keys(memberships);
        const administers: string[] = ids('owner', 'admin');
        const owns: string[] = ids('owner');

        can(Action.Read, Organization, { id: { $in: belongsTo } });
        // Updating and deleting both require owner or admin; plain members may
        // only read.
        can(Action.Update, Organization, { id: { $in: administers } });
        can(Action.Delete, Organization, { id: { $in: administers } });

        can(Action.Read, Membership, { organizationId: { $in: belongsTo } });
        // Admins manage members, but only owners may touch another owner —
        // otherwise an admin could demote the people who appointed them.
        can(Action.Manage, Membership, {
            organizationId: { $in: administers },
            role: { $ne: 'owner' }
        });
        can(Action.Manage, Membership, { organizationId: { $in: owns } });

        return build();
    }
}
