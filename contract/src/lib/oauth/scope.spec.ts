import { describeScopes, SUPPORTED_SCOPE_NAMES } from './scope.js';

/*
 * `parseScope` and `formatScope` are organon's now. They stay covered here
 * rather than being deleted with the local copy: organon has no tests for
 * them, and what these assert is the wire format pistis mints and accepts
 * tokens against — a contract worth failing loudly if the dependency changes
 * it under us.
 */
import { formatScope, parseScope } from '../organon.js';

describe('parseScope', () => {

    it('splits the space-delimited wire format of RFC 6749 §3.3', () => {
        expect(parseScope('profile email')).toEqual(['profile', 'email']);
    });

    it('treats an absent or empty scope as no scopes', () => {
        expect(parseScope(undefined)).toEqual([]);
        expect(parseScope(null)).toEqual([]);
        expect(parseScope('')).toEqual([]);
    });

    it('ignores repeated separators rather than yielding empty scopes', () => {
        expect(parseScope('  profile   email ')).toEqual(['profile', 'email']);
    });

    it('de-duplicates so a repeated scope cannot be granted twice', () => {
        expect(parseScope('profile profile email')).toEqual(['profile', 'email']);
    });
});

describe('formatScope', () => {

    it('round-trips through parseScope', () => {
        expect(parseScope(formatScope(['profile', 'email'])))
            .toEqual(['profile', 'email']);
    });

    it('renders no scopes as an empty string', () => {
        expect(formatScope([])).toBe('');
    });
});

describe('describeScopes', () => {

    it('describes every supported scope', () => {
        const described = describeScopes(SUPPORTED_SCOPE_NAMES);

        expect(described).toHaveLength(SUPPORTED_SCOPE_NAMES.length);
        expect(described.every((scope) => scope.description !== 'Unknown permission'))
            .toBe(true);
    });

    /*
     * The catalogue is what `ClientService.register` validates against, so a
     * resource server's scope must be here before any client can hold it —
     * loculus refuses to serve one object to another without this one.
     */
    it('knows the scope that lets a service read another client’s objects', () => {
        expect(SUPPORTED_SCOPE_NAMES).toContain('objects:read:any');
    });

    it('falls back rather than throwing on an unrecognised scope', () => {
        expect(describeScopes(['not-a-scope'])).toEqual([
            { name: 'not-a-scope', description: 'Unknown permission' }
        ]);
    });
});
