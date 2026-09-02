import { z } from 'zod';

/**
 * `slug` is the stable, URL-safe identifier; `name` is the display label and is
 * free to change. Keeping them separate means renaming an organization does not
 * invalidate anything that referred to it.
 */
const organizationSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(64).regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'must be lowercase letters, digits and single hyphens'
    ),
    description: z.string().max(1000).nullable(),
    createdAt: z.date(),
    updatedAt: z.date()
});

const createOrganizationSchema = organizationSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true
}).extend({
    description: z.string().max(1000).nullable().default(null)
});

export const organizationDtoSchema = organizationSchema;
export const createOrganizationDtoSchema = createOrganizationSchema;

export type OrganizationDTO = z.infer<typeof organizationSchema>;
export type CreateOrganizationDTO = z.infer<typeof createOrganizationSchema>;
