import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
    Pageable,
    type AddMembershipDTO,
    type MembershipDTO,
    type MembershipRole,
    type PageRequestDTO,
    type UserDTO
} from "@pistis/contract";
import { Not, Repository } from "typeorm";

import { UserService } from "../../user/user.service";
import { Organization } from "../organization";
import { Membership } from "./membership";
import { MembershipMapper } from "./membership.mapper";

@Injectable()
export class MembershipService {

    constructor(
        @InjectRepository(Membership) private readonly membershipRepository: Repository<Membership>,
        // The organization repository rather than OrganizationService: this
        // module is imported *by* the organization module, and depending back
        // on it would make the pair circular.
        @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
        private readonly userService: UserService,
        private readonly membershipMapper: MembershipMapper
    ) { }

    async getMembers(
        organizationId: string,
        pageRequest: PageRequestDTO
    ): Promise<Pageable<MembershipDTO>> {
        await this.assertOrganizationExists(organizationId);

        const [memberships, totalNumberOfElements] = await this.membershipRepository
            .findAndCount({
                where: { organizationId },
                order: { createdAt: 'ASC' },
                skip: (pageRequest.pageNumber * pageRequest.perPage),
                take: pageRequest.perPage
            });

        return Pageable.of(
            await this.toDTOs(memberships),
            totalNumberOfElements,
            pageRequest
        );
    }

    async getMember(organizationId: string, userId: string): Promise<MembershipDTO> {
        const membership: Membership = await this.loadMembership(organizationId, userId);

        return this.membershipMapper.toDTO(
            membership,
            await this.userService.getUser(userId)
        );
    }

    async addMember(organizationId: string, request: AddMembershipDTO): Promise<MembershipDTO> {
        await this.assertOrganizationExists(organizationId);

        // Resolved first: this throws NotFound for an unknown user, which is a
        // better answer than a foreign key that refers to nothing.
        const user: UserDTO = await this.userService.getUser(request.userId);

        const existing: number = await this.membershipRepository.countBy({
            organizationId,
            userId: request.userId
        });

        if (existing > 0) {
            throw new ConflictException(
                `${user.email} is already a member of this organization.`
            );
        }

        const entity: Membership = this.membershipMapper.toEntity(request, organizationId);

        return this.membershipMapper.toDTO(
            await this.membershipRepository.save(entity),
            user
        );
    }

    async updateMember(
        organizationId: string,
        userId: string,
        role: MembershipRole
    ): Promise<MembershipDTO> {
        const membership: Membership = await this.loadMembership(organizationId, userId);

        if (membership.role === 'owner' && role !== 'owner') {
            await this.assertNotLastOwner(organizationId, userId);
        }

        this.membershipMapper.mapEntity(role, membership);

        return this.membershipMapper.toDTO(
            await this.membershipRepository.save(membership),
            await this.userService.getUser(userId)
        );
    }

    async removeMember(organizationId: string, userId: string): Promise<boolean> {
        const membership: Membership = await this.loadMembership(organizationId, userId);

        if (membership.role === 'owner') {
            await this.assertNotLastOwner(organizationId, userId);
        }

        const result = await this.membershipRepository.delete({ id: membership.id });

        return result.affected === 1;
    }

    /** Every organization the user belongs to, keyed by id, with their role. */
    async getRolesOf(userId: string): Promise<Record<string, MembershipRole>> {
        const memberships: Membership[] = await this.membershipRepository.findBy({ userId });

        return Object.fromEntries(
            memberships.map((membership) => [
                membership.organizationId,
                membership.role as MembershipRole
            ])
        );
    }

    /** Ids of the organizations the user belongs to. */
    async getOrganizationIdsOf(userId: string): Promise<string[]> {
        const memberships: Membership[] = await this.membershipRepository.findBy({ userId });

        return memberships.map((membership) => membership.organizationId);
    }

    /** Removes every membership of an organization, for use when it is deleted. */
    async removeAllMembers(organizationId: string): Promise<number> {
        const result = await this.membershipRepository.delete({ organizationId });

        return result.affected ?? 0;
    }

    private async toDTOs(memberships: Membership[]): Promise<MembershipDTO[]> {
        const users: UserDTO[] = await this.userService.getUsersByIds(
            memberships.map((membership) => membership.userId)
        );
        const byId = new Map(users.map((user) => [user.id, user]));

        return memberships
            // A membership whose user has been deleted has nothing to show.
            .filter((membership) => byId.has(membership.userId))
            .map((membership) => this.membershipMapper.toDTO(
                membership,
                byId.get(membership.userId) as UserDTO
            ));
    }

    /**
     * An organization without an owner cannot be administered by anyone, so the
     * last one may be neither demoted nor removed.
     */
    private async assertNotLastOwner(organizationId: string, userId: string): Promise<void> {
        const otherOwners: number = await this.membershipRepository.countBy({
            organizationId,
            role: 'owner',
            userId: Not(userId)
        });

        if (otherOwners === 0) {
            throw new ConflictException(
                'An organization must keep at least one owner.'
            );
        }
    }

    private async assertOrganizationExists(organizationId: string): Promise<void> {
        const organizations: number = await this.organizationRepository.countBy({
            id: organizationId
        });

        if (organizations === 0) {
            throw new NotFoundException(
                `Organization with id "${organizationId}" not found.`
            );
        }
    }

    private async loadMembership(organizationId: string, userId: string): Promise<Membership> {
        await this.assertOrganizationExists(organizationId);

        const membership: Membership | null = await this.membershipRepository.findOneBy({
            organizationId,
            userId
        });

        if (!membership) {
            throw new NotFoundException(
                `User "${userId}" is not a member of this organization.`
            );
        }

        return membership;
    }
}
