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

/**
 * The colour a client is shown in.
 *
 * Six digits and a hash, lowercased so that one colour has one spelling — the
 * same reasoning as tags elsewhere in the workspace, and it means a comparison
 * never has to fold case. Three-digit shorthand is refused rather than expanded:
 * `<input type="color">` always submits the long form, so accepting both would
 * mean storing two spellings of the same colour for no caller's benefit.
 */
export const clientPrimaryColorSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, 'must be a six-digit hex colour, such as "#2563eb"');

/**
 * The colour a client gets when nobody chooses one.
 *
 * kosmos's own `--kosmos-color-primary`, rather than a blue picked here: a
 * client that has expressed no preference should look like the workspace it
 * belongs to, and a second opinion about what blue means would drift from it.
 */
export const DEFAULT_CLIENT_PRIMARY_COLOR = '#2563eb';

/** A registered OAuth client as the dashboard sees it; the secret is never returned. */
export const adminClientSchema = z.object({
    id: z.uuid(),
    clientId: z.string(),
    name: z.string(),
    confidential: z.boolean(),
    redirectUris: z.array(z.string()),
    grantTypes: z.array(z.string()),
    scopes: z.array(z.string()),
    primaryColor: clientPrimaryColorSchema,
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
     * Empty is allowed here, and `ClientService` is what refuses it for a client
     * that has a browser to send back — the rule depends on `grantTypes`, and
     * for an update it depends on fields the request may not even carry, so it
     * cannot live in a schema without living in two.
     *
     * A client that only uses client credentials has no browser to send
     * anywhere. Requiring a URI of it meant every service client in the
     * workspace had to be registered in code instead of through this API.
     */
    redirectUris: z.array(z.url()),
    grantTypes: z.array(
        z.enum(['authorization_code', 'refresh_token', 'client_credentials'])
    ).min(1),
    scopes: z.array(z.string()).min(1),
    primaryColor: clientPrimaryColorSchema.default(DEFAULT_CLIENT_PRIMARY_COLOR),
    /** Omit for a client that acts on a person's behalf. */
    organization: clientOrganizationSchema.optional()
});

/**
 * What an admin may change about a registered client.
 *
 * Every field optional: absent leaves the value alone. `clientId` is not here
 * because it is the client's identity — the thing its own configuration names —
 * and `clientSecret` is not either, because rotation is its own route and
 * returns the new secret exactly once.
 *
 * `organization` is *nullable* where the others are not, because there are two
 * ways to say something about a binding and only one of them is "leave it":
 * `null` removes it, absent keeps it. The arrays have no such distinction —
 * `[]` already says "none".
 *
 * The two rules `createClientSchema` enforces are not repeated here, because a
 * partial change cannot be judged on its own: dropping `organizations` from the
 * scopes is only wrong if a binding survives the change. They are checked
 * against the *resulting* client instead — see `ClientService.update`.
 */
export const updateClientSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    redirectUris: z.array(z.url()).optional(),
    grantTypes: z.array(
        z.enum(['authorization_code', 'refresh_token', 'client_credentials'])
    ).min(1).optional(),
    scopes: z.array(z.string()).min(1).optional(),
    primaryColor: clientPrimaryColorSchema.optional(),
    organization: clientOrganizationSchema.nullable().optional()
});

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
export type UpdateClientDTO = z.infer<typeof updateClientSchema>;
export type ClientSecretDTO = z.infer<typeof clientSecretSchema>;
