import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { type CodeChallengeMethod } from "@pistis/contract";
import { IsNull, LessThan, Repository } from "typeorm";

import { OAuthException } from "../oauth.error";
import { OAUTH_OPTIONS, type OAuthOptions } from "../oauth.options";
import { Pkce } from "../pkce";
import { TokenHash } from "../token-hash";
import { AuthorizationCode } from "./authorization-code";

export interface IssueCodeRequest {
    clientId: string;
    userId: string;
    redirectUri: string;
    scopes: string[];
    codeChallenge?: string;
    codeChallengeMethod?: CodeChallengeMethod;
}

export interface ConsumeCodeRequest {
    code: string;
    clientId: string;
    redirectUri?: string;
    codeVerifier?: string;
}

export interface ConsumedCode {
    record: AuthorizationCode;
    /** True when the code had already been redeemed — tokens from it must be revoked. */
    replayed: boolean;
}

@Injectable()
export class AuthorizationCodeService {

    constructor(
        @InjectRepository(AuthorizationCode) private readonly codeRepository: Repository<AuthorizationCode>,
        private readonly tokenHash: TokenHash,
        private readonly pkce: Pkce,
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) { }

    /** Returns the plaintext code; only its digest is persisted. */
    async issue(request: IssueCodeRequest): Promise<string> {
        const code: string = this.tokenHash.issue();

        const record: AuthorizationCode = new AuthorizationCode();
        record.code = this.tokenHash.hash(code);
        record.clientId = request.clientId;
        record.userId = request.userId;
        record.redirectUri = request.redirectUri;
        record.scopes = request.scopes;
        record.codeChallenge = request.codeChallenge ?? null;
        record.codeChallengeMethod = request.codeChallenge
            ? (request.codeChallengeMethod ?? 'plain')
            : null;
        record.expiresAt = new Date(
            Date.now() + (this.options.authorizationCodeTtlSeconds * 1000)
        );
        record.consumedAt = null;

        await this.codeRepository.save(record);

        return code;
    }

    /**
     * Redeems a code exactly once. A replay is reported rather than thrown on,
     * so the caller can revoke the tokens the first redemption produced before
     * failing the request.
     */
    async consume(request: ConsumeCodeRequest): Promise<ConsumedCode> {
        const record: AuthorizationCode | null = await this.codeRepository.findOneBy({
            code: this.tokenHash.hash(request.code)
        });

        if (!record) {
            throw OAuthException.invalidGrant('Authorization code is invalid.');
        }

        if (record.clientId !== request.clientId) {
            throw OAuthException.invalidGrant(
                'Authorization code was issued to another client.'
            );
        }

        if (record.consumedAt !== null) {
            return { record, replayed: true };
        }

        if (record.expiresAt.getTime() <= Date.now()) {
            throw OAuthException.invalidGrant('Authorization code has expired.');
        }

        // RFC 6749 §4.1.3: when the authorization request carried a redirect_uri
        // the token request must repeat the identical value.
        if (request.redirectUri !== undefined && request.redirectUri !== record.redirectUri) {
            throw OAuthException.invalidGrant('redirect_uri does not match the authorization request.');
        }

        this.verifyPkce(record, request.codeVerifier);

        // Mark consumed before any token is minted, so a concurrent replay loses.
        const claimed = await this.codeRepository.update(
            { id: record.id, consumedAt: IsNull() },
            { consumedAt: new Date() }
        );

        if (claimed.affected !== 1) {
            return { record, replayed: true };
        }

        return { record, replayed: false };
    }

    async revokeExpired(now: Date = new Date()): Promise<number> {
        const result = await this.codeRepository.delete({
            expiresAt: LessThan(now)
        });

        return result.affected ?? 0;
    }

    private verifyPkce(record: AuthorizationCode, codeVerifier?: string): void {
        if (record.codeChallenge === null) {
            if (codeVerifier) {
                throw OAuthException.invalidGrant(
                    'code_verifier was sent for an authorization request that carried no code_challenge.'
                );
            }

            return;
        }

        if (!codeVerifier) {
            throw OAuthException.invalidGrant('code_verifier is required.');
        }

        const method: CodeChallengeMethod =
            record.codeChallengeMethod === 'S256' ? 'S256' : 'plain';

        if (!this.pkce.verify(codeVerifier, record.codeChallenge, method)) {
            throw OAuthException.invalidGrant('code_verifier is invalid.');
        }
    }
}
