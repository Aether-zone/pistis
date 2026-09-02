import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 * Links a user to an organization. Following the convention set by `Password`,
 * the association is plain foreign-key columns rather than TypeORM relations.
 */
@Entity({
    name: 'organization_memberships'
})
@Index(['organizationId', 'userId'], { unique: true })
export class Membership {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({
        name: 'organization_id'
    })
    organizationId: string;

    @Index()
    @Column({
        name: 'user_id'
    })
    userId: string;

    @Column({
        name: 'role'
    })
    role: string;

    @CreateDateColumn({
        name: 'created_at'
    })
    createdAt: Date;

    @UpdateDateColumn({
        name: 'updated_at'
    })
    updatedAt: Date;
}
