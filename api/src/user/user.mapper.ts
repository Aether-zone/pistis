import { Injectable } from "@nestjs/common";
import { CreateUserDTO, UserDTO } from "@pistis/contract";
import { User } from "./user";

@Injectable()
export class UserMapper {

    toDTO(entity: User): UserDTO {
        return {
            id: entity.id,
            name: entity.name,
            email: entity.email,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt
        }
    }

    toEntity(user: CreateUserDTO): User {
        const entity: User = new User();

        this.mapEntity(user, entity);

        return entity;
    }

    mapEntity(user: CreateUserDTO, entity: User) {
        entity.name = user.name;
        entity.email = user.email;
    }
}