import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateOrganizationDTO, OrganizationDTO, Pageable, PageRequestDTO } from "@pistis/contract";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";

import { MembershipService } from "./membership/membership.service";
import { Organization } from "./organization";
import { OrganizationMapper } from "./organization.mapper";

@Injectable()
export class OrganizationService {

    constructor(
        @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
        private readonly organizationMapper: OrganizationMapper,
        private readonly membershipService: MembershipService
    ) { }

    /**
     * Lists the organizations the user belongs to.
     *
     * The scoping is a `where` clause rather than a CASL check over a fetched
     * page: filtering after the query would page over rows the caller cannot
     * see, so `totalNumberOfElements` would count other people's organizations
     * and pages would come back short. `organizationIds` of `null` means no
     * restriction, which is what a global admin gets.
     */
    async getOrganizations(
        pageRequest: PageRequestDTO,
        organizationIds: string[] | null
    ): Promise<Pageable<OrganizationDTO>> {
        if (organizationIds !== null && organizationIds.length === 0) {
            return Pageable.of([], 0, pageRequest);
        }

        const [organizations, totalNumberOfElements] = await this.organizationRepository
            .findAndCount({
                where: organizationIds === null ? {} : { id: In(organizationIds) },
                order: { createdAt: 'ASC' },
                skip: (pageRequest.pageNumber * pageRequest.perPage),
                take: pageRequest.perPage
            });

        return Pageable.of(
            organizations.map((organization) => this.organizationMapper.toDTO(organization)),
            totalNumberOfElements,
            pageRequest
        );
    }

    async getOrganization(id: string): Promise<OrganizationDTO> {
        return this.organizationMapper.toDTO(await this.loadOrganization(id));
    }

    async getOrganizationBySlug(slug: string): Promise<OrganizationDTO> {
        const organization: Organization | null = await this.organizationRepository.findOneBy({
            slug
        });

        if (!organization) {
            throw new NotFoundException(`Organization with slug "${slug}" not found.`);
        }

        return this.organizationMapper.toDTO(organization);
    }

    /**
     * Creates an organization and makes its creator the owner. Without that an
     * organization would exist that nobody can administer, and the "keep at
     * least one owner" rule would have nothing to protect.
     */
    async createOrganization(
        organization: CreateOrganizationDTO,
        ownerId: string
    ): Promise<OrganizationDTO> {
        await this.assertSlugIsFree(organization.slug);

        const entity: Organization = this.organizationMapper.toEntity(organization);
        const saved: Organization = await this.organizationRepository.save(entity);

        await this.membershipService.addMember(saved.id, {
            userId: ownerId,
            role: 'owner'
        });

        return this.organizationMapper.toDTO(saved);
    }

    async updateOrganization(organization: CreateOrganizationDTO, id: string): Promise<OrganizationDTO> {
        const entity: Organization = await this.loadOrganization(id);

        await this.assertSlugIsFree(organization.slug, id);

        this.organizationMapper.mapEntity(organization, entity);

        return this.organizationMapper.toDTO(
            await this.organizationRepository.save(entity)
        );
    }

    async deleteOrganization(id: string): Promise<boolean> {
        // There are no database-level cascades — the association is plain
        // columns — so the memberships have to go explicitly, or they outlive
        // the organization they point at.
        await this.membershipService.removeAllMembers(id);

        const result = await this.organizationRepository.delete({
            id
        });

        return result.affected === 1;
    }

    /**
     * Checked rather than left to the unique index, which surfaces as an opaque
     * 500 from the driver. `exclude` is the organization being updated, which
     * is allowed to keep its own slug.
     */
    private async assertSlugIsFree(slug: string, exclude?: string): Promise<void> {
        const clash: number = await this.organizationRepository.countBy(
            exclude ? { slug, id: Not(exclude) } : { slug }
        );

        if (clash > 0) {
            throw new ConflictException(`An organization with the slug "${slug}" already exists.`);
        }
    }

    private async loadOrganization(id: string): Promise<Organization> {
        const organization: Organization | null = await this.organizationRepository.findOneBy({
            id
        });

        if (!organization) {
            throw new NotFoundException(`Organization with id "${id}" not found.`);
        }

        return organization;
    }
}
