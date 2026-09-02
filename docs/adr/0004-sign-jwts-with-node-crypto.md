# 4. Sign and verify JWTs with node:crypto rather than a JWT library

- Status: Accepted
- Date: 2026-09-02

## Context

Adopting JWTs meant choosing how to sign and verify them. The obvious
candidates were `jose` and `@nestjs/jwt`.

Both are published as pure ESM. This workspace runs Jest in CommonJS, and
already carries two carve-outs for ESM-only packages — a
`transformIgnorePatterns` exception for `@nestjs/typeorm` and `commonjs` module
output in the SWC configs. `@nestjs/jwt` v12 also declares a peer dependency on
Nest 12, while this workspace is on Nest 11.

Against that, hand-rolling JWTs is conventionally bad advice, because the
dangerous part of a JWT is verification, and verifiers that are flexible about
the token's own `alg` header are the source of the two classic attacks:
`alg: none`, and algorithm confusion, where an RSA-signed token is replaced by
an HMAC-signed one using the public key as the shared secret.

## Decision

Sign and verify with `node:crypto` directly, in `api/src/oauth/jwt/jwt.ts`.

The verifier is deliberately rigid rather than general:

- exactly one algorithm, named by a constant and checked against the header,
  never read from the token to choose a verifier;
- the algorithm is settled before any other check, so a token naming an
  unacceptable one is refused for that reason;
- the expected JWT `typ` is pinned by the caller;
- claims are validated by the caller, which knows what the token is for.

## Consequences

No new dependency, no third ESM carve-out, and no Nest version conflict.

The two attacks the flexibility would have enabled are closed by construction,
and `jwt.spec.ts` asserts both are refused, along with tampered payloads,
foreign keys, malformed structures and missing signatures.

The cost is that this code is ours to maintain and to get right. It supports
RS256 only. Supporting a second algorithm, or key rotation with multiple active
keys, means extending it — and the natural way to do that (dispatching on the
header) is exactly what must not happen. Any change to `verifyJwt` deserves
more scrutiny than its size suggests.

If a future requirement genuinely needs algorithm agility or JWE, that is the
point to revisit this and take the dependency.
