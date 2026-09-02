import { createHash, createPublicKey, KeyObject, sign, verify } from "crypto";

/**
 * Minimal RS256 JWS, built on node:crypto so the api needs no JWT dependency.
 *
 * The security of a JWT verifier lives almost entirely in what it refuses, so
 * this one is deliberately rigid: exactly one algorithm, named by a constant
 * and never read from the token for dispatch. That closes the two classic
 * holes — `alg: "none"`, and algorithm confusion, where an attacker re-signs a
 * token with HMAC using the RSA public key as the shared secret.
 */

export const JWT_ALGORITHM = 'RS256';
export const ACCESS_TOKEN_TYPE = 'at+jwt';

export interface JwtHeader {
    alg: string;
    typ: string;
    kid: string;
}

export class JwtVerificationError extends Error {

    constructor(message: string) {
        super(message);
        this.name = 'JwtVerificationError';
    }
}

function encodeSegment(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeSegment(segment: string): unknown {
    let decoded: string;

    try {
        decoded = Buffer.from(segment, 'base64url').toString('utf8');
    } catch {
        throw new JwtVerificationError('Token segment is not valid base64url.');
    }

    try {
        return JSON.parse(decoded);
    } catch {
        throw new JwtVerificationError('Token segment is not valid JSON.');
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** node:crypto's types want an ArrayBufferView; Buffer no longer satisfies it. */
function bytes(value: string | Buffer): Uint8Array {
    return new Uint8Array(typeof value === 'string' ? Buffer.from(value) : value);
}

export function signJwt(
    claims: Record<string, unknown>,
    privateKey: KeyObject,
    kid: string,
    type: string = ACCESS_TOKEN_TYPE
): string {
    const header: JwtHeader = { alg: JWT_ALGORITHM, typ: type, kid };
    const signingInput = `${encodeSegment(header)}.${encodeSegment(claims)}`;

    // For an RSA key, node's default padding is PKCS#1 v1.5 — exactly RS256.
    const signature: Buffer = sign('sha256', bytes(signingInput), privateKey);

    return `${signingInput}.${signature.toString('base64url')}`;
}

/**
 * Verifies signature and header, returning the raw claims. Claim semantics
 * (issuer, audience, expiry) are checked by the caller, which knows what the
 * token is meant to be for.
 */
export function verifyJwt(
    token: string,
    publicKey: KeyObject,
    expectedType: string = ACCESS_TOKEN_TYPE
): Record<string, unknown> {
    const parts: string[] = token.split('.');

    if (parts.length !== 3) {
        throw new JwtVerificationError('Token is not a well-formed JWS.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    if (!encodedHeader || !encodedPayload) {
        throw new JwtVerificationError('Token has an empty segment.');
    }

    // The algorithm is settled before anything else is examined, so a token
    // that names an algorithm we do not accept is refused for that reason
    // rather than incidentally failing a later structural check.
    const header: unknown = decodeSegment(encodedHeader);

    if (!isRecord(header)) {
        throw new JwtVerificationError('Token header is not an object.');
    }

    // Checked, never used to choose a verifier.
    if (header.alg !== JWT_ALGORITHM) {
        throw new JwtVerificationError(
            `Unsupported algorithm; only ${JWT_ALGORITHM} is accepted.`
        );
    }

    if (header.typ !== expectedType) {
        throw new JwtVerificationError(
            `Unexpected token type; expected "${expectedType}".`
        );
    }

    if (!encodedSignature) {
        throw new JwtVerificationError('Token has no signature.');
    }

    let signature: Buffer;

    try {
        signature = Buffer.from(encodedSignature, 'base64url');
    } catch {
        throw new JwtVerificationError('Token signature is not valid base64url.');
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const valid: boolean = verify(
        'sha256',
        bytes(signingInput),
        publicKey,
        bytes(signature)
    );

    if (!valid) {
        throw new JwtVerificationError('Token signature does not verify.');
    }

    const payload: unknown = decodeSegment(encodedPayload);

    if (!isRecord(payload)) {
        throw new JwtVerificationError('Token payload is not an object.');
    }

    return payload;
}

/** RFC 7638 JWK thumbprint: SHA-256 over the canonical required members. */
export function jwkThumbprint(publicKey: KeyObject): string {
    const jwk = publicKey.export({ format: 'jwk' }) as { e: string; kty: string; n: string };
    const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });

    return createHash('sha256').update(canonical).digest('base64url');
}

export function publicKeyOf(privateKey: KeyObject): KeyObject {
    return createPublicKey(privateKey);
}
