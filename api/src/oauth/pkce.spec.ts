import { createHash, randomBytes } from "crypto";

import { Pkce } from "./pkce";

describe('Pkce', () => {

    const pkce: Pkce = new Pkce();

    it('derives the S256 challenge as base64url of the SHA-256 digest', () => {
        // The worked example from RFC 7636 Appendix B.
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

        expect(pkce.challengeOf(verifier))
            .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });

    it('accepts a matching S256 verifier', () => {
        const verifier: string = randomBytes(32).toString('base64url');
        const challenge: string = createHash('sha256')
            .update(verifier, 'ascii')
            .digest('base64url');

        expect(pkce.verify(verifier, challenge, 'S256')).toBe(true);
    });

    it('rejects a non-matching S256 verifier', () => {
        const challenge: string = pkce.challengeOf(randomBytes(32).toString('base64url'));

        expect(pkce.verify(randomBytes(32).toString('base64url'), challenge, 'S256'))
            .toBe(false);
    });

    it('rejects a verifier that would match only under the plain method', () => {
        const verifier: string = randomBytes(32).toString('base64url');

        expect(pkce.verify(verifier, verifier, 'S256')).toBe(false);
        expect(pkce.verify(verifier, verifier, 'plain')).toBe(true);
    });

    it('rejects verifiers of a different length without throwing', () => {
        expect(pkce.verify('short', 'a-much-longer-challenge-value', 'plain'))
            .toBe(false);
    });
});
