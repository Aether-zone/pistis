import { z } from 'zod';

import { membershipRoleSchema } from '../organon.js';

/**
 * The organization a client acts in, for the client credentials grant.
 *
 * A role as well as an id, because a client has no membership row to read one
 * from — the binding is a grant rather than a membership. The client must also
 * hold the `organizations` scope, or registration is refused: a claim without
 * the scope that announces it would contradict what a resource server is
 * entitled to assume.
 */
export const clientOrganizationSchema = z.object({
    id: z.uuid(),
    role: membershipRoleSchema
});

/** A registered OAuth client as the dashboard sees it; the secret is never returned. */
export const adminClientSchema = z.object({
    id: z.uuid(),
    clientId: z.string(),
    name: z.string(),
    confidential: z.boolean(),
    redirectUris: z.array(z.string()),
    grantTypes: z.array(z.string()),
    scopes: z.array(z.string()),
    /** Present only for a client bound to an organization. */
    organization: clientOrganizationSchema.nullable(),
    createdAt: z.date(),
    updatedAt: z.date()
});

export const createClientSchema = z.object({
    clientId: z.string().min(1).max(128),
    name: z.string().min(1).max(200),
    /** Omit for a public client, which must then use PKCE. */
    confidential: z.boolean(),
    /**
     * Empty is allowed, and only the authorization code grant requires one —
     * see the rule below. A client that only uses client credentials has no
     * browser to send anywhere, and requiring a URI for it meant every service
     * client in the workspace had to be registered in code instead.
     */
    redirectUris: z.array(z.url()),
    grantTypes: z.array(
        z.enum(['authorization_code', 'refresh_token', 'client_credentials'])
    ).min(1),
    scopes: z.array(z.string()).min(1),
    /** Omit for a client that acts on a person's behalf. */
    organization: clientOrganizationSchema.optional()
}).refine(
    (client) =>
        !client.grantTypes.includes('authorization_code')
        || client.redirectUris.length > 0,
    {
        error: 'A client using the authorization code grant needs at least one '
            + 'redirect URI to send the browser back to.',
        path: ['redirectUris']
    }
);

/**
 * The generated secret, returned exactly once at registration or rotation —
 * only its bcrypt hash is stored, so it cannot be shown again.
 */
export const clientSecretSchema = z.object({
    clientId: z.string(),
    clientSecret: z.string()
});

export type ClientOrganizationDTO = z.infer<typeof clientOrganizationSchema>;
export type AdminClientDTO = z.infer<typeof adminClientSchema>;
export type CreateClientDTO = z.infer<typeof createClientSchema>;
export type ClientSecretDTO = z.infer<typeof clientSecretSchema>;
