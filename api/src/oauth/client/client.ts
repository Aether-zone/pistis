import { type MembershipRole } from "@pistis/contract";
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

    /**
     * The organization this client acts in, for the client credentials grant.
     *
     * Null for every client that acts on a person's behalf, and that is the
     * whole distinction: those take their organizations from the *subject's*
     * memberships, resolved fresh on each issue. A client credentials token has
     * no subject and belongs to nothing, so without this it can act in no
     * organization at all — which is every organization-scoped route in the
     * workspace.
     *
     * So the binding is not a membership but a *grant*, which is why the role
     * is stored beside it rather than looked up: there is no membership row to
     * look it up from.
     */
    @Column({
        name: 'organization_id',
        type: 'uuid',
        nullable: true
    })
    organizationId: string | null;

    /** The role the grant carries. Null exactly when {@link organizationId} is. */
    @Column({
        name: 'organization_role',
        type: 'text',
        nullable: true
    })
    organizationRole: MembershipRole | null;

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
