import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type UserDTO } from "@pistis/contract";

import { SessionGuard, type SessionRequest } from "../auth/session.guard";
import { MembershipService } from "../organization/membership/membership.service";
import { type AppAbility, CaslAbilityFactory } from "./casl-ability.factory";

export type PolicyHandler = (ability: AppAbility, request: SessionRequest) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

/**
 * Attaches policy checks to a route, as in the Nest authorization guide:
 *
 * ```ts
 * @CheckPolicies((ability, request) =>
 *   ability.can(Action.Update, subject(Organization, { id: request.params.id })))
 * ```
 */
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
    SetMetadata(CHECK_POLICIES_KEY, handlers);

/** A request whose ability has been built. */
export interface AuthorizedRequest extends SessionRequest {
    ability?: AppAbility;
}

@Injectable()
export class PoliciesGuard implements CanActivate {

    constructor(
        private readonly reflector: Reflector,
        private readonly sessionGuard: SessionGuard,
        private readonly membershipService: MembershipService,
        private readonly caslAbilityFactory: CaslAbilityFactory
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        await this.sessionGuard.canActivate(context);

        const request = context.switchToHttp().getRequest<AuthorizedRequest>();
        const user: UserDTO = request.user as UserDTO;

        const ability: AppAbility = this.caslAbilityFactory.createForUser(
            user,
            await this.membershipService.getRolesOf(user.id),
            request.session?.admin === true
        );

        // Exposed so handlers and services can ask further questions of it.
        request.ability = ability;

        const handlers: PolicyHandler[] = this.reflector.get<PolicyHandler[]>(
            CHECK_POLICIES_KEY,
            context.getHandler()
        ) ?? [];

        const allowed: boolean = handlers.every(
            (handler) => handler(ability, request)
        );

        if (!allowed) {
            throw new ForbiddenException(
                'You do not have permission to do that.'
            );
        }

        return true;
    }
}
