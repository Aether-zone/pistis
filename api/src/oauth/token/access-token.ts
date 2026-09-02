import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({
    name: 'oauth_access_tokens'
})
export class AccessToken {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * The `jti` of the JWT handed to the client. The token itself is signed and
     * self-describing, so nothing secret is stored — this row exists so that an
     * otherwise self-contained credential can still be revoked.
     */
    @Index({ unique: true })
    @Column({
        name: 'jti'
    })
    jti: string;

    @Column({
        name: 'client_id'
    })
    clientId: string;

    /** Null for the client credentials grant, which acts on no user's behalf. */
    @Column({
        name: 'user_id',
        type: 'text',
        nullable: true
    })
    userId: string | null;

    /**
     * The authorization code this token descends from, so that replaying a code
     * can revoke everything it produced (RFC 6749 §4.1.2).
     */
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
