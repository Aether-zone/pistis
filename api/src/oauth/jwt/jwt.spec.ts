import { createHmac, generateKeyPairSync, KeyObject } from "crypto";

import {
    ACCESS_TOKEN_TYPE,
    JWT_ALGORITHM,
    JwtVerificationError,
    jwkThumbprint,
    publicKeyOf,
    signJwt,
    verifyJwt
} from "./jwt";

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey: KeyObject = publicKeyOf(privateKey);
const kid: string = jwkThumbprint(publicKey);

const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

describe('signJwt / verifyJwt', () => {

    it('round-trips claims', () => {
        const token: string = signJwt({ sub: 'ada', jti: 'abc' }, privateKey, kid);

        expect(verifyJwt(token, publicKey)).toMatchObject({ sub: 'ada', jti: 'abc' });
    });

    it('writes the pinned algorithm, type and key id into the header', () => {
        const token: string = signJwt({ sub: 'ada' }, privateKey, kid);
        const header = JSON.parse(
            Buffer.from(token.split('.')[0], 'base64url').toString('utf8')
        );

        expect(header).toEqual({ alg: JWT_ALGORITHM, typ: ACCESS_TOKEN_TYPE, kid });
    });

    it('rejects a token signed by a different key', () => {
        const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
        const token: string = signJwt({ sub: 'ada' }, other.privateKey, kid);

        expect(() => verifyJwt(token, publicKey)).toThrow(JwtVerificationError);
    });

    it('rejects a tampered payload', () => {
        const token: string = signJwt({ sub: 'ada', scope: 'profile' }, privateKey, kid);
        const [header, , signature] = token.split('.');
        const forged = `${header}.${encode({ sub: 'ada', scope: 'users:write' })}.${signature}`;

        expect(() => verifyJwt(forged, publicKey)).toThrow(/signature does not verify/);
    });

    it('rejects the alg: none attack', () => {
        const header: string = encode({ alg: 'none', typ: ACCESS_TOKEN_TYPE, kid });
        const payload: string = encode({ sub: 'attacker' });

        expect(() => verifyJwt(`${header}.${payload}.`, publicKey))
            .toThrow(/Unsupported algorithm/);
        expect(() => verifyJwt(`${header}.${payload}.anything`, publicKey))
            .toThrow(/Unsupported algorithm/);
    });

    it('rejects algorithm confusion: HS256 signed with the RSA public key', () => {
        // The classic attack — a verifier that dispatches on the header's `alg`
        // would treat the public key as an HMAC secret and accept this.
        const header: string = encode({ alg: 'HS256', typ: ACCESS_TOKEN_TYPE, kid });
        const payload: string = encode({ sub: 'attacker' });
        const secret: string = publicKey.export({ type: 'spki', format: 'pem' }).toString();
        const signature: string = createHmac('sha256', secret)
            .update(`${header}.${payload}`)
            .digest('base64url');

        expect(() => verifyJwt(`${header}.${payload}.${signature}`, publicKey))
            .toThrow(/Unsupported algorithm/);
    });

    it('rejects a token whose type is not the expected one', () => {
        const token: string = signJwt({ sub: 'ada' }, privateKey, kid, 'JWT');

        expect(() => verifyJwt(token, publicKey, ACCESS_TOKEN_TYPE))
            .toThrow(/Unexpected token type/);
    });

    it('rejects structurally malformed tokens', () => {
        expect(() => verifyJwt('not-a-token', publicKey)).toThrow(/well-formed/);
        expect(() => verifyJwt('a.b', publicKey)).toThrow(/well-formed/);
        expect(() => verifyJwt('a.b.c.d', publicKey)).toThrow(/well-formed/);
        expect(() => verifyJwt('..', publicKey)).toThrow(/empty segment/);
        expect(() => verifyJwt(`${encode({ alg: JWT_ALGORITHM, typ: ACCESS_TOKEN_TYPE, kid })}.${encode({ sub: 'a' })}.`, publicKey))
            .toThrow(/no signature/);
    });

    it('rejects a header or payload that is not JSON', () => {
        const payload: string = encode({ sub: 'ada' });
        const garbage: string = Buffer.from('not json').toString('base64url');

        expect(() => verifyJwt(`${garbage}.${payload}.x`, publicKey))
            .toThrow(/not valid JSON/);
    });

    it('rejects a payload that is a JSON array rather than an object', () => {
        const header: string = encode({ alg: JWT_ALGORITHM, typ: ACCESS_TOKEN_TYPE, kid });
        const payload: string = Buffer.from(JSON.stringify([1, 2])).toString('base64url');
        const token: string = signJwt({}, privateKey, kid);
        const signature: string = token.split('.')[2];

        expect(() => verifyJwt(`${header}.${payload}.${signature}`, publicKey))
            .toThrow(JwtVerificationError);
    });
});

describe('jwkThumbprint', () => {

    it('is stable for the same key and distinct across keys', () => {
        const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

        expect(jwkThumbprint(publicKey)).toBe(jwkThumbprint(publicKeyOf(privateKey)));
        expect(jwkThumbprint(publicKeyOf(other.privateKey))).not.toBe(kid);
    });
});
