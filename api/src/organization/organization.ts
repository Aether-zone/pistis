import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({
    name: 'organizations'
})
export class Organization {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        name: 'name'
    })
    name: string;

    /** Stable URL-safe key; unique so it can address the organization. */
    @Index({ unique: true })
    @Column({
        name: 'slug'
    })
    slug: string;

    @Column({
        name: 'description',
        type: 'text',
        nullable: true
    })
    description: string | null;

    @CreateDateColumn({
        name: 'created_at'
    })
    createdAt: Date;

    @UpdateDateColumn({
        name: 'updated_at'
    })
    updatedAt: Date;
}
