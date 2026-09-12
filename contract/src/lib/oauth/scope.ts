import { z } from 'zod';

// `formatScope` and `parseScope` are organon's and re-exported from
// `lib/organon.ts`. What stays here is the catalogue — which scopes exist, and
// how a consent screen describes them — which is this server's alone.

/**
 * Scopes this authorization server knows about. `description` is what a
 * consent screen shows the resource owner, so keep it user-facing.
 */
export const SUPPORTED_SCOPES = {
    profile: 'View your name and profile details',
    email: 'View your email address',
    'users:read': 'Read the user directory',
    'users:write': 'Create and modify users',
    organizations: 'See which organizations you belong to',
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
