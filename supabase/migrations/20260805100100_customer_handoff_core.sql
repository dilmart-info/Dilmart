-- STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff foundation, migration 2/4.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §11.1 (handoff table), §11.4 (RLS),
--                 §16.2/§16.3 (hash-only, single-use, replay), E2/E4 of the task.
--
-- Creates the one-time Handoff table (hash-only storage) and a dedicated, immutable,
-- service-role-only audit-event table. No raw code, raw state, assertion, or PII columns.
--
-- ROLLBACK: DROP TABLE of both is data-destructive for in-flight handoffs and audit history.
-- Handoffs are short-lived (120s) and additive; prefer disabling the feature flag over a drop.

-- ── DilMart_customer_handoffs (hash-only, single-use) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.DilMart_customer_handoffs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Secrets are stored ONLY as hashes. The raw 256-bit code and raw state never touch the DB.
  code_hash          TEXT        NOT NULL UNIQUE,   -- SHA-256(raw code)
  state_hash         TEXT        NOT NULL,          -- SHA-256(raw client state)

  -- Assertion replay guard: a jti can create at most one handoff.
  assertion_jti      TEXT        NOT NULL UNIQUE,

  -- Resolved identity (nullable until/unless a link/customer is resolved).
  DilMart_user_id     UUID        NOT NULL,
  linked_profile_id  UUID        NULL REFERENCES public.store_linked_profiles(id) ON DELETE SET NULL,
  store_customer_id  UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Validated internal target path (never an external URL).
  target_path        TEXT        NOT NULL,
  source_surface     TEXT        NOT NULL,
  campaign           TEXT        NULL,

  status             TEXT        NOT NULL DEFAULT 'PENDING',
  identity_outcome   TEXT        NOT NULL,          -- LINKED | LINK_REQUIRED | BLOCKED

  expires_at         TIMESTAMPTZ NOT NULL,
  redeemed_at        TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT DilMart_customer_handoffs_status_check
    CHECK (status IN ('PENDING','REDEEMED','EXPIRED','REJECTED','LINK_REQUIRED','BLOCKED')),
  CONSTRAINT DilMart_customer_handoffs_identity_outcome_check
    CHECK (identity_outcome IN ('LINKED','LINK_REQUIRED','BLOCKED'))
);

CREATE INDEX IF NOT EXISTS idx_DilMart_customer_handoffs_expires_at
  ON public.DilMart_customer_handoffs(expires_at);
CREATE INDEX IF NOT EXISTS idx_DilMart_customer_handoffs_status
  ON public.DilMart_customer_handoffs(status);
CREATE INDEX IF NOT EXISTS idx_DilMart_customer_handoffs_DilMart_user_id
  ON public.DilMart_customer_handoffs(DilMart_user_id);

ALTER TABLE public.DilMart_customer_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.DilMart_customer_handoffs FORCE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service_role only (bypasses RLS via the backend key).

COMMENT ON TABLE public.DilMart_customer_handoffs IS
  'One-time Customer Handoff records (spec §11.1). Hash-only: raw code/state never stored. Single-use, DB-time expiry. Service-role only.';
COMMENT ON COLUMN public.DilMart_customer_handoffs.code_hash IS 'SHA-256 of the raw 256-bit CSPRNG handoff code. Unique. Raw code is never stored.';
COMMENT ON COLUMN public.DilMart_customer_handoffs.state_hash IS 'SHA-256 of the raw opaque client state. Compared against assertion.clientStateHash at prepare time.';
COMMENT ON COLUMN public.DilMart_customer_handoffs.assertion_jti IS 'Main assertion jti. Unique — a replayed assertion cannot create a second handoff.';
COMMENT ON COLUMN public.DilMart_customer_handoffs.identity_outcome IS 'Resolved identity outcome recorded at prepare: LINKED | LINK_REQUIRED | BLOCKED.';

-- ── DilMart_customer_handoff_audit_events (immutable, service-role only) ───────
CREATE TABLE IF NOT EXISTS public.DilMart_customer_handoff_audit_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID        NULL,
  -- Referenced by value only (NO foreign key). An append-only immutable audit log must never be
  -- mutated by a cascade/SET-NULL action when a handoff or linked profile is later removed; the
  -- B8 immutability trigger blocks all UPDATE/DELETE, so a referential action would break deletes.
  handoff_id         UUID        NULL,
  linked_profile_id  UUID        NULL,
  event_type         TEXT        NOT NULL,
  status             TEXT        NULL,
  error_code         TEXT        NULL,
  source_surface     TEXT        NULL,
  campaign           TEXT        NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- safe, non-PII metadata only
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_DilMart_handoff_audit_handoff_id
  ON public.DilMart_customer_handoff_audit_events(handoff_id);
CREATE INDEX IF NOT EXISTS idx_DilMart_handoff_audit_created_at
  ON public.DilMart_customer_handoff_audit_events(created_at);

ALTER TABLE public.DilMart_customer_handoff_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.DilMart_customer_handoff_audit_events FORCE ROW LEVEL SECURITY;
-- No anon/authenticated policies: service_role only.

COMMENT ON TABLE public.DilMart_customer_handoff_audit_events IS
  'Immutable audit trail for Customer Handoff prepare/redeem (task E4). Safe metadata only: never raw code/state/assertion/token/full phone/email/body. Service-role only.';
