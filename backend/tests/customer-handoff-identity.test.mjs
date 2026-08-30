/**
 * STORE-PR3 — Deterministic identity resolution (spec §10.1, Phase F + hardening B2/B5). No DB.
 * The resolver DECIDES + provisions the external shadow user but performs NO link write (the atomic
 * finalize RPC persists it). Covers 38–50 plus shadow collision + explicit metadata mapping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { CustomerHandoffIdentityService } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff-identity.service.js"
);
const { ShadowProvisioningError, ShadowCollisionError } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-shadow-provisioner.service.js"
);

function assertion(over = {}) {
  return {
    sub: over.sub ?? randomUUID(),
    displayName: "Buyer",
    phoneVerified: over.phoneVerified ?? false,
    phone: over.phone,
    phoneVerifiedAt: over.phoneVerifiedAt ?? null,
    emailVerified: over.emailVerified ?? false,
    email: over.email,
    emailVerifiedAt: over.emailVerifiedAt ?? null,
  };
}

function svc({ config = {}, repo = {}, provisioner = {} } = {}) {
  const cfg = { autoLinkEnabled: config.autoLinkEnabled ?? false };
  const r = {
    findLinkByDilMartUser: async () => null,
    confirmedPhoneCandidates: async () => [],
    confirmedEmailCandidates: async () => [],
    storeCustomerLinkedToOtherDilMartUser: async () => false,
    ...repo,
  };
  const p = { provisionOrResolve: async () => "cust-new", ...provisioner };
  return { service: new CustomerHandoffIdentityService(cfg, r, p), repo: r };
}

test("38/39. existing link wins (EXISTING_LINK, reuseExisting) and is idempotent", async () => {
  const link = { id: "lp-1", DilMart_role: "CUSTOMER", store_customer_id: "cust-1", link_status: "LINKED" };
  const { service } = svc({ repo: { findLinkByDilMartUser: async () => link } });
  const r1 = await service.resolve(assertion());
  const r2 = await service.resolve(assertion());
  assert.deepEqual([r1.outcome, r1.linkMethod, r1.reuseExisting, r1.storeCustomerId, r1.existingLinkedProfileId], ["LINKED", "EXISTING_LINK", true, "cust-1", "lp-1"]);
  assert.equal(r2.storeCustomerId, "cust-1");
});

test("40. incompatible Barber/non-Customer link fails closed (no provision)", async () => {
  let provisioned = 0;
  const { service } = svc({
    repo: { findLinkByDilMartUser: async () => ({ id: "lp-b", DilMart_role: "OWNER", store_customer_id: null, link_status: "LINKED" }) },
    provisioner: { provisionOrResolve: async () => { provisioned++; return "x"; } },
  });
  const r = await service.resolve(assertion());
  assert.equal(r.outcome, "BLOCKED");
  assert.equal(r.conflictReason, "incompatible_existing_role");
  assert.equal(provisioned, 0);
});

test("41. unique confirmed phone candidate → VERIFIED_PHONE/OTP_PHONE (flag ON)", async () => {
  const { service } = svc({ config: { autoLinkEnabled: true }, repo: { confirmedPhoneCandidates: async () => ["cust-p"] } });
  const r = await service.resolve(assertion({ phoneVerified: true, phone: "+9647700000000", phoneVerifiedAt: new Date().toISOString() }));
  assert.deepEqual([r.outcome, r.linkMethod, r.identityAssurance, r.storeCustomerId], ["LINKED", "VERIFIED_PHONE", "OTP_PHONE", "cust-p"]);
});

test("42. unique confirmed email candidate → VERIFIED_EMAIL/OTP_EMAIL (flag ON)", async () => {
  const { service } = svc({ config: { autoLinkEnabled: true }, repo: { confirmedEmailCandidates: async () => ["cust-e"] } });
  const r = await service.resolve(assertion({ emailVerified: true, email: "a@b.com", emailVerifiedAt: new Date().toISOString() }));
  assert.deepEqual([r.outcome, r.linkMethod, r.identityAssurance, r.storeCustomerId], ["LINKED", "VERIFIED_EMAIL", "OTP_EMAIL", "cust-e"]);
});

test("43. phone/email point to different users → BLOCKED conflict", async () => {
  const { service } = svc({ config: { autoLinkEnabled: true }, repo: { confirmedPhoneCandidates: async () => ["A"], confirmedEmailCandidates: async () => ["B"] } });
  const r = await service.resolve(assertion({ phoneVerified: true, phone: "+9647700000000", phoneVerifiedAt: "2026-08-01T00:00:00Z", emailVerified: true, email: "a@b.com", emailVerifiedAt: "2026-08-01T00:00:00Z" }));
  assert.equal(r.outcome, "BLOCKED");
  assert.equal(r.conflictReason, "candidate_conflict");
});

test("44. multiple phone candidates → BLOCKED", async () => {
  const { service } = svc({ config: { autoLinkEnabled: true }, repo: { confirmedPhoneCandidates: async () => ["A", "B"] } });
  const r = await service.resolve(assertion({ phoneVerified: true, phone: "+9647700000000", phoneVerifiedAt: "2026-08-01T00:00:00Z" }));
  assert.equal(r.outcome, "BLOCKED");
});

test("45. candidate already linked to another DilMart user → BLOCKED", async () => {
  const { service } = svc({ config: { autoLinkEnabled: true }, repo: { confirmedPhoneCandidates: async () => ["cust-x"], storeCustomerLinkedToOtherDilMartUser: async () => true } });
  const r = await service.resolve(assertion({ phoneVerified: true, phone: "+9647700000000", phoneVerifiedAt: "2026-08-01T00:00:00Z" }));
  assert.equal(r.outcome, "BLOCKED");
  assert.equal(r.conflictReason, "candidate_linked_to_other_user");
});

test("46. auto-link DISABLED → LINK_REQUIRED (no provisioning)", async () => {
  let provisioned = 0;
  const { service } = svc({
    config: { autoLinkEnabled: false },
    repo: { confirmedPhoneCandidates: async () => ["cust-x"] },
    provisioner: { provisionOrResolve: async () => { provisioned++; return "y"; } },
  });
  const r = await service.resolve(assertion({ phoneVerified: true, phone: "+9647700000000", phoneVerifiedAt: "2026-08-01T00:00:00Z" }));
  assert.equal(r.outcome, "LINK_REQUIRED");
  assert.equal(r.storeCustomerId, null);
  assert.equal(r.linkMethod, null);
  assert.equal(provisioned, 0);
});

test("47/48. no candidate → NEW_FEDERATED/DilMart_SESSION, deterministic same customer", async () => {
  const sub = randomUUID();
  const { service } = svc({ provisioner: { provisionOrResolve: async () => "cust-deterministic" } });
  const r1 = await service.resolve(assertion({ sub }));
  const r2 = await service.resolve(assertion({ sub }));
  assert.deepEqual([r1.outcome, r1.linkMethod, r1.identityAssurance, r1.storeCustomerId], ["LINKED", "NEW_FEDERATED", "DilMart_SESSION", "cust-deterministic"]);
  assert.equal(r2.storeCustomerId, "cust-deterministic");
});

test("49. transient provisioning failure surfaces; a collision maps to BLOCKED", async () => {
  const t = svc({ provisioner: { provisionOrResolve: async () => { throw new ShadowProvisioningError("boom"); } } });
  await assert.rejects(() => t.service.resolve(assertion()), ShadowProvisioningError);

  const c = svc({ provisioner: { provisionOrResolve: async () => { throw new ShadowCollisionError("collide"); } } });
  const r = await c.service.resolve(assertion());
  assert.equal(r.outcome, "BLOCKED");
  assert.equal(r.conflictReason, "shadow_provision_collision");
});

test("50. blocked / revoked existing link is rejected", async () => {
  for (const status of ["BLOCKED", "REVOKED"]) {
    const { service } = svc({ repo: { findLinkByDilMartUser: async () => ({ id: "lp", DilMart_role: "CUSTOMER", store_customer_id: "c", link_status: status }) } });
    const r = await service.resolve(assertion());
    assert.equal(r.outcome, "BLOCKED");
    assert.equal(r.conflictReason, "existing_link_blocked");
  }
});
