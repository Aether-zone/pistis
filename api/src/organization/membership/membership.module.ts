import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthorizationModule } from "../../authorization/authorization.module";
import { UserModule } from "../../user/user.module";
import { Organization } from "../organization";
import { Membership } from "./membership";
import { MembershipController } from "./membership.controller";
import { MembershipMapper } from "./membership.mapper";
import { MembershipService } from "./membership.service";

/**
 * Imported by `OrganizationModule`, and deliberately does not import it back —
 * the organization existence check goes through the repository instead, which
 * keeps the two from forming a cycle.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([Membership, Organization]),
        UserModule,
        forwardRef(() => AuthorizationModule)
    ],
    providers: [
        MembershipMapper,
        MembershipService
    ],
    controllers: [
        MembershipController
    ],
    exports: [
        MembershipService
    ]
})
export class MembershipModule { }
