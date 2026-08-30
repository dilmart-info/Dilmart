-- STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff foundation, migration 3/4.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §11.2, §11.3, §11.4.
--
-- Schema FOUNDATIONS ONLY for the STORE-PR4 federated session. PR3 does NOT issue any
-- real access/refresh token and does NOT insert any production/fake refresh token here.
-- These tables exist so PR4 can add the federated-session core without a schema migration
-- on the critical path. Both are service-role only with FORCE RLS.
--
-- ROLLBACK: empty in PR3 (no rows). DROP TABLE is safe while unused; once PR4 issues real
-- sessions a drop becomes data-destructive and is disallowed (revoke via status instead).

-- ── store_federated_session_families ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_federated_session_families (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_customer_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  linked_profile_id   UUID        NOT NULL REFERENCES public.store_linked_profiles(id) ON DELETE CASCADE,
  DilMart_user_id      UUID        NOT NULL,
  device_id_hash      TEXT        NULL,
  session_version     INTEGER     NOT NULL DEFAULT 1,
  status              TEXT        NOT NULL DEFAULT 'ACTIVE',
  last_used_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ NULL,
  revoke_reason       TEXT        NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_federated_session_status_check
    CHECK (status IN ('ACTIVE','REVOKED','COMPROMISED','EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_store_fed_session_families_customer
  ON public.store_federated_session_families(store_customer_id);
CREATE INDEX IF NOT EXISTS idx_store_fed_session_families_DilMart_user
  ON public.store_federated_session_families(DilMart_user_id);
CREATE INDEX IF NOT EXISTS idx_store_fed_session_families_status
  ON public.store_federated_session_families(status);

ALTER TABLE public.store_federated_session_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_federated_session_families FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.store_federated_session_families IS
  'STORE-PR4 foundation (spec §11.2). Federated Store customer session families. No rows issued in PR3. Service-role only.';

-- ── store_federated_refresh_tokens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_federated_refresh_tokens (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_family_id  UUID        NOT NULL REFERENCES public.store_federated_session_families(id) ON DELETE CASCADE,
  token_hash         TEXT        NOT NULL UNIQUE,   -- hash only; raw refresh token never stored
  parent_token_id    UUID        NULL REFERENCES public.store_federated_refresh_tokens(id) ON DELETE SET NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ NULL,
  revoked_at         TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_fed_refresh_family
  ON public.store_federated_refresh_tokens(session_family_id);
CREATE INDEX IF NOT EXISTS idx_store_fed_refresh_expires
  ON public.store_federated_refresh_tokens(expires_at);

ALTER TABLE public.store_federated_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_federated_refresh_tokens FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.store_federated_refresh_tokens IS
  'STORE-PR4 foundation (spec §11.3). Rotating refresh tokens, hash only. No rows issued in PR3. Service-role only.';
