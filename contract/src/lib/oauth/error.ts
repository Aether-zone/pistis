import { z } from 'zod';

/** RFC 6749 §4.1.2.1 and §5.2 error codes. */
export const oauthErrorCodeSchema = z.enum([
    'invalid_request',
    'invalid_client',
    'invalid_grant',
    'unauthorized_client',
    'unsupported_grant_type',
    'unsupported_response_type',
    'invalid_scope',
    'access_denied',
    'invalid_token',
    'insufficient_scope',
    'server_error',
    'temporarily_unavailable',
]);

export const oauthErrorSchema = z.object({
    error: oauthErrorCodeSchema,
    error_description: z.string().optional(),
    error_uri: z.string().optional(),
    state: z.string().optional(),
});

export type OAuthErrorCode = z.infer<typeof oauthErrorCodeSchema>;
export type OAuthErrorDTO = z.infer<typeof oauthErrorSchema>;
