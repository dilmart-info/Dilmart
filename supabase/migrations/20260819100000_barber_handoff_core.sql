-- STORE-BARBER-HANDOFF — Barber/Owner web SSO handoff foundation, migration 1/2.
--
-- Sibling of the Customer Handoff (see 20260805100100_customer_handoff_core.sql), reusing the same
-- hash-only / single-use / DB-time-expiry pattern. Deliberately SIMPLER than the Customer table:
-- Barber identity is already 1:1 resolved by store_linked_profiles.DilMart_user_id (a Barber/Owner
-- must already be a real, signature-verified DilMart user — there is no phone/email-based identity
-- resolution, no shadow account provisioning, and no LINK_REQUIRED/BLOCKED ambiguity to record.
--
-- ROLLBACK: DROP TABLE is data-destructive for in-flight handoffs (120s TTL) and audit history;
-- prefer disabling STORE_BARBER_HANDOFF_ENABLED over a drop.

-- ── DilMart_barber_handoffs (hash-only, single-use) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.DilMart_barber_handoffs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Secrets are stored ONLY as hashes. The raw 256-bit code and raw state never touch the DB.
  code_hash          TEXT        NOT NULL UNIQUE,   -- SHA-256(raw code)
  state_hash         TEXT        NOT NULL,          -- SHA-256(raw client state)

  -- Main assertion replay guard: a jti can create at most one handoff.
  assertion_jti      TEXT        NOT NULL UNIQUE,

  DilMart_user_id     UUID        NOT NULL,
  linked_profile_id  UUID        NOT NULL REFERENCES public.store_linked_profiles(id) ON DELETE CASCADE,

  -- Validated internal target path (never an external URL) — same allowlist shape as Customer.
  target_path        TEXT        NOT NULL,
  source_surface     TEXT        NOT NULL,

  status             TEXT        NOT NULL DEFAULT 'PENDING',

  expires_at         TIMESTAMPTZ NOT NULL,
  redeemed_at        TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT DilMart_barber_handoffs_status_check
    CHECK (status IN ('PENDING','REDEEMED','EXPIRED','REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_DilMart_barber_handoffs_expires_at
  ON public.DilMart_barber_handoffs(expires_at);
CREATE INDEX IF NOT EXISTS idx_DilMart_barber_handoffs_DilMart_user_id
  ON public.DilMart_barber_handoffs(DilMart_user_id);

ALTER TABLE public.DilMart_barber_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.DilMart_barber_handoffs FORCE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service_role only (bypasses RLS via the backend key).

COMMENT ON TABLE public.DilMart_barber_handoffs IS
  'One-time Barber/Owner web handoff records. Hash-only: raw code/state never stored. Single-use, DB-time expiry. Service-role only.';
COMMENT ON COLUMN public.DilMart_barber_handoffs.code_hash IS 'SHA-256 of the raw 256-bit CSPRNG handoff code. Unique. Raw code is never stored.';
COMMENT ON COLUMN public.DilMart_barber_handoffs.state_hash IS 'SHA-256 of the raw opaque client state. Compared against assertion.clientStateHash at prepare time.';
COMMENT ON COLUMN public.DilMart_barber_handoffs.assertion_jti IS 'Main assertion jti. Unique — a replayed assertion cannot create a second handoff.';
COMMENT ON COLUMN public.DilMart_barber_handoffs.linked_profile_id IS 'store_linked_profiles row upserted at prepare time (mirrors the native X-Store-Session exchange upsert). NOT NULL — a Barber handoff always resolves a real linked profile.';

-- ── DilMart_barber_handoff_audit_events (immutable, service-role only) ─────────
CREATE TABLE IF NOT EXISTS public.DilMart_barber_handoff_audit_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID        NULL,
  -- Referenced by value only (no FK) — see Customer handoff audit table for the same rationale:
  -- an append-only immutable log must never be mutated by a cascade when a handoff row expires away.
  handoff_id         UUID        NULL,
  linked_profile_id  UUID        NULL,
  event_type         TEXT        NOT NULL,
  status             TEXT        NULL,
  error_code         TEXT        NULL,
  source_surface     TEXT        NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- safe, non-PII metadata only
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_DilMart_barber_handoff_audit_handoff_id
  ON public.DilMart_barber_handoff_audit_events(handoff_id);
CREATE INDEX IF NOT EXISTS idx_DilMart_barber_handoff_audit_created_at
  ON public.DilMart_barber_handoff_audit_events(created_at);

ALTER TABLE public.DilMart_barber_handoff_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.DilMart_barber_handoff_audit_events FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.DilMart_barber_handoff_audit_events IS
  'Immutable audit trail for Barber Handoff prepare/redeem. Safe metadata only: never raw code/state/assertion/token/full phone. Service-role only.';

CREATE OR REPLACE FUNCTION public.reject_barber_handoff_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'DilMart_barber_handoff_audit_events is append-only (immutable audit trail).';
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_barber_handoff_audit_mutation ON public.DilMart_barber_handoff_audit_events;
CREATE TRIGGER trg_reject_barber_handoff_audit_mutation
  BEFORE UPDATE OR DELETE ON public.DilMart_barber_handoff_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_barber_handoff_audit_mutation();
