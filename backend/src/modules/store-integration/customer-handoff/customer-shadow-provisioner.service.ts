/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Shadow federated customer provisioning.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §10.1 Step 4; task A2/F4 + hardening B2.
 *
 * Creates a Store-owned customer identity (Supabase Auth user → profiles row via the existing
 * handle_new_user trigger) for a DilMart user with no Store account. Supabase Admin API is used from
 * the Store Backend ONLY.
 *
 * B2 hardening:
 *   * The internal identifier is OPAQUE — base64url(HMAC-SHA256(STORE_FEDERATED_ID_SECRET, DilMartUserId)).
 *     The raw DilMart UUID never appears in the identifier / reserved email.
 *   * Recovery is OWNERSHIP-VALIDATING (RPC checks account_type/origin/DilMart_user_id/profile/active).
 *     A reserved email that exists but fails ownership is a COLLISION and is never reused.
 *   * The reserved @federated.DilMart.internal domain is enforced at the Auth boundary by a DB trigger
 *     (public signup/OTP/admin-arbitrary-email cannot set app_metadata.origin and is rejected).
 */
import { Injectable, Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import { SupabaseAdminService } from "../../supabase-admin/supabase-admin.service";
import { CustomerHandoffConfig } from "./customer-handoff.config";
import { FEDERATED_CUSTOMER_EMAIL_DOMAIN } from "./customer-handoff.types";

/**
 * Server-side guard: is this a reserved internal federated email? Backend-mediated customer-creation
 * routes (signup / OTP / resend / recovery / admin-create) must reject a customer-supplied email on
 * the reserved domain (task B2 — server-side, not React). The load-bearing anti-takeover control is
 * the ownership-validating recovery RPC; this guard is defence in depth for backend paths.
 */
export function isReservedFederatedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${FEDERATED_CUSTOMER_EMAIL_DOMAIN}`);
}

/** Transient failure (retryable). Maps to STORE_UNAVAILABLE. */
export class ShadowProvisioningError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ShadowProvisioningError";
  }
}

/** The reserved email is held by an account we do not own. Never reuse it → identity BLOCKED. */
export class ShadowCollisionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ShadowCollisionError";
  }
}

@Injectable()
export class CustomerShadowProvisionerService {
  private readonly logger = new Logger(CustomerShadowProvisionerService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly config: CustomerHandoffConfig,
  ) {}

  /** Opaque deterministic identifier for a DilMart user; the raw UUID is not derivable from it. */
  federatedIdentifier(DilMartUserId: string): string {
    return createHmac("sha256", this.config.getFederatedIdSecret()).update(DilMartUserId, "utf8").digest("base64url");
  }

  /** Deterministic, reserved, non-routable internal email built from the opaque identifier. */
  internalEmailFor(DilMartUserId: string): string {
    return `DilMart-federated+${this.federatedIdentifier(DilMartUserId)}@${FEDERATED_CUSTOMER_EMAIL_DOMAIN}`;
  }

  /**
   * Resolves (idempotent, ownership-validated) or provisions the shadow Store customer for a DilMart user via
   * the SECURITY DEFINER direct-insert RPC (which sets full ownership metadata + federated_id AT insert, so
   * the reserved-domain trigger permits it). Returns the Store customer id (= profiles.id). Never returns
   * credentials. Throws ShadowCollisionError when the reserved identity is held by a non-owned account.
   */
  async provisionOrResolve(DilMartUserId: string): Promise<string> {
    const federatedId = this.federatedIdentifier(DilMartUserId);
    const { data, error } = await this.supabaseAdmin.client.rpc("provision_DilMart_federated_customer", {
      p_DilMart_user_id: DilMartUserId,
      p_federated_id: federatedId,
    });
    if (error) {
      this.logger.error(`[shadow-provisioner] provision rpc failed (${error.code ?? "?"}).`);
      throw new ShadowProvisioningError("shadow provisioning failed");
    }
    const row = ((data ?? []) as Array<{ store_customer_id: string | null; error_code: string | null }>)[0];
    if (!row || row.error_code === "IDENTITY_BLOCKED") {
      throw new ShadowCollisionError("reserved federated identity collision");
    }
    if (!row.store_customer_id) {
      throw new ShadowProvisioningError("shadow provisioning returned no id");
    }
    return row.store_customer_id;
  }
}
