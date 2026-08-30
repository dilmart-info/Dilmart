import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { AdjustInventoryDto, GetInventoryQueryDto } from "./inventory.dto";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";

@Controller("inventory")
@Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list(@Query() query: GetInventoryQueryDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.inventoryService.listInventory({ ...query, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post("adjust")
  adjust(@Body() payload: AdjustInventoryDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.inventoryService.adjustInventory({ ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }
}
