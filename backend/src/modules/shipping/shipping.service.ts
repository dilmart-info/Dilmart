import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { CreateDeliveryCompanyDto, UpdateDeliveryCompanyPolicyDto, UpsertDeliveryPriceDto } from "./shipping.dto";

@Injectable()
export class ShippingService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private async getJenniCompanyId(): Promise<string | null> {
    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("id")
      .eq("provider_code", "jenni")
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return (data as { id?: string } | null)?.id ?? null;
  }

  async getCompanies() {
    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async createCompany(payload: CreateDeliveryCompanyDto) {
    const { data, error } = await this.supabaseAdmin.client.from("delivery_companies").insert(payload as any).select("*").single();
    if (error) throw error;
    return data;
  }

  async getGovernorates() {
    const companyId = await this.getJenniCompanyId();
    const { data, error } = await this.supabaseAdmin.client.from("governorates").select("*").order("name");
    if (error) throw error;

    let priceByGov = new Map<string, number>();
    if (companyId) {
      const { data: prices, error: pricesError } = await this.supabaseAdmin.client
        .from("delivery_prices")
        .select("governorate_id,price")
        .eq("company_id", companyId);
      if (pricesError) throw pricesError;
      priceByGov = new Map((prices ?? []).map((row: any) => [row.governorate_id, Number(row.price)]));
    }

    return (data ?? []).map((gov: any) => ({
      ...gov,
      delivery_price: priceByGov.has(gov.id) ? priceByGov.get(gov.id) : null,
      delivery_provider: "jenni",
    }));
  }

  async getRegions(governorateId?: string) {
    let query = this.supabaseAdmin.client
      .from("regions")
      // Note: regions table has no is_active column — all rows are returned (admin-managed table).
      .select("id, governorate_id, name, sort_order")
      .order("sort_order", { ascending: true });

    if (governorateId) {
      query = query.eq("governorate_id", governorateId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async getCompanyPrices(companyId: string) {
    const { data, error } = await this.supabaseAdmin.client.from("delivery_prices").select("*").eq("company_id", companyId);
    if (error) throw error;
    return data ?? [];
  }

  async upsertCompanyPrice(companyId: string, payload: UpsertDeliveryPriceDto) {
    const { data: existing, error: findError } = await this.supabaseAdmin.client
      .from("delivery_prices")
      .select("id")
      .eq("company_id", companyId)
      .eq("governorate_id", payload.governorate_id)
      .maybeSingle();

    if (findError) throw findError;

    if (existing?.id) {
      const { error } = await this.supabaseAdmin.client.from("delivery_prices").update({ price: payload.price } as any).eq("id", existing.id);
      if (error) throw error;
      return { ok: true };
    }

    const { error } = await this.supabaseAdmin.client.from("delivery_prices").insert({
      company_id: companyId,
      governorate_id: payload.governorate_id,
      price: payload.price,
    } as any);
    if (error) throw error;
    return { ok: true };
  }

  async updateCompanyPolicy(companyId: string, payload: UpdateDeliveryCompanyPolicyDto) {
    const patch: Record<string, unknown> = {};
    if (payload.cod_remittance_mode) patch.cod_remittance_mode = payload.cod_remittance_mode;
    if (typeof payload.allow_courier_fee_offset === "boolean") patch.allow_courier_fee_offset = payload.allow_courier_fee_offset;
    if (payload.default_remittance_cycle) patch.default_remittance_cycle = payload.default_remittance_cycle;
    if (typeof payload.remittance_notes !== "undefined") patch.remittance_notes = payload.remittance_notes;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await this.supabaseAdmin.client.from("delivery_companies").update(patch as any).eq("id", companyId);
    if (error) throw error;
    return { ok: true };
  }
}
