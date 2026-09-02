import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { type GrantType, type UserDTO } from "@pistis/contract";
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "crypto";

import { configureApp } from "../app/configure";
import { AuthModule } from "../auth/auth.module";
import { PasswordService } from "../user/password/password.service";
import { UserModule } from "../user/user.module";
import { UserService } from "../user/user.service";
import { ClientService } from "./client/client.service";
import { OAUTH_OPTIONS, type OAuthOptions } from "./oauth.options";
import { OAuthModule } from "./oauth.module";

const REDIRECT_URI = 'https://client.example/callback';
const OWNER_EMAIL = 'ada@example.com';
const OWNER_PASSWORD = 'correct horse battery staple';

let app: INestApplication;
let base: string;
let owner: UserDTO;

interface HttpResult {
    status: number;
    // The endpoints under test return several unrelated JSON shapes (tokens,
    // errors, introspection, metadata), and each assertion narrows it itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any;
    headers: Headers;
}

function verifier(): string {
    return randomBytes(32).toString('base64url');
}

function challengeOf(value: string): string {
    return createHash('sha256').update(value, 'ascii').digest('base64url');
}

function basic(clientId: string, clientSecret: string): string {
    const encoded: string = Buffer
        .from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`)
        .toString('base64');

    return `Basic ${encoded}`;
}

async function read(response: Response): Promise<HttpResult> {
    const text: string = await response.text();

    return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        headers: response.headers
    };
}

async function form(
    path: string,
    body: Record<string, string>,
    headers: Record<string, string> = {}
): Promise<HttpResult> {
    return read(await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
        body: new URLSearchParams(body).toString()
    }));
}

async function postJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
): Promise<HttpResult> {
    return read(await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    }));
}

async function get(path: string, headers: Record<string, string> = {}): Promise<HttpResult> {
    return read(await fetch(`${base}${path}`, { headers }));
}

interface RegisteredClient {
    clientId: string;
    clientSecret?: string;
}

/** Each test registers its own client, so none can collide on the unique index. */
async function registerClient(overrides: {
    clientSecret?: string | null;
    grantTypes?: GrantType[];
    scopes?: string[];
    redirectUris?: string[];
} = {}): Promise<RegisteredClient> {
    const clientId = `client-${randomBytes(8).toString('hex')}`;
    const clientSecret: string | undefined = overrides.clientSecret === null
        ? undefined
        : (overrides.clientSecret ?? 's3cret');

    await app.get(ClientService).register({
        clientId,
        clientSecret,
        name: 'Example Client',
        redirectUris: overrides.redirectUris ?? [REDIRECT_URI],
        grantTypes: overrides.grantTypes ?? ['authorization_code', 'refresh_token'],
        scopes: overrides.scopes ?? ['profile', 'email']
    });

    return { clientId, clientSecret };
}

/** Drives the consent step and returns the raw response. */
async function decide(
    clientId: string,
    extra: Record<string, unknown> = {}
): Promise<HttpResult> {
    return postJson('/api/oauth/authorize', {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'profile',
        state: 'xyz',
        username: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        approved: true,
        ...extra
    });
}

/** Full authorization code + PKCE round trip, returning the token response. */
async function authorizationCodeFlow(client: RegisteredClient): Promise<HttpResult> {
    const codeVerifier: string = verifier();

    const authorized: HttpResult = await decide(client.clientId, {
        code_challenge: challengeOf(codeVerifier),
        code_challenge_method: 'S256'
    });

    return form('/api/oauth/token', {
        grant_type: 'authorization_code',
        code: authorized.body.code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier
    }, { Authorization: basic(client.clientId, client.clientSecret as string) });
}

beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
            TypeOrmModule.forRoot({
                type: 'better-sqlite3',
                database: ':memory:',
                autoLoadEntities: true,
                synchronize: true,
                dropSchema: true
            }),
            UserModule,
            AuthModule,
            OAuthModule
        ]
    }).compile();

    app = configureApp(moduleRef.createNestApplication());

    await app.listen(0);

    base = await app.getUrl();

    owner = await app.get(UserService).createUser({
        name: 'Ada Lovelace',
        email: OWNER_EMAIL
    });

    await app.get(PasswordService).storePassword(OWNER_PASSWORD, owner.id);
});

afterAll(async () => {
    await app?.close();
});

describe('RFC 8414 discovery', () => {
    it('serves metadata outside the global api prefix', async () => {
        const result: HttpResult = await get('/.well-known/oauth-authorization-server');

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            response_types_supported: ['code'],
            grant_types_supported: [
                'authorization_code',
                'refresh_token',
                'client_credentials'
            ],
            code_challenge_methods_supported: ['S256', 'plain']
        });
        expect(result.body.token_endpoint).toContain('/api/oauth/token');
    });
});

describe('JWT access tokens', () => {

    it('serves the signing key as a JWKS outside the global api prefix', async () => {
        const result: HttpResult = await get('/.well-known/jwks.json');

        expect(result.status).toBe(200);
        expect(result.body.keys).toHaveLength(1);
        expect(result.body.keys[0]).toMatchObject({
            kty: 'RSA',
            use: 'sig',
            alg: 'RS256'
        });
        expect(result.body.keys[0].kid).toEqual(expect.any(String));
        // The private half must never be published.
        expect(result.body.keys[0].d).toBeUndefined();
    });

    it('advertises the JWKS from the discovery document', async () => {
        const metadata: HttpResult = await get('/.well-known/oauth-authorization-server');

        expect(metadata.body.jwks_uri).toContain('/.well-known/jwks.json');
    });

    it('issues an access token that verifies against the published JWKS', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);
        const jwks: HttpResult = await get('/.well-known/jwks.json');

        const [header, payload, signature] = issued.body.access_token.split('.');

        expect(signature).toBeTruthy();
        expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
            alg: 'RS256',
            typ: 'at+jwt',
            kid: jwks.body.keys[0].kid
        });

        // Verify the signature the way a resource server would: rebuild the key
        // from the published JWK, with no access to anything the server holds.
        const key = createPublicKey({ key: jwks.body.keys[0], format: 'jwk' });

        expect(verify(
            'sha256',
            new Uint8Array(Buffer.from(`${header}.${payload}`)),
            key,
            new Uint8Array(Buffer.from(signature, 'base64url'))
        )).toBe(true);
    });

    it('carries the RFC 9068 claims', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);

        const claims = JSON.parse(
            Buffer.from(issued.body.access_token.split('.')[1], 'base64url').toString()
        );

        expect(claims).toMatchObject({
            iss: expect.any(String),
            sub: owner.id,
            aud: expect.any(String),
            client_id: client.clientId,
            scope: 'profile'
        });
        expect(claims.jti).toEqual(expect.any(String));
        expect(claims.exp - claims.iat).toBe(3600);
    });

    it('makes the client its own subject for the client credentials grant', async () => {
        const client: RegisteredClient = await registerClient({
            grantTypes: ['client_credentials']
        });

        const issued: HttpResult = await form('/api/oauth/token', {
            grant_type: 'client_credentials',
            scope: 'profile'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const claims = JSON.parse(
            Buffer.from(issued.body.access_token.split('.')[1], 'base64url').toString()
        );

        expect(claims.sub).toBe(client.clientId);
        expect(claims.client_id).toBe(client.clientId);
    });

    it('refuses a token signed by a key that is not ours', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

        const [header, payload] = issued.body.access_token.split('.');
        const forgedSignature: string = sign(
            'sha256',
            new Uint8Array(Buffer.from(`${header}.${payload}`)),
            privateKey
        ).toString('base64url');

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${header}.${payload}.${forgedSignature}`
        });

        expect(result.status).toBe(401);
        expect(result.body.error).toBe('invalid_token');
    });

    it('refuses a token whose claims were edited to widen scope', async () => {
        const client: RegisteredClient = await registerClient({ scopes: ['email'] });
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            scope: 'email',
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const issued: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const [header, payload, signature] = issued.body.access_token.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        const forgedPayload: string = Buffer
            .from(JSON.stringify({ ...claims, scope: 'profile email' }))
            .toString('base64url');

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${header}.${forgedPayload}.${signature}`
        });

        expect(result.status).toBe(401);
    });

    it('still honours revocation, which the token cannot express by itself', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);

        // The JWT stays cryptographically valid; only the database says it died.
        await form('/api/oauth/revoke', {
            token: issued.body.access_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${issued.body.access_token}`
        });

        expect(result.status).toBe(401);
    });
});

