import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserService } from "../user/user.service";
import { PasswordService } from "../user/password/password.service";
import { CredentialsDTO, type SessionDTO, UserDTO } from "@pistis/contract";
import { SessionService } from "./session.service";
import { User } from "../user/user";

@Injectable()
export class AuthService {

    constructor(
        private readonly userService: UserService,
        private readonly passwordService: PasswordService,
        private readonly sessionService: SessionService
    ) { }

    /** Signs someone in to this application and returns their session. */
    async login(credentials: CredentialsDTO): Promise<SessionDTO> {
        const user: UserDTO = await this.verifyCredentials(credentials);
        const entity: User | null = await this.userService.getEntityByEmail(user.email);

        return this.sessionService.issue(user, entity?.admin === true);
    }

    /**
     * Resolves credentials to the user they belong to. Every failure — unknown
     * email, no stored password, wrong password — surfaces as the same
     * `UnauthorizedException`, so callers cannot use the error to tell which
     * emails are registered.
     */
    async verifyCredentials(credentials: CredentialsDTO): Promise<UserDTO> {
        const user: UserDTO = await this.userService.getUserByUsername(credentials.username);

        const passwordMatch: boolean = await this.passwordService
            .checkPassword(credentials.password, user.id)
            .catch(() => false);

        if (!passwordMatch) {
            throw new UnauthorizedException(`Invalid credentials`);
        }

        return user;
    }
}
