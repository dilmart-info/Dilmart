import { BadRequestException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

@Injectable()
export class LoyaltyService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async preview(userId: string, subtotal: number) {
    const safeSubtotal = Number.isFinite(subtotal) && subtotal >= 0 ? subtotal : 0;

    try {
      const { data, error } = await this.supabaseAdmin.client
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        return { available_points: 0, redeemable_amount: 0 };
      }

      const points = Number((data as any)?.points ?? 0);
      const redeemable_amount = Math.min(points * 10, safeSubtotal);
      return {
        available_points: points,
        redeemable_amount: Number.isFinite(redeemable_amount) ? redeemable_amount : 0,
      };
    } catch {
      return { available_points: 0, redeemable_amount: 0 };
    }
  }

  async redeem(userId: string, points: number) {
    // points=0 would zero any profile that has ≥ 0 points; guard against it.
    if (points <= 0) {
      throw new BadRequestException("Points to redeem must be greater than zero.");
    }

    const { error } = await this.supabaseAdmin.client
      .from("profiles")
      .update({ points: 0 } as any)
      .eq("id", userId)
      .gte("points", points);

    if (error) throw error;
    return { ok: true };
  }
}
