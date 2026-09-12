import { z } from 'zod';

// `formatScope` and `parseScope` are organon's and re-exported from
// `lib/organon.ts`. What stays here is the catalogue — which scopes exist, and
// how a consent screen describes them — which is this server's alone.

/**
 * Scopes this authorization server knows about. `description` is what a
 * consent screen shows the resource owner, so keep it user-facing.
 *
 * The catalogue is an allowlist: `ClientService.register` refuses a client that
 * asks for anything not named here, so a resource server inventing a scope of
 * its own gets an `invalid_scope` at registration rather than a token nobody
 * can use.
 */
export const SUPPORTED_SCOPES = {
    profile: 'View your name and profile details',
    email: 'View your email address',
    'users:read': 'Read the user directory',
    'users:write': 'Create and modify users',
    organizations: 'See which organizations you belong to',
    /*
     * loculus's, and the first scope here that no person is ever asked about.
     *
     * It lets a service read an object another client uploaded — what mneme
     * needs to index a document a browser put in the workspace, having
     * presigned none of it. Worded for a consent screen anyway, because the
     * catalogue is one list and the next reader should not have to work out why
     * one entry reads differently.
     *
     * Granted by registering a client with it, never by a person approving it:
     * it belongs to the client credentials grant, which has no resource owner.
     */
    'objects:read:any': 'Read stored files belonging to any application',
} as const;

export type SupportedScope = keyof typeof SUPPORTED_SCOPES;

export const SUPPORTED_SCOPE_NAMES = Object.keys(
    SUPPORTED_SCOPES,
) as SupportedScope[];

export const scopeDescriptorSchema = z.object({
    name: z.string(),
    description: z.string(),
});

export type ScopeDescriptorDTO = z.infer<typeof scopeDescriptorSchema>;

export function describeScopes(scopes: readonly string[]): ScopeDescriptorDTO[] {
    return scopes.map((name) => ({
        name,
        description:
            SUPPORTED_SCOPES[name as SupportedScope] ?? 'Unknown permission',
    }));
}
