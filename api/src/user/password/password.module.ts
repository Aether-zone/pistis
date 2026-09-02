import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Password } from './password';
import { PasswordEncoder } from './password.encoder';
import { PasswordService } from './password.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Password])
    ],
    providers: [
        PasswordEncoder,
        PasswordService
    ],
    exports: [
        PasswordService,
        PasswordEncoder
    ]
})
export class PasswordModule { }
