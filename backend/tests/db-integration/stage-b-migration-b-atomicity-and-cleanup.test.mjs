import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";

const migrationBPath = path.resolve(
  process.cwd(),
  "../supabase/migrations/20260831120000_stage_b_legacy_destructive_cleanup.sql"
);

describe("Stage B Pass 4: Migration B Atomicity & Destructive Cleanup Invariants", () => {
  const sql = fs.readFileSync(migrationBPath, "utf8");

  it("Subtest 1: Migration B contains explicit BEGIN and COMMIT transaction wrapper", () => {
    assert.match(
      sql,
      /^\s*BEGIN\s*;/m,
      "Migration B must begin with explicit BEGIN;"
    );
    assert.match(
      sql,
      /COMMIT\s*;\s*$/m,
      "Migration B must end with explicit COMMIT;"
    );
  });

  it("Subtest 2: PROHIBITION: Migration B must contain ZERO CASCADE keywords", () => {
    assert.doesNotMatch(
      sql,
      /\bCASCADE\b/i,
      "Migration B must NOT use CASCADE on any DROP operation"
    );
  });

  it("Subtest 3: Migration B Preflight strictly asserts Migration A post-state", () => {
    assert.match(
      sql,
      /p\.proname\s*=\s*'place_order'/i,
      "Preflight must inspect public.place_order"
    );
    assert.match(
      sql,
      /p\.pronargs\s*=\s*49/i,
      "Preflight must assert 49 arguments on place_order"
    );
    assert.match(
      sql,
      /p\.proname\s*=\s*'place_order_idempotent'/i,
      "Preflight must inspect public.place_order_idempotent"
    );
    assert.match(
      sql,
      /p\.pronargs\s*=\s*51/i,
      "Preflight must assert 51 arguments on place_order_idempotent"
    );
    assert.match(
      sql,
      /v_po_owner\s*<>\s*'postgres'/i,
      "Preflight must assert owner is postgres"
    );
    assert.match(
      sql,
      /place_order_legacy_stageb/i,
      "Preflight must assert temporary legacy function is absent"
    );
  });

  it("Subtest 4: Migration B Preflight asserts zero rows in all 11 legacy tables", () => {
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

  it("Subtest 5: Migration B Preflight asserts zero non-null/non-default legacy column data", () => {
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

  it("Subtest 6: Migration B explicitly drops all 16 legacy candidate functions by exact signature", () => {
    const legacyFunctions = [
      "finalize_barber_handoff",
      "finalize_customer_handoff",
      "logout_all_federated_sessions",
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
    for (const fn of legacyFunctions) {
      assert.ok(
        sql.includes(`DROP FUNCTION IF EXISTS public.${fn}`),
        `Migration B must explicitly drop function: ${fn}`
      );
    }
  });

  it("Subtest 7: Migration B explicitly drops legacy columns and constraints from active tables", () => {
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

  it("Subtest 8: Migration B explicitly drops all 11 legacy tables in child-to-parent order", () => {
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
      "store_carts"
    ];
    const rootTable = "store_linked_profiles";

    const lastChildIdx = Math.max(...childTables.map((t) => sql.indexOf(`DROP TABLE IF EXISTS public.${t}`)));
    const firstParentIdx = Math.min(...parentTables.map((t) => sql.indexOf(`DROP TABLE IF EXISTS public.${t}`)));
    const rootIdx = sql.indexOf(`DROP TABLE IF EXISTS public.${rootTable}`);

    assert.ok(lastChildIdx < firstParentIdx, "Child tables must be dropped before parent session/cart tables");
    assert.ok(firstParentIdx < rootIdx, "Parent tables must be dropped before root linked profiles table");
  });
});
