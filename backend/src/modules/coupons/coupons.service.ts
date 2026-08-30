import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { UpsertCouponDto, ValidateCouponDto } from "./coupons.dto";

@Injectable()
export class CouponsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}



  private validateCouponPayload(payload: UpsertCouponDto) {
    const code = String(payload.code ?? "").trim();
    if (!code) {
      throw new BadRequestException("Coupon code is required.");
    }
    if (Number(payload.value ?? 0) <= 0) {
      throw new BadRequestException("Coupon value must be greater than zero.");
    }
    if (payload.discount_type === "percentage" && Number(payload.value) > 100) {
      throw new BadRequestException("Percentage coupon value cannot exceed 100.");
    }
    if (Number(payload.min_order_amount ?? 0) < 0) {
      throw new BadRequestException("Minimum order amount cannot be negative.");
    }
    if (payload.max_uses != null && payload.max_uses !== undefined && Number(payload.max_uses) <= 0) {
      throw new BadRequestException("Max uses must be greater than zero.");
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

  private async ensureCodeUniquePerScope(code: string, merchantId: string | null, excludeId?: string) {
    let req = this.supabaseAdmin.client.from("coupons").select("id").eq("code", code.toUpperCase().trim()).limit(1);
    if (merchantId) {
      req = req.eq("merchant_id", merchantId);
    } else {
      req = req.is("merchant_id", null);
    }
    if (excludeId) req = req.neq("id", excludeId);
    const { data, error } = await req.maybeSingle();
    if (error) throw error;
    if (data?.id) {
      throw new ConflictException({
        message: "Coupon code already exists in this scope.",
        code: "COUPON_CODE_EXISTS",
      });
    }
  }

  async listCoupons(params: { merchant_id?: string; actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(params.merchant_id, params.actor_role, params.actor_id);
    let req = this.supabaseAdmin.client.from("coupons").select("*, merchants(display_name)").order("created_at", { ascending: false });
    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
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
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id ?? undefined, payload.actor_role, payload.actor_id);
    const scopedMerchantId = resolvedMerchantId ?? payload.merchant_id ?? null;
    await this.ensureCodeUniquePerScope(payload.code, scopedMerchantId, payload.id);
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
      const { error } = await this.supabaseAdmin.client.from("coupons").update(dataPayload as any).eq("id", payload.id);
      if (error) throw error;
      return { ok: true };
    }

    const { error } = await this.supabaseAdmin.client.from("coupons").insert(dataPayload as any);
    if (error) throw error;
    return { ok: true };
  }

  async deleteCoupon(id: string, merchantId?: string, actor?: { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor?.actor_role, actor?.actor_id);
    let req = this.supabaseAdmin.client.from("coupons").delete().eq("id", id);
    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    const { error } = await req;
    if (error) throw error;
    return { ok: true };
  }
}
