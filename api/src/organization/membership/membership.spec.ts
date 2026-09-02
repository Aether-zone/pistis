import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { type UserDTO } from "@pistis/contract";

import { configureApp } from "../../app/configure";
import { AuthModule } from "../../auth/auth.module";
import { PasswordService } from "../../user/password/password.service";
import { UserModule } from "../../user/user.module";
import { UserService } from "../../user/user.service";
import { OrganizationModule } from "../organization.module";

let app: INestApplication;
let base: string;
let users: UserService;
let passwords: PasswordService;
/** A global admin: these tests are about membership rules, not authorization. */
let token: string;

interface Result { status: number; body: any }

async function call(path: string, init: RequestInit & { as?: string } = {}): Promise<Result> {
    const { as, ...rest } = init;
    const response = await fetch(`${base}${path}`, {
        ...rest,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${as ?? token}`,
            ...(rest.headers ?? {})
        }
    });

    const text: string = await response.text();

    return { status: response.status, body: text ? JSON.parse(text) : null };
}

let sequence = 0;

async function makeUser(): Promise<UserDTO> {
    sequence += 1;

    return users.createUser({
        name: `Member ${sequence}`,
        email: `member-${sequence}@example.com`
    });
}

/** The admin who creates the organizations, and is therefore their first owner. */
let creatorId: string;

async function makeOrganization(): Promise<string> {
    sequence += 1;

    const result: Result = await call('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: `Org ${sequence}`, slug: `org-${sequence}` })
    });

    return result.body.id;
}

/**
 * An organization with a second, dedicated owner. The creator is already an
 * owner, so it is removed again to leave exactly one — which is what the
 * last-owner rules are written against.
 */
async function organizationWithOwner(): Promise<{ organizationId: string; owner: UserDTO }> {
    const organizationId: string = await makeOrganization();
    const owner: UserDTO = await makeUser();

    await call(`/api/organizations/${organizationId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: owner.id, role: 'owner' })
    });

    await call(`/api/organizations/${organizationId}/members/${creatorId}`, {
        method: 'DELETE'
    });

    return { organizationId, owner };
}

const UNKNOWN_UUID = '2b5f2b3a-0d5e-4c39-9a1e-1f2c3d4e5f60';

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
            OrganizationModule
        ]
    }).compile();

    app = configureApp(moduleRef.createNestApplication());

    await app.listen(0);

    base = await app.getUrl();
    users = app.get(UserService);
    passwords = app.get(PasswordService);

    const admin = await users.createUser({ name: 'Root', email: 'root@example.com' });
    await passwords.storePassword('root-password-1234', admin.id);
    await users.setAdmin(admin.id, true);

    const session = await fetch(`${base}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'root@example.com', password: 'root-password-1234' })
    }).then((response) => response.json()) as { token: string };

    token = session.token;
    creatorId = admin.id;
});

afterAll(async () => {
    await app?.close();
});

describe('POST /api/organizations/:id/members', () => {

    it('adds a member and returns them with their user summary', async () => {
        const organizationId: string = await makeOrganization();
        const user: UserDTO = await makeUser();

        const result: Result = await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: user.id, role: 'admin' })
        });

        expect(result.status).toBe(201);
        expect(result.body).toMatchObject({
            organizationId,
            role: 'admin',
            user: { id: user.id, name: user.name, email: user.email }
        });
    });

    it('defaults the role to member', async () => {
        const organizationId: string = await makeOrganization();
        const user: UserDTO = await makeUser();

        const result: Result = await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: user.id })
        });

        expect(result.body.role).toBe('member');
    });

    it('refuses a second membership for the same user', async () => {
        const organizationId: string = await makeOrganization();
        const user: UserDTO = await makeUser();
        const body = JSON.stringify({ userId: user.id });

        await call(`/api/organizations/${organizationId}/members`, { method: 'POST', body });

        const duplicate: Result = await call(
            `/api/organizations/${organizationId}/members`,
            { method: 'POST', body }
        );

        expect(duplicate.status).toBe(409);
        expect(duplicate.body.message).toContain('already a member');
    });

    it('lets the same user belong to two organizations', async () => {
        const user: UserDTO = await makeUser();
        const first: string = await makeOrganization();
        const second: string = await makeOrganization();
        const body = JSON.stringify({ userId: user.id });

        expect((await call(`/api/organizations/${first}/members`, { method: 'POST', body })).status)
            .toBe(201);
        expect((await call(`/api/organizations/${second}/members`, { method: 'POST', body })).status)
            .toBe(201);
    });

    it('404s for an unknown organization or user', async () => {
        const user: UserDTO = await makeUser();
        const organizationId: string = await makeOrganization();

        expect((await call(`/api/organizations/${UNKNOWN_UUID}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: user.id })
        })).status).toBe(404);

        expect((await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: UNKNOWN_UUID })
        })).status).toBe(404);
    });

    it('rejects an unknown role and a malformed user id', async () => {
        const organizationId: string = await makeOrganization();
        const user: UserDTO = await makeUser();

        expect((await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: user.id, role: 'sovereign' })
        })).status).toBe(400);

        expect((await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: 'not-a-uuid' })
        })).status).toBe(400);
    });
});

