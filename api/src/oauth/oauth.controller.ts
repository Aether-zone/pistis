import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, Res, UseFilters, UseGuards } from "@nestjs/common";
import {
    authorizationDecisionSchema,
    authorizationRequestSchema,
    introspectionRequestSchema,
    revocationRequestSchema,
    tokenRequestSchema,
    type AuthorizationDecisionDTO,
    type AuthorizationPromptDTO,
    type AuthorizationRequestDTO,
    type AuthorizationResponseDTO,
    type IntrospectionRequestDTO,
    type IntrospectionResponseDTO,
    type RevocationRequestDTO,
    type TokenRequestDTO,
    type TokenResponseDTO,
    type UserInfoDTO
} from "@pistis/contract";


import { BearerTokenGuard, type AuthenticatedRequest } from "./bearer-token.guard";
import { Client } from "./client/client";
import { ClientService } from "./client/client.service";
import { resolveClientCredentials, type PresentedClientCredentials } from "./client-credentials";
import { type HttpResponse } from "./http";
import { OAuthExceptionFilter } from "./oauth-exception.filter";
import { OAuthException } from "./oauth.error";
import { OAuthService } from "./oauth.service";
import { SchemaValidationPipe } from "../common/schema-validation.pipe";

@Controller('/oauth')
@UseFilters(OAuthExceptionFilter)
export class OAuthController {

    constructor(
        private readonly oauthService: OAuthService,
        private readonly clientService: ClientService
    ) { }

    /**
     * Describes a pending authorization request so a consent screen can render
     * it. This deliberately does not redirect: the resource owner has not been
     * authenticated or asked anything yet.
     */
    @Get('/authorize')
    authorize(
        @Query(new SchemaValidationPipe(authorizationRequestSchema, OAuthException.invalidRequest)) request: AuthorizationRequestDTO
    ): Promise<AuthorizationPromptDTO> {
        return this.oauthService.prompt(request);
    }

    /**
     * Answers the pending request. Returns the URL to send the user agent to
     * rather than a 302, so the consent screen stays in control of navigation.
     */
    @Post('/authorize')
    @HttpCode(200)
    authorizeDecision(
        @Body(new SchemaValidationPipe(authorizationDecisionSchema, OAuthException.invalidRequest)) decision: AuthorizationDecisionDTO
    ): Promise<AuthorizationResponseDTO> {
        return this.oauthService.decide(decision);
    }

    @Post('/token')
    @HttpCode(200)
    async token(
        @Headers('authorization') authorization: string | undefined,
        @Body(new SchemaValidationPipe(tokenRequestSchema, OAuthException.invalidRequest)) request: TokenRequestDTO,
        @Res({ passthrough: true }) response: HttpResponse
    ): Promise<TokenResponseDTO> {
        const client: Client = await this.authenticateClient(authorization, request);

        // RFC 6749 §5.1: token responses must never be cached.
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Pragma', 'no-cache');

        return this.oauthService.token(request, client);
    }

    @Post('/introspect')
    @HttpCode(200)
    async introspect(
        @Headers('authorization') authorization: string | undefined,
        @Body(new SchemaValidationPipe(introspectionRequestSchema, OAuthException.invalidRequest)) request: IntrospectionRequestDTO,
        @Body() body: { client_id?: string; client_secret?: string }
    ): Promise<IntrospectionResponseDTO> {
        const client: Client = await this.authenticateClient(authorization, body);

        return this.oauthService.introspect(request.token, client);
    }

    /** RFC 7009 §2.2: a successful revocation returns 200 with an empty body. */
    @Post('/revoke')
    @HttpCode(200)
    async revoke(
        @Headers('authorization') authorization: string | undefined,
        @Body(new SchemaValidationPipe(revocationRequestSchema, OAuthException.invalidRequest)) request: RevocationRequestDTO,
        @Body() body: { client_id?: string; client_secret?: string }
    ): Promise<void> {
        const client: Client = await this.authenticateClient(authorization, body);

        return this.oauthService.revoke(request.token, client);
    }

    @Get('/userinfo')
    @UseGuards(BearerTokenGuard)
    userInfo(@Req() request: AuthenticatedRequest): Promise<UserInfoDTO> {
        if (!request.accessToken) {
            throw OAuthException.invalidToken('A bearer token is required.');
        }

        return this.oauthService.userInfo(request.accessToken);
    }

    private authenticateClient(
        authorization: string | undefined,
        body: { client_id?: string; client_secret?: string }
    ): Promise<Client> {
        const credentials: PresentedClientCredentials = resolveClientCredentials(
            authorization,
            body
        );

        return this.clientService.authenticate(
            credentials.clientId,
            credentials.clientSecret
        );
    }
}
