import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DEFAULT_CLIENT_PRIMARY_COLOR, formatScope, parseScope, SUPPORTED_SCOPE_NAMES, type GrantType, type MembershipRole, type UpdateClientDTO } from "@pistis/contract";
import { Repository } from "typeorm";

import { PasswordEncoder } from "../../user/password/password.encoder";
import { OAuthException } from "../oauth.error";
import { Client } from "./client";

export interface ClientRegistration {
    clientId: string;
    /** Omit to register a public client, which must then use PKCE. */
    clientSecret?: string;
    name: string;
    redirectUris: string[];
    grantTypes: GrantType[];
    scopes: string[];
    /** Six-digit hex. Defaults to the workspace's own blue when omitted. */
    primaryColor?: string;
    /**
     * The organization this client acts in, with the role the grant carries.
     *
     * Only meaningful for the client credentials grant — see the column on
     * {@link Client}. Omit for every client that acts on a person's behalf.
     */
    organization?: { id: string; role: MembershipRole };
}

/**
 * A bcrypt hash of a value no caller can produce. Compared against when the
 * client id is unknown so that "no such client" and "wrong secret" take the
 * same time and cannot be told apart by an enumerating attacker.
 */
const ABSENT_CLIENT_SECRET_HASH =
    '$2b$12$0000000000000000000000000000000000000000000000000000';

@Injectable()
export class ClientService {

    constructor(
        @InjectRepository(Client) private readonly clientRepository: Repository<Client>,
        private readonly passwordEncoder: PasswordEncoder
    ) { }

    async register(registration: ClientRegistration): Promise<Client> {
        const unknownScopes: string[] = registration.scopes.filter(
            (scope) => !SUPPORTED_SCOPE_NAMES.includes(scope as never)
        );

        if (unknownScopes.length > 0) {
            throw OAuthException.invalidScope(
                `Unknown scope(s): ${formatScope(unknownScopes)}`
            );
        }

        // Checked rather than left to the unique index, which would surface as
        // an opaque 500 from the driver.
        if (await this.findByClientId(registration.clientId)) {
            throw OAuthException.invalidRequest(
                `A client with the id "${registration.clientId}" already exists.`
            );
        }

        this.assertCoherent(registration.clientId, {
            grantTypes: registration.grantTypes,
            redirectUris: registration.redirectUris,
            scopes: registration.scopes,
            bound: Boolean(registration.organization)
        });

        const client: Client = new Client();
        client.clientId = registration.clientId;
        client.clientSecret = registration.clientSecret
            ? await this.passwordEncoder.hash(registration.clientSecret)
            : null;
        client.name = registration.name;
        client.redirectUris = registration.redirectUris;
        client.grantTypes = registration.grantTypes;
        client.scopes = registration.scopes;
        client.primaryColor =
            registration.primaryColor ?? DEFAULT_CLIENT_PRIMARY_COLOR;
        client.organizationId = registration.organization?.id ?? null;
        client.organizationRole = registration.organization?.role ?? null;

        return this.clientRepository.save(client);
    }

    /**
     * Changes what an admin may change about a client, leaving the rest alone.
     *
     * The rules are checked against the *result*, which is the only place they
     * can be: dropping `organizations` from the scopes is wrong only if a
     * binding survives the change, and adding `authorization_code` is wrong only
     * if no redirect URI does. A request cannot be judged on its own.
     *
     * `organization: null` removes a binding and absent leaves it — the one
     * field with two ways to say something about it. Everything else is
     * replaced whole where given, so narrowing scopes here really is a
     * revocation, deliberately: that is what an administrator asking for it
     * means, unlike {@link grantScopes}, which a seed calls and must never use
     * to take access away.
     */
    async update(client: Client, changes: UpdateClientDTO): Promise<Client> {
        const unknownScopes: string[] = (changes.scopes ?? []).filter(
            (scope) => !SUPPORTED_SCOPE_NAMES.includes(scope as never)
        );

        if (unknownScopes.length > 0) {
            throw OAuthException.invalidScope(
                `Unknown scope(s): ${formatScope(unknownScopes)}`
            );
        }

        const organization: { id: string; role: MembershipRole } | null =
            changes.organization === undefined
                ? (client.organizationId && client.organizationRole
                    ? { id: client.organizationId, role: client.organizationRole }
                    : null)
                : changes.organization;

        const resulting = {
            grantTypes: (changes.grantTypes ?? client.grantTypes) as GrantType[],
            redirectUris: changes.redirectUris ?? client.redirectUris,
            scopes: changes.scopes ?? client.scopes,
            bound: organization !== null
        };

        this.assertCoherent(client.clientId, resulting);

        client.name = changes.name ?? client.name;
        client.primaryColor = changes.primaryColor ?? client.primaryColor;
        client.redirectUris = resulting.redirectUris;
        client.grantTypes = resulting.grantTypes;
        client.scopes = resulting.scopes;
        client.organizationId = organization?.id ?? null;
        client.organizationRole = organization?.role ?? null;

        return this.clientRepository.save(client);
    }

