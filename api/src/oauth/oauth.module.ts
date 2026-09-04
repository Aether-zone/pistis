import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { PasswordModule } from "../user/password/password.module";
import { MembershipModule } from "../organization/membership/membership.module";
import { UserModule } from "../user/user.module";
import { BearerTokenGuard } from "./bearer-token.guard";
import { DevSeedService } from "./dev-seed.service";
import { AccessTokenFactory } from "./jwt/access-token.factory";
import { JwtKeyService } from "./jwt/jwt-key.service";
import { JwtModule } from "./jwt/jwt.module";
import { Client } from "./client/client";
import { ClientService } from "./client/client.service";
import { AuthorizationCode } from "./code/authorization-code";
import { AuthorizationCodeService } from "./code/authorization-code.service";
import { OAuthMetadataController } from "./oauth-metadata.controller";
import { OAuthController } from "./oauth.controller";
import { OAuthService } from "./oauth.service";
import { Pkce } from "./pkce";
import { AccessToken } from "./token/access-token";
import { RefreshToken } from "./token/refresh-token";
import { TokenService } from "./token/token.service";
import { TokenHash } from "./token-hash";

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Client,
            AuthorizationCode,
            AccessToken,
            RefreshToken
        ]),
        UserModule,
        // For the `orgs` claim. MembershipModule imports neither this module nor
        // OrganizationModule, so the dependency stays one-way.
        MembershipModule,
        PasswordModule,
        AuthModule,
        JwtModule
    ],
    providers: [
        TokenHash,
        Pkce,
        JwtKeyService,
        AccessTokenFactory,
        ClientService,
        AuthorizationCodeService,
        TokenService,
        OAuthService,
        BearerTokenGuard,
        DevSeedService
    ],
    controllers: [
        OAuthController,
        OAuthMetadataController
    ],
    exports: [
        ClientService,
        TokenService,
        JwtKeyService
    ]
})
export class OAuthModule { }
