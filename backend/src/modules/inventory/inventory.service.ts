import { ForbiddenException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { AdjustInventoryDto, GetInventoryQueryDto } from "./inventory.dto";

@Injectable()
export class InventoryService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}



  async listInventory(query: GetInventoryQueryDto & { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(query.merchant_id, query.actor_role, query.actor_id);
    let req = this.supabaseAdmin.client
      .from("products")
      .select("id,name,stock,low_stock_threshold,merchant_id,merchants(id,display_name,slug)")
      .order("created_at", { ascending: false });

    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    if (query.search?.trim()) req = req.ilike("name", `%${query.search.trim()}%`);

    const { data, error } = await req;
    if (error) throw error;
    return data ?? [];
  }

  async adjustInventory(payload: AdjustInventoryDto & { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, payload.actor_role, payload.actor_id);
    const { data: product, error: loadError } = await this.supabaseAdmin.client
      .from("products")
      .select("id,stock,merchant_id")
      .eq("id", payload.product_id)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!product) throw new Error("Product not found.");
    if (resolvedMerchantId && (product as any).merchant_id !== resolvedMerchantId) {
      throw new Error("Product is outside merchant scope.");
    }

    const currentStock = Number((product as any).stock ?? 0);
    const nextStock = Math.max(0, currentStock + payload.delta);

    const { error } = await this.supabaseAdmin.client
      .from("products")
      .update({ stock: nextStock } as any)
      .eq("id", payload.product_id);

    if (error) throw error;

    return { ok: true, stock: nextStock };
  }
}
