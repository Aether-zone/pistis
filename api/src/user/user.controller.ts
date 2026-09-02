import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { UserService } from "./user.service";
import { type CreateUserDTO, type UserDTO, type PageRequestDTO, Pageable } from "@pistis/contract";

@Controller('/users')
export class UserController {

    constructor(
        private readonly userService: UserService
    ) { }

    @Get()
    getUsers(
        @Param() pageRequest: PageRequestDTO
    ): Promise<Pageable<UserDTO>> {
        return this.userService.getUsers(pageRequest);
    }

    @Get('/:id')
    getUser(
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<UserDTO> {
        return this.userService.getUser(id);
    }

    @Post()
    createUser(
        @Body() user: CreateUserDTO
    ): Promise<UserDTO> {
        return this.userService.createUser(user);
    }

    @Put('/:id')
    updateUser(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() user: CreateUserDTO
    ): Promise<UserDTO> {
        return this.userService.updateUser(user, id);
    }

    @Delete('/:id')
    deleteUser(
        @Param('id', ParseUUIDPipe) id: string
    ): Promise<boolean> {
        return this.userService.deleteUser(id);
    }
}