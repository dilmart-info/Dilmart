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
      throw new ConflictException({
        code: "SLUG_EXISTS",
        message: "المعرّف المقترح للرابط مستخدم بالفعل. يرجى اختيار معرّف آخر.",
      });
    }

    const normalizedEmail = payload.email.trim().toLowerCase();

    // Check if a user with this email already exists
    const { data: existingProfile, error: profileLookupError } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id, role, email")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;

    if (existingProfile?.id) {
      const { data: existingMemberships } = await this.supabaseAdmin.client
        .from("merchant_users")
        .select("merchant_id, role, merchants(id, status, display_name)")
        .eq("user_id", existingProfile.id);

      if (existingMemberships && existingMemberships.length > 0) {
        const activeOrPending = existingMemberships.find((m: any) => {
          const st = m.merchants?.status;
          return st === "active" || st === "pending_review";
        });
        if (activeOrPending) {
          const st = (activeOrPending as any).merchants?.status;
          if (st === "active") {
            throw new ConflictException({
              code: "EXISTING_MERCHANT",
              message: "هذا البريد الإلكتروني مرتبط بمتجر مفعّل بالفعل. يرجى تسجيل الدخول.",
            });
          } else {
            throw new ConflictException({
              code: "EXISTING_APPLICATION",
              message: "يوجد طلب تسجيل متجر قيد المراجعة بالفعل لهذا البريد الإلكتروني. يرجى متابعة حالة الطلب.",
            });
          }
        }
      }

      throw new ConflictException({
        code: "ACCOUNT_EXISTS",
        message: "هذا البريد الإلكتروني مسجل مسبقاً في المنصة. يرجى تسجيل الدخول أولاً.",
      });
    }

    const { data: createdUser, error: createUserError } = await this.supabaseAdmin.client.auth.admin.createUser({
      email: normalizedEmail,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.owner_full_name,
        phone: payload.owner_phone,
      },
    });
    if (createUserError || !createdUser?.user) {
      const errMsg = (createUserError?.message || "").toLowerCase();
      if (errMsg.includes("already registered") || errMsg.includes("already exists") || errMsg.includes("unique")) {
        throw new ConflictException({
          code: "ACCOUNT_EXISTS",
          message: "هذا البريد الإلكتروني مسجل مسبقاً في المنصة. يرجى تسجيل الدخول.",
        });
      }
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
          email: normalizedEmail,
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
      .eq("user_id", actorId);
    if (error) throw error;

    if (!memberships || memberships.length === 0) {
      return { has_application: false };
    }

    const statusWeight: Record<string, number> = {
      active: 40,
      pending_review: 30,
      suspended: 20,
      rejected: 10,
    };

    const sorted = [...memberships].sort((a: any, b: any) => {
      const aMerchant = Array.isArray(a.merchants) ? a.merchants[0] : a.merchants;
      const bMerchant = Array.isArray(b.merchants) ? b.merchants[0] : b.merchants;
      const weightA = statusWeight[aMerchant?.status] ?? 0;
      const weightB = statusWeight[bMerchant?.status] ?? 0;
      if (weightB !== weightA) return weightB - weightA;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    const top = sorted[0] as any;
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

    const { data: merchant, error: fetchErr } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, status")
      .eq("id", merchantId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!merchant) throw new BadRequestException("Merchant not found.");

    const now = new Date().toISOString();
    const { error: updateErr } = await this.supabaseAdmin.client
      .from("merchants")
      .update({
        status: "active",
        approved_at: now,
        approved_by: actorId,
        rejection_reason: null,
      } as any)
      .eq("id", merchantId);
    if (updateErr) throw updateErr;

    // Promote merchant owner(s) to merchant_owner
    const { data: owners } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("user_id")
      .eq("merchant_id", merchantId)
      .eq("role", "owner");

    const ownerIds = (owners ?? []).map((o: any) => o.user_id).filter(Boolean);
    if (ownerIds.length > 0) {
      await this.supabaseAdmin.client
        .from("profiles")
        .update({ role: "merchant_owner" } as any)
        .in("id", ownerIds)
        .in("role", ["merchant_applicant", "customer"]);
    }

    return { ok: true };
  }

  async rejectMerchant(merchantId: string, reason: string, actorId?: string) {
    if (!actorId) throw new ForbiddenException("Admin actor is required.");
    if (!reason?.trim()) throw new BadRequestException("Rejection reason is required.");

    const { data: merchant, error: fetchErr } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, status")
      .eq("id", merchantId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!merchant) throw new BadRequestException("Merchant not found.");

    const now = new Date().toISOString();
    const { error: updateErr } = await this.supabaseAdmin.client
      .from("merchants")
      .update({
        status: "rejected",
        rejected_at: now,
        rejected_by: actorId,
        rejection_reason: reason.trim(),
      } as any)
      .eq("id", merchantId);
    if (updateErr) throw updateErr;

    return { ok: true };
  }
}
