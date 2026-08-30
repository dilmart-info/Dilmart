import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentActor } from "../../common/authz/actor-context.decorator";
import { Roles } from "../../common/authz/roles.decorator";
import { CreateWhatsAppIntentDto, MerchantIntentMetricsQueryDto, ResolveWhatsAppIntentQueryDto } from "./whatsapp-intents.dto";
import { WhatsAppIntentsService } from "./whatsapp-intents.service";

@Controller("whatsapp-intents")
export class WhatsAppIntentsController {
  constructor(private readonly whatsAppIntentsService: WhatsAppIntentsService) {}

  @Post()
  create(@Body() payload: CreateWhatsAppIntentDto) {
    return this.whatsAppIntentsService.createIntent(payload);
  }

  @Post(":id/opened")
  markOpened(@Param("id") id: string) {
    return this.whatsAppIntentsService.markOpened(id);
  }

  @Get("merchant-metrics")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getMerchantMetrics(
    @Query() query: MerchantIntentMetricsQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.whatsAppIntentsService
      .resolveMetricsMerchantScope(query.merchant_id, actor)
      .then((merchantId) => this.whatsAppIntentsService.getMerchantComplianceMetrics(merchantId));
  }

  @Get("resolve")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  resolveByToken(
    @Query() query: ResolveWhatsAppIntentQueryDto,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.whatsAppIntentsService.resolveIntentByToken(query.intent_token, actor);
  }
}
