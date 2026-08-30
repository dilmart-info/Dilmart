import { Injectable } from "@nestjs/common";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import * as crypto from "crypto";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { CreateProvisionalUserDto } from "./create-provisional-user.dto";
import {
  AuthContextCapabilities,
  AuthContextMerchant,
  AuthContextProfile,
  AuthContextResponse,
  ContextRole,
  FEDERATED_CUSTOMER_ACCOUNT_TYPE,
  RawMembershipRow,
  isContextRole,
  isPlatformRole,
} from "./auth.types";
import { AuthSource } from "../../common/authz/auth-source";

/** Capability flags all off — used for the guest passthrough and any non-customer back-office actor. */
const NO_CAPABILITIES: AuthContextCapabilities = {
  customerCommerce: false,
  phoneIdentity: false,
  accountClaim: false,
  passwordManagement: false,
  federatedLogoutAll: false,
};

/**
 * STORE-PR5 §Phase A — capabilities are a pure function of (authSource, activeRole).
 *  - A federated DilMart customer: commerce + "logout everywhere", but NO Store password/phone/claim
 *    surface (those live on Supabase-owned auth-security routes the guard denies to federated actors).
 *  - A Supabase customer/provisional: the classic Store-account surface; federatedLogoutAll never applies.
 *  - Merchant / admin / agent: no customer-commerce capabilities.
 */
function capabilitiesFor(
  authSource: AuthSource | null,
  activeRole: ContextRole | null,
): AuthContextCapabilities {
  if (authSource === "DilMart_federated") {
    return {
      customerCommerce: true,
      phoneIdentity: false,
      accountClaim: false,
      passwordManagement: false,
      federatedLogoutAll: true,
    };
  }
  const isCustomer = activeRole === "customer";
  return {
    customerCommerce: isCustomer,
    phoneIdentity: isCustomer,
    accountClaim: isCustomer,
    passwordManagement: isCustomer,
    federatedLogoutAll: false,
  };
}

const merchantRoleWeight: Record<"owner" | "manager" | "staff", number> = {
  owner: 3,
  manager: 2,
  staff: 1,
};

function merchantStatusWeight(status: string | null | undefined): number {
  return status === "active" ? 10 : 0;
}

