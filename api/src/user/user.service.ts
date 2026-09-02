import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { User } from "./user";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { CreateUserDTO, Pageable, PageRequestDTO, UserDTO } from "@pistis/contract";
import { UserMapper } from "./user.mapper";

@Injectable()
export class UserService {

    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        private readonly userMapper: UserMapper
    ) { }

    async getUsers(pageRequest: PageRequestDTO): Promise<Pageable<UserDTO>> {
        const [users, totalNumberOfElements] = await this.userRepository
            .findAndCount({
                skip: (pageRequest.pageNumber * pageRequest.perPage),
                take: pageRequest.perPage
            });

        return Pageable.of(users, totalNumberOfElements, pageRequest);
    }

    async getUser(id: string): Promise<UserDTO> {
        const user: User = await this.loadUser(id);

        return this.userMapper.toDTO(user);
    }

    /** Entity access for callers that need fields the DTO deliberately omits. */
    async getEntityByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOneBy({ email });
    }

    /** Batch lookup, so callers resolving many users at once need one query. */
    async getUsersByIds(ids: string[]): Promise<UserDTO[]> {
        if (ids.length === 0) {
            return [];
        }

        const users: User[] = await this.userRepository.findBy({ id: In(ids) });

        return users.map((user) => this.userMapper.toDTO(user));
    }

    async listAll(): Promise<User[]> {
        return this.userRepository.find({ order: { createdAt: 'ASC' } });
    }

    async setAdmin(id: string, admin: boolean): Promise<void> {
        await this.userRepository.update({ id }, { admin });
    }

    async getUserByUsername(username: string): Promise<UserDTO> {
        const user: User | null = await this.userRepository.findOneBy({
            email: username
        });

        if (!user) {
            throw new UnauthorizedException(`Invalid credentials`);
        }

        return this.userMapper.toDTO(user);
    }

    async createUser(user: CreateUserDTO): Promise<UserDTO> {
        const entity: User = this.userMapper.toEntity(user);

        const createdEntity: User = await this.userRepository.save(entity);


        return this.userMapper.toDTO(createdEntity);
    }

    async updateUser(user: CreateUserDTO, id: string): Promise<UserDTO> {
        const entity: User = await this.loadUser(id);

        this.userMapper.mapEntity(user, entity);

        const updatedEntity: User = await this.userRepository.save(
            entity
        )

        return this.userMapper.toDTO(updatedEntity);
    }

    async deleteUser(id: string): Promise<boolean> {
        const result = await this.userRepository.delete({
            id
        });

        return result.affected === 1;
    }

    private loadUser(id: string): Promise<User> {
        return this.userRepository.findOneByOrFail({
            id
        }).catch((err) => {
            throw new NotFoundException(`User with id "${id}" not found.`)
        })
    }
}