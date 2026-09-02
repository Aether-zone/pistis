import { Inject, Injectable } from "@nestjs/common";
import { type SessionClaimsDTO, type SessionDTO, type UserDTO } from "@pistis/contract";
import { randomUUID } from "crypto";

import { JwtVerificationError, signJwt, verifyJwt } from "../oauth/jwt/jwt";
import { JwtKeyService } from "../oauth/jwt/jwt-key.service";
import { OAuthException } from "../oauth/oauth.error";
import { OAUTH_OPTIONS, type OAuthOptions } from "../oauth/oauth.options";

/**
 * Session tokens use the same signing key as OAuth access tokens but a
 * different JWT `typ`. That separation is the point: an access token minted for
 * a third-party client must never be accepted as proof that someone is signed
 * in to the management API, and `verifyJwt` refuses on type mismatch.
 */
export const SESSION_TOKEN_TYPE = 'session+jwt';

@Injectable()
export class SessionService {

    constructor(
        private readonly keys: JwtKeyService,
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) { }

    issue(user: UserDTO, admin: boolean): SessionDTO {
        const issuedAt: Date = new Date();
        const ttl: number = this.options.sessionTtlSeconds;

        const claims: SessionClaimsDTO = {
            iss: this.options.issuer,
            sub: user.id,
            aud: `${this.options.issuer}/session`,
            exp: Math.floor(issuedAt.getTime() / 1000) + ttl,
            iat: Math.floor(issuedAt.getTime() / 1000),
            jti: randomUUID(),
            admin
        };

        return {
            token: signJwt(claims, this.keys.signingKey(), this.keys.kid, SESSION_TOKEN_TYPE),
            expires_in: ttl,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                admin
            }
        };
    }

    verify(token: string): SessionClaimsDTO {
        let payload: Record<string, unknown>;

        try {
            payload = verifyJwt(token, this.keys.verificationKey(), SESSION_TOKEN_TYPE);
        } catch (error) {
            if (error instanceof JwtVerificationError) {
                throw OAuthException.invalidToken(error.message);
            }

            throw error;
        }

        const claims = payload as unknown as SessionClaimsDTO;

        if (claims.iss !== this.options.issuer
            || claims.aud !== `${this.options.issuer}/session`) {
            throw OAuthException.invalidToken('Session was issued elsewhere.');
        }

        if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
            throw OAuthException.invalidToken('Session has expired.');
        }

        if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
            throw OAuthException.invalidToken('Session has no subject.');
        }

        return claims;
    }
}
