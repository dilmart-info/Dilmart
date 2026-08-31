# DILMART — Stage B Pass 4: Migration B Final Authority Correction & Dual-Environment Fingerprint Dossier

---

## 1. Executive Summary

This dossier provides the authoritative machine-verified catalog and fingerprint analysis for **Stage B Migration B (`20260831120000_stage_b_legacy_destructive_cleanup.sql`)** following the merge of dedicated Netlify trust-boundary PR #4 into `main` and the final micro-correction of function accounting and complete literal argument signature comparison.

All findings are based on direct read-only inspection of the live Production database (`ztplxqlthuqkuktbznbo`) and clean local migration replay.

---

## 2. Exact Candidate Function Family Inventory (19 Names Total)

The legacy candidate cleanup family contains **exactly 19 function names** (19 function overloads):

| # | Function Name | Live Production Identity | Clean Replay Identity | Action in Migration B |
|---|:---|:---|:---|:---|
| 1 | `finalize_barber_handoff` | `(uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,integer,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 2 | `finalize_customer_handoff` | `(uuid,uuid,text,text,text,text,boolean,text,text,text,text,text,text,text,integer,text,text,timestamp with time zone,timestamp with time zone,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 3 | `logout_all_federated_sessions` | `(text,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 4 | `logout_federated_session` | `(text,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 5 | `place_b2b_cart_order_idempotent` | `(uuid,text,uuid,uuid,timestamp with time zone,text,text,uuid,text,numeric,numeric,numeric,jsonb,text,text,numeric,uuid,double precision,double precision,text,uuid,numeric,numeric,numeric,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,integer,text,text,text,numeric,uuid,uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,text,text)` | Identical | **REMOVE (RESTRICT)** |
| 6 | `provision_dilmart_federated_customer` | `(uuid,text)` | Identical | **REMOVE (RESTRICT)** |
| 7 | `redeem_and_create_federated_session` | `(text,text,uuid,uuid,text,uuid,text,uuid,uuid,uuid,uuid,text,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 8 | `redeem_barber_handoff_and_create_session` | `(text,text,text,integer)` | Identical | **REMOVE (RESTRICT)** |
| 9 | `redeem_customer_handoff` | `(text,text)` | Identical | **REMOVE (RESTRICT)** |
| 10 | `reject_barber_handoff_audit_mutation` | `()` | Identical | **REMOVE (RESTRICT)** |
| 11 | `reject_handoff_audit_mutation` | `()` | Identical | **REMOVE (RESTRICT)** |
| 12 | `reject_federated_session_audit_mutation` | `()` | Identical | **REMOVE (RESTRICT)** |
| 13 | `reject_reserved_federated_email` | `()` | Identical | **KEEP / DEFER (Migration F)** |
| 14 | `resolve_dilmart_federated_customer` | `(uuid,text)` | Identical | **REMOVE (RESTRICT)** |
| 15 | `revoke_barber_web_sessions_for_user` | `(uuid)` | Identical | **REMOVE (RESTRICT)** |
| 16 | `revoke_federated_sessions_for_identity` | `(uuid,uuid,text,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 17 | `rotate_federated_refresh_token` | `(text,uuid,text,text,uuid,uuid,uuid,uuid,integer,uuid)` | Identical | **REMOVE (RESTRICT)** |
| 18 | `validate_federated_session_family` | `(uuid,integer)` | Identical | **REMOVE (RESTRICT)** |
| 19 | `verify_barber_web_session` | `(text)` | Identical | **REMOVE (RESTRICT)** |

### Final Accounting Summary
- **Total Candidate Function Names in Family:** **19**
- **Migration B Target Functions Dropped:** **18**
- **Preserved / Deferred Functions (`auth.users` guard):** **1** (`reject_reserved_federated_email()`)

---

## 3. Dual-Environment Fingerprint Comparison & Whitelist

Both live production and clean migration replay produce identical regprocedure signatures due to the migration hardening applied in `20260806100200` and `20260819100200`.

### Fail-Closed Whitelist Policy
Migration B Preflight enumerates every function present in `pg_proc` under `public` matching any of the 19 candidate names and asserts that its `p.oid::regprocedure::text` is strictly contained within the reviewed whitelist. If an unreviewed signature or overload appears, the migration fails immediately with `STAGE_B_UNEXPECTED_LEGACY_FUNCTION_IDENTITY`.

---

## 4. Modern Integrity Contract: `checkout_attempts.user_id`

- **Pre-Migration State:** `checkout_attempts.user_id` was nullable due to the legacy XOR constraint `chk_checkout_attempts_owner_xor` accommodating `store_linked_profile_id` and `store_cart_id`.
- **Preflight Check:** Asserts `count(*) WHERE user_id IS NULL = 0`.
- **Migration Action:** Executes `ALTER TABLE public.checkout_attempts ALTER COLUMN user_id SET NOT NULL;` before dropping legacy columns.
- **Postcondition Gate:** Asserts `information_schema.columns.is_nullable = 'NO'` for `checkout_attempts.user_id`.

---

## 5. Migration A Authority Protection Fingerprint

Migration B verifies the COMPLETE literal identity arguments string of the surviving modern functions before executing any DDL:

| Check | `public.place_order` | `public.place_order_idempotent` |
|:---|:---|:---|
| **Count** | Exactly 1 | Exactly 1 |
| **Argument Count** | Exactly 49 | Exactly 51 |
| **Security Mode** | `SECURITY DEFINER` | `SECURITY DEFINER` |
| **Owner** | `postgres` | `postgres` |
| **Search Path** | `public, pg_temp` | `public, pg_temp` |
| **Identity Arguments** | COMPLETE literal 49-arg Migration A signature string | COMPLETE literal 51-arg Migration A signature string |
| **Execute ACL** | `service_role` ONLY (`PUBLIC`, `anon`, `authenticated` revoked) | `service_role` ONLY (`PUBLIC`, `anon`, `authenticated` revoked) |
| **Legacy Stubs** | `place_order_legacy_stageb` = 0 | 55-arg `place_order` = 0 |

---

## 6. Live Production Data Invariant Validation

Live read-only inspection confirmed:
- **All 11 legacy tables:** Exactly 0 rows.
- **All 7 target legacy columns on active tables:** Exactly 0 non-default values.
- **`checkout_attempts.user_id` NULL rows:** Exactly 0 rows.

---

## 7. Remaining Stage B Debt Register & Residue Classification

| Item | Current Production State | Classification | Target Milestone |
|:---|:---|:---|:---|
| `marketplace_banners.requires_verified_salon` | 0 non-default rows | **REMOVE LATER** | Follow-up Stage B cleanup migration |
| `marketplace_banners.visible_in` default | `ARRAY['barber_app']` default | **REMOVE LATER / DEFAULT FIX** | Update default before final Stage B closure |
| `orders.source_app` | 0 non-null rows | **REPURPOSE / KEEP** | Retain as neutral client/channel tag |
| `orders.segment` | 0 non-null rows | **REPURPOSE / DEFER** | Evaluate for general marketplace customer segment |
| `orders.business_type` | 0 non-null rows | **REPURPOSE / DEFER** | Evaluate for general merchant business type |
| `auth.users.trg_reject_reserved_federated_email` | 0 reserved/federated users | **DEFER (Migration F)** | Dedicated Auth Boundary retirement migration |
