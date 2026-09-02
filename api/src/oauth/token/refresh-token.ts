import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({
    name: 'oauth_refresh_tokens'
})
export class RefreshToken {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** SHA-256 of the refresh token. */
    @Index({ unique: true })
    @Column({
        name: 'token'
    })
    token: string;

    @Index()
    @Column({
        name: 'access_token_id'
    })
    accessTokenId: string;

    @Column({
        name: 'client_id'
    })
    clientId: string;

    @Column({
        name: 'user_id',
        type: 'text',
        nullable: true
    })
    userId: string | null;

    @Index()
    @Column({
        name: 'authorization_code_id',
        type: 'text',
        nullable: true
    })
    authorizationCodeId: string | null;

    @Column({
        name: 'scopes',
        type: 'simple-array'
    })
    scopes: string[];

    @Column({
        name: 'expires_at'
    })
    expiresAt: Date;

    @Column({
        name: 'revoked_at',
        type: 'datetime',
        nullable: true
    })
    revokedAt: Date | null;

    @CreateDateColumn({
        name: 'created_at'
    })
    createdAt: Date;
}
