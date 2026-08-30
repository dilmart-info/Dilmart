import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { RegisterMerchantApplicationDto } from "./merchant-applications.dto";

@Injectable()
export class MerchantApplicationsService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private normalizeSlug(slug: string) {
    return slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async registerApplication(payload: RegisterMerchantApplicationDto) {
    const normalizedSlug = this.normalizeSlug(payload.slug);
    if (!normalizedSlug) {
      throw new BadRequestException("Slug is required.");
    }

    const { data: existingMerchant, error: existingMerchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();
    if (existingMerchantError) throw existingMerchantError;
    if (existingMerchant?.id) {
      throw new ConflictException("Slug already exists.");
    }

    const { data: createdUser, error: createUserError } = await this.supabaseAdmin.client.auth.admin.createUser({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.owner_full_name,
        phone: payload.owner_phone,
      },
    });
    if (createUserError || !createdUser?.user) {
      throw new ConflictException(createUserError?.message || "Failed to create merchant account.");
    }

    const userId = createdUser.user.id;
    const now = new Date().toISOString();

    try {
      const { error: profileError } = await this.supabaseAdmin.client.from("profiles").upsert(
        {
          id: userId,
          role: "merchant_applicant",
          full_name: payload.owner_full_name,
          email: payload.email.trim().toLowerCase(),
          phone: payload.owner_phone,
        } as any,
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
        .from("merchants")
        .insert(
          {
            slug: normalizedSlug,
            name_ar: payload.store_name_ar,
            name_en: payload.store_name_en,
            display_name: payload.display_name,
            description: payload.description ?? null,
            business_type: payload.business_type?.trim() || null,
            status: "pending_review",
            submitted_at: now,
          } as any,
        )
        .select("id,status,slug,display_name,submitted_at")
        .single();
      if (merchantError || !merchant) throw merchantError;

      const { error: settingsError } = await this.supabaseAdmin.client.from("merchant_settings").upsert({
        merchant_id: merchant.id,
        contact_phone: payload.contact_phone,
        support_email: payload.support_email ?? null,
        city: payload.city,
        address: payload.address,
      } as any);
      if (settingsError) throw settingsError;

      const { error: membershipError } = await this.supabaseAdmin.client.from("merchant_users").upsert({
        merchant_id: merchant.id,
        user_id: userId,
        role: "owner",
      } as any);
      if (membershipError) throw membershipError;

      return {
        ok: true,
        user_id: userId,
        merchant_id: merchant.id,
        status: merchant.status,
      };
    } catch (error) {
      await this.supabaseAdmin.client.auth.admin.deleteUser(userId);
      throw error;
    }
  }

  async getMyApplicationStatus(actorId?: string) {
    if (!actorId) {
      throw new ForbiddenException("Authentication required.");
    }

    const { data: memberships, error } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id, role, created_at, merchants(id,status,display_name,slug,submitted_at,approved_at,rejected_at,rejection_reason)")
      .eq("user_id", actorId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const top = (memberships ?? [])[0] as any;
    if (!top?.merchant_id || !top?.merchants) {
      return { has_application: false };
    }

    const merchant = Array.isArray(top.merchants) ? top.merchants[0] : top.merchants;
    return {
      has_application: true,
      merchant: {
        id: top.merchant_id,
        role: top.role,
        status: merchant?.status ?? null,
        display_name: merchant?.display_name ?? null,
        slug: merchant?.slug ?? null,
        submitted_at: merchant?.submitted_at ?? null,
        approved_at: merchant?.approved_at ?? null,
        rejected_at: merchant?.rejected_at ?? null,
        rejection_reason: merchant?.rejection_reason ?? null,
      },
    };
  }

  async approveMerchant(merchantId: string, actorId?: string) {
    if (!actorId) throw new ForbiddenException("Admin actor is required.");

    // استخدام RPC atomic لضمان تحديث merchants.status و profiles.role في عملية واحدة
    const { data, error } = await this.supabaseAdmin.client.rpc("approve_merchant_atomic", {
      p_merchant_id: merchantId,
      p_approved_by: actorId,
    });
    if (error) throw error;
    if (!data?.ok) throw new BadRequestException(data?.error ?? "Approval failed.");

    return { ok: true };
  }

  async rejectMerchant(merchantId: string, reason: string, actorId?: string) {
    if (!actorId) throw new ForbiddenException("Admin actor is required.");
    if (!reason?.trim()) throw new BadRequestException("Rejection reason is required.");

    // استخدام RPC atomic لضمان تحديث merchants.status و profiles.role في عملية واحدة
    const { data, error } = await this.supabaseAdmin.client.rpc("reject_merchant_atomic", {
      p_merchant_id: merchantId,
      p_reason: reason.trim(),
      p_rejected_by: actorId,
    });
    if (error) throw error;
    if (!data?.ok) throw new BadRequestException(data?.error ?? "Rejection failed.");

    return { ok: true };
  }
}
