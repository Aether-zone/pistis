import { Module } from "@nestjs/common";

import { OAUTH_OPTIONS, oauthOptionsFromEnv, type OAuthOptions } from "../oauth.options";
import { JwtKeyService } from "./jwt-key.service";

/**
 * The single source of the signing key and of the resolved options.
 *
 * Both must be shared: with no `OAUTH_JWT_PRIVATE_KEY` configured the key is
 * generated at boot, so a second instance of `JwtKeyService` would mint tokens
 * under a second key that the published JWKS says nothing about.
 */
@Module({
    providers: [
        {
            provide: OAUTH_OPTIONS,
            useFactory: (): OAuthOptions => oauthOptionsFromEnv()
        },
        JwtKeyService
    ],
    exports: [
        OAUTH_OPTIONS,
        JwtKeyService
    ]
})
export class JwtModule { }
