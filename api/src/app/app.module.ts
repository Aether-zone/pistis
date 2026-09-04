import { Module } from '@nestjs/common';


import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { OAuthModule } from '../oauth/oauth.module';
import { AdminModule } from '../admin/admin.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      // Relative to the working directory by default, which is the workspace
      // root under `pnpm start:server`. Containers set this to a mounted path,
      // since anything written inside the image is lost on restart.
      database: process.env.DATABASE_PATH ?? 'db.sqlite',
      autoLoadEntities: true,
      synchronize: true
    }),
    UserModule,
    AuthModule,
    OAuthModule,
    AdminModule,
    OrganizationModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
