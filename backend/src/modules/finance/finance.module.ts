import { Module } from "@nestjs/common";
import { CommercialEngineService } from "./commercial-engine.service";
import { CourierFinanceService } from "./courier-finance.service";
import { OrderFinanceService } from "./order-finance.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";

@Module({
  imports: [SupabaseAdminModule],
  providers: [OrderFinanceService, CourierFinanceService, CommercialEngineService],
  exports: [OrderFinanceService, CourierFinanceService, CommercialEngineService],
})
export class FinanceModule {}