describe('GET /api/oauth/authorize', () => {
    it('describes the pending request for a consent screen', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await get(
            `/api/oauth/authorize?response_type=code&client_id=${client.clientId}`
            + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=profile&state=xyz`
        );

        expect(result.status).toBe(200);
        expect(result.body).toEqual({
            client_id: client.clientId,
            client_name: 'Example Client',
            redirect_uri: REDIRECT_URI,
            scopes: [{ name: 'profile', description: expect.any(String) }],
            state: 'xyz'
        });
    });

    it('rejects an unregistered redirect_uri without redirecting to it', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await get(
            `/api/oauth/authorize?response_type=code&client_id=${client.clientId}`
            + `&redirect_uri=${encodeURIComponent('https://attacker.example/steal')}`
        );

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_request');
    });

    it('rejects an unknown client', async () => {
        const result: HttpResult = await get(
            '/api/oauth/authorize?response_type=code&client_id=nope'
        );

        expect(result.status).toBe(401);
        expect(result.body.error).toBe('invalid_client');
    });

    it('rejects a scope the client did not register', async () => {
        const client: RegisteredClient = await registerClient({ scopes: ['profile'] });

        const result: HttpResult = await get(
            `/api/oauth/authorize?response_type=code&client_id=${client.clientId}`
            + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=profile%20users%3Awrite`
        );

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_scope');
    });

    it('requires PKCE from a public client', async () => {
        const client: RegisteredClient = await registerClient({ clientSecret: null });

        const result: HttpResult = await get(
            `/api/oauth/authorize?response_type=code&client_id=${client.clientId}`
            + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
        );

        expect(result.status).toBe(400);
        expect(result.body.error_description).toContain('PKCE');
    });

    it('does not require PKCE from a confidential client by default', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await get(
            `/api/oauth/authorize?response_type=code&client_id=${client.clientId}`
            + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
        );

        expect(result.status).toBe(200);
    });

    it('rejects an unsupported response_type', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await get(
            `/api/oauth/authorize?response_type=token&client_id=${client.clientId}`
        );

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_request');
    });
});

