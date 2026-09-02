import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
    addMembershipDtoSchema,
    pageRequestDtoSchema,
    updateMembershipDtoSchema,
    Pageable,
    type AddMembershipDTO,
    type MembershipDTO,
    type PageRequestDTO,
    type UpdateMembershipDTO
} from "@pistis/contract";

import { Action } from "../../authorization/action";
import { CheckPolicies, PoliciesGuard } from "../../authorization/policies.guard";
import { membershipRef } from "../../authorization/subjects";
import { SchemaValidationPipe } from "../../common/schema-validation.pipe";
import { MembershipService } from "./membership.service";

/**
 * Members are addressed by their user id rather than by the membership id: a
 * user has at most one membership per organization, so the pair already
 * identifies it, and callers hold user ids rather than membership ids.
 */
@Controller('/organizations/:organizationId/members')
@UseGuards(PoliciesGuard)
export class MembershipController {

    constructor(
        private readonly membershipService: MembershipService
    ) { }

    @Get()
    @CheckPolicies((ability, request) =>
        ability.can(Action.Read, membershipRef(request.params.organizationId)))
    getMembers(
        @Param('organizationId', ParseUUIDPipe) organizationId: string,
        @Query(new SchemaValidationPipe(pageRequestDtoSchema)) pageRequest: PageRequestDTO
    ): Promise<Pageable<MembershipDTO>> {
        return this.membershipService.getMembers(organizationId, pageRequest);
    }

    @Get('/:userId')
    @CheckPolicies((ability, request) =>
        ability.can(Action.Read, membershipRef(request.params.organizationId)))
    getMember(
        @Param('organizationId', ParseUUIDPipe) organizationId: string,
        @Param('userId', ParseUUIDPipe) userId: string
    ): Promise<MembershipDTO> {
        return this.membershipService.getMember(organizationId, userId);
    }

    // The role being granted is part of the subject, so appointing an owner is
    // checked separately from adding an ordinary member.
    @Post()
    @CheckPolicies((ability, request) =>
        ability.can(Action.Create, membershipRef(
            request.params.organizationId,
            typeof (request.body as { role?: string } | undefined)?.role === 'string'
                ? (request.body as { role: string }).role
                : 'member'
        )))
    addMember(
        @Param('organizationId', ParseUUIDPipe) organizationId: string,
        @Body(new SchemaValidationPipe(addMembershipDtoSchema)) membership: AddMembershipDTO
    ): Promise<MembershipDTO> {
        return this.membershipService.addMember(organizationId, membership);
    }

    @Put('/:userId')
    @CheckPolicies((ability, request) =>
        ability.can(Action.Update, membershipRef(
            request.params.organizationId,
            typeof (request.body as { role?: string } | undefined)?.role === 'string'
                ? (request.body as { role: string }).role
                : 'member'
        )))
    updateMember(
        @Param('organizationId', ParseUUIDPipe) organizationId: string,
        @Param('userId', ParseUUIDPipe) userId: string,
        @Body(new SchemaValidationPipe(updateMembershipDtoSchema)) membership: UpdateMembershipDTO
    ): Promise<MembershipDTO> {
        return this.membershipService.updateMember(organizationId, userId, membership.role);
    }

    @Delete('/:userId')
    @CheckPolicies((ability, request) =>
        ability.can(Action.Delete, membershipRef(request.params.organizationId)))
    removeMember(
        @Param('organizationId', ParseUUIDPipe) organizationId: string,
        @Param('userId', ParseUUIDPipe) userId: string
    ): Promise<boolean> {
        return this.membershipService.removeMember(organizationId, userId);
    }
}
