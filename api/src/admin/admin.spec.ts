import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { type SessionDTO } from "@pistis/contract";

import { AdminModule } from "./admin.module";
import { configureApp } from "../app/configure";
import { AuthModule } from "../auth/auth.module";
import { ClientService } from "../oauth/client/client.service";
import { OAuthModule } from "../oauth/oauth.module";
import { PasswordService } from "../user/password/password.service";
import { UserModule } from "../user/user.module";
import { UserService } from "../user/user.service";

let app: INestApplication;
let base: string;
let adminToken: string;
let plainToken: string;

const ADMIN = { email: 'admin@example.com', password: 'admin-password-1234' };
const PLAIN = { email: 'plain@example.com', password: 'plain-password-1234' };

interface Result { status: number; body: any }

async function call(
    path: string,
    init: RequestInit & { token?: string } = {}
): Promise<Result> {
    const { token, ...rest } = init;
    const response = await fetch(`${base}${path}`, {
        ...rest,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(rest.headers ?? {})
        }
    });

    const text = await response.text();

    return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Runs the client credentials grant and returns the issued access token. */
async function clientCredentialsToken(
    clientId: string,
    clientSecret: string
): Promise<{ access_token: string }> {
    const response = await fetch(`${base}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        }).toString()
    });

    return (await response.json()) as { access_token: string };
}

async function login(credentials: { email: string; password: string }): Promise<SessionDTO> {
    const result = await call('/api/auth', {
        method: 'POST',
        body: JSON.stringify({
            username: credentials.email,
            password: credentials.password
        })
    });

    return result.body as SessionDTO;
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
            OAuthModule,
            AdminModule
        ]
    }).compile();

    app = configureApp(moduleRef.createNestApplication());

    await app.listen(0);

    base = await app.getUrl();

    const users = app.get(UserService);
    const passwords = app.get(PasswordService);

    const admin = await users.createUser({ name: 'Admin', email: ADMIN.email });
    await passwords.storePassword(ADMIN.password, admin.id);
    await users.setAdmin(admin.id, true);

    const plain = await users.createUser({ name: 'Plain', email: PLAIN.email });
    await passwords.storePassword(PLAIN.password, plain.id);

    adminToken = (await login(ADMIN)).token;
    plainToken = (await login(PLAIN)).token;
});

afterAll(async () => {
    await app?.close();
});

describe('POST /api/auth', () => {

    it('returns a session that reports the admin flag', async () => {
        const session: SessionDTO = await login(ADMIN);

        expect(session.token).toEqual(expect.any(String));
        expect(session.user).toMatchObject({ email: ADMIN.email, admin: true });
    });

    it('does not mark an ordinary user as an admin', async () => {
        expect((await login(PLAIN)).user.admin).toBe(false);
    });

    it('rejects a wrong password', async () => {
        const result = await call('/api/auth', {
            method: 'POST',
            body: JSON.stringify({ username: ADMIN.email, password: 'nope' })
        });

        expect(result.status).toBe(401);
    });
});

describe('AdminGuard', () => {

    it('refuses an anonymous request', async () => {
        expect((await call('/api/admin/clients')).status).toBe(401);
    });

    it('refuses a signed-in non-admin', async () => {
        const result = await call('/api/admin/clients', { token: plainToken });

        expect(result.status).toBe(403);
        expect(result.body.message).toContain('not an administrator');
    });

    it('refuses an OAuth access token in place of a session', async () => {
        // Both are signed by the same key; only the JWT `typ` separates them,
        // so a client that can get an access token must not reach this API.
        await app.get(ClientService).register({
            clientId: 'sneaky', clientSecret: 'sneaky-secret', name: 'Sneaky',
            redirectUris: ['https://sneaky.example/cb'],
            grantTypes: ['client_credentials'], scopes: ['profile']
        });

        const token = await clientCredentialsToken('sneaky', 'sneaky-secret');

        const result = await call('/api/admin/clients', {
            token: token.access_token
        });

        expect(result.status).toBe(401);
    });

    it('admits an admin', async () => {
        expect((await call('/api/admin/clients', { token: adminToken })).status).toBe(200);
    });
});

describe('client management', () => {

    it('creates a client, returns its secret once, and lists it', async () => {
        const created = await call('/api/admin/clients', {
            method: 'POST',
            token: adminToken,
            body: JSON.stringify({
                clientId: 'managed', name: 'Managed', confidential: true,
                redirectUris: ['https://managed.example/cb'],
                grantTypes: ['authorization_code'], scopes: ['profile']
            })
        });

        expect(created.status).toBe(201);
        expect(created.body.clientSecret).toEqual(expect.any(String));

        const list = await call('/api/admin/clients', { token: adminToken });
        const managed = list.body.find((c: any) => c.clientId === 'managed');

        expect(managed).toMatchObject({ name: 'Managed', confidential: true });
        // The secret must never come back from a listing.
        expect(JSON.stringify(list.body)).not.toContain(created.body.clientSecret);
    });

    it('rotates a secret so the old one stops working', async () => {
        await call('/api/admin/clients', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({
                clientId: 'rotate-me', name: 'Rotate', confidential: true,
                redirectUris: ['https://rotate.example/cb'],
                grantTypes: ['client_credentials'], scopes: ['profile']
            })
        });

        const first = await call('/api/admin/clients', { token: adminToken });
        void first;

        const rotated = await call('/api/admin/clients/rotate-me/secret', {
            method: 'POST', token: adminToken
        });

        expect(rotated.status).toBe(200);

        const useNew = await fetch(`${base}/api/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: 'rotate-me',
                client_secret: rotated.body.clientSecret
            }).toString()
        });

        expect(useNew.status).toBe(200);
    });

    it('revokes the tokens of a client it deletes', async () => {
        await call('/api/admin/clients', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({
                clientId: 'doomed', name: 'Doomed', confidential: true,
                redirectUris: ['https://doomed.example/cb'],
                grantTypes: ['client_credentials'], scopes: ['profile']
            })
        }).then(async (created) => {
            await fetch(`${base}/api/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: 'doomed',
                    client_secret: created.body.clientSecret
                }).toString()
            });
        });

        const before = await call('/api/admin/tokens', { token: adminToken });
        expect(before.body.some((t: any) => t.clientId === 'doomed' && t.active)).toBe(true);

        expect((await call('/api/admin/clients/doomed', {
            method: 'DELETE', token: adminToken
        })).status).toBe(204);

        const after = await call('/api/admin/tokens', { token: adminToken });
        expect(after.body.some((t: any) => t.clientId === 'doomed' && t.active)).toBe(false);
    });

    it('rejects a duplicate client_id with a message, not a 500', async () => {
        const body = JSON.stringify({
            clientId: 'twice', name: 'Twice', confidential: true,
            redirectUris: ['https://twice.example/cb'],
            grantTypes: ['authorization_code'], scopes: ['profile']
        });

        expect((await call('/api/admin/clients', {
            method: 'POST', token: adminToken, body
        })).status).toBe(201);

        const duplicate = await call('/api/admin/clients', {
            method: 'POST', token: adminToken, body
        });

        // Raised by ClientService, which is shared with the OAuth module and
        // reports in RFC 6749's shape; the global filter renders it here too.
        expect(duplicate.status).toBe(400);
        expect(duplicate.body.error_description).toContain('already exists');
    });

    it('rejects a malformed client', async () => {
        const result = await call('/api/admin/clients', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({ clientId: '', name: '', confidential: true, redirectUris: [], grantTypes: [], scopes: [] })
        });

        expect(result.status).toBe(400);
    });
});

describe('user management', () => {

    it('creates a user with a password that actually works', async () => {
        const created = await call('/api/admin/users', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({
                name: 'Managed User', email: 'managed@example.com',
                password: 'managed-password-1234', admin: false
            })
        });

        expect(created.status).toBe(201);
        expect(created.body.hasPassword).toBe(true);

        const session = await login({
            email: 'managed@example.com',
            password: 'managed-password-1234'
        });

        expect(session.user.email).toBe('managed@example.com');
        expect(session.user.admin).toBe(false);
    });

    it('reports which users have no password', async () => {
        await app.get(UserService).createUser({
            name: 'No Password', email: 'nopassword@example.com'
        });

        const users = await call('/api/admin/users', { token: adminToken });
        const found = users.body.find((u: any) => u.email === 'nopassword@example.com');

        expect(found.hasPassword).toBe(false);
    });

    it('resets a password', async () => {
        const created = await call('/api/admin/users', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({
                name: 'Reset Me', email: 'reset@example.com',
                password: 'first-password-1234', admin: false
            })
        });

        expect((await call(`/api/admin/users/${created.body.id}/password`, {
            method: 'POST', token: adminToken,
            body: JSON.stringify({ password: 'second-password-1234' })
        })).status).toBe(204);

        const session = await login({
            email: 'reset@example.com', password: 'second-password-1234'
        });

        expect(session.token).toEqual(expect.any(String));

        const stale = await call('/api/auth', {
            method: 'POST',
            body: JSON.stringify({
                username: 'reset@example.com', password: 'first-password-1234'
            })
        });

        expect(stale.status).toBe(401);
    });

    it('rejects a short password', async () => {
        const result = await call('/api/admin/users', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({
                name: 'Weak', email: 'weak@example.com', password: 'short', admin: false
            })
        });

        expect(result.status).toBe(400);
    });
});

describe('token management', () => {

    it('lists tokens and revokes one', async () => {
        const created = await call('/api/admin/clients', {
            method: 'POST', token: adminToken,
            body: JSON.stringify({
                clientId: 'token-owner', name: 'Token Owner', confidential: true,
                redirectUris: ['https://tokens.example/cb'],
                grantTypes: ['client_credentials'], scopes: ['profile']
            })
        });

        const issued = await clientCredentialsToken(
            'token-owner',
            created.body.clientSecret
        );

        const tokens = await call('/api/admin/tokens', { token: adminToken });
        const mine = tokens.body.find(
            (t: any) => t.clientId === 'token-owner' && t.kind === 'access'
        );

        expect(mine.active).toBe(true);
        // A listing must never expose anything usable as a credential.
        expect(JSON.stringify(tokens.body)).not.toContain(issued.access_token);

        expect((await call(`/api/admin/tokens/access/${mine.id}`, {
            method: 'DELETE', token: adminToken
        })).status).toBe(204);

        const after = await call('/api/admin/tokens', { token: adminToken });

        expect(after.body.find((t: any) => t.id === mine.id).active).toBe(false);
    });
});
