import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";

import { configureApp } from "../app/configure";
import { AuthModule } from "../auth/auth.module";
import { PasswordService } from "../user/password/password.service";
import { UserModule } from "../user/user.module";
import { UserService } from "../user/user.service";
import { OrganizationModule } from "./organization.module";

let app: INestApplication;
let base: string;
let users: UserService;
let passwords: PasswordService;
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

/** Creates a user with a password and returns a signed-in session token. */
async function signedInUser(admin = false): Promise<{ id: string; token: string }> {
    sequence += 1;

    const email = `person-${sequence}@example.com`;
    const password = 'a-long-enough-password';
    const user = await users.createUser({ name: `Person ${sequence}`, email });

    await passwords.storePassword(password, user.id);

    if (admin) {
        await users.setAdmin(user.id, true);
    }

    const response = await fetch(`${base}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password })
    });

    const session = (await response.json()) as { token: string };

    return { id: user.id, token: session.token };
}

function organization(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        name: 'Acme Incorporated',
        slug: `acme-${Math.random().toString(36).slice(2, 10)}`,
        description: 'A maker of anvils.',
        ...overrides
    });
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
            OrganizationModule
        ]
    }).compile();

    app = configureApp(moduleRef.createNestApplication());

    await app.listen(0);

    base = await app.getUrl();
    users = app.get(UserService);
    passwords = app.get(PasswordService);
    token = (await signedInUser()).token;
});

afterAll(async () => {
    await app?.close();
});

describe('POST /api/organizations', () => {

    it('creates an organization', async () => {
        const result: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'acme' })
        });

        expect(result.status).toBe(201);
        expect(result.body).toMatchObject({
            name: 'Acme Incorporated',
            slug: 'acme',
            description: 'A maker of anvils.'
        });
        expect(result.body.id).toEqual(expect.any(String));
    });

    it('defaults an omitted description to null rather than undefined', async () => {
        const result: Result = await call('/api/organizations', {
            method: 'POST',
            body: JSON.stringify({ name: 'No Description', slug: 'no-description' })
        });

        expect(result.status).toBe(201);
        expect(result.body.description).toBeNull();
    });

    it('rejects a duplicate slug with a conflict, not a 500', async () => {
        await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'taken' })
        });

        const duplicate: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'taken' })
        });

        expect(duplicate.status).toBe(409);
        expect(duplicate.body.message).toContain('already exists');
    });

    it('rejects a slug that is not url-safe', async () => {
        for (const slug of ['Acme Inc', 'ACME', 'acme_inc', '-acme', 'acme--inc']) {
            const result: Result = await call('/api/organizations', {
                method: 'POST',
                body: organization({ slug })
            });

            expect(result.status).toBe(400);
        }
    });

    it('rejects a missing name', async () => {
        const result: Result = await call('/api/organizations', {
            method: 'POST',
            body: JSON.stringify({ slug: 'nameless' })
        });

        expect(result.status).toBe(400);
    });
});

describe('GET /api/organizations', () => {

    it('pages, and reports the page shape by its public names', async () => {
        for (let index = 0; index < 5; index += 1) {
            await call('/api/organizations', {
                method: 'POST',
                body: organization({ name: `Paged ${index}`, slug: `paged-${index}` })
            });
        }

        const result: Result = await call('/api/organizations?pageNumber=0&perPage=2');

        expect(result.status).toBe(200);
        // Not `_items` / `_totalNumberOfElements`, which is what serialising the
        // class emitted before Pageable gained a toJSON.
        expect(result.body.items).toHaveLength(2);
        expect(result.body.totalNumberOfElements).toBeGreaterThanOrEqual(5);
        expect(result.body.totalNumberOfPages).toBeGreaterThanOrEqual(3);
        expect(result.body.pageRequest).toEqual({ pageNumber: 0, perPage: 2 });
    });

    it('applies the schema defaults when paging is omitted', async () => {
        const result: Result = await call('/api/organizations');

        expect(result.body.pageRequest).toEqual({ pageNumber: 0, perPage: 20 });
    });

    it('returns a later page', async () => {
        const first: Result = await call('/api/organizations?pageNumber=0&perPage=1');
        const second: Result = await call('/api/organizations?pageNumber=1&perPage=1');

        expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });

    it('rejects nonsensical paging', async () => {
        expect((await call('/api/organizations?perPage=0')).status).toBe(400);
        expect((await call('/api/organizations?pageNumber=-1')).status).toBe(400);
        expect((await call('/api/organizations?perPage=abc')).status).toBe(400);
    });
});

describe('GET /api/organizations/:id', () => {

    it('returns one organization', async () => {
        const created: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'fetch-me' })
        });

        const result: Result = await call(`/api/organizations/${created.body.id}`);

        expect(result.status).toBe(200);
        expect(result.body.slug).toBe('fetch-me');
    });

    it('looks one up by slug', async () => {
        await call('/api/organizations', {
            method: 'POST',
            body: organization({ name: 'By Slug', slug: 'by-slug' })
        });

        const result: Result = await call('/api/organizations/slug/by-slug');

        expect(result.status).toBe(200);
        expect(result.body.name).toBe('By Slug');
    });

    it('refuses an unknown id, and 404s an unknown slug', async () => {
        // An id the caller has no membership for is refused by policy before
        // anything is loaded, so an unknown organization and one belonging to
        // someone else answer identically — deliberately no existence oracle.
        expect((await call('/api/organizations/2b5f2b3a-0d5e-4c39-9a1e-1f2c3d4e5f60')).status)
            .toBe(403);
        expect((await call('/api/organizations/slug/nope')).status).toBe(404);
    });

    it('refuses a malformed id before validating it', async () => {
        // Guards run ahead of pipes, so the policy answers first. A caller with
        // no membership learns nothing either way.
        expect((await call('/api/organizations/not-a-uuid')).status).toBe(403);
    });
});

describe('PUT /api/organizations/:id', () => {

    it('updates an organization', async () => {
        const created: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'before' })
        });

        const result: Result = await call(`/api/organizations/${created.body.id}`, {
            method: 'PUT',
            body: organization({ name: 'Renamed', slug: 'after', description: null })
        });

        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({
            id: created.body.id,
            name: 'Renamed',
            slug: 'after',
            description: null
        });
    });

    it('lets an organization keep its own slug', async () => {
        const created: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'unchanged' })
        });

        const result: Result = await call(`/api/organizations/${created.body.id}`, {
            method: 'PUT',
            body: organization({ name: 'Same Slug', slug: 'unchanged' })
        });

        expect(result.status).toBe(200);
        expect(result.body.name).toBe('Same Slug');
    });

    it('refuses a slug another organization already holds', async () => {
        await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'occupied' })
        });

        const other: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'mover' })
        });

        const result: Result = await call(`/api/organizations/${other.body.id}`, {
            method: 'PUT',
            body: organization({ slug: 'occupied' })
        });

        expect(result.status).toBe(409);
    });

    it('refuses an organization the caller does not administer', async () => {
        const result: Result = await call(
            '/api/organizations/2b5f2b3a-0d5e-4c39-9a1e-1f2c3d4e5f60',
            { method: 'PUT', body: organization() }
        );

        expect(result.status).toBe(403);
    });
});

describe('DELETE /api/organizations/:id', () => {

    it('deletes an organization', async () => {
        const created: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'delete-me' })
        });

        const deleted: Result = await call(`/api/organizations/${created.body.id}`, {
            method: 'DELETE'
        });

        expect(deleted.body).toBe(true);
        // The membership went with it, so the caller can no longer even ask.
        expect((await call(`/api/organizations/${created.body.id}`)).status).toBe(403);
    });

    it('refuses to delete an organization the caller does not own', async () => {
        const result: Result = await call(
            '/api/organizations/2b5f2b3a-0d5e-4c39-9a1e-1f2c3d4e5f60',
            { method: 'DELETE' }
        );

        expect(result.status).toBe(403);
    });

    it('frees the slug for reuse', async () => {
        const created: Result = await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'recycled' })
        });

        await call(`/api/organizations/${created.body.id}`, { method: 'DELETE' });

        expect((await call('/api/organizations', {
            method: 'POST',
            body: organization({ slug: 'recycled' })
        })).status).toBe(201);
    });
});

describe('scoping to the caller\'s memberships', () => {

    it('lists only the organizations the caller belongs to', async () => {
        const alice = await signedInUser();
        const bob = await signedInUser();

        const mine: Result = await call('/api/organizations', {
            method: 'POST', as: alice.token,
            body: organization({ name: 'Alice Co', slug: `alice-${Date.now()}` })
        });

        await call('/api/organizations', {
            method: 'POST', as: bob.token,
            body: organization({ name: 'Bob Co', slug: `bob-${Date.now()}` })
        });

        const page: Result = await call('/api/organizations?perPage=100', { as: alice.token });

        expect(page.body.items).toHaveLength(1);
        expect(page.body.items[0].id).toBe(mine.body.id);
        expect(page.body.totalNumberOfElements).toBe(1);
    });

    it('counts only visible organizations, so paging stays consistent', async () => {
        const carol = await signedInUser();

        for (let index = 0; index < 3; index += 1) {
            await call('/api/organizations', {
                method: 'POST', as: carol.token,
                body: organization({ slug: `carol-${Date.now()}-${index}` })
            });
        }

        const page: Result = await call('/api/organizations?perPage=2', { as: carol.token });

        // Were the filter applied after the query, the total would include
        // everyone else's organizations and the pages would come back short.
        expect(page.body.items).toHaveLength(2);
        expect(page.body.totalNumberOfElements).toBe(3);
        expect(page.body.totalNumberOfPages).toBe(2);
    });

    it('returns an empty page for someone who belongs to nothing', async () => {
        const newcomer = await signedInUser();

        const page: Result = await call('/api/organizations', { as: newcomer.token });

        expect(page.body.items).toEqual([]);
        expect(page.body.totalNumberOfElements).toBe(0);
    });

    it('shows a global admin every organization', async () => {
        const admin = await signedInUser(true);

        const page: Result = await call('/api/organizations?perPage=100', { as: admin.token });

        expect(page.body.totalNumberOfElements).toBeGreaterThan(1);
    });

    it('refuses an anonymous request entirely', async () => {
        const response = await fetch(`${base}/api/organizations`);

        expect(response.status).toBe(401);
    });

    it('makes the creator an owner', async () => {
        const founder = await signedInUser();

        const created: Result = await call('/api/organizations', {
            method: 'POST', as: founder.token,
            body: organization({ slug: `founded-${Date.now()}` })
        });

        const members: Result = await call(
            `/api/organizations/${created.body.id}/members`,
            { as: founder.token }
        );

        expect(members.body.items).toHaveLength(1);
        expect(members.body.items[0]).toMatchObject({
            role: 'owner',
            user: { id: founder.id }
        });
    });
});

describe('update and delete require owner or admin', () => {

    async function organizationWithMember(): Promise<{
        id: string;
        owner: { id: string; token: string };
        member: { id: string; token: string };
    }> {
        const owner = await signedInUser();
        const member = await signedInUser();

        const created: Result = await call('/api/organizations', {
            method: 'POST', as: owner.token,
            body: organization({ slug: `roles-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
        });

        await call(`/api/organizations/${created.body.id}/members`, {
            method: 'POST', as: owner.token,
            body: JSON.stringify({ userId: member.id, role: 'member' })
        });

        return { id: created.body.id, owner, member };
    }

    it('lets an owner update and delete', async () => {
        const { id, owner } = await organizationWithMember();

        expect((await call(`/api/organizations/${id}`, {
            method: 'PUT', as: owner.token,
            body: organization({ name: 'Owner Renamed', slug: `owner-renamed-${Date.now()}` })
        })).status).toBe(200);

        expect((await call(`/api/organizations/${id}`, {
            method: 'DELETE', as: owner.token
        })).status).toBe(200);
    });

    it('lets an organization admin update and delete', async () => {
        const { id, owner, member } = await organizationWithMember();

        await call(`/api/organizations/${id}/members/${member.id}`, {
            method: 'PUT', as: owner.token, body: JSON.stringify({ role: 'admin' })
        });

        expect((await call(`/api/organizations/${id}`, {
            method: 'PUT', as: member.token,
            body: organization({ name: 'Admin Renamed', slug: `admin-renamed-${Date.now()}` })
        })).status).toBe(200);

        expect((await call(`/api/organizations/${id}`, {
            method: 'DELETE', as: member.token
        })).status).toBe(200);
    });

    it('refuses a plain member, who may still read', async () => {
        const { id, member } = await organizationWithMember();

        expect((await call(`/api/organizations/${id}`, { as: member.token })).status).toBe(200);

        expect((await call(`/api/organizations/${id}`, {
            method: 'PUT', as: member.token,
            body: organization({ slug: `nope-${Date.now()}` })
        })).status).toBe(403);

        expect((await call(`/api/organizations/${id}`, {
            method: 'DELETE', as: member.token
        })).status).toBe(403);
    });

    it('refuses a stranger outright', async () => {
        const { id } = await organizationWithMember();
        const stranger = await signedInUser();

        expect((await call(`/api/organizations/${id}`, { as: stranger.token })).status).toBe(403);
        expect((await call(`/api/organizations/${id}`, {
            method: 'DELETE', as: stranger.token
        })).status).toBe(403);
    });

    it('lets a global admin do both', async () => {
        const { id } = await organizationWithMember();
        const admin = await signedInUser(true);

        expect((await call(`/api/organizations/${id}`, {
            method: 'PUT', as: admin.token,
            body: organization({ name: 'Admin Edit', slug: `sysadmin-${Date.now()}` })
        })).status).toBe(200);

        expect((await call(`/api/organizations/${id}`, {
            method: 'DELETE', as: admin.token
        })).status).toBe(200);
    });
});
