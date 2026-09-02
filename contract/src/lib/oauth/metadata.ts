import { z } from 'zod';

/** RFC 8414 §2 authorization server metadata. */
export const authorizationServerMetadataSchema = z.object({
    issuer: z.string(),
    authorization_endpoint: z.string(),
    jwks_uri: z.string(),
    token_endpoint: z.string(),
    introspection_endpoint: z.string(),
    revocation_endpoint: z.string(),
    userinfo_endpoint: z.string(),
    scopes_supported: z.array(z.string()),
    response_types_supported: z.array(z.string()),
    grant_types_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()),
    code_challenge_methods_supported: z.array(z.string()),
});

export type AuthorizationServerMetadataDTO = z.infer<
    typeof authorizationServerMetadataSchema
>;
