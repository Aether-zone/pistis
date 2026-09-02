import { forwardRef, Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { MembershipModule } from "../organization/membership/membership.module";
import { CaslAbilityFactory } from "./casl-ability.factory";
import { PoliciesGuard } from "./policies.guard";

@Module({
    imports: [
        AuthModule,
        forwardRef(() => MembershipModule)
    ],
    providers: [
        CaslAbilityFactory,
        PoliciesGuard
    ],
    exports: [
        CaslAbilityFactory,
        PoliciesGuard,
        // Re-exported because `@UseGuards(PoliciesGuard)` instantiates the guard
        // in the *consuming* module's context, so SessionGuard has to be
        // resolvable there too.
        AuthModule
    ]
})
export class AuthorizationModule { }
