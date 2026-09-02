import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { formatScope, type AccessTokenClaimsDTO, type IntrospectionResponseDTO, type TokenResponseDTO } from "@pistis/contract";
import { IsNull, Repository } from "typeorm";

import { AccessTokenFactory, type MintedAccessToken } from "../jwt/access-token.factory";
import { OAuthException } from "../oauth.error";
import { OAUTH_OPTIONS, type OAuthOptions } from "../oauth.options";
import { TokenHash } from "../token-hash";
import { AccessToken } from "./access-token";
import { RefreshToken } from "./refresh-token";

export interface IssueTokenRequest {
    clientId: string;
    userId: string | null;
    scopes: string[];
    /** Refresh tokens are only issued when the client may use the refresh grant. */
    withRefreshToken: boolean;
    authorizationCodeId?: string;
}

@Injectable()
export class TokenService {

    constructor(
        @InjectRepository(AccessToken) private readonly accessTokenRepository: Repository<AccessToken>,
        @InjectRepository(RefreshToken) private readonly refreshTokenRepository: Repository<RefreshToken>,
        private readonly tokenHash: TokenHash,
        private readonly accessTokenFactory: AccessTokenFactory,
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) { }

    async issue(request: IssueTokenRequest): Promise<TokenResponseDTO> {
        const minted: MintedAccessToken = this.accessTokenFactory.mint({
            clientId: request.clientId,
            userId: request.userId,
            scopes: request.scopes
        });

        const access: AccessToken = new AccessToken();
        access.jti = minted.jti;
        access.clientId = request.clientId;
        access.userId = request.userId;
        access.authorizationCodeId = request.authorizationCodeId ?? null;
        access.scopes = request.scopes;
        access.expiresAt = minted.expiresAt;
        access.revokedAt = null;

        const savedAccess: AccessToken = await this.accessTokenRepository.save(access);

        const response: TokenResponseDTO = {
            access_token: minted.token,
            token_type: 'Bearer',
            expires_in: this.options.accessTokenTtlSeconds,
            scope: formatScope(request.scopes)
        };

        if (!request.withRefreshToken) {
            return response;
        }

        const refreshToken: string = this.tokenHash.issue();

        const refresh: RefreshToken = new RefreshToken();
        refresh.token = this.tokenHash.hash(refreshToken);
        refresh.accessTokenId = savedAccess.id;
        refresh.clientId = request.clientId;
        refresh.userId = request.userId;
        refresh.authorizationCodeId = request.authorizationCodeId ?? null;
        refresh.scopes = request.scopes;
        refresh.expiresAt = new Date(
            Date.now() + (this.options.refreshTokenTtlSeconds * 1000)
        );
        refresh.revokedAt = null;

        await this.refreshTokenRepository.save(refresh);

        return { ...response, refresh_token: refreshToken };
    }

    /**
     * Rotates a refresh token: the presented token is revoked along with the
     * access token it was issued beside, and a fresh pair is returned. Narrowing
     * the scope is allowed (RFC 6749 §6); widening it is not.
     */
    async refresh(token: string, clientId: string, requestedScope?: string): Promise<TokenResponseDTO> {
        const record: RefreshToken | null = await this.refreshTokenRepository.findOneBy({
            token: this.tokenHash.hash(token)
        });

        if (!record || record.clientId !== clientId) {
            throw OAuthException.invalidGrant('Refresh token is invalid.');
        }

        if (record.revokedAt !== null) {
            // A revoked token being presented means it leaked or was replayed;
            // drop the whole family rather than just refusing this one.
            await this.revokeDescendants(record);

            throw OAuthException.invalidGrant('Refresh token has been revoked.');
        }

        if (record.expiresAt.getTime() <= Date.now()) {
            throw OAuthException.invalidGrant('Refresh token has expired.');
        }

        const scopes: string[] = this.narrowScopes(record.scopes, requestedScope);

        await this.refreshTokenRepository.update(
            { id: record.id, revokedAt: IsNull() },
            { revokedAt: new Date() }
        );
        await this.accessTokenRepository.update(
            { id: record.accessTokenId, revokedAt: IsNull() },
            { revokedAt: new Date() }
        );

        return this.issue({
            clientId: record.clientId,
            userId: record.userId,
            scopes,
            withRefreshToken: true,
            authorizationCodeId: record.authorizationCodeId ?? undefined
        });
    }

