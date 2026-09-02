import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { UpsertCouponDto, ValidateCouponDto } from "./coupons.dto";
import {
  getCommercialPolicyProfile,
  isValidCommercialPolicyProfileId,
} from "../../common/commercial-policy";

@Injectable()
export class CouponsService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private validateCouponPayload(payload: UpsertCouponDto) {
    const code = String(payload.code ?? "").trim();
    if (!code) {
      throw new BadRequestException("Coupon code is required.");
    }
    const val = Number(payload.value);
    if (!Number.isFinite(val) || val <= 0) {
      throw new BadRequestException("Coupon value must be a positive number.");
    }
    if (payload.discount_type === "percentage" && val > 100) {
      throw new BadRequestException("Percentage coupon value cannot exceed 100.");
    }
    if (payload.min_order_amount != null) {
      const minAmount = Number(payload.min_order_amount);
      if (!Number.isFinite(minAmount) || minAmount < 0) {
        throw new BadRequestException("Minimum order amount cannot be negative.");
      }
    }
    if (payload.max_uses != null && payload.max_uses !== undefined) {
      const maxUses = Number(payload.max_uses);
      if (!Number.isInteger(maxUses) || maxUses <= 0) {
        throw new BadRequestException("Max uses must be a positive integer.");
      }
    }
    if (payload.expires_at) {
      const expiresMs = Date.parse(payload.expires_at);
      if (Number.isNaN(expiresMs)) {
        throw new BadRequestException("Coupon expiry date is invalid.");
      }
      if (expiresMs <= Date.now()) {
        throw new BadRequestException("Coupon expiry date must be in the future.");
      }
    }
  }

  private async resolveMerchantCouponScope(
    requestedMerchantId: string | undefined,
    actor?: { actor_role?: string; actor_id?: string },
    isWrite = false,
  ): Promise<string | null> {
    const role = actor?.actor_role;
    const actorId = actor?.actor_id;

    if (!role || !actorId) {
      throw new ForbiddenException("Actor context is required.");
    }

    if (role === "super_admin" || role === "admin") {
      if (requestedMerchantId) {
        const { data, error } = await this.supabaseAdmin.client
          .from("merchants")
          .select("id")
          .eq("id", requestedMerchantId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new NotFoundException("Merchant not found.");
        return requestedMerchantId;
      }
      return null;
    }

    if (role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff") {
      if (isWrite && role === "merchant_staff") {
        throw new ForbiddenException("Staff role is not authorized to manage coupons.");
      }

      if (!requestedMerchantId) {
        throw new BadRequestException("Merchant ID is required for merchant coupon operations.");
      }

      // Exact membership verification
      const { data: membership, error: memberError } = await this.supabaseAdmin.client
        .from("merchant_users")
        .select("merchant_id, role")
        .eq("user_id", actorId)
        .eq("merchant_id", requestedMerchantId)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!membership) {
        throw new ForbiddenException("Actor is not a member of this merchant.");
      }

      // Exact active merchant status verification
      const { data: merchantRow, error: merchantError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("id, status")
        .eq("id", requestedMerchantId)
        .maybeSingle();

      if (merchantError) throw merchantError;
      if (!merchantRow) {
        throw new NotFoundException("Merchant not found.");
      }
      if (merchantRow.status !== "active") {
        throw new ForbiddenException("Merchant is not active.");
      }

      return requestedMerchantId;
    }

    throw new ForbiddenException("Unauthorized role for coupon operations.");
  }

  private async validateCommercialPolicy(
    merchantId: string | null,
    payload: { discount_type: string; value: number; min_order_amount?: number; max_uses?: number | null },
  ): Promise<void> {
    if (!merchantId) return;

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_policy_assignments")
      .select("merchant_id, profile_id")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (error) {
      throw new ServiceUnavailableException("السياسة التجارية للمتجر غير متاحة مؤقتًا. تعذر إتمام العملية.");
    }

    let profileId: string = "balanced";
    if (data) {
      const assigned = (data as { profile_id?: string | null }).profile_id;
      if (!isValidCommercialPolicyProfileId(assigned)) {
        throw new ServiceUnavailableException("ملف السياسة التجارية المحدد غير صالح أو غير معتمد.");
      }
      profileId = assigned;
    }

    const policy = getCommercialPolicyProfile(profileId);

    if (payload.discount_type === "percentage" && payload.value > policy.maxDiscountPercent) {
      throw new BadRequestException(
        `سياسة ${policy.label}: الحد الأقصى لخصم النسبة هو ${policy.maxDiscountPercent}%`,
      );
    }

    if (Number(payload.min_order_amount ?? 0) < policy.minCouponOrderAmount) {
      throw new BadRequestException(
        `سياسة ${policy.label}: الحد الأدنى للطلب يجب أن يكون ${policy.minCouponOrderAmount} د.ع أو أكثر`,
      );
    }

    if (payload.max_uses != null && payload.max_uses !== undefined && Number(payload.max_uses) > policy.maxCouponUsage) {
      throw new BadRequestException(
        `سياسة ${policy.label}: الحد الأقصى للاستخدام لا يتجاوز ${policy.maxCouponUsage}`,
      );
    }
  }

  private async ensureCodeUnique(code: string, excludeId?: string): Promise<void> {
    let req = this.supabaseAdmin.client
      .from("coupons")
      .select("id")
      .eq("code", code.toUpperCase().trim())
      .limit(1);

    if (excludeId) req = req.neq("id", excludeId);
    const { data, error } = await req.maybeSingle();
    if (error) throw error;
    if (data?.id) {
      throw new ConflictException({
        message: "Coupon code already exists.",
        code: "COUPON_CODE_EXISTS",
      });
    }
  }

  async listCoupons(params: { merchant_id?: string; actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.resolveMerchantCouponScope(
      params.merchant_id,
      { actor_role: params.actor_role, actor_id: params.actor_id },
      false,
    );

    let req = this.supabaseAdmin.client
      .from("coupons")
      .select("*, merchants(display_name)")
      .order("created_at", { ascending: false });

    if (resolvedMerchantId) {
      req = req.eq("merchant_id", resolvedMerchantId);
    }

    const { data, error } = await req;
    if (error) throw error;
    return data ?? [];
  }

  async validateCoupon(payload: ValidateCouponDto) {
    const { data, error } = await this.supabaseAdmin.client.rpc("validate_coupon", {
      p_code: payload.code,
      p_total: payload.total,
      p_merchant_id: payload.merchant_id ?? null,
    });

    if (error) throw error;
    return data;
  }

  async upsertCoupon(payload: UpsertCouponDto & { actor_role?: string; actor_id?: string }) {
    this.validateCouponPayload(payload);

    const scopedMerchantId = await this.resolveMerchantCouponScope(
      payload.merchant_id ?? undefined,
      { actor_role: payload.actor_role, actor_id: payload.actor_id },
      true,
    );

    await this.validateCommercialPolicy(scopedMerchantId, payload);
    await this.ensureCodeUnique(payload.code, payload.id);

    const dataPayload = {
      code: payload.code.toUpperCase().trim(),
      discount_type: payload.discount_type,
      value: payload.value,
      is_active: payload.is_active,
      merchant_id: scopedMerchantId,
      min_order_amount: payload.min_order_amount ?? 0,
      max_uses: payload.max_uses ?? null,
      expires_at: payload.expires_at ?? null,
    };

    if (payload.id) {
      // IDOR closure: verify existence and ownership before updating
      let checkQuery = this.supabaseAdmin.client
        .from("coupons")
        .select("id, merchant_id")
        .eq("id", payload.id);

      if (scopedMerchantId) {
        checkQuery = checkQuery.eq("merchant_id", scopedMerchantId);
      }

      const { data: existing, error: checkError } = await checkQuery.maybeSingle();
      if (checkError) throw checkError;
      if (!existing) {
        throw new NotFoundException("Coupon not found.");
      }

      let updateQuery = this.supabaseAdmin.client
        .from("coupons")
        .update(dataPayload as any)
        .eq("id", payload.id);

      if (scopedMerchantId) {
        updateQuery = updateQuery.eq("merchant_id", scopedMerchantId);
      }

      const { data: updatedRows, error: updateError } = await updateQuery.select("id");
      if (updateError) throw updateError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new NotFoundException("Coupon not found or scope mismatch.");
      }
      return { ok: true };
    }

    const { error: insertError } = await this.supabaseAdmin.client
      .from("coupons")
      .insert(dataPayload as any);

    if (insertError) throw insertError;
    return { ok: true };
  }

  async deleteCoupon(id: string, merchantId?: string, actor?: { actor_role?: string; actor_id?: string }) {
    const scopedMerchantId = await this.resolveMerchantCouponScope(
      merchantId,
      { actor_role: actor?.actor_role, actor_id: actor?.actor_id },
      true,
    );

    let req = this.supabaseAdmin.client
      .from("coupons")
      .delete()
      .eq("id", id);

    if (scopedMerchantId) {
      req = req.eq("merchant_id", scopedMerchantId);
    }

    const { data, error } = await req.select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new NotFoundException("Coupon not found.");
    }

    return { ok: true };
  }
}
