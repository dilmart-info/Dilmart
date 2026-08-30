import { Controller, Get, Query } from "@nestjs/common";
import { UsersService } from "./users.service";
import { Roles } from "../../common/authz/roles.decorator";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles("super_admin", "admin")
  listUsers(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.usersService.listUsers({
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
