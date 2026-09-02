export const OAUTH_OPTIONS = 'OAUTH_OPTIONS';

export interface OAuthOptions {
    /** Public origin of this server; the `issuer` in RFC 8414 metadata. */
    issuer: string;
    /** RFC 6749 §4.1.2 recommends a maximum authorization code lifetime of 10 minutes. */
    authorizationCodeTtlSeconds: number;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
    /** Require PKCE from every client, not just public ones. */
    requirePkce: boolean;
    /**
     * PEM-encoded RSA private key that signs access tokens. Unset means an
     * ephemeral key is generated at boot — usable for local work only.
     */
    jwtPrivateKey?: string;
    /** `aud` claim of issued access tokens; defaults to the issuer. */
    jwtAudience?: string;
    /** Lifetime of a management-app session token. */
    sessionTtlSeconds: number;
    /** Create a demo client and user at boot; never in production. */
    devSeed: boolean;
    devSeedRedirectUris: string[];
}

export const DEFAULT_OAUTH_OPTIONS: OAuthOptions = {
    issuer: 'http://localhost:3000',
    authorizationCodeTtlSeconds: 600,
    accessTokenTtlSeconds: 3600,
    refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
    requirePkce: false,
    sessionTtlSeconds: 60 * 60 * 12,
    devSeed: false,
    devSeedRedirectUris: ['http://localhost:3000/callback']
};

export function oauthOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): OAuthOptions {
    const number = (value: string | undefined, fallback: number): number => {
        const parsed = Number(value);

        return value !== undefined && Number.isFinite(parsed) && parsed > 0
            ? parsed
            : fallback;
    };

    return {
        issuer: env.OAUTH_ISSUER
            ?? `http://localhost:${env.PORT ?? 3000}`,
        authorizationCodeTtlSeconds: number(
            env.OAUTH_AUTHORIZATION_CODE_TTL,
            DEFAULT_OAUTH_OPTIONS.authorizationCodeTtlSeconds
        ),
        accessTokenTtlSeconds: number(
            env.OAUTH_ACCESS_TOKEN_TTL,
            DEFAULT_OAUTH_OPTIONS.accessTokenTtlSeconds
        ),
        refreshTokenTtlSeconds: number(
            env.OAUTH_REFRESH_TOKEN_TTL,
            DEFAULT_OAUTH_OPTIONS.refreshTokenTtlSeconds
        ),
        requirePkce: env.OAUTH_REQUIRE_PKCE === 'true',
        // Newlines survive round-tripping through an env var badly, so a PEM
        // supplied with literal "\n" escapes is accepted too.
        jwtPrivateKey: env.OAUTH_JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        jwtAudience: env.OAUTH_JWT_AUDIENCE,
        sessionTtlSeconds: number(
            env.SESSION_TTL,
            DEFAULT_OAUTH_OPTIONS.sessionTtlSeconds
        ),
        devSeed: env.OAUTH_DEV_SEED === 'true',
        devSeedRedirectUris: (env.OAUTH_DEV_SEED_REDIRECT_URIS
            ?? DEFAULT_OAUTH_OPTIONS.devSeedRedirectUris.join(','))
            .split(',')
            .map((uri) => uri.trim())
            .filter((uri) => uri.length > 0)
    };
}
