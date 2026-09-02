import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({
    name: 'users'
})
export class User {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        name: 'name'
    })
    name: string;

    @Column({
        name: 'email'
    })
    email: string;

    /** Grants access to the management API; nothing else looks at it. */
    @Column({
        name: 'admin',
        type: 'boolean',
        default: false
    })
    admin: boolean;

    @CreateDateColumn({
        name: 'created_at'
    })
    createdAt: Date;

    @UpdateDateColumn({
        name: 'udpated_at'
    })
    updatedAt: Date;

}