import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";
import { MarketplaceBannersService } from "./marketplace-banners.service";
import { WhatsAppIntentsModule } from "../whatsapp-intents/whatsapp-intents.module";
import { StoreIntegrationModule } from "../store-integration/store-integration.module";
import { CustomerEntryController } from "./customer-entry/customer-entry.controller";
import { CustomerEntryService } from "./customer-entry/customer-entry.service";

@Module({
  imports: [SupabaseAdminModule, WhatsAppIntentsModule, StoreIntegrationModule],
  controllers: [MarketplaceController, CustomerEntryController],
  providers: [MarketplaceService, MarketplaceBannersService, CustomerEntryService],
  exports: [MarketplaceService, MarketplaceBannersService],
})
export class MarketplaceModule {}
