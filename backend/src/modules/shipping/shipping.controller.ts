import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ShippingService } from "./shipping.service";
import { Roles } from "../../common/authz/roles.decorator";
import { CreateDeliveryCompanyDto, UpdateDeliveryCompanyPolicyDto, UpsertDeliveryPriceDto } from "./shipping.dto";

@Controller("shipping")
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  /** Read-only — intentionally public for checkout delivery fee display. */
  @Get("companies")
  getCompanies() {
    return this.shippingService.getCompanies();
  }

  /** Admin-only: creating a new delivery company. */
  @Post("companies")
  @Roles("super_admin", "admin")
  createCompany(@Body() payload: CreateDeliveryCompanyDto) {
    return this.shippingService.createCompany(payload);
  }

  /** Read-only — intentionally public for checkout governorate list. */
  @Get("governorates")
  getGovernorates() {
    return this.shippingService.getGovernorates();
  }

  /** Read-only — regions (sub-areas) within a governorate; public for checkout. */
  @Get("regions")
  getRegions(@Query("governorate_id") governorateId?: string) {
    return this.shippingService.getRegions(governorateId);
  }

  /** Read-only — delivery prices; public for checkout fee calculation. */
  @Get("companies/:companyId/prices")
  getCompanyPrices(@Param("companyId") companyId: string) {
    return this.shippingService.getCompanyPrices(companyId);
  }

  /** Admin-only: configure delivery prices per company/governorate. */
  @Post("companies/:companyId/prices")
  @Roles("super_admin", "admin")
  upsertCompanyPrice(@Param("companyId") companyId: string, @Body() payload: UpsertDeliveryPriceDto) {
    return this.shippingService.upsertCompanyPrice(companyId, payload);
  }

  /** Admin-only: configure COD remittance policy for a delivery company. */
  @Post("companies/:companyId/policy")
  @Roles("super_admin", "admin")
  updateCompanyPolicy(@Param("companyId") companyId: string, @Body() payload: UpdateDeliveryCompanyPolicyDto) {
    return this.shippingService.updateCompanyPolicy(companyId, payload);
  }
}
