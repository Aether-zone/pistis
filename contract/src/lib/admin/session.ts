import { z } from 'zod';

/**
 * An application session, distinct from an OAuth access token: it says who is
 * using *this* app, not what a third-party client may do on their behalf. The
 * two are signed with the same key but carry different JWT `typ` values, so one
 * can never be presented in place of the other.
 */
export const sessionSchema = z.object({
    token: z.string(),
    expires_in: z.number(),
    user: z.object({
        id: z.uuid(),
        name: z.string(),
        email: z.email(),
        admin: z.boolean()
    })
});

export const sessionClaimsSchema = z.object({
    iss: z.string(),
    sub: z.uuid(),
    aud: z.string(),
    exp: z.number(),
    iat: z.number(),
    jti: z.string(),
    admin: z.boolean()
});

export type SessionDTO = z.infer<typeof sessionSchema>;
export type SessionClaimsDTO = z.infer<typeof sessionClaimsSchema>;
