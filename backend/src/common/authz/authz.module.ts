/**
 * STORE-PR5 — Authorization module. Provides the extracted Supabase actor resolver and the dual
 * actor resolver so the global RolesGuard (registered as APP_GUARD in AppModule) can compose the
 * Supabase and federated identity paths. Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.4/§9.5.
 */
import { Module } from "@nestjs/common";
import { SupabaseAdminModule } from "../../modules/supabase-admin/supabase-admin.module";
import { FederatedAuthModule } from "../../modules/auth/federated/federated-auth.module";
import { SupabaseActorResolverService } from "./supabase-actor-resolver.service";
import { DualActorResolverService } from "./dual-actor-resolver.service";

@Module({
  imports: [SupabaseAdminModule, FederatedAuthModule],
  providers: [SupabaseActorResolverService, DualActorResolverService],
  exports: [SupabaseActorResolverService, DualActorResolverService],
})
export class AuthzModule {}
