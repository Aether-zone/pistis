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
 * mneme's own client, for the work that has no person behind it.
 *
 * A second seeded client rather than more scopes on the first, because it is a
 * different *kind* of client: no redirect, no consent, no resource owner. It
 * signs in as itself with the client credentials grant to read objects out of
 * loculus and index what it finds — which is why it holds `objects:read:any`,
 * the scope that lets a service read a file another client uploaded.
 *
 * Every other service borrows the caller's token and needs no registration
 * here. Add one the day another has work nobody is waiting on.
 */
export const DEV_SEED_SERVICE_CLIENT_ID = 'mneme';
export const DEV_SEED_SERVICE_CLIENT_SECRET = 'mneme-secret';
/**
 * `objects:read:any` and nothing else, because that is all mneme does: it reads
 * objects out of loculus, which authorizes by `client_id` rather than by
 * organization.
 *
 * Deliberately *not* bound to an organization, and so deliberately without the
 * `organizations` scope. A binding is what a client needs to reach an
 * organization-scoped route, and mneme reaches none — it takes the tenant to
 * file a document under from the event, not from its own token. Granting the
 * scope anyway would hand out authority nothing spends.
 */
export const DEV_SEED_SERVICE_CLIENT_SCOPES = ['objects:read:any'];

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
        await this.seedServiceClient();
        await this.seedUser();

        this.logger.warn(
            `Dev seed active. client_id="${DEV_SEED_CLIENT_ID}" `
            + `client_secret="${DEV_SEED_CLIENT_SECRET}" `
            + `admin login="${DEV_SEED_EMAIL}" password="${DEV_SEED_PASSWORD}" `
            + `redirect_uri=${redirectUris.join(', ')} `
            + `service client_id="${DEV_SEED_SERVICE_CLIENT_ID}" `
            + `client_secret="${DEV_SEED_SERVICE_CLIENT_SECRET}"`
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
     * mneme's service client, converged rather than created once.
     *
     * The scopes are brought up to date on every boot for the same reason the
     * account below is: a database seeded by an older build has the client but
     * not a scope added since, and skipping it there leaves mneme unable to
     * read anything — visible only as loculus answering 404 for every object,
     * which is a long way from the cause.
     *
     * Converging cannot repair a *secret*, which is hashed and cannot be read
     * back to compare. A client seeded with a different one keeps it, and the
     * fix is to delete the client and restart.
     */
    private async seedServiceClient(): Promise<void> {
        const existing = await this.clientService.findByClientId(
            DEV_SEED_SERVICE_CLIENT_ID
        );

        if (existing) {
            await this.clientService.grantScopes(
                existing,
                DEV_SEED_SERVICE_CLIENT_SCOPES
            );

            return;
        }

        await this.clientService.register({
            clientId: DEV_SEED_SERVICE_CLIENT_ID,
            // Confidential: the client credentials grant requires it, and a
            // secret is the only thing standing between this and anybody.
            clientSecret: DEV_SEED_SERVICE_CLIENT_SECRET,
            name: 'mneme',
            // None. There is no browser in this flow to send anywhere.
            redirectUris: [],
            grantTypes: ['client_credentials'],
            scopes: DEV_SEED_SERVICE_CLIENT_SCOPES
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
