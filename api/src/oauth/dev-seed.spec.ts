import { INestApplication, Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { UserModule } from "../user/user.module";
import { ClientService } from "./client/client.service";
import {
    DevSeedService as DevSeedServiceRef,
    DEV_SEED_CLIENT_ID,
    DEV_SEED_EMAIL,
    DEV_SEED_PASSWORD
} from "./dev-seed.service";
import { UserService as UserServiceRef } from "../user/user.service";
import { OAUTH_OPTIONS, oauthOptionsFromEnv, type OAuthOptions } from "./oauth.options";
import { OAuthModule } from "./oauth.module";

async function bootWith(env: NodeJS.ProcessEnv): Promise<INestApplication> {
    const options: OAuthOptions = oauthOptionsFromEnv(env);

    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
            TypeOrmModule.forRoot({
                type: 'better-sqlite3',
                database: ':memory:',
                autoLoadEntities: true,
                synchronize: true,
                dropSchema: true
            }),
            UserModule,
            AuthModule,
            OAuthModule
        ]
    })
        .overrideProvider(OAUTH_OPTIONS)
        .useValue(options)
        .compile();

    const app: INestApplication = moduleRef.createNestApplication();

    await app.init();

    return app;
}

describe('DevSeedService', () => {

    it('does nothing unless OAUTH_DEV_SEED is set', async () => {
        const app: INestApplication = await bootWith({});

        try {
            expect(await app.get(ClientService).findByClientId(DEV_SEED_CLIENT_ID))
                .toBeNull();
        } finally {
            await app.close();
        }
    });

    it('creates a usable client and user when enabled', async () => {
        const app: INestApplication = await bootWith({
            OAUTH_DEV_SEED: 'true',
            OAUTH_DEV_SEED_REDIRECT_URIS: 'http://localhost:4200/callback'
        });

        try {
            const client = await app.get(ClientService).findByClientId(DEV_SEED_CLIENT_ID);

            expect(client).not.toBeNull();
            expect(client?.redirectUris).toEqual(['http://localhost:4200/callback']);

            // The seeded user must actually be able to authenticate, which is
            // the whole point — `POST /api/users` cannot set a password.
            const user = await app.get(AuthService).verifyCredentials({
                username: DEV_SEED_EMAIL,
                password: DEV_SEED_PASSWORD
            });

            expect(user.email).toBe(DEV_SEED_EMAIL);
        } finally {
            await app.close();
        }
    });

    it('refuses to create demo credentials under NODE_ENV=production', async () => {
        const previous = process.env.NODE_ENV;
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

        process.env.NODE_ENV = 'production';

        const app: INestApplication = await bootWith({ OAUTH_DEV_SEED: 'true' });

        try {
            expect(await app.get(ClientService).findByClientId(DEV_SEED_CLIENT_ID))
                .toBeNull();
            expect(error).toHaveBeenCalledWith(
                expect.stringContaining('refusing to create demo credentials')
            );
        } finally {
            process.env.NODE_ENV = previous;
            error.mockRestore();
            await app.close();
        }
    });

    it('repairs an account seeded before the admin flag existed', async () => {
        const app: INestApplication = await bootWith({ OAUTH_DEV_SEED: 'true' });

        try {
            // Simulate the older build's state: the account exists but is not
            // an admin, which used to make the seeder skip it forever.
            const users = app.get(UserServiceRef);
            const seeded = await users.getUserByUsername(DEV_SEED_EMAIL);

            await users.setAdmin(seeded.id, false);

            const seeder = app.get(DevSeedServiceRef);

            await seeder.onApplicationBootstrap();

            const repaired = await users.getEntityByEmail(DEV_SEED_EMAIL);

            expect(repaired?.admin).toBe(true);
        } finally {
            await app.close();
        }
    });

    it('is idempotent across restarts', async () => {
        const env = { OAUTH_DEV_SEED: 'true' };
        const first: INestApplication = await bootWith(env);

        await first.close();

        // A second boot against a fresh in-memory database must not throw on
        // the unique client_id index either way.
        const second: INestApplication = await bootWith(env);

        try {
            expect(await second.get(ClientService).findByClientId(DEV_SEED_CLIENT_ID))
                .not.toBeNull();
        } finally {
            await second.close();
        }
    });
});
