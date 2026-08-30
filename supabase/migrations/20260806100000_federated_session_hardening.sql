-- STORE-PR4 (DilMart-CUSTOMER-STORE-STORE-PR4) — Federated Store Session core, migration 1/2.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9, §11.2–§11.4, §16.
--
-- Additive hardening of the PR3 session-foundation tables (they carry NO rows yet) + a dedicated,
-- immutable, service-role-only session audit table. No PR3 migration is rewritten or squashed.

-- ── store_federated_session_families — rotation / audit / concurrency fields ──────────────────
ALTER TABLE public.store_federated_session_families
  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_rotated_at          TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS refresh_window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS refresh_count            INTEGER     NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_fed_session_version_positive') THEN
    ALTER TABLE public.store_federated_session_families
      ADD CONSTRAINT store_fed_session_version_positive CHECK (session_version >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_fed_session_refresh_count_nonneg') THEN
    ALTER TABLE public.store_federated_session_families
      ADD CONSTRAINT store_fed_session_refresh_count_nonneg CHECK (refresh_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_fed_session_absolute_after_created') THEN
    ALTER TABLE public.store_federated_session_families
      ADD CONSTRAINT store_fed_session_absolute_after_created CHECK (absolute_expires_at > created_at);
  END IF;
  -- Revoked/compromised families must carry a revoked_at (EXPIRED/ACTIVE need not).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_fed_session_revoked_consistency') THEN
    ALTER TABLE public.store_federated_session_families
      ADD CONSTRAINT store_fed_session_revoked_consistency
      CHECK (status NOT IN ('REVOKED','COMPROMISED') OR revoked_at IS NOT NULL);
  END IF;
END;
$$;

-- ── store_federated_refresh_tokens — rotation-chain / reuse-evidence fields ────────────────────
ALTER TABLE public.store_federated_refresh_tokens
  ADD COLUMN IF NOT EXISTS replaced_by_token_id UUID        NULL REFERENCES public.store_federated_refresh_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reuse_detected_at    TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_store_fed_families_customer_status
  ON public.store_federated_session_families(store_customer_id, status);
CREATE INDEX IF NOT EXISTS idx_store_fed_families_linked_profile
  ON public.store_federated_session_families(linked_profile_id);

-- ── store_federated_session_audit_events — immutable, service-role only ────────────────────────
CREATE TABLE IF NOT EXISTS public.store_federated_session_audit_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        UUID        NULL,
  -- Referenced by value only (no FK) so the append-only log is never cascade/SET-NULL-mutated.
  session_family_id UUID        NULL,
  refresh_token_id  UUID        NULL,
  handoff_id        UUID        NULL,
  linked_profile_id UUID        NULL,
  store_customer_id UUID        NULL,
  event_type        TEXT        NOT NULL,
  status            TEXT        NULL,
  error_code        TEXT        NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- safe, non-PII, no secrets
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_fed_session_audit_family
  ON public.store_federated_session_audit_events(session_family_id);
CREATE INDEX IF NOT EXISTS idx_store_fed_session_audit_created
  ON public.store_federated_session_audit_events(created_at);

ALTER TABLE public.store_federated_session_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_federated_session_audit_events FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reject_federated_session_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'store_federated_session_audit_events is append-only (immutable audit trail).';
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_federated_session_audit_mutation ON public.store_federated_session_audit_events;
CREATE TRIGGER trg_reject_federated_session_audit_mutation
  BEFORE UPDATE OR DELETE ON public.store_federated_session_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_federated_session_audit_mutation();

COMMENT ON TABLE public.store_federated_session_audit_events IS
  'Immutable audit trail for federated Store sessions (spec §9/§16). Safe metadata only: never raw tokens, token hashes, raw handoff code/state, phone/email, Authorization, or device id. Service-role only.';
COMMENT ON FUNCTION public.reject_federated_session_audit_mutation() IS
  'Enforces federated session audit immutability: blocks UPDATE/DELETE for every role.';
