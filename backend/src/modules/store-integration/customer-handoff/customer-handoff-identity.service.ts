/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Deterministic customer identity resolver.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §10.1; task Phase F + hardening B2/B5/eligibility.
 *
 * DECIDES the identity outcome (and, for a new customer, provisions the external shadow auth user).
 * It performs NO store_linked_profiles write — the atomic finalize RPC persists link + handoff + audit
 * together (task B4). It returns the FULL link metadata (method/status/assurance) so the finalize step
 * persists the correct values (task B5), never always NEW_FEDERATED.
 *
 * Mandatory, fail-closed order:
 *   F1. Existing DilMart link  → reuse. BLOCKED/REVOKED or non-CUSTOMER/incompatible link ⇒ BLOCKED.
 *   F2. Confirmed phone/email candidates (authoritative auth.users + customer-compatible profile only).
 *   F3. STORE_IDENTITY_AUTO_LINK_ENABLED (default false): a confirmed candidate ⇒ LINK_REQUIRED.
 *   F4. No candidate / collision-free ⇒ provision a NEW_FEDERATED shadow customer (idempotent).
 */
import { Injectable, Logger } from "@nestjs/common";
import { CustomerHandoffConfig } from "./customer-handoff.config";
import { CustomerHandoffRepository } from "./customer-handoff-repository";
import {
  CustomerShadowProvisionerService,
  ShadowCollisionError,
} from "./customer-shadow-provisioner.service";
import { CustomerHandoffAssertion, IdentityResolution } from "./customer-handoff.types";

function isCustomerCompatible(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toUpperCase();
  return r === "" || r === "CUSTOMER";
}

/** auth.users stores E.164 digits WITHOUT the leading '+'. */
function toAuthUsersPhone(e164: string): string {
  return e164.replace(/^\+/, "");
}

@Injectable()
export class CustomerHandoffIdentityService {
  private readonly logger = new Logger(CustomerHandoffIdentityService.name);

  constructor(
    private readonly config: CustomerHandoffConfig,
    private readonly repo: CustomerHandoffRepository,
    private readonly provisioner: CustomerShadowProvisionerService,
  ) {}

  async resolve(assertion: CustomerHandoffAssertion): Promise<IdentityResolution> {
    // ── F1: Existing DilMart link ───────────────────────────────────────────────
    const link = await this.repo.findLinkByDilMartUser(assertion.sub);
    if (link) {
      const status = String(link.link_status ?? "").toUpperCase();
      if (status === "BLOCKED" || status === "REVOKED") return this.blocked("existing_link_blocked");
      if (!isCustomerCompatible(link.DilMart_role)) return this.blocked("incompatible_existing_role");
      if (link.store_customer_id) {
        return {
          outcome: "LINKED",
          storeCustomerId: link.store_customer_id,
          linkMethod: "EXISTING_LINK",
          linkStatus: "LINKED",
          identityAssurance: "DilMart_SESSION",
          reuseExisting: true,
          existingLinkedProfileId: link.id,
        };
      }
      // Compatible link with no resolved Store customer yet → fall through to candidate/provision.
    }

    // ── F2: Confirmed candidates (authoritative auth.users + eligible profile only) ─────────────
    const phoneUsers = assertion.phoneVerified && assertion.phone
      ? await this.repo.confirmedPhoneCandidates(toAuthUsersPhone(assertion.phone))
      : [];
    const emailUsers = assertion.emailVerified && assertion.email
      ? await this.repo.confirmedEmailCandidates(assertion.email)
      : [];
    const candidateSet = new Set<string>([...phoneUsers, ...emailUsers]);

    if (candidateSet.size > 0) {
      const ambiguous =
        phoneUsers.length > 1 ||
        emailUsers.length > 1 ||
        candidateSet.size > 1 ||
        (phoneUsers.length === 1 && emailUsers.length === 1 && phoneUsers[0] !== emailUsers[0]);
      if (ambiguous) return this.blocked("candidate_conflict");

      const candidate = [...candidateSet][0];
      if (await this.repo.storeCustomerLinkedToOtherDilMartUser(candidate, assertion.sub)) {
        return this.blocked("candidate_linked_to_other_user");
      }

      // ── F3: auto-link gate ─────────────────────────────────────────────────────
      if (!this.config.autoLinkEnabled) {
        return {
          outcome: "LINK_REQUIRED",
          storeCustomerId: null,
          linkMethod: null,
          linkStatus: null,
          identityAssurance: null,
          reuseExisting: false,
          existingLinkedProfileId: link?.id ?? null,
          conflictReason: "confirmed_candidate_requires_verification",
        };
      }

      // Auto-link ENABLED (tests only): every master-spec condition already holds here.
      const fromPhone = phoneUsers.length === 1;
      return {
        outcome: "LINKED",
        storeCustomerId: candidate,
        linkMethod: fromPhone ? "VERIFIED_PHONE" : "VERIFIED_EMAIL",
        linkStatus: "LINKED",
        identityAssurance: fromPhone ? "OTP_PHONE" : "OTP_EMAIL",
        reuseExisting: false,
        existingLinkedProfileId: link?.id ?? null,
      };
    }

    // ── F4: Provision a new federated customer (idempotent, ownership-validated) ────────────────
    let storeCustomerId: string;
    try {
      storeCustomerId = await this.provisioner.provisionOrResolve(assertion.sub);
    } catch (err) {
      if (err instanceof ShadowCollisionError) return this.blocked("shadow_provision_collision");
      throw err; // ShadowProvisioningError → transient (service maps to STORE_UNAVAILABLE)
    }
    return {
      outcome: "LINKED",
      storeCustomerId,
      linkMethod: "NEW_FEDERATED",
      linkStatus: "LINKED",
      identityAssurance: "DilMart_SESSION",
      reuseExisting: false,
      existingLinkedProfileId: link?.id ?? null,
    };
  }

  private blocked(reason: string): IdentityResolution {
    return {
      outcome: "BLOCKED",
      storeCustomerId: null,
      linkMethod: null,
      linkStatus: null,
      identityAssurance: null,
      reuseExisting: false,
      existingLinkedProfileId: null,
      conflictReason: reason,
    };
  }
}