    /**
     * Resolves a bearer token to its record, or throws `invalid_token`. The JWT
     * is validated first — a forged or expired token is rejected without a
     * database round trip — and the row is then consulted purely for revocation,
     * which a self-contained token cannot express on its own.
     */
    async verifyAccessToken(token: string): Promise<AccessToken> {
        const claims: AccessTokenClaimsDTO = this.accessTokenFactory.verify(token);

        const record: AccessToken | null = await this.accessTokenRepository.findOneBy({
            jti: claims.jti
        });

        if (!record || record.revokedAt !== null) {
            throw OAuthException.invalidToken('Access token is invalid.');
        }

        if (record.expiresAt.getTime() <= Date.now()) {
            throw OAuthException.invalidToken('Access token has expired.');
        }

        return record;
    }

    /**
     * RFC 7009: revocation is idempotent and must not reveal whether the token
     * existed, so an unknown token is a silent success.
     */
    async revoke(token: string, clientId: string): Promise<void> {
        const now: Date = new Date();

        // An access token names itself; a refresh token is opaque and has to be
        // looked up by digest.
        const claims: AccessTokenClaimsDTO | null = this.accessTokenFactory.tryVerify(token);
        const access: AccessToken | null = claims
            ? await this.accessTokenRepository.findOneBy({ jti: claims.jti })
            : null;

        if (access) {
            if (access.clientId !== clientId) {
                return;
            }

            await this.accessTokenRepository.update(
                { id: access.id },
                { revokedAt: now }
            );
            await this.refreshTokenRepository.update(
                { accessTokenId: access.id },
                { revokedAt: now }
            );

            return;
        }

        const refresh: RefreshToken | null = await this.refreshTokenRepository.findOneBy({
            token: this.tokenHash.hash(token)
        });

        if (!refresh || refresh.clientId !== clientId) {
            return;
        }

        await this.refreshTokenRepository.update(
            { id: refresh.id },
            { revokedAt: now }
        );
        await this.accessTokenRepository.update(
            { id: refresh.accessTokenId },
            { revokedAt: now }
        );
    }

    /**
     * RFC 7662. An inactive token yields `{ active: false }` and nothing else;
     * a token belonging to another client is reported inactive too, so
     * introspection cannot be used to probe other clients' tokens.
     */
    async introspect(token: string, clientId: string): Promise<IntrospectionResponseDTO> {
        const inactive: IntrospectionResponseDTO = { active: false };

        // The two token kinds no longer look alike: an access token is a JWT
        // that verifies against our own key, a refresh token is opaque. The
        // token therefore identifies itself, so the endpoint still accepts
        // `token_type_hint` but has no use for it — RFC 7662 §2.1 allows a
        // server to ignore it.
        const claims: AccessTokenClaimsDTO | null = this.accessTokenFactory.tryVerify(token);

        const record: AccessToken | RefreshToken | null = claims
            ? await this.accessTokenRepository.findOneBy({ jti: claims.jti })
            : await this.refreshTokenRepository.findOneBy({
                token: this.tokenHash.hash(token)
            });

        if (!record) {
            return inactive;
        }

        if (record.clientId !== clientId
            || record.revokedAt !== null
            || record.expiresAt.getTime() <= Date.now()) {
            return inactive;
        }

        return {
            active: true,
            scope: formatScope(record.scopes),
            client_id: record.clientId,
            token_type: claims ? 'Bearer' : undefined,
            exp: Math.floor(record.expiresAt.getTime() / 1000),
            iat: Math.floor(record.createdAt.getTime() / 1000),
            sub: record.userId ?? undefined
        };
    }

    /** Revokes everything descended from one authorization code (RFC 6749 §4.1.2). */
    async revokeByAuthorizationCode(authorizationCodeId: string): Promise<void> {
        const now: Date = new Date();

        await this.accessTokenRepository.update(
            { authorizationCodeId, revokedAt: IsNull() },
            { revokedAt: now }
        );
        await this.refreshTokenRepository.update(
            { authorizationCodeId, revokedAt: IsNull() },
            { revokedAt: now }
        );
    }

    private async revokeDescendants(record: RefreshToken): Promise<void> {
        if (record.authorizationCodeId) {
            await this.revokeByAuthorizationCode(record.authorizationCodeId);

            return;
        }

        const now: Date = new Date();

        await this.accessTokenRepository.update(
            { id: record.accessTokenId },
            { revokedAt: now }
        );
    }

    private narrowScopes(granted: string[], requested?: string): string[] {
        if (!requested) {
            return [...granted];
        }

        const scopes: string[] = requested.split(' ').filter((value) => value.length > 0);
        const widened: string[] = scopes.filter((scope) => !granted.includes(scope));

        if (widened.length > 0) {
            throw OAuthException.invalidScope(
                `Refresh may not widen scope; not originally granted: ${formatScope(widened)}`
            );
        }

        return scopes;
    }
}
