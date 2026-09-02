import { z } from 'zod';

export const grantTypeSchema = z.enum([
    'authorization_code',
    'refresh_token',
    'client_credentials',
]);

/**
 * Client credentials may arrive in the body (`client_secret_post`) or in the
 * Authorization header (`client_secret_basic`), so both are optional here and
 * resolved by the controller (RFC 6749 §2.3.1).
 */
const clientAuthenticationSchema = z.object({
    client_id: z.string().min(1).optional(),
    client_secret: z.string().min(1).optional(),
});

export const authorizationCodeGrantSchema = clientAuthenticationSchema.extend({
    grant_type: z.literal('authorization_code'),
    code: z.string().min(1),
    redirect_uri: z.url().optional(),
    code_verifier: z.string().min(43).max(128).optional(),
});

export const refreshTokenGrantSchema = clientAuthenticationSchema.extend({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(1),
    scope: z.string().optional(),
});

export const clientCredentialsGrantSchema = clientAuthenticationSchema.extend({
    grant_type: z.literal('client_credentials'),
    scope: z.string().optional(),
});

export const tokenRequestSchema = z.discriminatedUnion('grant_type', [
    authorizationCodeGrantSchema,
    refreshTokenGrantSchema,
    clientCredentialsGrantSchema,
]);

export const tokenResponseSchema = z.object({
    access_token: z.string(),
    token_type: z.literal('Bearer'),
    expires_in: z.number(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
});

export type GrantType = z.infer<typeof grantTypeSchema>;
export type AuthorizationCodeGrantDTO = z.infer<
    typeof authorizationCodeGrantSchema
>;
export type RefreshTokenGrantDTO = z.infer<typeof refreshTokenGrantSchema>;
export type ClientCredentialsGrantDTO = z.infer<
    typeof clientCredentialsGrantSchema
>;
export type TokenRequestDTO = z.infer<typeof tokenRequestSchema>;
export type TokenResponseDTO = z.infer<typeof tokenResponseSchema>;
