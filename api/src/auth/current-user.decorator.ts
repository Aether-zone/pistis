import { createParamDecorator, ExecutionContext, InternalServerErrorException } from "@nestjs/common";
import { type UserDTO } from "@pistis/contract";

import { type SessionRequest } from "./session.guard";

/**
 * Injects the signed-in user, or one of its fields:
 *
 * ```ts
 * @UseGuards(SessionGuard)
 * @Get('/me')
 * me(@CurrentUser() user: UserDTO) { ... }
 * me(@CurrentUser('id') id: string) { ... }
 * ```
 *
 * Only `SessionGuard` (and `AdminGuard`, which builds on it) populates this.
 * Reaching for it on an unguarded route throws rather than yielding
 * `undefined` — a handler that believes it has a user and silently receives
 * nothing is how authorization checks end up passing by accident.
 *
 * This is the *application* session, not OAuth: an access token issued to a
 * third-party client does not satisfy `SessionGuard`, and the client
 * credentials grant has no user at all.
 */
export const CurrentUser = createParamDecorator(
    (property: keyof UserDTO | undefined, context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest<SessionRequest>();

        if (!request.user) {
            throw new InternalServerErrorException(
                '@CurrentUser() requires SessionGuard or AdminGuard on the route.'
            );
        }

        return property ? request.user[property] : request.user;
    }
);
