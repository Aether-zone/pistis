import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({
    name: 'passwords'
})
export class Password {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        name: 'password'
    })
    password: string;

    @Column({
        name: 'user_id'
    })
    userId: string;
}