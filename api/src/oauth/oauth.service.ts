import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
    describeScopes,
    type AuthorizationDecisionDTO,
    type AuthorizationPromptDTO,
    type AuthorizationRequestDTO,
    type AuthorizationResponseDTO,
    type IntrospectionResponseDTO,
    type TokenRequestDTO,
    type TokenResponseDTO,
    type UserDTO,
    type UserInfoDTO
} from "@pistis/contract";

import { AuthService } from "../auth/auth.service";
import { UserService } from "../user/user.service";
import { Client } from "./client/client";
import { ClientService } from "./client/client.service";
import { AuthorizationCodeService, type ConsumedCode } from "./code/authorization-code.service";
import { OAuthException } from "./oauth.error";
import { OAUTH_OPTIONS, type OAuthOptions } from "./oauth.options";
import { AccessToken } from "./token/access-token";
import { TokenService } from "./token/token.service";

@Injectable()
export class OAuthService {

    constructor(
        private readonly clientService: ClientService,
        private readonly authorizationCodeService: AuthorizationCodeService,
        private readonly tokenService: TokenService,
        private readonly authService: AuthService,
        private readonly userService: UserService,
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) { }

    /**
     * Validates an authorization request and describes it for a consent screen.
     * Nothing is issued here — the resource owner has not answered yet.
     */
    async prompt(request: AuthorizationRequestDTO): Promise<AuthorizationPromptDTO> {
        const { client, redirectUri, scopes } = await this.validateAuthorizationRequest(request);

        return {
            client_id: client.clientId,
            client_name: client.name,
            redirect_uri: redirectUri,
            scopes: describeScopes(scopes),
            state: request.state
        };
    }

    /**
     * Records the resource owner's answer. A denial is reported by redirecting
     * with `error=access_denied` rather than by failing the call, because at
     * this point the redirect URI is known to be legitimate (RFC 6749 §4.1.2.1).
     */
    async decide(decision: AuthorizationDecisionDTO): Promise<AuthorizationResponseDTO> {
        const { client, redirectUri, scopes } = await this.validateAuthorizationRequest(decision);

        const user: UserDTO = await this.authenticateResourceOwner(decision);

        if (!decision.approved) {
            return {
                redirect_uri: this.buildRedirect(redirectUri, {
                    error: 'access_denied',
                    error_description: 'The resource owner denied the request.',
                    state: decision.state
                }),
                state: decision.state
            };
        }

        const code: string = await this.authorizationCodeService.issue({
            clientId: client.clientId,
            userId: user.id,
            redirectUri,
            scopes,
            codeChallenge: decision.code_challenge,
            codeChallengeMethod: decision.code_challenge_method
        });

        return {
            redirect_uri: this.buildRedirect(redirectUri, {
                code,
                state: decision.state
            }),
            code,
            state: decision.state
        };
    }

    async token(request: TokenRequestDTO, client: Client): Promise<TokenResponseDTO> {
        this.clientService.assertGrantAllowed(client, request.grant_type);

        switch (request.grant_type) {
            case 'authorization_code':
                return this.authorizationCodeGrant(request, client);
            case 'refresh_token':
                return this.tokenService.refresh(
                    request.refresh_token,
                    client.clientId,
                    request.scope
                );
            case 'client_credentials':
                return this.clientCredentialsGrant(request, client);
            default:
                throw OAuthException.unsupportedGrantType(
                    'Unsupported grant_type.'
                );
        }
    }

    async introspect(token: string, client: Client): Promise<IntrospectionResponseDTO> {
        return this.tokenService.introspect(token, client.clientId);
    }

    async revoke(token: string, client: Client): Promise<void> {
        return this.tokenService.revoke(token, client.clientId);
    }

    async userInfo(accessToken: AccessToken): Promise<UserInfoDTO> {
        if (!accessToken.userId) {
            throw OAuthException.invalidToken(
                'This token was issued to a client, not a user.'
            );
        }

        if (!accessToken.scopes.includes('profile')) {
            throw new OAuthException(
                'insufficient_scope',
                'The "profile" scope is required.',
                403
            );
        }

        const user: UserDTO = await this.userService.getUser(accessToken.userId);

        return {
            sub: user.id,
            name: user.name,
            email: user.email,
            updated_at: Math.floor(new Date(user.updatedAt).getTime() / 1000)
        };
    }

    private async authorizationCodeGrant(
        request: Extract<TokenRequestDTO, { grant_type: 'authorization_code' }>,
        client: Client
    ): Promise<TokenResponseDTO> {
        const consumed: ConsumedCode = await this.authorizationCodeService.consume({
            code: request.code,
            clientId: client.clientId,
            redirectUri: request.redirect_uri,
            codeVerifier: request.code_verifier
        });

        if (consumed.replayed) {
            // RFC 6749 §4.1.2: a reused code means it leaked, so everything it
            // already produced has to go.
            await this.tokenService.revokeByAuthorizationCode(consumed.record.id);

            throw OAuthException.invalidGrant(
                'Authorization code has already been used.'
            );
        }

        return this.tokenService.issue({
            clientId: client.clientId,
            userId: consumed.record.userId,
            scopes: consumed.record.scopes,
            withRefreshToken: client.grantTypes.includes('refresh_token'),
            authorizationCodeId: consumed.record.id
        });
    }

    private async clientCredentialsGrant(
        request: Extract<TokenRequestDTO, { grant_type: 'client_credentials' }>,
        client: Client
    ): Promise<TokenResponseDTO> {
        if (!client.confidential) {
            throw OAuthException.unauthorizedClient(
                'The client credentials grant requires a confidential client.'
            );
        }

        return this.tokenService.issue({
            clientId: client.clientId,
            userId: null,
            scopes: this.clientService.resolveScopes(client, request.scope),
            // RFC 6749 §4.4.3: no refresh token for the client credentials grant.
            withRefreshToken: false
        });
    }

    private async validateAuthorizationRequest(request: AuthorizationRequestDTO): Promise<{
        client: Client;
        redirectUri: string;
        scopes: string[];
    }> {
        const client: Client = await this.clientService.loadClient(request.client_id);

        // Resolved before anything else can fail, so an error is never bounced
        // to an unverified redirect target.
        const redirectUri: string = this.clientService.resolveRedirectUri(
            client,
            request.redirect_uri
        );

        this.clientService.assertGrantAllowed(client, 'authorization_code');

        // A public client has no secret, so PKCE is the only thing binding the
        // code to the requester; confidential clients can opt in server-wide.
        if ((this.options.requirePkce || !client.confidential) && !request.code_challenge) {
            throw OAuthException.invalidRequest(
                client.confidential
                    ? 'PKCE is required by this server.'
                    : 'PKCE is required for public clients.'
            );
        }

        return {
            client,
            redirectUri,
            scopes: this.clientService.resolveScopes(client, request.scope)
        };
    }

    private async authenticateResourceOwner(decision: AuthorizationDecisionDTO): Promise<UserDTO> {
        try {
            return await this.authService.verifyCredentials({
                username: decision.username,
                password: decision.password
            });
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw OAuthException.accessDenied(
                    'Invalid resource owner credentials.',
                    decision.state
                );
            }

            throw error;
        }
    }

    private buildRedirect(
        redirectUri: string,
        params: Record<string, string | undefined>
    ): string {
        const url: URL = new URL(redirectUri);

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                url.searchParams.set(key, value);
            }
        }

        return url.toString();
    }
}
