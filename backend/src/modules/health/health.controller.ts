import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { Roles } from "../../common/authz/roles.decorator";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  /** Render health-check endpoint — public, skip throttle. */
  @Get()
  @SkipThrottle()
  check() {
    return { ok: true, service: "DilMart-store-backend" };
  }

  /** Safe public probe: compare `supabaseProjectRef` with frontend `VITE_SUPABASE_URL` host. */
  @Get("config-public")
  @SkipThrottle()
  configPublic() {
    return {
      ok: true,
      supabaseProjectRef: this.supabaseAdmin.projectRef || null,
      supabaseUrlConfigured: Boolean(this.configService.get<string>("SUPABASE_URL")),
    };
  }

  /**
   * DB connectivity probe — admin-only, throttled.
   * No error details exposed; returns only `ok` boolean.
   * Note: endpoint path kept as "db-public" for backward compatibility,
   * but it is no longer publicly accessible.
   */
  @Get("db-public")
  @Roles("super_admin", "admin")
  async dbPublic() {
    const probe = await this.supabaseAdmin.probeDatabase();
    return {
      ok: probe.ok,
      supabaseProjectRef: this.supabaseAdmin.projectRef || null,
    };
  }
}
