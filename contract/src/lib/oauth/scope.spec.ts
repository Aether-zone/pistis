import {
    describeScopes,
    formatScope,
    parseScope,
    SUPPORTED_SCOPE_NAMES
} from './scope.js';

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

    it('falls back rather than throwing on an unrecognised scope', () => {
        expect(describeScopes(['not-a-scope'])).toEqual([
            { name: 'not-a-scope', description: 'Unknown permission' }
        ]);
    });
});
