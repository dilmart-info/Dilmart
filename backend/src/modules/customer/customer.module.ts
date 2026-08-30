import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";
import { CustomerController } from "./customer.controller";
import { CustomerService } from "./customer.service";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
