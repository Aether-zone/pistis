import { z } from 'zod';

/**
 * A single JSON Web Key. Only the RSA public parameters are ever published,
 * so `d` and the other private fields deliberately have no place here.
 */
export const jsonWebKeySchema = z.object({
    kty: z.literal('RSA'),
    use: z.literal('sig'),
    alg: z.literal('RS256'),
    kid: z.string(),
    n: z.string(),
    e: z.string()
});

export const jsonWebKeySetSchema = z.object({
    keys: z.array(jsonWebKeySchema)
});

/**
 * Claims of a JWT access token, per RFC 9068 §2.2. `sub` is the resource
 * owner for a user-delegated token and the client itself for the client
 * credentials grant; `jti` is what ties the token back to its database row,
 * which is what makes revocation possible for an otherwise self-contained
 * credential.
 */
export const accessTokenClaimsSchema = z.object({
    iss: z.string(),
    sub: z.string(),
    aud: z.string(),
    exp: z.number(),
    iat: z.number(),
    jti: z.string(),
    client_id: z.string(),
    scope: z.string()
});

export type JsonWebKeyDTO = z.infer<typeof jsonWebKeySchema>;
export type JsonWebKeySetDTO = z.infer<typeof jsonWebKeySetSchema>;
export type AccessTokenClaimsDTO = z.infer<typeof accessTokenClaimsSchema>;
