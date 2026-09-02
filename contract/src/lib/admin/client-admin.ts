import { z } from 'zod';

/** A registered OAuth client as the dashboard sees it; the secret is never returned. */
export const adminClientSchema = z.object({
    id: z.uuid(),
    clientId: z.string(),
    name: z.string(),
    confidential: z.boolean(),
    redirectUris: z.array(z.string()),
    grantTypes: z.array(z.string()),
    scopes: z.array(z.string()),
    createdAt: z.date(),
    updatedAt: z.date()
});

export const createClientSchema = z.object({
    clientId: z.string().min(1).max(128),
    name: z.string().min(1).max(200),
    /** Omit for a public client, which must then use PKCE. */
    confidential: z.boolean(),
    redirectUris: z.array(z.url()).min(1),
    grantTypes: z.array(
        z.enum(['authorization_code', 'refresh_token', 'client_credentials'])
    ).min(1),
    scopes: z.array(z.string()).min(1)
});

/**
 * The generated secret, returned exactly once at registration or rotation —
 * only its bcrypt hash is stored, so it cannot be shown again.
 */
export const clientSecretSchema = z.object({
    clientId: z.string(),
    clientSecret: z.string()
});

export type AdminClientDTO = z.infer<typeof adminClientSchema>;
export type CreateClientDTO = z.infer<typeof createClientSchema>;
export type ClientSecretDTO = z.infer<typeof clientSecretSchema>;
