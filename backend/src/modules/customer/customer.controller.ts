import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { GetCustomerOrdersQueryDto, UpdateCustomerProfileDto, UpsertCustomerAddressDto } from "./customer.dto";
import { CustomerService } from "./customer.service";

@Controller("customer")
@Roles("authenticated")
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get("profile")
  getProfile(@CurrentActor() actor: { actorId?: string }) {
    return this.customerService.getProfile(actor?.actorId);
  }

  @Patch("profile")
  updateProfile(@CurrentActor() actor: { actorId?: string }, @Body() payload?: UpdateCustomerProfileDto) {
    return this.customerService.updateProfile(actor?.actorId, payload);
  }

  @Get("addresses")
  listAddresses(@CurrentActor() actor: { actorId?: string }) {
    return this.customerService.listAddresses(actor?.actorId);
  }

  @Post("addresses")
  createAddress(@CurrentActor() actor: { actorId?: string }, @Body() payload?: UpsertCustomerAddressDto) {
    return this.customerService.createAddress(actor?.actorId, payload);
  }

  @Patch("addresses/:id")
  updateAddress(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }, @Body() payload: UpsertCustomerAddressDto) {
    return this.customerService.updateAddress(actor?.actorId, id, payload);
  }

  @Delete("addresses/:id")
  deleteAddress(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.deleteAddress(actor?.actorId, id);
  }

  @Post("addresses/:id/set-default")
  setDefaultAddress(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.setDefaultAddress(actor?.actorId, id);
  }

  @Get("orders")
  listOrders(@CurrentActor() actor: { actorId?: string }, @Query() query: GetCustomerOrdersQueryDto) {
    return this.customerService.listOrders(actor?.actorId, query.limit ? Number(query.limit) : undefined);
  }

  @Get("orders/:id")
  getOrderDetail(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.getOrderDetail(actor?.actorId, id);
  }

  @Post("orders/:id/reorder-preview")
  reorderPreview(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.getReorderPreview(actor?.actorId, id);
  }
}

