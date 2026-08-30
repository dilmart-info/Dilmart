# DILMART — STAGE B PASS 2
# ROLLBACK & TEST VERIFICATION PLAN (PASS 3 BLUEPRINT)

**Generated:** 2026-08-30 | **Status:** PLANNING & PROPOSAL ONLY

---

## 1. Rollback & Recovery Strategy by Wave

| Wave | Operation | Data Loss Risk | Rollback Feasibility | Recovery / Restoration Procedure | Verification Query |
|---|---|:---:|:---:|---|---|
| **Wave 0** | `place_order` Refactor | **ZERO** (Code change only) | **HIGH** (Instant) | Re-execute prior `place_order` DDL definition from `20260820180000`. | `SELECT prosrc FROM pg_proc WHERE proname = 'place_order';` |
| **Wave 1** | Drop 19 Dead Functions | **ZERO** (Unused routines) | **HIGH** (Instant) | Execute DDL re-creating function definitions from historical migrations. | `SELECT proname FROM pg_proc WHERE proname = ANY(...);` |
| **Wave 2** | Drop 6 Leaf Tables | **ZERO** (0 live rows) | **MEDIUM** (DDL rollback) | Execute `CREATE TABLE` and `ENABLE RLS` DDL statements for the 6 empty tables. | `SELECT relname FROM pg_class WHERE relname = ANY(...);` |
| **Wave 3** | Drop 4 Intermediate Tables | **ZERO** (0 live rows) | **MEDIUM** (DDL rollback) | Re-create 4 tables and re-add FK constraints. | `SELECT conname FROM pg_constraint WHERE conname = ANY(...);` |
| **Wave 4** | Drop `store_linked_profiles` | **ZERO** (0 live rows) | **MEDIUM** (DDL rollback) | Re-create table and re-establish child FK constraints. | `SELECT relname FROM pg_class WHERE relname = 'store_linked_profiles';` |
| **Wave 5** | Drop 8 Legacy Columns | **ZERO** (0 non-null values) | **MEDIUM** (DDL rollback) | Re-add nullable columns: `ALTER TABLE ... ADD COLUMN ... NULL;` | `SELECT attname FROM pg_attribute WHERE attname = ANY(...);` |

---

## 2. Pre-Migration Safety Gates for Future Pass 3

Before executing ANY destructive DDL in Pass 3:
1. **Live Row Count Re-Check:** Assert `count(*) = 0` on every target table immediately before drop.
2. **Non-Null Value Re-Check:** Assert `count(col) = 0` on every target column immediately before drop.
3. **Database Backup Point:** Create a snapshot/dump of current schema and data via Supabase management API.
4. **CI Integration Gate:** Full green run of `Launch Critical PR Quality & Security CI` on the candidate branch.

---

## 3. Required Future Test Suite Matrix (Pass 3 Validation)

| Suite Name | Command | Primary Validation Focus |
|---|---|---|
| **Policy Matrix Suite** | `npm run test:policy` | RLS enablement, table ACL lockdowns, role privilege isolation. |
| **Hardening Regression Suite** | `npm run test:hardening` | Phone normalization, search sanitization, customer masking. |
| **Launch Critical Suite** | `npm run test:launch-critical` | Account claim, order cancellation atomicity, checkout idempotency. |
| **Product Import Suite** | `npm run test:product-import` | Catalog readiness, publication gates, tenant scope isolation. |
| **Database Integration Suite** | `node --test tests/db-integration/*.test.mjs` | Live PostgreSQL execution, atomic confirm, RLS policies, concurrency locks. |
| **Frontend Production Build** | `npm run build` (root) | Zero broken imports or type references to removed legacy tables/types. |
| **Backend Production Build** | `npm run build` (`backend/`) | Zero broken NestJS service dependencies or DTO mappings. |
| **CI / Deployment Guards** | `npm run test:ci` | Universal schema gate (`final-schema-gate.sql`) passes with 0 RLS gaps. |
