import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';
import { PasswordModule } from '../user/password/password.module';
import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';
import { JwtModule } from '../oauth/jwt/jwt.module';

@Module({
    imports: [
        UserModule,
        PasswordModule,
        JwtModule
    ],
    providers: [
        SessionService,
        SessionGuard,
        AuthService
    ],
    controllers: [
        AuthController
    ],
    exports: [
        AuthService,
        SessionService,
        SessionGuard
    ]
})
export class AuthModule { }
