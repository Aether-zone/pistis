import {
    createClientSchema,
    DEFAULT_CLIENT_PRIMARY_COLOR,
    updateClientSchema
} from './client-admin.js';

const base = {
    clientId: 'my-client',
    name: 'My Client',
    confidential: true,
    scopes: ['profile']
};

describe('binding a client to an organization', () => {

    const organization = {
        id: '11111111-1111-4111-8111-111111111111',
        role: 'admin' as const
    };

    it('takes an organization and a role', () => {
        // A role as well as an id: a client has no membership row to read one
        // from, so the binding carries it.
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['client_credentials'],
            redirectUris: [],
            organization
        }).success).toBe(true);
    });

    it('refuses a role that is not one of pistis’s', () => {
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['client_credentials'],
            redirectUris: [],
            organization: { ...organization, role: 'superuser' }
        }).success).toBe(false);
    });

    it('refuses an organization id that is not a uuid', () => {
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['client_credentials'],
            redirectUris: [],
            organization: { ...organization, id: 'acme' }
        }).success).toBe(false);
    });

    it('is optional, and absent rather than null when unbound', () => {
        const result = createClientSchema.safeParse({
            ...base,
            grantTypes: ['client_credentials'],
            redirectUris: []
        });

        expect(result.success).toBe(true);
        expect(result.data?.organization).toBeUndefined();

        // Nullable would be a second way to say "unbound", and the api reads
        // only the absence.
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['client_credentials'],
            redirectUris: [],
            organization: null
        }).success).toBe(false);
    });
});

/*
 * What a change may say, as opposed to whether the result is allowed — that is
 * `ClientService`'s to judge, because a partial change cannot be read on its
 * own.
 */
describe('changing a client', () => {

    it('takes each field on its own', () => {
        expect(updateClientSchema.parse({ name: 'Renamed' }))
            .toEqual({ name: 'Renamed' });
    });

    it('removes a binding given null, and leaves it alone when absent', () => {
        // The only field with two ways to say something and one of them being
        // "leave it": `[]` already says "none" for the arrays.
        expect(updateClientSchema.parse({ organization: null }))
            .toEqual({ organization: null });
        expect(updateClientSchema.parse({}).organization).toBeUndefined();
    });

    it('refuses an empty scope list, which would leave a client able to ask for nothing', () => {
        expect(updateClientSchema.safeParse({ scopes: [] }).success).toBe(false);
    });

    it('refuses a change to the client id, which is the client\'s identity', () => {
        // Not refused so much as ignored: there is no such field, and a caller
        // that sent one would otherwise believe it had been renamed.
        expect(updateClientSchema.parse({ clientId: 'renamed' }))
            .toEqual({});
    });
});

describe('a client’s colour', () => {

    const base = {
        clientId: 'my-client',
        name: 'My Client',
        confidential: true,
        redirectUris: [],
        grantTypes: ['client_credentials' as const],
        scopes: ['profile']
    };

    it('defaults to the workspace’s own blue', () => {
        // kosmos's `--kosmos-color-primary`, so a client that expressed no
        // preference looks like the workspace it belongs to.
        expect(createClientSchema.parse(base).primaryColor)
            .toBe(DEFAULT_CLIENT_PRIMARY_COLOR);
    });

    it('lowercases it, so one colour has one spelling', () => {
        expect(createClientSchema.parse({ ...base, primaryColor: '#AABBCC' })
            .primaryColor).toBe('#aabbcc');
    });

    it('needs the hash and six digits', () => {
        for (const bad of ['2563eb', '#25', '#2563e', '#2563ebb', 'blue', '#12345g']) {
            expect(createClientSchema.safeParse({ ...base, primaryColor: bad }).success)
                .toBe(false);
        }
    });

    it('refuses three-digit shorthand rather than expanding it', () => {
        // `<input type="color">` always submits the long form, so accepting
        // both would store two spellings of one colour for nobody's benefit.
        expect(createClientSchema.safeParse({ ...base, primaryColor: '#abc' }).success)
            .toBe(false);
    });

    it('can be changed on its own', () => {
        expect(updateClientSchema.parse({ primaryColor: '#FF0000' }))
            .toEqual({ primaryColor: '#ff0000' });
    });
});
