import { z } from 'zod';

export const adminTokenSchema = z.object({
    id: z.uuid(),
    kind: z.enum(['access', 'refresh']),
    clientId: z.string(),
    userId: z.string().nullable(),
    scopes: z.array(z.string()),
    issuedAt: z.date(),
    expiresAt: z.date(),
    revokedAt: z.date().nullable(),
    active: z.boolean()
});

export type AdminTokenDTO = z.infer<typeof adminTokenSchema>;
