-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 1: Jenni Stores-only (Path A) — Schema-only Data Model Extension
-- ══════════════════════════════════════════════════════════════════════════════
--
-- RULES (supervisor-approved):
--   ✅ Schema changes only (ADD COLUMN, CREATE INDEX, COMMENT)
--   ❌ NO backfill — NO UPDATE — NO DELETE — NO INSERT
--   ❌ NO jenni_merchant_id (Path A: single DilMart merchant account)
--   ❌ NO state machine changes — NO delivery_status changes
--   ❌ NO settlement tables — NO place_order() changes
--   ❌ NO provider_current_step (already exists)
--
-- All merchants remain jenni_store_id = NULL after this migration.
-- Manual mapping (e.g. DilMart-primary → 17025) requires separate approval.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1) merchants: Jenni Store identity columns ─────────────────────────────

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS jenni_store_id INTEGER,
  ADD COLUMN IF NOT EXISTS jenni_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jenni_sync_error TEXT;

COMMENT ON COLUMN public.merchants.jenni_store_id
  IS 'Jenni delivery store ID. Each DilMart merchant maps to one Jenni store/pickup point. NULL = not yet linked.';
COMMENT ON COLUMN public.merchants.jenni_synced_at
  IS 'Timestamp of last successful sync with Jenni API for this merchant store.';
COMMENT ON COLUMN public.merchants.jenni_sync_error
  IS 'Last sync error message from Jenni API. Cleared on successful sync.';

-- ─── 2) order_delivery_integrations: settlement & actual cost columns ────────

ALTER TABLE public.order_delivery_integrations
  ADD COLUMN IF NOT EXISTS jenni_store_id INTEGER,
  ADD COLUMN IF NOT EXISTS jenni_settlement_id INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_actual NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cod_collected NUMERIC(12,2);

COMMENT ON COLUMN public.order_delivery_integrations.jenni_store_id
  IS 'Jenni store_id used when this shipment was dispatched. Denormalized from merchant for audit trail.';
COMMENT ON COLUMN public.order_delivery_integrations.jenni_settlement_id
  IS 'Jenni settlement batch ID. 0 = not yet settled by Jenni.';
COMMENT ON COLUMN public.order_delivery_integrations.delivery_cost_actual
  IS 'Actual delivery cost reported by Jenni (may differ from quoted price at dispatch time).';
COMMENT ON COLUMN public.order_delivery_integrations.cod_collected
  IS 'Cash-on-delivery amount actually collected by Jenni courier from recipient.';

-- ─── 3) Indexes ──────────────────────────────────────────────────────────────

-- Partial unique: each merchant maps to at most one Jenni store
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_jenni_store_id
  ON public.merchants (jenni_store_id)
  WHERE jenni_store_id IS NOT NULL;

-- Lookup shipments by Jenni store
CREATE INDEX IF NOT EXISTS idx_odi_jenni_store_id
  ON public.order_delivery_integrations (jenni_store_id)
  WHERE jenni_store_id IS NOT NULL;

-- Settlement reconciliation queries
CREATE INDEX IF NOT EXISTS idx_odi_jenni_settlement_id
  ON public.order_delivery_integrations (jenni_settlement_id)
  WHERE jenni_settlement_id > 0;
