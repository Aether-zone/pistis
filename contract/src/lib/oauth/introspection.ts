import { z } from 'zod';

export const tokenTypeHintSchema = z.enum(['access_token', 'refresh_token']);

/** RFC 7662 §2.1 */
export const introspectionRequestSchema = z.object({
    token: z.string().min(1),
    token_type_hint: tokenTypeHintSchema.optional(),
});

/**
 * RFC 7662 §2.2. Only `active` is guaranteed; for an inactive token the server
 * must not disclose anything else.
 */
export const introspectionResponseSchema = z.object({
    active: z.boolean(),
    scope: z.string().optional(),
    client_id: z.string().optional(),
    username: z.string().optional(),
    token_type: z.string().optional(),
    exp: z.number().optional(),
    iat: z.number().optional(),
    sub: z.string().optional(),
});

/** RFC 7009 §2.1 */
export const revocationRequestSchema = z.object({
    token: z.string().min(1),
    token_type_hint: tokenTypeHintSchema.optional(),
});

export type TokenTypeHint = z.infer<typeof tokenTypeHintSchema>;
export type IntrospectionRequestDTO = z.infer<typeof introspectionRequestSchema>;
export type IntrospectionResponseDTO = z.infer<
    typeof introspectionResponseSchema
>;
export type RevocationRequestDTO = z.infer<typeof revocationRequestSchema>;
