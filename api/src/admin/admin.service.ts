import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
    type AdminClientDTO,
    type AdminTokenDTO,
    type AdminUserDTO,
    type ClientSecretDTO,
    type CreateAdminUserDTO,
    type CreateClientDTO
} from "@pistis/contract";
import { randomBytes } from "crypto";
import { Repository } from "typeorm";

import { Client } from "../oauth/client/client";
import { ClientService } from "../oauth/client/client.service";
import { AccessToken } from "../oauth/token/access-token";
import { RefreshToken } from "../oauth/token/refresh-token";
import { Password } from "../user/password/password";
import { PasswordService } from "../user/password/password.service";
import { User } from "../user/user";
import { UserService } from "../user/user.service";

@Injectable()
export class AdminService {

    constructor(
        private readonly clientService: ClientService,
        private readonly userService: UserService,
        private readonly passwordService: PasswordService,
        @InjectRepository(Client) private readonly clientRepository: Repository<Client>,
        @InjectRepository(Password) private readonly passwordRepository: Repository<Password>,
        @InjectRepository(AccessToken) private readonly accessTokenRepository: Repository<AccessToken>,
        @InjectRepository(RefreshToken) private readonly refreshTokenRepository: Repository<RefreshToken>
    ) { }

    async listClients(): Promise<AdminClientDTO[]> {
        const clients: Client[] = await this.clientRepository.find({
            order: { createdAt: 'ASC' }
        });

        return clients.map((client) => this.toClientDTO(client));
    }

    /**
     * Generates the secret rather than accepting one, so a weak secret cannot
     * be chosen from the dashboard. It is returned exactly once.
     */
    async createClient(request: CreateClientDTO): Promise<ClientSecretDTO> {
        const clientSecret: string | undefined = request.confidential
            ? randomBytes(32).toString('base64url')
            : undefined;

        await this.clientService.register({
            clientId: request.clientId,
            clientSecret,
            name: request.name,
            redirectUris: request.redirectUris,
            grantTypes: request.grantTypes,
            scopes: request.scopes
        });

        return { clientId: request.clientId, clientSecret: clientSecret ?? '' };
    }

    async rotateClientSecret(clientId: string): Promise<ClientSecretDTO> {
        const client: Client = await this.loadClient(clientId);

        if (!client.confidential) {
            throw new NotFoundException('Public clients have no secret to rotate.');
        }

        const clientSecret: string = randomBytes(32).toString('base64url');

        await this.clientService.replaceSecret(client, clientSecret);

        return { clientId, clientSecret };
    }

    async deleteClient(clientId: string): Promise<void> {
        const client: Client = await this.loadClient(clientId);

        // Tokens outlive their client otherwise, and would keep validating.
        await this.revokeForClient(client.clientId);
        await this.clientRepository.delete({ id: client.id });
    }

    async listUsers(): Promise<AdminUserDTO[]> {
        const users: User[] = await this.userService.listAll();
        const passwords: Password[] = await this.passwordRepository.find();
        const withPassword = new Set(passwords.map((password) => password.userId));

        return users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            admin: user.admin === true,
            hasPassword: withPassword.has(user.id),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }));
    }

    /** Creates a user *with* a password, which `POST /api/users` cannot do. */
    async createUser(request: CreateAdminUserDTO): Promise<AdminUserDTO> {
        const user = await this.userService.createUser({
            name: request.name,
            email: request.email
        });

        await this.passwordService.storePassword(request.password, user.id);

        if (request.admin) {
            await this.userService.setAdmin(user.id, true);
        }

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            admin: request.admin,
            hasPassword: true,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }

    async setPassword(userId: string, password: string): Promise<void> {
        await this.userService.getUser(userId);
        await this.passwordService.replacePassword(password, userId);
    }

    async listTokens(): Promise<AdminTokenDTO[]> {
        const [access, refresh] = await Promise.all([
            this.accessTokenRepository.find({ order: { createdAt: 'DESC' } }),
            this.refreshTokenRepository.find({ order: { createdAt: 'DESC' } })
        ]);

        const now: number = Date.now();

        const tokens: AdminTokenDTO[] = [
            ...access.map((token) => this.toTokenDTO(token, 'access', now)),
            ...refresh.map((token) => this.toTokenDTO(token, 'refresh', now))
        ];

        return tokens.sort(
            (left, right) => right.issuedAt.getTime() - left.issuedAt.getTime()
        );
    }

    async revokeToken(kind: 'access' | 'refresh', id: string): Promise<void> {
        const now: Date = new Date();

        if (kind === 'access') {
            await this.accessTokenRepository.update({ id }, { revokedAt: now });
            await this.refreshTokenRepository.update(
                { accessTokenId: id },
                { revokedAt: now }
            );

            return;
        }

        const refresh: RefreshToken | null = await this.refreshTokenRepository.findOneBy({ id });

        if (!refresh) {
            return;
        }

        await this.refreshTokenRepository.update({ id }, { revokedAt: now });
        await this.accessTokenRepository.update(
            { id: refresh.accessTokenId },
            { revokedAt: now }
        );
    }

    private async revokeForClient(clientId: string): Promise<void> {
        const now: Date = new Date();

        await this.accessTokenRepository.update({ clientId }, { revokedAt: now });
        await this.refreshTokenRepository.update({ clientId }, { revokedAt: now });
    }

    private async loadClient(clientId: string): Promise<Client> {
        const client: Client | null = await this.clientService.findByClientId(clientId);

        if (!client) {
            throw new NotFoundException(`No client "${clientId}".`);
        }

        return client;
    }

    private toClientDTO(client: Client): AdminClientDTO {
        return {
            id: client.id,
            clientId: client.clientId,
            name: client.name,
            confidential: client.confidential,
            redirectUris: client.redirectUris,
            grantTypes: client.grantTypes,
            scopes: client.scopes,
            createdAt: client.createdAt,
            updatedAt: client.updatedAt
        };
    }

    private toTokenDTO(
        token: AccessToken | RefreshToken,
        kind: 'access' | 'refresh',
        now: number
    ): AdminTokenDTO {
        return {
            id: token.id,
            kind,
            clientId: token.clientId,
            userId: token.userId,
            scopes: token.scopes,
            issuedAt: token.createdAt,
            expiresAt: token.expiresAt,
            revokedAt: token.revokedAt,
            active: token.revokedAt === null && token.expiresAt.getTime() > now
        };
    }
}
