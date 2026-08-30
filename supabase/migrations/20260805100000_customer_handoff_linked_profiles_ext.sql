-- STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff foundation, migration 1/4.
-- Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §10.2 (link metadata) + §10.3 (uniqueness).
--
-- Extends public.store_linked_profiles with the identity-link lifecycle metadata the
-- Customer Handoff resolver needs, and enforces a one-to-one Store-customer link.
--
-- ADDITIVE ONLY. Existing Barber-linked rows keep every value they have today:
--   * new columns are all NULL-able (legacy rows are valid with NULL lifecycle metadata);
--   * the existing UNIQUE (DilMart_user_id) constraint is untouched;
--   * store_customer_id is NULL for every current row (the barber exchange never sets it),
--     so the new partial UNIQUE cannot conflict with existing data.
--
-- PREFLIGHT: fail closed if any duplicate non-NULL store_customer_id already exists
-- (would violate the new one-to-one invariant). We never silently pick a winner.
--
-- ROLLBACK: additive columns + one partial index. A rollback that drops these columns is
-- NON-DESTRUCTIVE to Barber data (all legacy values live in pre-existing columns), but
-- dropping the partial UNIQUE would re-open the many-DilMart→one-Store takeover vector, so
-- rollback is discouraged once Customer links exist. See migration report.

-- ── PREFLIGHT ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes
  FROM (
    SELECT store_customer_id
    FROM public.store_linked_profiles
    WHERE store_customer_id IS NOT NULL
    GROUP BY store_customer_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'STORE-PR3 preflight failed: % Store customer id(s) are linked to more than one DilMart user. Resolve duplicates before applying the one-to-one constraint; do not auto-pick a winner.',
      v_dupes;
  END IF;
END;
$$;

-- ── FORWARD SCHEMA ───────────────────────────────────────────────────────────
ALTER TABLE public.store_linked_profiles
  ADD COLUMN IF NOT EXISTS link_status        TEXT        NULL,
  ADD COLUMN IF NOT EXISTS link_method        TEXT        NULL,
  ADD COLUMN IF NOT EXISTS identity_assurance TEXT        NULL,
  ADD COLUMN IF NOT EXISTS email              TEXT        NULL,
  ADD COLUMN IF NOT EXISTS phone_verified_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS linked_at          TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_handoff_at    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS conflict_reason    TEXT        NULL;

-- Allowed-value CHECKs. NULL is permitted so pre-existing Barber rows stay valid.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_linked_profiles_link_status_check') THEN
    ALTER TABLE public.store_linked_profiles
      ADD CONSTRAINT store_linked_profiles_link_status_check
      CHECK (link_status IS NULL OR link_status IN ('LINKED','LINK_REQUIRED','BLOCKED','REVOKED'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_linked_profiles_link_method_check') THEN
    ALTER TABLE public.store_linked_profiles
      ADD CONSTRAINT store_linked_profiles_link_method_check
      CHECK (link_method IS NULL OR link_method IN ('EXISTING_LINK','VERIFIED_PHONE','VERIFIED_EMAIL','NEW_FEDERATED','MANUAL_REVIEW'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_linked_profiles_identity_assurance_check') THEN
    ALTER TABLE public.store_linked_profiles
      ADD CONSTRAINT store_linked_profiles_identity_assurance_check
      CHECK (identity_assurance IS NULL OR identity_assurance IN ('DilMart_SESSION','OTP_PHONE','OTP_EMAIL','MANUAL'));
  END IF;
END;
$$;

-- One-to-one: a Store customer is linked to at most one DilMart user (spec §10.3).
-- Partial UNIQUE (only non-NULL store_customer_id) so the many legacy NULL rows are fine.
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_linked_profiles_store_customer_id
  ON public.store_linked_profiles(store_customer_id)
  WHERE store_customer_id IS NOT NULL;

-- ── COMMENTS ─────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.store_linked_profiles.link_status IS
  'Customer Handoff link lifecycle: LINKED | LINK_REQUIRED | BLOCKED | REVOKED. NULL for legacy Barber rows.';
COMMENT ON COLUMN public.store_linked_profiles.link_method IS
  'How the link was established: EXISTING_LINK | VERIFIED_PHONE | VERIFIED_EMAIL | NEW_FEDERATED | MANUAL_REVIEW.';
COMMENT ON COLUMN public.store_linked_profiles.identity_assurance IS
  'Assurance level of the link decision: DilMart_SESSION | OTP_PHONE | OTP_EMAIL | MANUAL.';
COMMENT ON COLUMN public.store_linked_profiles.email IS
  'Normalized (lower(trim())) email captured at link time, when an email drove/accompanied the link.';
COMMENT ON COLUMN public.store_linked_profiles.phone_verified_at IS
  'Timestamp the phone was proven verified (from the Main assertion) at link time.';
COMMENT ON COLUMN public.store_linked_profiles.email_verified_at IS
  'Timestamp the email was proven verified (from the Main assertion) at link time.';
COMMENT ON COLUMN public.store_linked_profiles.linked_at IS
  'When this row first reached link_status = LINKED.';
COMMENT ON COLUMN public.store_linked_profiles.last_handoff_at IS
  'Last time a Customer Handoff resolved to this linked profile.';
COMMENT ON COLUMN public.store_linked_profiles.conflict_reason IS
  'Human-safe reason a link was BLOCKED / marked LINK_REQUIRED (no PII).';
COMMENT ON INDEX public.uq_store_linked_profiles_store_customer_id IS
  'One-to-one Store customer link (spec §10.3): a store_customer_id maps to at most one DilMart user.';
