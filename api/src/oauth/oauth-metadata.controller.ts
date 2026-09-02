import { Controller, Get, Inject } from "@nestjs/common";
import { SUPPORTED_SCOPE_NAMES, type AuthorizationServerMetadataDTO, type JsonWebKeySetDTO } from "@pistis/contract";

import { JwtKeyService } from "./jwt/jwt-key.service";
import { OAUTH_OPTIONS, type OAuthOptions } from "./oauth.options";

/**
 * RFC 8414 discovery. Excluded from the global `api` prefix in `main.ts`
 * because the spec fixes this path at the root of the issuer origin.
 */
@Controller('/.well-known')
export class OAuthMetadataController {

    constructor(
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions,
        private readonly keys: JwtKeyService
    ) { }

    @Get('/oauth-authorization-server')
    metadata(): AuthorizationServerMetadataDTO {
        const base = `${this.options.issuer.replace(/\/$/, '')}/api/oauth`;

        return {
            issuer: this.options.issuer,
            jwks_uri: `${this.options.issuer.replace(/\/$/, '')}/.well-known/jwks.json`,
            authorization_endpoint: `${base}/authorize`,
            token_endpoint: `${base}/token`,
            introspection_endpoint: `${base}/introspect`,
            revocation_endpoint: `${base}/revoke`,
            userinfo_endpoint: `${base}/userinfo`,
            scopes_supported: [...SUPPORTED_SCOPE_NAMES],
            response_types_supported: ['code'],
            grant_types_supported: [
                'authorization_code',
                'refresh_token',
                'client_credentials'
            ],
            token_endpoint_auth_methods_supported: [
                'client_secret_basic',
                'client_secret_post',
                'none'
            ],
            code_challenge_methods_supported: ['S256', 'plain']
        };
    }

    /** The public half of the access-token signing key, for resource servers. */
    @Get('/jwks.json')
    jwks(): JsonWebKeySetDTO {
        return this.keys.jwks();
    }
}
