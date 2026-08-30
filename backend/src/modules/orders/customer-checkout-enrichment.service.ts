import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";

export interface CheckoutEnrichmentInput {
  userId: string;
  customerName: string;
  customerPhone: string;
  governorateId?: string | null;
  area?: string | null;
  nearestLandmark?: string | null;
  mapUrl?: string | null;
  notes?: string | null;
  saveAddress?: boolean;
}

@Injectable()
export class CustomerCheckoutEnrichmentService {
  private readonly logger = new Logger(CustomerCheckoutEnrichmentService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async enrichPostCheckout(input: CheckoutEnrichmentInput): Promise<string[]> {
    const warnings: string[] = [];

    if (!input.userId) return warnings;

    const phone = normalizeIraqiPhone(input.customerPhone);

    // 1. Update Profile (Name & Phone) if missing
    try {
      const { data: profile } = await this.supabaseAdmin.client
        .from("profiles")
        .select("full_name, phone")
        .eq("id", input.userId)
        .maybeSingle();

      const updates: Record<string, any> = {};
      if (!profile?.full_name && input.customerName) {
        updates.full_name = input.customerName.trim();
      }
      if (!profile?.phone && phone) {
        updates.phone = phone;
      }

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await this.supabaseAdmin.client
          .from("profiles")
          .update(updates)
          .eq("id", input.userId);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to enrich profile post checkout: ${err.message}`);
      warnings.push("تعذر إكمال تحديث بيانات الملف الشخصي تلقائياً");
    }

    // 2. Save Address if saveAddress requested or no address exists
    try {
      if (input.saveAddress && input.area && input.area.trim()) {
        const trimmedArea = input.area.trim();

        // Check deduplication fingerprint (user_id, governorate_id, area, phone)
        const { data: existingAddress } = await this.supabaseAdmin.client
          .from("customer_addresses")
          .select("id")
          .eq("user_id", input.userId)
          .eq("governorate_id", input.governorateId || null)
          .ilike("area", trimmedArea)
          .eq("phone", phone)
          .maybeSingle();

        if (!existingAddress) {
          // Check count to set default
          const { count } = await this.supabaseAdmin.client
            .from("customer_addresses")
            .select("id", { count: "exact", head: true })
            .eq("user_id", input.userId);

          await this.supabaseAdmin.client.from("customer_addresses").insert({
            user_id: input.userId,
            recipient_name: input.customerName?.trim() || "العميل",
            recipient_phone: phone,
            governorate_id: input.governorateId || null,
            area: trimmedArea,
            nearest_landmark: input.nearestLandmark?.trim() || null,
            map_url: input.mapUrl?.trim() || null,
            delivery_notes: input.notes?.trim() || null,
            is_default: (count ?? 0) === 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to enrich customer address post checkout: ${err.message}`);
      warnings.push("تعذر حفظ العنوان الجديد تلقائياً");
    }

    return warnings;
  }
}
