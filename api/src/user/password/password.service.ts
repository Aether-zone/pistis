import { Injectable, NotFoundException } from "@nestjs/common";
import { Password } from "./password";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PasswordEncoder } from "./password.encoder";

@Injectable()
export class PasswordService {

    constructor(
        @InjectRepository(Password) private readonly passwordRepository: Repository<Password>,
        private readonly passwordEncoder: PasswordEncoder
    ) { }

    async getPassword(userId: string): Promise<string> {
        const password: Password = await this.loadPassword(userId);

        return password.password;
    }

    async storePassword(password: string, userId: string): Promise<boolean> {
        const entity: Password = new Password();
        entity.userId = userId;
        entity.password = await this.passwordEncoder.hash(password);

        const createdEntity: Password = await this.passwordRepository.save(entity);

        return createdEntity != null;
    }

    /** Sets or replaces the password for a user that may not have one yet. */
    async replacePassword(password: string, userId: string): Promise<void> {
        const existing: Password | null = await this.passwordRepository.findOneBy({ userId });

        if (!existing) {
            await this.storePassword(password, userId);

            return;
        }

        await this.passwordRepository.update(
            { id: existing.id },
            { password: await this.passwordEncoder.hash(password) }
        );
    }

    async checkPassword(raw: string, userId: string): Promise<boolean> {
        const password: Password = await this.loadPassword(userId);

        return this.passwordEncoder.compare(password.password, raw);
    }

    private async loadPassword(userId: string): Promise<Password> {
        return this.passwordRepository.findOneByOrFail({
            userId
        }).catch((err) => { throw new NotFoundException('Password not found') });
    }
}