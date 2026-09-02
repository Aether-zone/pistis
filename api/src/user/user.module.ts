import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user';
import { UserMapper } from './user.mapper';
import { UserService } from './user.service';

import { IdentityModule } from './identity/identity.module';
import { PasswordModule } from './password/password.module';
import { UserController } from './user.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    IdentityModule,
    PasswordModule
  ],
  providers: [
    UserMapper,
    UserService
  ],
  controllers: [
    UserController
  ],
  exports: [
    UserService
  ]
})
export class UserModule { }