describe('GET /api/organizations/:id/members', () => {

    it('pages members and scopes them to their organization', async () => {
        const organizationId: string = await makeOrganization();
        const other: string = await makeOrganization();

        for (let index = 0; index < 3; index += 1) {
            const user: UserDTO = await makeUser();

            await call(`/api/organizations/${organizationId}/members`, {
                method: 'POST',
                body: JSON.stringify({ userId: user.id })
            });
        }

        const stranger: UserDTO = await makeUser();
        await call(`/api/organizations/${other}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: stranger.id })
        });

        const page: Result = await call(
            `/api/organizations/${organizationId}/members?perPage=2`
        );

        expect(page.status).toBe(200);
        expect(page.body.items).toHaveLength(2);
        // Three added, plus the creator, who is made an owner automatically.
        expect(page.body.totalNumberOfElements).toBe(4);
        expect(page.body.totalNumberOfPages).toBe(2);
        expect(
            page.body.items.some((m: any) => m.user.id === stranger.id)
        ).toBe(false);
    });

    it('returns one member, and 404s for a non-member', async () => {
        const { organizationId, owner } = await organizationWithOwner();
        const stranger: UserDTO = await makeUser();

        const found: Result = await call(
            `/api/organizations/${organizationId}/members/${owner.id}`
        );

        expect(found.status).toBe(200);
        expect(found.body.role).toBe('owner');

        expect((await call(
            `/api/organizations/${organizationId}/members/${stranger.id}`
        )).status).toBe(404);
    });

    it('404s for an unknown organization rather than returning an empty page', async () => {
        // The caller here is a global admin, so the policy admits them and the
        // service answers; a non-member would be refused before this point.
        expect((await call(`/api/organizations/${UNKNOWN_UUID}/members`)).status).toBe(404);
    });

    it('400s when the organization id is not a uuid', async () => {
        expect((await call('/api/organizations/nope/members')).status).toBe(400);
    });
});

describe('PUT /api/organizations/:id/members/:userId', () => {

    it('changes a role', async () => {
        const { organizationId } = await organizationWithOwner();
        const user: UserDTO = await makeUser();

        await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: user.id })
        });

        const result: Result = await call(
            `/api/organizations/${organizationId}/members/${user.id}`,
            { method: 'PUT', body: JSON.stringify({ role: 'admin' }) }
        );

        expect(result.status).toBe(200);
        expect(result.body.role).toBe('admin');
    });

    it('refuses to demote the last owner', async () => {
        const { organizationId, owner } = await organizationWithOwner();

        const result: Result = await call(
            `/api/organizations/${organizationId}/members/${owner.id}`,
            { method: 'PUT', body: JSON.stringify({ role: 'member' }) }
        );

        expect(result.status).toBe(409);
        expect(result.body.message).toContain('at least one owner');
    });

    it('allows demoting an owner once another exists', async () => {
        const { organizationId, owner } = await organizationWithOwner();
        const second: UserDTO = await makeUser();

        await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: second.id, role: 'owner' })
        });

        expect((await call(
            `/api/organizations/${organizationId}/members/${owner.id}`,
            { method: 'PUT', body: JSON.stringify({ role: 'member' }) }
        )).status).toBe(200);
    });
});

describe('DELETE /api/organizations/:id/members/:userId', () => {

    it('removes a member', async () => {
        const { organizationId } = await organizationWithOwner();
        const user: UserDTO = await makeUser();

        await call(`/api/organizations/${organizationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: user.id })
        });

        const removed: Result = await call(
            `/api/organizations/${organizationId}/members/${user.id}`,
            { method: 'DELETE' }
        );

        expect(removed.body).toBe(true);
        expect((await call(
            `/api/organizations/${organizationId}/members/${user.id}`
        )).status).toBe(404);
    });

    it('refuses to remove the last owner', async () => {
        const { organizationId, owner } = await organizationWithOwner();

        const result: Result = await call(
            `/api/organizations/${organizationId}/members/${owner.id}`,
            { method: 'DELETE' }
        );

        expect(result.status).toBe(409);
    });

    it('404s when removing someone who is not a member', async () => {
        const { organizationId } = await organizationWithOwner();
        const stranger: UserDTO = await makeUser();

        expect((await call(
            `/api/organizations/${organizationId}/members/${stranger.id}`,
            { method: 'DELETE' }
        )).status).toBe(404);
    });
});

describe('deleting an organization', () => {

    it('takes its memberships with it', async () => {
        const { organizationId, owner } = await organizationWithOwner();

        expect((await call(`/api/organizations/${organizationId}`, { method: 'DELETE' })).body)
            .toBe(true);

        // The organization is gone, so the membership must be too — and the
        // user survives, since only the association was removed.
        expect((await call(`/api/organizations/${organizationId}/members`)).status).toBe(404);
        await expect(users.getUser(owner.id)).resolves.toMatchObject({ id: owner.id });
    });
});
