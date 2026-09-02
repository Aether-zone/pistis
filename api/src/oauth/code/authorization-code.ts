import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({
    name: 'oauth_authorization_codes'
})
export class AuthorizationCode {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** SHA-256 of the code handed to the client; the code itself is never stored. */
    @Index({ unique: true })
    @Column({
        name: 'code'
    })
    code: string;

    @Column({
        name: 'client_id'
    })
    clientId: string;

    @Column({
        name: 'user_id'
    })
    userId: string;

    @Column({
        name: 'redirect_uri'
    })
    redirectUri: string;

    @Column({
        name: 'scopes',
        type: 'simple-array'
    })
    scopes: string[];

    @Column({
        name: 'code_challenge',
        type: 'text',
        nullable: true
    })
    codeChallenge: string | null;

    @Column({
        name: 'code_challenge_method',
        type: 'text',
        nullable: true
    })
    codeChallengeMethod: string | null;

    @Column({
        name: 'expires_at'
    })
    expiresAt: Date;

    /** Set the first time the code is redeemed; a second attempt is a replay. */
    @Column({
        name: 'consumed_at',
        type: 'datetime',
        nullable: true
    })
    consumedAt: Date | null;

    @CreateDateColumn({
        name: 'created_at'
    })
    createdAt: Date;
}
