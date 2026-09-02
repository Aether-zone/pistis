import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { type CredentialsDTO, type SessionDTO, type UserDTO } from "@pistis/contract";
import { CurrentUser } from "./current-user.decorator";
import { SessionGuard, type SessionRequest } from "./session.guard";

@Controller('/auth')
export class AuthController {

    constructor(
        private readonly authService: AuthService
    ) { }

    /**
     * Who the caller is signed in as; 401 if the session is not usable. The
     * admin flag comes from the session rather than the user record, which is
     * what every guard actually reads.
     */
    @Get('/me')
    @UseGuards(SessionGuard)
    me(
        @CurrentUser() user: UserDTO,
        @Req() request: SessionRequest
    ): UserDTO & { admin: boolean } {
        return { ...user, admin: request.session?.admin === true };
    }

    @Post()
    @HttpCode(200)
    async login(
        @Body() credentials: CredentialsDTO
    ): Promise<SessionDTO> {
        return this.authService.login(credentials);
    }
}