import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./categories.dto";
import { Roles } from "../../common/authz/roles.decorator";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get("admin-list")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getAdminList() {
    return this.categoriesService.getAdminCategories();
  }

  @Post()
  @Roles("super_admin", "admin")
  create(@Body() payload: CreateCategoryDto) {
    return this.categoriesService.createCategory(payload);
  }

  @Post(":id")
  @Roles("super_admin", "admin")
  update(@Param("id") id: string, @Body() payload: UpdateCategoryDto) {
    return this.categoriesService.updateCategory(id, payload);
  }

  @Delete(":id")
  @Roles("super_admin", "admin")
  delete(@Param("id") id: string) {
    return this.categoriesService.deleteCategory(id);
  }
}
