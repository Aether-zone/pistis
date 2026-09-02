import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { type SessionClaimsDTO, type UserDTO } from "@pistis/contract";

import { type HttpRequest } from "../oauth/http";
import { UserService } from "../user/user.service";
import { SessionService } from "./session.service";

/** A request that `SessionGuard` has resolved an identity for. */
export interface SessionRequest extends HttpRequest {
    session?: SessionClaimsDTO;
    user?: UserDTO;
}

/**
 * Establishes who is making the request, and is what `@CurrentUser()` reads.
 *
 * The user is loaded rather than reconstructed from the token's claims. That
 * costs a query, and buys the guarantee the claims cannot give: a session
 * belonging to a user who has since been deleted stops working immediately,
 * instead of staying valid until the token expires.
 */
@Injectable()
export class SessionGuard implements CanActivate {

    constructor(
        private readonly sessionService: SessionService,
        private readonly userService: UserService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<SessionRequest>();
        const header: string = typeof request.headers.authorization === 'string'
            ? request.headers.authorization
            : '';
        const [scheme, token] = header.split(' ');

        if (scheme?.toLowerCase() !== 'bearer' || !token) {
            throw new UnauthorizedException('A session token is required.');
        }

        // SessionService reports failures as OAuth errors because it shares the
        // JWT machinery; sessions are not OAuth, so they are restated as
        // ordinary 401s that render the same way on every controller.
        let claims: SessionClaimsDTO;

        try {
            claims = this.sessionService.verify(token);
        } catch {
            throw new UnauthorizedException('The session token is not valid.');
        }

        const user: UserDTO | null = await this.userService
            .getUser(claims.sub)
            .catch(() => null);

        if (!user) {
            throw new UnauthorizedException('The signed-in account no longer exists.');
        }

        request.session = claims;
        request.user = user;

        return true;
    }
}
