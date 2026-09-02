import { z } from 'zod';

/**
 * Roles are ordered by authority: an `owner` can do anything, an `admin` can
 * manage members but not owners, a `member` only belongs. The service enforces
 * one invariant — an organization always keeps at least one owner.
 */
export const membershipRoleSchema = z.enum(['owner', 'admin', 'member']);

/**
 * Memberships carry a summary of the user they refer to. A members list is the
 * reason this resource exists, and returning bare ids would force every caller
 * into a second request per row.
 */
const membershipSchema = z.object({
    id: z.uuid(),
    organizationId: z.uuid(),
    role: membershipRoleSchema,
    user: z.object({
        id: z.uuid(),
        name: z.string(),
        email: z.email()
    }),
    createdAt: z.date(),
    updatedAt: z.date()
});

const addMembershipSchema = z.object({
    userId: z.uuid(),
    role: membershipRoleSchema.default('member')
});

const updateMembershipSchema = z.object({
    role: membershipRoleSchema
});

export const membershipDtoSchema = membershipSchema;
export const addMembershipDtoSchema = addMembershipSchema;
export const updateMembershipDtoSchema = updateMembershipSchema;

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type MembershipDTO = z.infer<typeof membershipSchema>;
export type AddMembershipDTO = z.infer<typeof addMembershipSchema>;
export type UpdateMembershipDTO = z.infer<typeof updateMembershipSchema>;
