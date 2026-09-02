import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import {
    createOrganizationDtoSchema,
    pageRequestDtoSchema,
    Pageable,
    type CreateOrganizationDTO,
    type OrganizationDTO,
    type PageRequestDTO
} from "@pistis/contract";

import { CurrentUser } from "../auth/current-user.decorator";
import { Action } from "../authorization/action";
import { CheckPolicies, PoliciesGuard, type AuthorizedRequest } from "../authorization/policies.guard";
import { organizationRef } from "../authorization/subjects";
import { SchemaValidationPipe } from "../common/schema-validation.pipe";
import { MembershipService } from "./membership/membership.service";
import { Organization } from "./organization";
import { OrganizationService } from "./organization.service";

/**
 * Every route is authenticated, and authorized by CASL. Where the id is in the
 * path the policy runs against a bare reference, so a request is refused before
 * anything is loaded.
 */
@Controller('/organizations')
@UseGuards(PoliciesGuard)
export class OrganizationController {

    constructor(
        private readonly organizationService: OrganizationService,
        private readonly membershipService: MembershipService
    ) { }

    /** Only the organizations the caller belongs to; an admin sees them all. */
    @Get()
    async getOrganizations(
        @Query(new SchemaValidationPipe(pageRequestDtoSchema)) pageRequest: PageRequestDTO,
        @CurrentUser('id') userId: string,
        @Req() request: AuthorizedRequest
    ): Promise<Pageable<OrganizationDTO>> {
        const unrestricted: boolean = request.ability?.can(Action.Manage, 'all') === true;

        return this.organizationService.getOrganizations(
            pageRequest,
            unrestricted ? null : await this.membershipService.getOrganizationIdsOf(userId)
        );
    }

    /**
     * The id is not known until the organization is loaded, so the policy runs
     * afterwards. A refusal is reported as "not found": to a caller with no
     * membership, an organization they may not read is indistinguishable from
     * one that does not exist, and saying otherwise would make this endpoint an
     * oracle for which slugs are taken.
     */
    @Get('/slug/:slug')
    async getOrganizationBySlug(
        @Param('slug') slug: string,
        @Req() request: AuthorizedRequest
    ): Promise<OrganizationDTO> {
        const organization: OrganizationDTO =
            await this.organizationService.getOrganizationBySlug(slug);

        if (!request.ability?.can(Action.Read, organizationRef(organization.id))) {
            throw new NotFoundException(`Organization with slug "${slug}" not found.`);
        }

        return organization;
    }

    @Get('/:id')
    @CheckPolicies((ability, request) =>
        ability.can(Action.Read, organizationRef(request.params.id)))
    getOrganization(
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<OrganizationDTO> {
        return this.organizationService.getOrganization(id);
    }

    @Post()
    @CheckPolicies((ability) => ability.can(Action.Create, Organization))
    createOrganization(
        @Body(new SchemaValidationPipe(createOrganizationDtoSchema)) organization: CreateOrganizationDTO,
        @CurrentUser('id') ownerId: string
    ): Promise<OrganizationDTO> {
        return this.organizationService.createOrganization(organization, ownerId);
    }

    @Put('/:id')
    @CheckPolicies((ability, request) =>
        ability.can(Action.Update, organizationRef(request.params.id)))
    updateOrganization(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new SchemaValidationPipe(createOrganizationDtoSchema)) organization: CreateOrganizationDTO
    ): Promise<OrganizationDTO> {
        return this.organizationService.updateOrganization(organization, id);
    }

    @Delete('/:id')
    @CheckPolicies((ability, request) =>
        ability.can(Action.Delete, organizationRef(request.params.id)))
    deleteOrganization(
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<boolean> {
        return this.organizationService.deleteOrganization(id);
    }
}
