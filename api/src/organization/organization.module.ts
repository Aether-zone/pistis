import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "./organization";
import { OrganizationController } from "./organization.controller";
import { OrganizationMapper } from "./organization.mapper";
import { OrganizationService } from "./organization.service";
import { MembershipModule } from "./membership/membership.module";
import { AuthorizationModule } from "../authorization/authorization.module";

@Module({
    imports: [
        TypeOrmModule.forFeature([Organization]),
        MembershipModule,
        AuthorizationModule
    ],
    providers: [
        OrganizationMapper,
        OrganizationService
    ],
    controllers: [
        OrganizationController
    ],
    exports: [
        OrganizationService,
        MembershipModule
    ]
})
export class OrganizationModule { }
