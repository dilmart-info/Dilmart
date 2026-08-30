/** STORE-PR4 DB test helpers. */
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

export const supabase = getTestClient();
export const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/** Create a customer auth user (→ profiles row, role customer). Returns its id. */
export async function makeCustomer() {
  const email = `pr4-${crypto.randomBytes(8).toString("hex")}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomBytes(20).toString("base64url") });
  if (error) throw error;
  return data.user.id;
}

/** Create a CUSTOMER LINKED store_linked_profiles row for a customer. Returns { linkId, DilMartUserId }. */
export async function makeLink(custId, over = {}) {
  const DilMartUserId = over.DilMartUserId ?? crypto.randomUUID();
  const { data, error } = await supabase.from("store_linked_profiles")
    .insert({ DilMart_user_id: DilMartUserId, DilMart_role: over.role ?? "CUSTOMER", store_customer_id: custId, segment: "DilMart_APP_CUSTOMER", source_app: "customer_app", link_status: over.linkStatus ?? "LINKED", display_name: over.displayName ?? "Buyer" })
    .select("id").single();
  if (error) throw error;
  return { linkId: data.id, DilMartUserId };
}

/** Insert a LINKED handoff. Returns { handoffId, codeHash, stateHash, custId, linkId, DilMartUserId }. */
export async function makeLinkedHandoff(over = {}) {
  const custId = over.custId ?? (await makeCustomer());
  const link = over.linkId ? { linkId: over.linkId, DilMartUserId: over.DilMartUserId } : await makeLink(custId, over);
  const code = "code-" + crypto.randomUUID();
  const state = "state-" + crypto.randomUUID();
  const codeHash = sha256(code), stateHash = sha256(state);
  const { data, error } = await supabase.from("DilMart_customer_handoffs").insert({
    code_hash: codeHash, state_hash: stateHash, assertion_jti: `jti-${crypto.randomUUID()}`,
    DilMart_user_id: link.DilMartUserId, linked_profile_id: link.linkId, store_customer_id: custId,
    target_path: "/product/x", source_surface: "customer_home_gateway", status: "PENDING",
    identity_outcome: over.identityOutcome ?? "LINKED", expires_at: new Date(Date.now() + (over.ttlMs ?? 120000)).toISOString(),
  }).select("id").single();
  if (error) throw error;
  return { handoffId: data.id, codeHash, stateHash, custId, linkId: link.linkId, DilMartUserId: link.DilMartUserId, targetPath: "/product/x" };
}

/**
 * Redeem+create. Expected-context (B6) defaults are read from the handoff itself — exactly what the backend
 * inspect step supplies — so callers don't repeat it; pass expected* overrides to force a mismatch.
 */
export const createSession = async (codeHash, stateHash, over = {}) => {
  const { data: h } = await supabase.from("DilMart_customer_handoffs")
    .select("id, store_customer_id, linked_profile_id, DilMart_user_id, target_path").eq("code_hash", codeHash).maybeSingle();
  return supabase.rpc("redeem_and_create_federated_session", {
    p_code_hash: codeHash, p_state_hash: stateHash, p_family_id: over.familyId ?? crypto.randomUUID(),
    p_refresh_token_id: over.refreshTokenId ?? crypto.randomUUID(), p_refresh_token_hash: over.refreshHash ?? ("rh-" + crypto.randomUUID()),
    p_access_jti: crypto.randomUUID(), p_device_hash: over.deviceHash ?? null,
    p_expected_handoff_id: over.expectedHandoffId ?? h?.id ?? crypto.randomUUID(),
    p_expected_store_customer_id: over.expectedStoreCustomerId ?? h?.store_customer_id ?? crypto.randomUUID(),
    p_expected_linked_profile_id: over.expectedLinkedProfileId ?? h?.linked_profile_id ?? crypto.randomUUID(),
    p_expected_DilMart_user_id: over.expectedDilMartUserId ?? h?.DilMart_user_id ?? crypto.randomUUID(),
    p_expected_target_path: over.expectedTargetPath ?? h?.target_path ?? "/",
    p_request_id: crypto.randomUUID(),
  });
};

/**
 * Rotate. Expected family-context (B6) defaults are resolved from the current token's family — exactly what
 * the backend pre-sign read supplies. Pass expected* overrides to force a mismatch.
 */
export const rotate = async (currentHash, over = {}) => {
  let exp = {};
  const { data: tok } = await supabase.from("store_federated_refresh_tokens").select("session_family_id").eq("token_hash", currentHash).maybeSingle();
  if (tok) {
    const { data: fam } = await supabase.from("store_federated_session_families")
      .select("id, session_version, store_customer_id, linked_profile_id, DilMart_user_id").eq("id", tok.session_family_id).maybeSingle();
    if (fam) exp = { familyId: fam.id, storeCustomerId: fam.store_customer_id, linkedProfileId: fam.linked_profile_id, DilMartUserId: fam.DilMart_user_id, sessionVersion: fam.session_version };
  }
  return supabase.rpc("rotate_federated_refresh_token", {
    p_current_token_hash: currentHash, p_new_token_id: over.newId ?? crypto.randomUUID(), p_new_token_hash: over.newHash ?? ("nh-" + crypto.randomUUID()),
    p_device_hash: over.deviceHash ?? null,
    p_expected_family_id: over.expectedFamilyId ?? exp.familyId ?? crypto.randomUUID(),
    p_expected_store_customer_id: over.expectedStoreCustomerId ?? exp.storeCustomerId ?? crypto.randomUUID(),
    p_expected_linked_profile_id: over.expectedLinkedProfileId ?? exp.linkedProfileId ?? crypto.randomUUID(),
    p_expected_DilMart_user_id: over.expectedDilMartUserId ?? exp.DilMartUserId ?? crypto.randomUUID(),
    p_expected_session_version: over.expectedSessionVersion ?? exp.sessionVersion ?? 1,
    p_request_id: crypto.randomUUID(),
  });
};

/** Logout / logout-all by raw-equivalent token hash (tests pass the stored token_hash directly). */
export const logout = (tokenHash) => supabase.rpc("logout_federated_session", { p_refresh_token_hash: tokenHash, p_request_id: crypto.randomUUID() });
export const logoutAll = (tokenHash) => supabase.rpc("logout_all_federated_sessions", { p_refresh_token_hash: tokenHash, p_request_id: crypto.randomUUID() });
export const validateFamily = (familyId, sessionVersion) => supabase.rpc("validate_federated_session_family", { p_family_id: familyId, p_session_version: sessionVersion });

export async function cleanupIdentity({ DilMartUserId, custId }) {
  if (DilMartUserId) {
    const { data: fams } = await supabase.from("store_federated_session_families").select("id").eq("DilMart_user_id", DilMartUserId);
    for (const f of fams ?? []) await supabase.from("store_federated_session_families").delete().eq("id", f.id);
    await supabase.from("DilMart_customer_handoffs").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.from("store_linked_profiles").delete().eq("DilMart_user_id", DilMartUserId);
  }
  if (custId) await supabase.auth.admin.deleteUser(custId);
}
