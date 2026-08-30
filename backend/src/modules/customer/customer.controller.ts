import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { AuthSources } from "../../common/authz/auth-source";
import { GetCustomerOrdersQueryDto, UpdateCustomerProfileDto, UpsertCustomerAddressDto } from "./customer.dto";
import { CustomerService } from "./customer.service";

// STORE-PR5 (spec §9.4/§9.5): the customer profile/address/order surface is DUAL_CUSTOMER — it accepts
// either a direct Supabase customer or a DilMart federated customer. Ownership is enforced per-handler
// from the verified actorId (never a body/query customer id) in CustomerService.
//
// STORE-PR5 Blocker 1: NO class-level @AuthSources. Federated access is declared on EACH approved
// handler individually so every federated-enabled route is visible and reviewable in isolation, and a
// newly added handler is Supabase-only until it is explicitly (and reviewably) classified.
@Controller("customer")
@Roles("authenticated")
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get("profile")
  @AuthSources("supabase", "DilMart_federated")
  getProfile(@CurrentActor() actor: { actorId?: string }) {
    return this.customerService.getProfile(actor?.actorId);
  }

  @Patch("profile")
  @AuthSources("supabase", "DilMart_federated")
  updateProfile(@CurrentActor() actor: { actorId?: string }, @Body() payload?: UpdateCustomerProfileDto) {
    return this.customerService.updateProfile(actor?.actorId, payload);
  }

  @Get("addresses")
  @AuthSources("supabase", "DilMart_federated")
  listAddresses(@CurrentActor() actor: { actorId?: string }) {
    return this.customerService.listAddresses(actor?.actorId);
  }

  @Post("addresses")
  @AuthSources("supabase", "DilMart_federated")
  createAddress(@CurrentActor() actor: { actorId?: string }, @Body() payload?: UpsertCustomerAddressDto) {
    return this.customerService.createAddress(actor?.actorId, payload);
  }

  @Patch("addresses/:id")
  @AuthSources("supabase", "DilMart_federated")
  updateAddress(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }, @Body() payload: UpsertCustomerAddressDto) {
    return this.customerService.updateAddress(actor?.actorId, id, payload);
  }

  @Delete("addresses/:id")
  @AuthSources("supabase", "DilMart_federated")
  deleteAddress(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.deleteAddress(actor?.actorId, id);
  }

  @Post("addresses/:id/set-default")
  @AuthSources("supabase", "DilMart_federated")
  setDefaultAddress(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.setDefaultAddress(actor?.actorId, id);
  }

  @Get("orders")
  @AuthSources("supabase", "DilMart_federated")
  listOrders(@CurrentActor() actor: { actorId?: string }, @Query() query: GetCustomerOrdersQueryDto) {
    return this.customerService.listOrders(actor?.actorId, query.limit ? Number(query.limit) : undefined);
  }

  @Get("orders/:id")
  @AuthSources("supabase", "DilMart_federated")
  getOrderDetail(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.getOrderDetail(actor?.actorId, id);
  }

  @Post("orders/:id/reorder-preview")
  @AuthSources("supabase", "DilMart_federated")
  reorderPreview(@Param("id") id: string, @CurrentActor() actor: { actorId?: string }) {
    return this.customerService.getReorderPreview(actor?.actorId, id);
  }
}
