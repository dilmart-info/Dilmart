import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Patch, UsePipes, ValidationPipe } from "@nestjs/common";
import { MerchantsService } from "./merchants.service";
import { Roles } from "../../common/authz/roles.decorator";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import {
  AssignMerchantOwnerDto,
  CreateMerchantDto,
  GetMerchantSettingsQueryDto,
  ListMerchantCustomersQueryDto,
  MerchantFinanceStatementQueryDto,
  MerchantPayoutHistoryQueryDto,
  UpdateMerchantDto,
  UpdateMerchantStatusDto,
  UpsertMerchantSettingsDto,
  UpdateMerchantRegistrationDetailsDto,
} from "./merchants.dto";


@Controller("merchants")
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get("active")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getActiveMerchants() {
    return this.merchantsService.getActiveMerchants();
  }

  @Get("storefront-default")
  getStorefrontDefault(@Query("default_slug") defaultSlug?: string) {
    return this.merchantsService.getStorefrontDefaultMerchant(defaultSlug);
  }

  @Get("active-by-slug")
  getActiveBySlug(@Query("slug") slug: string) {
    return this.merchantsService.getActiveMerchantBySlug(slug);
  }

  @Get()
  @Roles("super_admin", "admin")
  getAllMerchants() {
    return this.merchantsService.getAllMerchants();
  }

  @Get("settings")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getSettings(@Query() query: GetMerchantSettingsQueryDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.merchantsService.getMerchantSettings(query.merchant_id, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Post("settings")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager")
  upsertSettings(@Body() payload: UpsertMerchantSettingsDto, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.merchantsService.upsertMerchantSettings(payload, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get(":id")
  @Roles("super_admin", "admin")
  getMerchantById(@Param("id") id: string) {
    return this.merchantsService.getMerchantById(id);
  }

  @Post()
  @Roles("super_admin", "admin")
  createMerchant(@Body() payload: CreateMerchantDto) {
    return this.merchantsService.createMerchant(payload);
  }

  @Post(":id")
  @Roles("super_admin", "admin")
  updateMerchant(@Param("id") id: string, @Body() payload: UpdateMerchantDto) {
    return this.merchantsService.updateMerchant(id, payload);
  }

  @Post(":id/status")
  @Roles("super_admin", "admin")
  updateMerchantStatus(@Param("id") id: string, @Body() payload: UpdateMerchantStatusDto) {
    return this.merchantsService.updateMerchantStatus(id, payload);
  }

  @Post(":id/assign-owner")
  @Roles("super_admin", "admin")
  assignOwner(@Param("id") id: string, @Body() payload: AssignMerchantOwnerDto) {
    return this.merchantsService.assignMerchantOwner(id, payload);
  }

  @Get(":id/dashboard-stats")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getDashboardStats(@Param("id") id: string, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.merchantsService.getMerchantDashboardStats(id, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get(":id/readiness")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getReadiness(@Param("id") id: string, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.merchantsService.getMerchantReadiness(id, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get(":id/performance-scorecard")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getPerformanceScorecard(@Param("id") id: string, @CurrentActor() actor?: { actorRole?: string; actorId?: string }) {
    return this.merchantsService.getMerchantPerformanceScorecard(id, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get(":id/finance/summary")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getFinanceSummary(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.merchantsService.getMerchantFinanceSummary(id, { actor_role: actor?.actorRole, actor_id: actor?.actorId });
  }

  @Get(":id/finance/statement")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  getFinanceStatement(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: MerchantFinanceStatementQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.merchantsService.listMerchantStatementEntries(
      id,
      { actor_role: actor?.actorRole, actor_id: actor?.actorId },
      query,
    );
  }

  @Get(":id/finance/payout-history")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  getPayoutHistory(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: MerchantPayoutHistoryQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.merchantsService.listMerchantPayoutHistory(
      id,
      { actor_role: actor?.actorRole, actor_id: actor?.actorId },
      query,
    );
  }


  @Get(":id/customers")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  listCustomers(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query() query: ListMerchantCustomersQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.merchantsService.listMerchantCustomers(
      id,
      { actor_role: actor?.actorRole, actor_id: actor?.actorId },
      query,
    );
  }

  @Patch(":id/registration-details")
  @Roles("super_admin", "admin")
  @UsePipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }))
  updateMerchantRegistrationDetails(
    @Param("id") id: string,
    @Body() payload: UpdateMerchantRegistrationDetailsDto,
  ) {
    return this.merchantsService.updateMerchantRegistrationDetails(id, payload);
  }
}