describe('OAUTH_REQUIRE_PKCE', () => {

    it('extends the PKCE requirement to confidential clients when set', async () => {
        const options: OAuthOptions = app.get(OAUTH_OPTIONS);
        const client: RegisteredClient = await registerClient();

        options.requirePkce = true;

        try {
            const result: HttpResult = await get(
                `/api/oauth/authorize?response_type=code&client_id=${client.clientId}`
                + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
            );

            expect(result.status).toBe(400);
            expect(result.body.error_description).toContain('PKCE');
        } finally {
            options.requirePkce = false;
        }
    });
});

describe('POST /api/oauth/authorize', () => {
    it('issues a code and builds the redirect', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await decide(client.clientId);

        expect(result.status).toBe(200);
        expect(result.body.code).toEqual(expect.any(String));

        const redirect: URL = new URL(result.body.redirect_uri);

        expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
        expect(redirect.searchParams.get('code')).toBe(result.body.code);
        expect(redirect.searchParams.get('state')).toBe('xyz');
    });

    it('redirects with access_denied when the owner refuses', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await decide(client.clientId, { approved: false });

        expect(result.status).toBe(200);
        expect(result.body.code).toBeUndefined();

        const redirect: URL = new URL(result.body.redirect_uri);

        expect(redirect.searchParams.get('error')).toBe('access_denied');
        expect(redirect.searchParams.get('state')).toBe('xyz');
    });

    it('refuses wrong resource owner credentials', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await decide(client.clientId, { password: 'wrong' });

        expect(result.status).toBe(403);
        expect(result.body.error).toBe('access_denied');
    });
});

