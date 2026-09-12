import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import {
    createAdminUserSchema,
    createClientSchema,
    setPasswordSchema,
    updateClientSchema,
    type AdminClientDTO,
    type AdminTokenDTO,
    type AdminUserDTO,
    type ClientSecretDTO,
    type CreateAdminUserDTO,
    type CreateClientDTO,
    type SetPasswordDTO,
    type UpdateClientDTO
} from "@pistis/contract";

import { SchemaValidationPipe } from "../common/schema-validation.pipe";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

/** Management API. Every route requires an admin session (see `AdminGuard`). */
@Controller('/admin')
@UseGuards(AdminGuard)
export class AdminController {

    constructor(private readonly adminService: AdminService) { }

    @Get('/clients')
    listClients(): Promise<AdminClientDTO[]> {
        return this.adminService.listClients();
    }

    @Post('/clients')
    createClient(
        @Body(new SchemaValidationPipe(createClientSchema)) request: CreateClientDTO
    ): Promise<ClientSecretDTO> {
        return this.adminService.createClient(request);
    }

    /**
     * Changes a client. `PATCH` rather than `PUT`: every field is optional and
     * absent means "leave it", which is not what a replace says.
     */
    @Patch('/clients/:clientId')
    updateClient(
        @Param('clientId') clientId: string,
        @Body(new SchemaValidationPipe(updateClientSchema)) request: UpdateClientDTO
    ): Promise<AdminClientDTO> {
        return this.adminService.updateClient(clientId, request);
    }

    @Post('/clients/:clientId/secret')
    @HttpCode(200)
    rotateSecret(@Param('clientId') clientId: string): Promise<ClientSecretDTO> {
        return this.adminService.rotateClientSecret(clientId);
    }

    @Delete('/clients/:clientId')
    @HttpCode(204)
    deleteClient(@Param('clientId') clientId: string): Promise<void> {
        return this.adminService.deleteClient(clientId);
    }

    @Get('/users')
    listUsers(): Promise<AdminUserDTO[]> {
        return this.adminService.listUsers();
    }

    @Post('/users')
    createUser(
        @Body(new SchemaValidationPipe(createAdminUserSchema)) request: CreateAdminUserDTO
    ): Promise<AdminUserDTO> {
        return this.adminService.createUser(request);
    }

    @Post('/users/:id/password')
    @HttpCode(204)
    async setPassword(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new SchemaValidationPipe(setPasswordSchema)) request: SetPasswordDTO
    ): Promise<void> {
        return this.adminService.setPassword(id, request.password);
    }

    @Get('/tokens')
    listTokens(): Promise<AdminTokenDTO[]> {
        return this.adminService.listTokens();
    }

    @Delete('/tokens/:kind/:id')
    @HttpCode(204)
    revokeToken(
        @Param('kind') kind: string,
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<void> {
        return this.adminService.revokeToken(
            kind === 'refresh' ? 'refresh' : 'access',
            id
        );
    }
}
