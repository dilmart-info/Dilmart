import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { SupabaseAdminModule } from "../supabase-admin/supabase-admin.module";

@Module({
  imports: [SupabaseAdminModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

