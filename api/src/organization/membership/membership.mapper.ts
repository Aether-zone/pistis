import { Injectable } from "@nestjs/common";
import { AddMembershipDTO, MembershipDTO, MembershipRole, UserDTO } from "@pistis/contract";

import { Membership } from "./membership";

@Injectable()
export class MembershipMapper {

    /**
     * The user is passed in rather than looked up: callers listing a page of
     * members fetch every user once, which a mapper resolving them one at a
     * time would turn back into a query per row.
     */
    toDTO(entity: Membership, user: UserDTO): MembershipDTO {
        return {
            id: entity.id,
            organizationId: entity.organizationId,
            role: entity.role as MembershipRole,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            },
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt
        }
    }

    toEntity(membership: AddMembershipDTO, organizationId: string): Membership {
        const entity: Membership = new Membership();
        entity.organizationId = organizationId;
        entity.userId = membership.userId;

        this.mapEntity(membership.role, entity);

        return entity;
    }

    mapEntity(role: MembershipRole, entity: Membership) {
        entity.role = role;
    }
}
