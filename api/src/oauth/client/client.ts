import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({
    name: 'oauth_clients'
})
export class Client {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index({ unique: true })
    @Column({
        name: 'client_id'
    })
    clientId: string;

    /** bcrypt hash; null for public clients, which authenticate with PKCE only. */
    @Column({
        name: 'client_secret',
        type: 'text',
        nullable: true
    })
    clientSecret: string | null;

    @Column({
        name: 'name'
    })
    name: string;

    @Column({
        name: 'redirect_uris',
        type: 'simple-array'
    })
    redirectUris: string[];

    @Column({
        name: 'grant_types',
        type: 'simple-array'
    })
    grantTypes: string[];

    @Column({
        name: 'scopes',
        type: 'simple-array'
    })
    scopes: string[];

    @CreateDateColumn({
        name: 'created_at'
    })
    createdAt: Date;

    @UpdateDateColumn({
        name: 'updated_at'
    })
    updatedAt: Date;

    get confidential(): boolean {
        return this.clientSecret !== null;
    }
}
