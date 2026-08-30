import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { WhatsAppIntentsController } from "./whatsapp-intents.controller";
import { WhatsAppIntentsService } from "./whatsapp-intents.service";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [WhatsAppIntentsController],
  providers: [WhatsAppIntentsService],
  exports: [WhatsAppIntentsService],
})
export class WhatsAppIntentsModule {}