describe('POST /api/oauth/token — authorization_code', () => {
    it('exchanges a code for tokens and marks the response uncacheable', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await authorizationCodeFlow(client);

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'profile'
        });
        expect(result.body.access_token).toEqual(expect.any(String));
        expect(result.body.refresh_token).toEqual(expect.any(String));
        expect(result.headers.get('cache-control')).toBe('no-store');
    });

    it('accepts client_secret_post as well as Basic', async () => {
        const client: RegisteredClient = await registerClient();
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
            client_id: client.clientId,
            client_secret: client.clientSecret as string
        });

        expect(result.status).toBe(200);
        expect(result.body.access_token).toEqual(expect.any(String));
    });

    it('rejects a mismatched PKCE verifier', async () => {
        const client: RegisteredClient = await registerClient();

        const authorized: HttpResult = await decide(client.clientId, {
            code_challenge: challengeOf(verifier()),
            code_challenge_method: 'S256'
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier()
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_grant');
    });

    it('rejects a redirect_uri that differs from the authorization request', async () => {
        const client: RegisteredClient = await registerClient({
            redirectUris: [REDIRECT_URI, 'https://client.example/other']
        });
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: 'https://client.example/other',
            code_verifier: codeVerifier
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_grant');
    });

    it('revokes the issued tokens when a code is replayed', async () => {
        const client: RegisteredClient = await registerClient();
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const exchange = (): Promise<HttpResult> => form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const first: HttpResult = await exchange();
        const replay: HttpResult = await exchange();

        expect(first.status).toBe(200);
        expect(replay.status).toBe(400);
        expect(replay.body.error).toBe('invalid_grant');

        // The token the first, legitimate exchange produced must be dead too.
        const introspection: HttpResult = await form('/api/oauth/introspect', {
            token: first.body.access_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(introspection.body.active).toBe(false);
    });

    it('rejects a bad client secret with 401 and WWW-Authenticate', async () => {
        const client: RegisteredClient = await registerClient();
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }, { Authorization: basic(client.clientId, 'wrong') });

        expect(result.status).toBe(401);
        expect(result.body.error).toBe('invalid_client');
        expect(result.headers.get('www-authenticate')).toContain('invalid_client');
    });

    it('rejects a code issued to a different client', async () => {
        const victim: RegisteredClient = await registerClient();
        const attacker: RegisteredClient = await registerClient();
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(victim.clientId, {
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }, { Authorization: basic(attacker.clientId, attacker.clientSecret as string) });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_grant');
    });

    it('rejects both header and body credentials in one request', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'client_credentials',
            client_id: client.clientId,
            client_secret: client.clientSecret as string
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('invalid_request');
    });
});

