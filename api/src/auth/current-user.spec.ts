import { Controller, Get, INestApplication, UseGuards } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { type SessionDTO, type UserDTO } from "@pistis/contract";

import { AdminModule } from "../admin/admin.module";
import { configureApp } from "../app/configure";
import { ClientService } from "../oauth/client/client.service";
import { OAuthModule } from "../oauth/oauth.module";
import { PasswordService } from "../user/password/password.service";
import { UserModule } from "../user/user.module";
import { UserService } from "../user/user.service";
import { AuthModule } from "./auth.module";
import { CurrentUser } from "./current-user.decorator";
import { SessionGuard } from "./session.guard";

/** Exercises the decorator's shapes, including the unguarded misuse. */
@Controller('/probe')
class ProbeController {

    @Get('/guarded')
    @UseGuards(SessionGuard)
    guarded(@CurrentUser() user: UserDTO): UserDTO {
        return user;
    }

    @Get('/property')
    @UseGuards(SessionGuard)
    property(@CurrentUser('email') email: string): { email: string } {
        return { email };
    }

    @Get('/unguarded')
    unguarded(@CurrentUser() user: UserDTO): UserDTO {
        return user;
    }
}

let app: INestApplication;
let base: string;
let user: UserDTO;
let token: string;

const CREDENTIALS = { email: 'current@example.com', password: 'current-password-1234' };

interface Result { status: number; body: any }

async function call(path: string, token?: string): Promise<Result> {
    const response = await fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const text: string = await response.text();

    return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(password: string): Promise<Result> {
    const response = await fetch(`${base}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: CREDENTIALS.email, password })
    });

    const text: string = await response.text();

    return { status: response.status, body: text ? JSON.parse(text) : null };
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
        ],
        controllers: [ProbeController]
    }).compile();

    app = configureApp(moduleRef.createNestApplication());

    await app.listen(0);

    base = await app.getUrl();

    user = await app.get(UserService).createUser({
        name: 'Current User',
        email: CREDENTIALS.email
    });

    await app.get(PasswordService).storePassword(CREDENTIALS.password, user.id);

    token = ((await login(CREDENTIALS.password)).body as SessionDTO).token;
});

afterAll(async () => {
    await app?.close();
});

describe('@CurrentUser()', () => {

    it('injects the signed-in user', async () => {
        const result: Result = await call('/api/probe/guarded', token);

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            id: user.id,
            name: 'Current User',
            email: CREDENTIALS.email
        });
    });

    it('injects a single field when given one', async () => {
        const result: Result = await call('/api/probe/property', token);

        expect(result.body).toEqual({ email: CREDENTIALS.email });
    });

    it('throws rather than injecting undefined on an unguarded route', async () => {
        // Silently yielding undefined here is how a handler ends up treating an
        // anonymous request as an authenticated one.
        const result: Result = await call('/api/probe/unguarded', token);

        expect(result.status).toBe(500);
    });

    it('is reachable through AdminGuard too', async () => {
        await app.get(UserService).setAdmin(user.id, true);

        const admin: string = ((await login(CREDENTIALS.password)).body as SessionDTO).token;
        const result: Result = await call('/api/admin/clients', admin);

        expect(result.status).toBe(200);

        await app.get(UserService).setAdmin(user.id, false);
    });
});

describe('GET /api/auth/me', () => {

    it('returns the signed-in user', async () => {
        const result: Result = await call('/api/auth/me', token);

        expect(result.status).toBe(200);
        expect(result.body.email).toBe(CREDENTIALS.email);
    });

    it('refuses an anonymous or malformed request', async () => {
        expect((await call('/api/auth/me')).status).toBe(401);
        expect((await call('/api/auth/me', 'nonsense')).status).toBe(401);
    });

    it('refuses an OAuth access token, which is not a session', async () => {
        await app.get(ClientService).register({
            clientId: 'probe-client', clientSecret: 'probe-secret', name: 'Probe',
            redirectUris: ['https://probe.example/cb'],
            grantTypes: ['client_credentials'], scopes: ['profile']
        });

        const issued = await fetch(`${base}/api/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: 'probe-client',
                client_secret: 'probe-secret'
            }).toString()
        }).then((response) => response.json()) as { access_token: string };

        const result: Result = await call('/api/auth/me', issued.access_token);

        expect(result.status).toBe(401);
    });

    it('stops working once the account is deleted, before the token expires', async () => {
        const doomed: UserDTO = await app.get(UserService).createUser({
            name: 'Doomed', email: 'doomed@example.com'
        });

        await app.get(PasswordService).storePassword('doomed-password-1234', doomed.id);

        const response = await fetch(`${base}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'doomed@example.com',
                password: 'doomed-password-1234'
            })
        });

        const session = (await response.json()) as SessionDTO;

        expect((await call('/api/auth/me', session.token)).status).toBe(200);

        await app.get(UserService).deleteUser(doomed.id);

        // The JWT is still perfectly valid; the guard resolves the user, so the
        // session dies with the account rather than outliving it.
        expect((await call('/api/auth/me', session.token)).status).toBe(401);
    });
});
