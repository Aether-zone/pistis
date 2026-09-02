import { Injectable } from "@nestjs/common";
import { CreateOrganizationDTO, OrganizationDTO } from "@pistis/contract";

import { Organization } from "./organization";

@Injectable()
export class OrganizationMapper {

    toDTO(entity: Organization): OrganizationDTO {
        return {
            id: entity.id,
            name: entity.name,
            slug: entity.slug,
            description: entity.description,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt
        }
    }

    toEntity(organization: CreateOrganizationDTO): Organization {
        const entity: Organization = new Organization();

        this.mapEntity(organization, entity);

        return entity;
    }

    mapEntity(organization: CreateOrganizationDTO, entity: Organization) {
        entity.name = organization.name;
        entity.slug = organization.slug;
        entity.description = organization.description;
    }
}
