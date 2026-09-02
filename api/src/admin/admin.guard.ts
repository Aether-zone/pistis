import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import { SessionGuard, type SessionRequest } from "../auth/session.guard";

/**
 * Requires a valid session belonging to an admin.
 *
 * Delegates to `SessionGuard` so the two agree on what a session is and both
 * populate `@CurrentUser()`. The token must be a session token specifically —
 * `SessionService.verify` pins the JWT `typ`, so an OAuth access token obtained
 * by any registered client cannot be used to reach the management API.
 */
@Injectable()
export class AdminGuard implements CanActivate {

    constructor(private readonly sessionGuard: SessionGuard) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        await this.sessionGuard.canActivate(context);

        const request = context.switchToHttp().getRequest<SessionRequest>();

        if (request.session?.admin !== true) {
            throw new ForbiddenException('This account is not an administrator.');
        }

        return true;
    }
}
