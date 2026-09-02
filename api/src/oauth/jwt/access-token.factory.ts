import { Inject, Injectable } from "@nestjs/common";
import { formatScope, type AccessTokenClaimsDTO } from "@pistis/contract";
import { randomUUID } from "crypto";

import { OAuthException } from "../oauth.error";
import { OAUTH_OPTIONS, type OAuthOptions } from "../oauth.options";
import { JwtKeyService } from "./jwt-key.service";
import { JwtVerificationError, signJwt, verifyJwt } from "./jwt";

export interface MintedAccessToken {
    token: string;
    jti: string;
    issuedAt: Date;
    expiresAt: Date;
}

export interface MintAccessTokenRequest {
    clientId: string;
    /** Null for the client credentials grant, where the client is its own subject. */
    userId: string | null;
    scopes: string[];
}

/** Mints and validates RFC 9068 JWT access tokens. */
@Injectable()
export class AccessTokenFactory {

    constructor(
        private readonly keys: JwtKeyService,
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) { }

    mint(request: MintAccessTokenRequest): MintedAccessToken {
        const jti: string = randomUUID();
        const issuedAt: Date = new Date();
        const expiresAt: Date = new Date(
            issuedAt.getTime() + (this.options.accessTokenTtlSeconds * 1000)
        );

        const claims: AccessTokenClaimsDTO = {
            iss: this.options.issuer,
            // RFC 9068 §2.2: with no user, the client is the subject.
            sub: request.userId ?? request.clientId,
            aud: this.audience(),
            exp: Math.floor(expiresAt.getTime() / 1000),
            iat: Math.floor(issuedAt.getTime() / 1000),
            jti,
            client_id: request.clientId,
            scope: formatScope(request.scopes)
        };

        return {
            token: signJwt(claims, this.keys.signingKey(), this.keys.kid),
            jti,
            issuedAt,
            expiresAt
        };
    }

    /**
     * Verifies signature and claims. Revocation is not visible from the token
     * itself, so `TokenService` still checks the `jti` against the database —
     * this only establishes that the token is authentic and unexpired.
     */
    verify(token: string): AccessTokenClaimsDTO {
        let payload: Record<string, unknown>;

        try {
            payload = verifyJwt(token, this.keys.verificationKey());
        } catch (error) {
            if (error instanceof JwtVerificationError) {
                throw OAuthException.invalidToken(error.message);
            }

            throw error;
        }

        const claims = payload as unknown as AccessTokenClaimsDTO;

        if (claims.iss !== this.options.issuer) {
            throw OAuthException.invalidToken('Token was issued by another server.');
        }

        if (claims.aud !== this.audience()) {
            throw OAuthException.invalidToken('Token is for another audience.');
        }

        if (typeof claims.jti !== 'string' || claims.jti.length === 0) {
            throw OAuthException.invalidToken('Token has no jti.');
        }

        if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
            throw OAuthException.invalidToken('Access token has expired.');
        }

        return claims;
    }

    /** Best-effort read for introspection, which must not throw on a bad token. */
    tryVerify(token: string): AccessTokenClaimsDTO | null {
        try {
            return this.verify(token);
        } catch {
            return null;
        }
    }

    private audience(): string {
        return this.options.jwtAudience ?? this.options.issuer;
    }
}
