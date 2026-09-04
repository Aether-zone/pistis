import { Module } from '@nestjs/common';

import { OrganonModule } from '@aether-zone/organon';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { OAuthModule } from '../oauth/oauth.module';
import { AdminModule } from '../admin/admin.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [
    /*
     * Request ids and health, from organon.
     *
     * `problem: false` deliberately. organon's filter is `@Catch()` — it
     * catches everything — while pistis's `OAuthExceptionFilter` is
     * `@Catch(OAuthException)`. The OAuth endpoints owe RFC 6749's flat
     * `{ error, error_description }` body, and a catch-all registered
     * alongside can render those as problem documents instead. pistis is the
     * authorization server; that body is part of its contract, not a default
     * to be improved on.
     *
     * `config` is left out for the same kind of reason: `main.ts` loads
     * api/.env and the root .env in a specific order, from `__dirname` rather
     * than the cwd because the bundle runs from api/dist. Moving to a
     * validated schema is worth doing and is its own change.
     */
    OrganonModule.forRoot({
      problem: false,
      logging: {
        base: { service: 'pistis' },
        /*
         * Stated rather than derived. organon builds this list from the health
         * module's own path, which is `health` — but `configureApp` puts every
         * route behind a global `api` prefix that organon cannot see, so the
         * derived paths would never match and the probes would fill the log.
         */
        ignorePaths: ['/api/health', '/api/health/live', '/api/health/ready'],
      },
      health: {},
    }),
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
