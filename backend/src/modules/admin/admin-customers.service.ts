import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { sanitizeSearchTerm, buildSafeOrFilter } from "../../common/search-utils";

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  async getScopedCustomers(params: {
    merchant_id?: string;
    search?: string;
    actor_role?: string;
    actor_id?: string;
    page?: number;
    limit?: number;
  }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(params.merchant_id, params.actor_role, params.actor_id);

    // ── Platform/admin path: profiles table with pagination ──
    if (!resolvedMerchantId) {
      const page = Math.max(1, Math.floor(Number(params.page ?? 1)));
      const limit = Math.min(Math.max(1, Math.floor(Number(params.limit ?? 50))), 200);
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let req = this.supabaseAdmin.client
        .from("profiles")
        .select("id, full_name, email, phone, role, created_at", { count: "exact" })
        .in("role", ["customer", "user"])
        .order("created_at", { ascending: false });

      const escaped = sanitizeSearchTerm(params.search);
      if (escaped) {
        req = req.or(buildSafeOrFilter(escaped, ["full_name", "email", "phone"]));
      }

      req = req.range(from, to);
      const { data, error, count } = await req;
      if (error) throw error;

      const total = count ?? 0;
      return {
        items: data ?? [],
        page,
        limit,
        total,
        hasMore: from + limit < total,
      };
    }

    // ── Merchant path: SQL RPC — aggregation + privacy masking in DB ──
    const rpcLimit = Math.min(Math.max(1, Math.floor(Number(params.limit ?? 50))), 200);
    const rpcPage = Math.max(1, Math.floor(Number(params.page ?? 1)));
    const rpcOffset = (rpcPage - 1) * rpcLimit;

    const { data, error } = await this.supabaseAdmin.client.rpc("merchant_customer_summary", {
      p_merchant_id: resolvedMerchantId,
      p_search: sanitizeSearchTerm(params.search) || null,
      p_limit: rpcLimit,
      p_offset: rpcOffset,
    });
    if (error) throw error;

    const result = data as {
      items: Array<{ customer_ref: string; phone_masked: string; orders: number; spent: number; last_order_at: string }>;
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };

    return {
      items: result.items ?? [],
      page: rpcPage,
      limit: rpcLimit,
      total: result.total ?? 0,
      hasMore: result.has_more ?? false,
    };
  }
}
