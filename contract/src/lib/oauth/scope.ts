import { z } from 'zod';

/**
 * Scopes this authorization server knows about. `description` is what a
 * consent screen shows the resource owner, so keep it user-facing.
 */
export const SUPPORTED_SCOPES = {
    profile: 'View your name and profile details',
    email: 'View your email address',
    'users:read': 'Read the user directory',
    'users:write': 'Create and modify users',
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

/** OAuth puts scopes on the wire as a single space-delimited string (RFC 6749 §3.3). */
export function parseScope(scope: string | undefined | null): string[] {
    if (!scope) {
        return [];
    }

    return [...new Set(scope.split(' ').filter((value) => value.length > 0))];
}

export function formatScope(scopes: readonly string[]): string {
    return scopes.join(' ');
}

export function describeScopes(scopes: readonly string[]): ScopeDescriptorDTO[] {
    return scopes.map((name) => ({
        name,
        description:
            SUPPORTED_SCOPES[name as SupportedScope] ?? 'Unknown permission',
    }));
}
