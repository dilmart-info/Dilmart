import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { ListProductsQueryDto, ProductScopeQueryDto, UpsertProductDto } from "./products.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  list(
    @Query() query: ListProductsQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productsService.listProducts({
      merchant_id: query?.merchant_id,
      search: query?.search,
      offset: query?.offset,
      limit: query?.limit,
      page: query?.page,
      readiness: query?.readiness,
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Get(":id")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getById(
    @Param("id") id: string,
    @Query() query: ProductScopeQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productsService.getProductById(id, { ...query, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post()
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  create(@Body() payload: UpsertProductDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.productsService.createProduct(payload, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post(":id")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  update(
    @Param("id") id: string,
    @Body() payload: UpsertProductDto,
    @Query() query: ProductScopeQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productsService.updateProduct(id, payload, { ...query, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post(":id/status")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  updateStatus(
    @Param("id") id: string,
    @Body() payload: { is_active: boolean; merchant_id?: string },
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.productsService.updateProductStatus(id, { ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }
}
