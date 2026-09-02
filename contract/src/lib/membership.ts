import { z } from 'zod';


export type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

const membershipSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    organizationId: z.uuid(),
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
    createdAt: z.date(),
    updatedAt: z.date()
});

const createMembershipSchema = membershipSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).extend({
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('OWNER')
});


export type OrganizationDTO = z.infer<typeof membershipSchema>;
export type CreateOrganizationDTO = z.infer<typeof createMembershipSchema>;
