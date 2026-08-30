import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { ShippingModule } from "../shipping/shipping.module";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { JenniAuthService } from "./jenni-auth.service";
import { JenniClientService } from "./jenni-client.service";
import { JenniDispatchService } from "./jenni-dispatch.service";
import { JenniPricingService } from "./jenni-pricing.service";
import { JenniReferenceSyncService } from "./jenni-reference-sync.service";
import { JenniStoreProvisioningService } from "./jenni-store-provisioning.service";
import { JenniMerchantProvisioningService } from "./jenni-merchant-provisioning.service";
import { JenniStickerService } from "./jenni-sticker.service";
import { JenniSyncService } from "./jenni-sync.service";
import { JenniWebhookController } from "./jenni-webhook.controller";
import { JenniWebhookIngressService } from "./jenni-webhook-ingress.service";

@Module({
  imports: [SupabaseAdminModule, FinanceModule, ShippingModule],
  controllers: [JenniWebhookController],
  providers: [
    JenniAuthService,
    JenniClientService,
    JenniDispatchService,
    JenniStickerService,
    JenniSyncService,
    JenniReferenceSyncService,
    JenniPricingService,
    JenniWebhookIngressService,
    JenniStoreProvisioningService,
    JenniMerchantProvisioningService,
  ],
  exports: [
    JenniAuthService,
    JenniDispatchService,
    JenniStickerService,
    JenniSyncService,
    JenniReferenceSyncService,
    JenniPricingService,
    JenniClientService,
    JenniWebhookIngressService,
    JenniStoreProvisioningService,
    JenniMerchantProvisioningService,
  ],
})
export class JenniModule {}