@Injectable()
export class AuthService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private merchantMeta(row: RawMembershipRow) {
    if (!row.merchants) return null;
    return Array.isArray(row.merchants) ? row.merchants[0] ?? null : row.merchants;
  }

  private resolveMerchantCandidate(memberships: RawMembershipRow[]): AuthContextMerchant | null {
    if (memberships.length === 0) return null;

    const sorted = memberships.sort((a, b) => {
      const statusDelta = merchantStatusWeight(this.merchantMeta(b)?.status) - merchantStatusWeight(this.merchantMeta(a)?.status);
      if (statusDelta !== 0) return statusDelta;
      return merchantRoleWeight[b.role] - merchantRoleWeight[a.role];
    });

    const top = sorted[0];
    const merchantMeta = this.merchantMeta(top);

    return {
      id: top.merchant_id,
      role: top.role,
      status: merchantMeta?.status ?? null,
      display_name: merchantMeta?.display_name ?? null,
      slug: merchantMeta?.slug ?? null,
    };
  }

  private resolveMerchantMemberships(memberships: RawMembershipRow[]): AuthContextMerchant[] {
    if (memberships.length === 0) return [];
    const sorted = [...memberships].sort((a, b) => {
      const statusDelta = merchantStatusWeight(this.merchantMeta(b)?.status) - merchantStatusWeight(this.merchantMeta(a)?.status);
      if (statusDelta !== 0) return statusDelta;
      const roleDelta = merchantRoleWeight[b.role] - merchantRoleWeight[a.role];
      if (roleDelta !== 0) return roleDelta;
      return String(this.merchantMeta(a)?.display_name ?? "").localeCompare(String(this.merchantMeta(b)?.display_name ?? ""));
    });
    return sorted.map((row) => {
      const merchantMeta = this.merchantMeta(row);
      return {
        id: row.merchant_id,
        role: row.role,
        status: merchantMeta?.status ?? null,
        display_name: merchantMeta?.display_name ?? null,
        slug: merchantMeta?.slug ?? null,
      };
    });
  }

  async getContext(actor: ActorContext): Promise<AuthContextResponse> {
    const actorId = actor.actorId ?? "";

    // Guest passthrough — no token, return anonymous context immediately
    if (!actorId) {
      return {
        user: { id: "", email: null, phone: null },
        profile: null,
        roles: [],
        activeRole: null,
        merchant: null,
        authSource: null,
        capabilities: NO_CAPABILITIES,
      };
    }

    // Resolve auth context via service-role reads keyed by validated actor id.
    const { data: profileRow, error: profileError } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id, role, full_name, email, phone, address, points, account_type")
      .eq("id", actorId)
      .maybeSingle();

    if (profileError) throw profileError;

    // STORE-PR5 §Phase A — federated DilMart customer context.
    //
    // Authorization comes from the verified DilMart federated session, NOT from Supabase auth
    // state. A federated actor is ALWAYS a Store customer with commerce access; it must never be
    // presented as provisional / claim_required / needing a Store OTP/password/phone-change, even
    // if the underlying shadow profile row (created by the PR3 provisioning path) still carries
    // legacy `account_type = 'provisional_customer'`. We fix this at the CONTRACT layer — no DB
    // mutation — and never leak linkedProfileId/DilMartUserId/sessionFamilyId/sessionVersion/tokens.
    if (actor.authSource === "DilMart_federated") {
      return this.buildFederatedContext(actor, profileRow);
    }

    // Fetch phone verification status
    const { data: phoneIdentity } = await this.supabaseAdmin.client
      .from("customer_phone_identities")
      .select("phone_normalized, is_verified")
      .eq("user_id", actorId)
      .maybeSingle();

    const accountType = (profileRow as { account_type?: string | null } | null)?.account_type ?? null;
    const isProvisional = accountType === "provisional_customer";
    const phoneVerified = Boolean(phoneIdentity?.is_verified);
    const verifiedPhone = phoneIdentity?.is_verified ? phoneIdentity.phone_normalized : null;
    const claimRequired = isProvisional && !phoneVerified;

    const rawRole = String((profileRow as { role?: string | null } | null)?.role ?? "").trim() || null;
    const profile: AuthContextProfile | null =
      profileRow && isContextRole(rawRole)
        ? {
            id: profileRow.id as string,
            role: rawRole as ContextRole,
            full_name: (profileRow as { full_name?: string | null }).full_name ?? null,
            email: (profileRow as { email?: string | null }).email ?? null,
            phone: (profileRow as { phone?: string | null }).phone ?? null,
            address: (profileRow as { address?: string | null }).address ?? null,
            points: (profileRow as { points?: number | null }).points ?? null,
            account_type: accountType,
            phone_verified: phoneVerified,
            claim_required: claimRequired,
            verified_phone: verifiedPhone,
          }
        : null;

    const activeRole = profile ? profile.role : null;
    const roles = activeRole ? [activeRole] : [];

    let merchant: AuthContextMerchant | null = null;
    let merchantMemberships: AuthContextMerchant[] = [];
    if (
      activeRole &&
      !isPlatformRole(activeRole) &&
      (activeRole === "merchant_applicant" || activeRole === "merchant_owner" || activeRole === "merchant_manager" || activeRole === "merchant_staff")
    ) {
      const { data: membershipsData, error: membershipsError } = await this.supabaseAdmin.client
        .from("merchant_users")
        .select("merchant_id, role, merchants(id, status, display_name, slug)")
        .eq("user_id", actorId);

      if (membershipsError) throw membershipsError;
      merchant = this.resolveMerchantCandidate((membershipsData ?? []) as RawMembershipRow[]);
      merchantMemberships = this.resolveMerchantMemberships((membershipsData ?? []) as RawMembershipRow[]);
    }

    return {
      user: {
        id: actorId,
        email: actor.actorEmail ?? profile?.email ?? null,
        phone: actor.actorPhone ?? profile?.phone ?? null,
      },
      profile,
      roles,
      activeRole,
      merchant,
      merchant_memberships: merchantMemberships,
      account_type: accountType,
      phone_verified: phoneVerified,
      claim_required: claimRequired,
      verified_phone: verifiedPhone,
      authSource: actor.authSource ?? "supabase",
      capabilities: capabilitiesFor(actor.authSource ?? "supabase", activeRole),
    };
  }

  /**
   * STORE-PR5 §Phase A — build the federated customer context from the verified actor + Store profile.
   * `actor.actorId` is the Store customer/profile UUID (NOT DilMartUserId). Verified DilMart email/phone
   * from the federated verifier win over stale profile columns. Role is pinned to "customer"; merchant
   * facets are empty; claim/password/phone capabilities are off; account_type is a response-only marker.
   */
  private buildFederatedContext(
    actor: ActorContext,
    profileRow: unknown,
  ): AuthContextResponse {
    const actorId = actor.actorId as string;
    const row = (profileRow ?? null) as {
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      points?: number | null;
    } | null;

    const email = actor.actorEmail ?? row?.email ?? null;
    const phone = actor.actorPhone ?? row?.phone ?? null;
    // A federated session only exists because DilMart verified the identity; treat a carried phone as verified.
    const phoneVerified = Boolean(actor.actorPhone);

    const profile: AuthContextProfile = {
      id: actorId,
      role: "customer",
      full_name: row?.full_name ?? null,
      email,
      phone,
      address: row?.address ?? null,
      points: row?.points ?? null,
      account_type: FEDERATED_CUSTOMER_ACCOUNT_TYPE,
      phone_verified: phoneVerified,
      claim_required: false,
      verified_phone: phoneVerified ? phone : null,
    };

    return {
      user: { id: actorId, email, phone },
      profile,
      roles: ["customer"],
      activeRole: "customer",
      merchant: null,
      merchant_memberships: [],
      account_type: FEDERATED_CUSTOMER_ACCOUNT_TYPE,
      phone_verified: phoneVerified,
      claim_required: false,
      verified_phone: phoneVerified ? phone : null,
      authSource: "DilMart_federated",
      capabilities: capabilitiesFor("DilMart_federated", "customer"),
    };
  }

  async createProvisionalUser(payload: CreateProvisionalUserDto) {
    const normalizedPhone = normalizeIraqiPhone(payload.customer_phone);
    const uuidSuffix = crypto.randomBytes(4).toString("hex");
    const email = `provisional_${Date.now()}_${uuidSuffix}@provisional.DilMart.com`;
    const password = crypto.randomBytes(16).toString("hex");

    const { data, error } = await this.supabaseAdmin.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        account_type: "provisional_customer",
        phone_verified: false,
        signup_source: "checkout",
        checkout_phone: normalizedPhone,
      },
      app_metadata: {
        account_type: "provisional_customer",
      },
    });

    if (error) {
      throw error;
    }

    const userId = data.user.id;

    // Ensure profiles.account_type is populated properly with rollback on failure
    try {
      const { data: existingProfile } = await this.supabaseAdmin.client
        .from("profiles")
        .select("id, account_type")
        .eq("id", userId)
        .maybeSingle();

      if (!existingProfile) {
        const { error: insertErr } = await this.supabaseAdmin.client
          .from("profiles")
          .insert({
            id: userId,
            email: email,
            role: "customer",
            account_type: "provisional_customer",
          });
        if (insertErr) throw insertErr;
      } else if (existingProfile.account_type !== "provisional_customer") {
        const { error: updateErr } = await this.supabaseAdmin.client
          .from("profiles")
          .update({ account_type: "provisional_customer" })
          .eq("id", userId);
        if (updateErr) throw updateErr;
      }
    } catch (dbErr) {
      // Rollback: delete created auth user if profile persistence fails
      await this.supabaseAdmin.client.auth.admin.deleteUser(userId).catch(() => {});
      throw dbErr;
    }

    return {
      email,
      password,
    };
  }
}
