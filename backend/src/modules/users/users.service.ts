import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { sanitizeSearchTerm, buildSafeOrFilter } from "../../common/search-utils";

@Injectable()
export class UsersService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async listUsers(params: { search?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Number(params.limit ?? 50), 200);
    const offset = Math.max(0, Number(params.offset ?? 0));

    let query = this.supabaseAdmin.client
      .from("profiles")
      .select("id, full_name, phone, email, role, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const escaped = sanitizeSearchTerm(params.search);
    if (escaped) {
      query = query.or(buildSafeOrFilter(escaped, ["full_name", "email", "phone"]));
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { users: data ?? [], total: count ?? 0, limit, offset };
  }
}