describe('POST /api/oauth/token — refresh_token', () => {
    it('rotates the refresh token and revokes the previous access token', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);

        const refreshed: HttpResult = await form('/api/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: issued.body.refresh_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(refreshed.status).toBe(200);
        expect(refreshed.body.refresh_token).not.toBe(issued.body.refresh_token);
        expect(refreshed.body.access_token).not.toBe(issued.body.access_token);

        const old: HttpResult = await form('/api/oauth/introspect', {
            token: issued.body.access_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(old.body.active).toBe(false);
    });

    it('kills the whole family when a rotated refresh token is replayed', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);

        const refreshed: HttpResult = await form('/api/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: issued.body.refresh_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const replay: HttpResult = await form('/api/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: issued.body.refresh_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(replay.status).toBe(400);
        expect(replay.body.error).toBe('invalid_grant');

        // The token minted by the honest rotation is revoked as collateral,
        // because the server cannot tell which party is the attacker.
        const current: HttpResult = await form('/api/oauth/introspect', {
            token: refreshed.body.access_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(current.body.active).toBe(false);
    });

    it('allows narrowing scope but not widening it', async () => {
        const client: RegisteredClient = await registerClient({ scopes: ['profile', 'email'] });
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            scope: 'profile email',
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const issued: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const narrowed: HttpResult = await form('/api/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: issued.body.refresh_token,
            scope: 'profile'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(narrowed.status).toBe(200);
        expect(narrowed.body.scope).toBe('profile');

        const widened: HttpResult = await form('/api/oauth/token', {
            grant_type: 'refresh_token',
            refresh_token: narrowed.body.refresh_token,
            scope: 'profile email'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(widened.status).toBe(400);
        expect(widened.body.error).toBe('invalid_scope');
    });
});

describe('POST /api/oauth/token — client_credentials', () => {
    it('issues an access token with no refresh token and no subject', async () => {
        const client: RegisteredClient = await registerClient({
            grantTypes: ['client_credentials']
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'client_credentials',
            scope: 'profile'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(200);
        expect(result.body.refresh_token).toBeUndefined();

        const introspection: HttpResult = await form('/api/oauth/introspect', {
            token: result.body.access_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(introspection.body).toMatchObject({ active: true, scope: 'profile' });
        expect(introspection.body.sub).toBeUndefined();
    });

    it('refuses a grant the client did not register for', async () => {
        const client: RegisteredClient = await registerClient({
            grantTypes: ['authorization_code']
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'client_credentials'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('unauthorized_client');
    });

    it('refuses a public client, which cannot authenticate itself', async () => {
        const client: RegisteredClient = await registerClient({
            clientSecret: null,
            grantTypes: ['client_credentials']
        });

        const result: HttpResult = await form('/api/oauth/token', {
            grant_type: 'client_credentials',
            client_id: client.clientId
        });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('unauthorized_client');
    });
});

describe('POST /api/oauth/introspect', () => {
    it('reports another client\'s token as inactive', async () => {
        const owner: RegisteredClient = await registerClient();
        const other: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(owner);

        const result: HttpResult = await form('/api/oauth/introspect', {
            token: issued.body.access_token
        }, { Authorization: basic(other.clientId, other.clientSecret as string) });

        expect(result.body).toEqual({ active: false });
    });

    it('reports an unknown token as inactive rather than erroring', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await form('/api/oauth/introspect', {
            token: 'not-a-token'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(200);
        expect(result.body).toEqual({ active: false });
    });

    it('requires client authentication', async () => {
        const result: HttpResult = await form('/api/oauth/introspect', {
            token: 'anything'
        });

        expect(result.status).toBe(401);
        expect(result.body.error).toBe('invalid_client');
    });
});

describe('POST /api/oauth/revoke', () => {
    it('revokes an access token and its refresh token together', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);
        const credentials = { Authorization: basic(client.clientId, client.clientSecret as string) };

        const revoked: HttpResult = await form('/api/oauth/revoke', {
            token: issued.body.access_token
        }, credentials);

        expect(revoked.status).toBe(200);

        const access: HttpResult = await form('/api/oauth/introspect', {
            token: issued.body.access_token
        }, credentials);
        const refresh: HttpResult = await form('/api/oauth/introspect', {
            token: issued.body.refresh_token
        }, credentials);

        expect(access.body.active).toBe(false);
        expect(refresh.body.active).toBe(false);
    });

    it('is a silent success for an unknown token', async () => {
        const client: RegisteredClient = await registerClient();

        const result: HttpResult = await form('/api/oauth/revoke', {
            token: 'not-a-token'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        expect(result.status).toBe(200);
    });
});

describe('GET /api/oauth/userinfo', () => {
    it('returns the resource owner behind the bearer token', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${issued.body.access_token}`
        });

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            sub: owner.id,
            name: 'Ada Lovelace',
            email: OWNER_EMAIL
        });
    });

    it('rejects a missing or malformed bearer token', async () => {
        const missing: HttpResult = await get('/api/oauth/userinfo');
        const malformed: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: 'Bearer nonsense'
        });

        expect(missing.status).toBe(401);
        expect(missing.body.error).toBe('invalid_token');
        expect(malformed.status).toBe(401);
        expect(malformed.body.error).toBe('invalid_token');

        // RFC 6750 §3: a bearer failure is challenged with the Bearer scheme,
        // not the Basic scheme used for client authentication failures.
        expect(missing.headers.get('www-authenticate')).toMatch(/^Bearer /);
    });

    it('rejects a revoked token', async () => {
        const client: RegisteredClient = await registerClient();
        const issued: HttpResult = await authorizationCodeFlow(client);

        await form('/api/oauth/revoke', {
            token: issued.body.access_token
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${issued.body.access_token}`
        });

        expect(result.status).toBe(401);
    });

    it('rejects a client-credentials token, which has no subject', async () => {
        const client: RegisteredClient = await registerClient({
            grantTypes: ['client_credentials']
        });

        const issued: HttpResult = await form('/api/oauth/token', {
            grant_type: 'client_credentials',
            scope: 'profile'
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${issued.body.access_token}`
        });

        expect(result.status).toBe(401);
        expect(result.body.error).toBe('invalid_token');
    });

    it('requires the profile scope', async () => {
        const client: RegisteredClient = await registerClient({ scopes: ['email'] });
        const codeVerifier: string = verifier();

        const authorized: HttpResult = await decide(client.clientId, {
            scope: 'email',
            code_challenge: challengeOf(codeVerifier),
            code_challenge_method: 'S256'
        });

        const issued: HttpResult = await form('/api/oauth/token', {
            grant_type: 'authorization_code',
            code: authorized.body.code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        }, { Authorization: basic(client.clientId, client.clientSecret as string) });

        const result: HttpResult = await get('/api/oauth/userinfo', {
            Authorization: `Bearer ${issued.body.access_token}`
        });

        expect(result.status).toBe(403);
        expect(result.body.error).toBe('insufficient_scope');
        expect(result.headers.get('www-authenticate')).toContain('insufficient_scope');
    });
});
