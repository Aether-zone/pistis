import { createClientSchema } from './client-admin.js';

const base = {
    clientId: 'my-client',
    name: 'My Client',
    confidential: true,
    scopes: ['profile']
};

describe('registering a client', () => {

    it('needs a redirect URI for the authorization code grant', () => {
        // There is a browser to send back, and nowhere to send it.
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['authorization_code'],
            redirectUris: []
        }).success).toBe(false);
    });

    /*
     * The rule this replaced was `redirectUris.min(1)` for every client, which
     * made a service client unregisterable through the admin API at all — every
     * one in the workspace had to be created in code instead.
     */
    it('needs none for a client that only uses client credentials', () => {
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['client_credentials'],
            redirectUris: []
        }).success).toBe(true);
    });

    it('still needs one when a client uses both grants', () => {
        expect(createClientSchema.safeParse({
            ...base,
            grantTypes: ['authorization_code', 'client_credentials'],
            redirectUris: []
        }).success).toBe(false);
    });

    it('names the field the caller has to fix', () => {
        const result = createClientSchema.safeParse({
            ...base,
            grantTypes: ['authorization_code'],
            redirectUris: []
        });

        expect(result.error?.issues[0].path).toEqual(['redirectUris']);
    });
});

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
