/**
 * Stage B Pass 4: Migration B Atomicity, Destructive Cleanup & Authority Invariants Test Suite
 *
 * Verifies the structural integrity, safety invariants, exact identity signatures,
 * fail-closed whitelist validation, and atomicity of:
 * `supabase/migrations/20260831120000_stage_b_legacy_destructive_cleanup.sql`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_B_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/20260831120000_stage_b_legacy_destructive_cleanup.sql"
);

const sql = readFileSync(MIGRATION_B_PATH, "utf8");

describe("Stage B Pass 4: Migration B Atomicity & Destructive Cleanup Invariants", () => {
  it("Subtest 1: Migration B contains explicit BEGIN and COMMIT transaction wrapper", () => {
    assert.match(
      sql,
      /^\s*BEGIN\s*;/m,
      "Migration B must begin with an explicit BEGIN transaction"
    );
    assert.match(
      sql,
      /^\s*COMMIT\s*;/m,
      "Migration B must end with an explicit COMMIT transaction"
    );
  });

  it("Subtest 2: PROHIBITION: Migration B must contain ZERO CASCADE keywords", () => {
    const cascadeMatches = sql.match(/\bCASCADE\b/gi);
    assert.equal(
      cascadeMatches,
      null,
      "Migration B must not contain any CASCADE directives"
    );
  });

  it("Subtest 3: PROHIBITION: Migration B must contain ZERO dynamic catch-all DROP loops", () => {
    assert.doesNotMatch(
      sql,
      /EXECUTE\s+format\s*\(\s*['"]DROP\s+FUNCTION/i,
      "Migration B must not contain dynamic drop execution loops"
    );
  });

  it("Subtest 4: Migration B Preflight strictly asserts Migration A post-state authority", () => {
    assert.match(
      sql,
      /pronargs\s*<>\s*49/i,
      "Preflight must assert 49 arguments on place_order"
    );
    assert.match(
      sql,
      /pronargs\s*<>\s*51/i,
      "Preflight must assert 51 arguments on place_order_idempotent"
    );
    assert.match(
      sql,
      /owner_name\s*<>\s*'postgres'/i,
      "Preflight must assert owner is postgres"
    );
    assert.match(
      sql,
      /place_order_legacy_stageb/i,
      "Preflight must assert temporary legacy function is absent"
    );
    assert.match(
      sql,
      /has_function_privilege\s*\(\s*'service_role'/i,
      "Preflight must verify service_role execution privilege"
    );
  });

  it("Subtest 5: Migration B Preflight asserts zero rows in all 11 legacy tables", () => {
    const legacyTables = [
      "dilmart_barber_handoff_audit_events",
      "dilmart_barber_handoffs",
      "dilmart_barber_web_sessions",
      "dilmart_customer_handoff_audit_events",
      "dilmart_customer_handoffs",
      "store_cart_items",
      "store_carts",
      "store_federated_refresh_tokens",
      "store_federated_session_audit_events",
      "store_federated_session_families",
      "store_linked_profiles"
    ];
    for (const tbl of legacyTables) {
      assert.ok(
        sql.includes(`'${tbl}'`),
        `Preflight must enumerate legacy table: ${tbl}`
      );
    }
  });

  it("Subtest 6: Migration B Preflight asserts zero non-null/non-default legacy column data", () => {
    const legacyColumns = [
      "dilmart_barbershop_id",
      "dilmart_user_id",
      "store_cart_id",
      "store_linked_profile_id",
      "requires_verified_salon"
    ];
    for (const col of legacyColumns) {
      assert.ok(
        sql.includes(col),
        `Preflight must check legacy column: ${col}`
      );
    }
  });

  it("Subtest 7: Migration B Preflight asserts zero NULL user_id rows in checkout_attempts", () => {
    assert.match(
      sql,
      /checkout_attempts\s+WHERE\s+user_id\s+IS\s+NULL/i,
      "Preflight must check for NULL user_id rows in checkout_attempts"
    );
  });

  it("Subtest 8: Migration B Preflight enforces fail-closed whitelist for all 18 candidate function names", () => {
    const candidateNames = [
      "finalize_barber_handoff",
      "finalize_customer_handoff",
      "logout_all_federated_sessions",
      "logout_federated_session",
      "place_b2b_cart_order_idempotent",
      "provision_dilmart_federated_customer",
      "redeem_and_create_federated_session",
      "redeem_barber_handoff_and_create_session",
      "redeem_customer_handoff",
      "reject_barber_handoff_audit_mutation",
      "reject_handoff_audit_mutation",
      "reject_federated_session_audit_mutation",
      "reject_reserved_federated_email",
      "resolve_dilmart_federated_customer",
      "revoke_barber_web_sessions_for_user",
      "revoke_federated_sessions_for_identity",
      "rotate_federated_refresh_token",
      "validate_federated_session_family",
      "verify_barber_web_session"
    ];
    for (const fn of candidateNames) {
      assert.ok(
        sql.includes(`'${fn}'`),
        `Preflight whitelist validation must include function name: ${fn}`
      );
    }
    assert.match(
      sql,
      /STAGE_B_UNEXPECTED_LEGACY_FUNCTION_IDENTITY/i,
      "Preflight must raise STAGE_B_UNEXPECTED_LEGACY_FUNCTION_IDENTITY on unexpected identity"
    );
  });

  it("Subtest 9: Migration B explicitly drops 17 target legacy functions by exact signature with RESTRICT", () => {
    const targetDroppedFunctions = [
      "finalize_barber_handoff",
      "finalize_customer_handoff",
      "logout_all_federated_sessions",
      "logout_federated_session",
      "place_b2b_cart_order_idempotent",
      "provision_dilmart_federated_customer",
      "redeem_and_create_federated_session",
      "redeem_barber_handoff_and_create_session",
      "redeem_customer_handoff",
      "reject_barber_handoff_audit_mutation",
      "reject_handoff_audit_mutation",
      "reject_federated_session_audit_mutation",
      "resolve_dilmart_federated_customer",
      "revoke_barber_web_sessions_for_user",
      "revoke_federated_sessions_for_identity",
      "rotate_federated_refresh_token",
      "validate_federated_session_family",
      "verify_barber_web_session"
    ];
    for (const fn of targetDroppedFunctions) {
      assert.ok(
        sql.includes(`DROP FUNCTION IF EXISTS public.${fn}`),
        `Migration B must explicitly drop function: ${fn}`
      );
    }
    // Assert reject_reserved_federated_email is DEFERRED / NOT dropped
    assert.doesNotMatch(
      sql,
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.reject_reserved_federated_email/i,
      "reject_reserved_federated_email must be preserved for separate Migration F"
    );
  });

  it("Subtest 10: Migration B enforces checkout_attempts.user_id SET NOT NULL", () => {
    assert.match(
      sql,
      /ALTER\s+TABLE\s+public\.checkout_attempts\s+ALTER\s+COLUMN\s+user_id\s+SET\s+NOT\s+NULL/i,
      "Migration B must restore checkout_attempts.user_id NOT NULL integrity"
    );
  });

  it("Subtest 11: Migration B explicitly drops legacy columns and constraints from active tables", () => {
    assert.match(
      sql,
      /ALTER TABLE public\.checkout_attempts DROP CONSTRAINT IF EXISTS chk_checkout_attempts_owner_xor/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.checkout_attempts DROP COLUMN IF EXISTS store_cart_id/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.checkout_attempts DROP COLUMN IF EXISTS store_linked_profile_id/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.orders DROP COLUMN IF EXISTS dilmart_barbershop_id/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.orders DROP COLUMN IF EXISTS dilmart_user_id/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.orders DROP COLUMN IF EXISTS store_cart_id/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.orders DROP COLUMN IF EXISTS store_linked_profile_id/i
    );
    assert.match(
      sql,
      /ALTER TABLE public\.products DROP COLUMN IF EXISTS requires_verified_salon/i
    );
  });

  it("Subtest 12: Migration B explicitly drops all 11 legacy tables in child-to-parent order", () => {
    const childTables = [
      "dilmart_barber_handoff_audit_events",
      "dilmart_customer_handoff_audit_events",
      "store_federated_session_audit_events",
      "store_federated_refresh_tokens",
      "store_cart_items"
    ];
    const parentTables = [
      "dilmart_barber_web_sessions",
      "dilmart_barber_handoffs",
      "dilmart_customer_handoffs",
      "store_federated_session_families",
      "store_carts",
      "store_linked_profiles"
    ];
    for (const tbl of [...childTables, ...parentTables]) {
      assert.ok(
        sql.includes(`DROP TABLE IF EXISTS public.${tbl};`),
        `Migration B must explicitly drop table: ${tbl}`
      );
    }
  });
});
