import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Client } from "../oauth/client/client";
import { OAuthModule } from "../oauth/oauth.module";
import { AccessToken } from "../oauth/token/access-token";
import { RefreshToken } from "../oauth/token/refresh-token";
import { Password } from "../user/password/password";
import { PasswordModule } from "../user/password/password.module";
import { UserModule } from "../user/user.module";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@Module({
    imports: [
        TypeOrmModule.forFeature([Client, Password, AccessToken, RefreshToken]),
        UserModule,
        PasswordModule,
        AuthModule,
        OAuthModule
    ],
    providers: [
        AdminService,
        AdminGuard
    ],
    controllers: [
        AdminController
    ]
})
export class AdminModule { }
