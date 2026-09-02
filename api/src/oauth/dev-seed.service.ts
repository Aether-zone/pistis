import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { type UserDTO } from "@pistis/contract";

import { PasswordService } from "../user/password/password.service";
import { UserService } from "../user/user.service";
import { ClientService } from "./client/client.service";
import { OAUTH_OPTIONS, type OAuthOptions } from "./oauth.options";

export const DEV_SEED_CLIENT_ID = 'demo-client';
export const DEV_SEED_CLIENT_SECRET = 'demo-secret';
export const DEV_SEED_EMAIL = 'demo@example.com';
export const DEV_SEED_PASSWORD = 'demo-password';

/**
 * Creates one client and one user so the authorization flow can be driven
 * immediately after a fresh start. Nothing else in the app can currently do
 * this: clients are only registerable in code, and `POST /api/users` has no way
 * to set a password.
 *
 * Off unless `OAUTH_DEV_SEED=true`, and refuses to run under
 * `NODE_ENV=production` even then, because it creates a known-credential
 * account. It is a development affordance, not a provisioning story — a real
 * one still wants an authenticated admin API.
 */
@Injectable()
export class DevSeedService implements OnApplicationBootstrap {

    private readonly logger = new Logger(DevSeedService.name);

    constructor(
        private readonly clientService: ClientService,
        private readonly userService: UserService,
        private readonly passwordService: PasswordService,
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) { }

    async onApplicationBootstrap(): Promise<void> {
        if (!this.options.devSeed) {
            return;
        }

        if (process.env.NODE_ENV === 'production') {
            this.logger.error(
                'OAUTH_DEV_SEED is set but NODE_ENV=production; refusing to create demo credentials.'
            );

            return;
        }

        const redirectUris: string[] = this.options.devSeedRedirectUris;

        await this.seedClient(redirectUris);
        await this.seedUser();

        this.logger.warn(
            `Dev seed active. client_id="${DEV_SEED_CLIENT_ID}" `
            + `client_secret="${DEV_SEED_CLIENT_SECRET}" `
            + `admin login="${DEV_SEED_EMAIL}" password="${DEV_SEED_PASSWORD}" `
            + `redirect_uri=${redirectUris.join(', ')}`
        );
    }

    private async seedClient(redirectUris: string[]): Promise<void> {
        if (await this.clientService.findByClientId(DEV_SEED_CLIENT_ID)) {
            return;
        }

        await this.clientService.register({
            clientId: DEV_SEED_CLIENT_ID,
            clientSecret: DEV_SEED_CLIENT_SECRET,
            name: 'Demo Client',
            redirectUris,
            grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
            scopes: ['profile', 'email']
        });
    }

    /**
     * Converges the seeded account on the state it should have rather than
     * creating it once and never looking again: a database seeded by an older
     * build has the account but not, say, its admin flag, and skipping it there
     * leaves the dashboard permanently unreachable.
     */
    private async seedUser(): Promise<void> {
        const existing: UserDTO | null = await this.userService
            .getUserByUsername(DEV_SEED_EMAIL)
            .catch(() => null);

        const user: UserDTO = existing ?? await this.userService.createUser({
            name: 'Demo User',
            email: DEV_SEED_EMAIL
        });

        await this.passwordService.replacePassword(DEV_SEED_PASSWORD, user.id);
        // The seeded account is the only way into the management dashboard on
        // a fresh database, so it has to be an admin.
        await this.userService.setAdmin(user.id, true);
    }
}