    /**
     * The two things a client's configuration must not say at once.
     *
     * Shared by registration and update rather than written twice, and stated
     * over a *resulting* configuration rather than a request, so a partial
     * change is judged by what it leaves behind.
     */
    private assertCoherent(
        clientId: string,
        client: {
            grantTypes: GrantType[];
            redirectUris: string[];
            scopes: string[];
            bound: boolean;
        }
    ): void {
        /*
         * A binding without the scope would mint tokens whose `orgs` claim
         * contradicts the published contract, which says the claim is present
         * only when `organizations` was granted — and a resource server may rely
         * on that. Refused here rather than dropped silently at token time,
         * because the symptom would otherwise be 403s from every
         * organization-scoped route with nothing to connect them to the cause.
         */
        if (client.bound && !client.scopes.includes('organizations')) {
            throw OAuthException.invalidScope(
                `Client "${clientId}" is bound to an organization, `
                + 'so it must also be granted the "organizations" scope.'
            );
        }

        /*
         * In the service and not in the request schema, because the rule spans
         * two fields and an update may carry neither. A client with a browser to
         * send back and nowhere to send it is one that fails at the
         * authorization endpoint rather than at registration.
         */
        if (
            client.grantTypes.includes('authorization_code')
            && client.redirectUris.length === 0
        ) {
            throw OAuthException.invalidRequest(
                `Client "${clientId}" uses the authorization code grant, `
                + 'so it needs at least one redirect URI to send the browser back to.'
            );
        }
    }

    /**
     * Widens a client's scopes to include everything named.
     *
     * Additive, and a no-op when the client already holds them, so it is safe
     * to call on every boot — which is what the dev seed does. A client
     * registered by an older build otherwise keeps the scopes it was created
     * with for ever, and the service that needs a newer one fails with a 404
     * from whichever resource server was supposed to honour it.
     *
     * Deliberately not a general "set the scopes" method: narrowing is a
     * revocation, and revoking access is not something a seed should do by
     * accident on a database somebody is using.
     */
    async grantScopes(client: Client, scopes: string[]): Promise<void> {
        const missing: string[] = scopes.filter(
            (scope) => !client.scopes.includes(scope)
        );

        if (missing.length === 0) {
            return;
        }

        await this.clientRepository.update(
            { id: client.id },
            { scopes: [...client.scopes, ...missing] }
        );
    }

    /** Replaces a confidential client's secret with a freshly hashed one. */
    async replaceSecret(client: Client, clientSecret: string): Promise<void> {
        await this.clientRepository.update(
            { id: client.id },
            { clientSecret: await this.passwordEncoder.hash(clientSecret) }
        );
    }

    async findByClientId(clientId: string): Promise<Client | null> {
        return this.clientRepository.findOneBy({
            clientId
        });
    }

    /** Resolves a client for the authorization endpoint, where no secret is presented. */
    async loadClient(clientId: string): Promise<Client> {
        const client: Client | null = await this.findByClientId(clientId);

        if (!client) {
            throw OAuthException.invalidClient(`Unknown client "${clientId}".`);
        }

        return client;
    }

    /**
     * RFC 6749 §3.2.1. A confidential client must present its secret; a public
     * client must not present one at all.
     */
    async authenticate(clientId: string, clientSecret?: string): Promise<Client> {
        const client: Client | null = await this.findByClientId(clientId);

        if (!client || client.clientSecret === null) {
            // Burn the same time as a real comparison before deciding.
            await this.passwordEncoder.compare(
                client?.clientSecret ?? ABSENT_CLIENT_SECRET_HASH,
                clientSecret ?? ''
            );
        }

        if (!client) {
            throw OAuthException.invalidClient('Client authentication failed.');
        }

        if (client.clientSecret === null) {
            if (clientSecret) {
                throw OAuthException.invalidClient(
                    'Public clients must not present a client secret.'
                );
            }

            return client;
        }

        if (!clientSecret) {
            throw OAuthException.invalidClient('Client authentication required.');
        }

        const matches: boolean = await this.passwordEncoder.compare(
            client.clientSecret,
            clientSecret
        );

        if (!matches) {
            throw OAuthException.invalidClient('Client authentication failed.');
        }

        return client;
    }

    assertGrantAllowed(client: Client, grantType: GrantType): void {
        if (!client.grantTypes.includes(grantType)) {
            throw OAuthException.unauthorizedClient(
                `Client "${client.clientId}" may not use the "${grantType}" grant.`
            );
        }
    }

    /**
     * RFC 6749 §3.1.2.3: the redirect URI must match a registered one exactly.
     * Omitting it is only allowed when exactly one URI is registered.
     */
    resolveRedirectUri(client: Client, requested?: string): string {
        if (!requested) {
            if (client.redirectUris.length !== 1) {
                throw OAuthException.invalidRequest(
                    'redirect_uri is required when the client registers more than one.'
                );
            }

            return client.redirectUris[0];
        }

        if (!client.redirectUris.includes(requested)) {
            throw OAuthException.invalidRequest(
                'redirect_uri does not match a registered redirect URI.'
            );
        }

        return requested;
    }

    /** Falls back to the client's full registered set when none is requested. */
    resolveScopes(client: Client, requested?: string): string[] {
        const scopes: string[] = parseScope(requested);

        if (scopes.length === 0) {
            return [...client.scopes];
        }

        const forbidden: string[] = scopes.filter(
            (scope) => !client.scopes.includes(scope)
        );

        if (forbidden.length > 0) {
            throw OAuthException.invalidScope(
                `Client "${client.clientId}" is not allowed the scope(s): ${formatScope(forbidden)}`
            );
        }

        return scopes;
    }
}
