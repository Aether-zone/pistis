import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { formatScope, parseScope, SUPPORTED_SCOPE_NAMES, type GrantType } from "@pistis/contract";
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

        const client: Client = new Client();
        client.clientId = registration.clientId;
        client.clientSecret = registration.clientSecret
            ? await this.passwordEncoder.hash(registration.clientSecret)
            : null;
        client.name = registration.name;
        client.redirectUris = registration.redirectUris;
        client.grantTypes = registration.grantTypes;
        client.scopes = registration.scopes;

        return this.clientRepository.save(client);
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
