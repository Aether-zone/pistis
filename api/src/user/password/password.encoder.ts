import { Injectable } from "@nestjs/common";
import { compare, hash } from 'bcrypt';

@Injectable()
export class PasswordEncoder {

    private readonly rounds: number = 12;

    compare(hashed: string, raw: string): Promise<boolean> {
        return compare(raw, hashed)
    }

    hash(raw: string): Promise<string> {
        return hash(raw, this.rounds);
    }
}