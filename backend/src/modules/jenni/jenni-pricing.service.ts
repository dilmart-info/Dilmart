import { BadRequestException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

@Injectable()
export class JenniPricingService {
  private jenniCompanyId: string | null = null;

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async getJenniCompanyId(): Promise<string> {
    if (this.jenniCompanyId) return this.jenniCompanyId;

    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("id")
      .eq("provider_code", "jenni")
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) {
      throw new BadRequestException("Jenni delivery company is not configured. Run migrations and seed Jenni tariffs.");
    }

    this.jenniCompanyId = data.id as string;
    return this.jenniCompanyId;
  }

  /**
   * Checkout delivery fee — sourced from local Jenni tariffs (delivery_prices), not governorates.delivery_price.
   */
  async resolveJenniDeliveryPrice(governorateId: string): Promise<number> {
    const companyId = await this.getJenniCompanyId();
    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_prices")
      .select("price")
      .eq("company_id", companyId)
      .eq("governorate_id", governorateId)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.price == null) {
      throw new BadRequestException(
        "لا يتوفر سعر توصيل Jenni لهذه المحافظة. يرجى تحديث تعرفة Jenni من لوحة الإدارة.",
      );
    }

    const price = Number(data.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException("تعرفة توصيل Jenni غير صالحة لهذه المحافظة.");
    }
    return price;
  }
}
