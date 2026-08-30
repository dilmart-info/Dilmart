-- Gate 2 correction (DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001): Atomic Confirm via
-- Postgres RPC for product import. NOT applied by this change — see PR description /
-- GATE1_REPORT.md. Apply only after explicit governance sign-off.
--
-- Problem being fixed: the previous TS-side confirm implementation performed N sequential
-- Supabase REST calls (one SELECT + one INSERT/UPDATE per row) with a "compensating"
-- delete/update loop on failure. That is NOT atomic: a crash between the last product write
-- and the compensation loop (or between compensation calls themselves) can leave real product
-- rows behind while the session is marked 'failed', or leave the session claimable by a second
-- concurrent request while the first request is still mid-batch.
--
-- Fix: a single SECURITY DEFINER PL/pgSQL function that performs the ENTIRE confirm (claim +
-- validate + upsert every row + finalize + optional audit row) inside ONE Postgres transaction.
-- If anything fails partway through, Postgres rolls back the whole transaction automatically —
-- including the initial claim UPDATE — so the session is left exactly as it was before the
-- call (status = 'previewed'), safe to retry. No manual compensation code is needed or possible.
--
-- Concurrency: pg_advisory_xact_lock(hashtextextended(merchant_id || ':' || sku, 0))
-- serializes concurrent confirms that touch the same (merchant_id, merchant_sku) pair. This
-- matters because there is currently NO unique DB constraint on (merchant_id, merchant_sku) —
-- see docs/product-import/ard-al-khaleej/preflight/products_merchant_sku_unique.sql (blocked
-- by ~123 pre-existing duplicate groups on one merchant) — so the advisory lock is the only
-- thing preventing a duplicate-insert race for the same SKU today. The lock is xact-scoped and
-- releases automatically at COMMIT or ROLLBACK.
--
-- One-time claim: `UPDATE ... SET status='processing' WHERE status='previewed' AND
-- expires_at > now() RETURNING *`. A concurrent second call for the same import_id sees 0 rows
-- affected (Postgres MVCC blocks the second UPDATE until the first transaction ends, then the
-- WHERE re-evaluates and finds status <> 'previewed' once the first has committed, or the row
-- lock forces the second to simply wait and then fail the same WHERE check) and raises
-- IMPORT_SESSION_CLAIM_FAILED — it can never silently re-run the same import twice.
--
-- Design choice — status after a FAILED confirm stays 'previewed', not 'failed':
-- Postgres cannot both (a) leave a durable "status='failed'" marker and (b) roll back the
-- product writes in the SAME transaction — an EXCEPTION handler that writes a marker and then
-- re-raises would also roll back its own marker write (there is no autonomous transaction in
-- plain plpgsql, no dblink/pg_background dependency here). We deliberately choose (b): on any
-- error the whole transaction — including the claim — rolls back, so
-- `product_import_sessions.status` simply reverts to 'previewed' and the merchant/admin can
-- safely retry the confirm. The same reasoning applies to the "expired" case: this function
-- does NOT attempt to write status='expired' from inside a transaction that is about to raise
-- (that write would be rolled back too). Instead the caller (ProductImportService), upon seeing
-- the IMPORT_SESSION_EXPIRED error, performs a small best-effort, non-transactional UPDATE
-- purely for UI/audit labelling — it has no bearing on correctness because `expires_at` is
-- already re-checked by the claim WHERE clause on every future attempt regardless of the status
-- label actually stored.
--
-- Invalid rows: if the session's `invalid_rows` counter is > 0, OR any row inside
-- `preview_payload.rows` has `status = 'invalid'` (defense in depth against a stale/tampered
-- counter), the function raises IMPORT_HAS_INVALID_ROWS before touching a single product row.
-- Zero product writes ever happen for a batch that contains an invalid row — the caller must
-- fix the CSV and re-preview.
--
-- Slugs: the stable slug (`{slugify(name)}-{sku}`) is computed once, deterministically, in TS
-- at PREVIEW time (pure function of name+sku, no DB access needed) and stored in
-- `preview_payload.rows[i].normalized.slug`. This function only handles the DB-dependent part:
-- retrying once with a short deterministic merchant-hash suffix if that exact slug is already
-- taken globally (`products.slug` is DB-wide UNIQUE) by a different merchant's product. An
-- existing product's slug is NEVER touched on update, by construction (the UPDATE statement
-- below does not include the slug column).
--
-- Style follows supabase/migrations/20260512200000_p1_6_payout_batch_atomic_rpc.sql.
--
-- ── Gate 2 SECOND-REVIEW corrections (this revision) ────────────────────────────────────────
-- A. Ambiguous SKU guard: pre-existing (merchant_id, merchant_sku) duplicate data (see the
--    ~123-duplicate-group note above) meant the old `SELECT ... FOR UPDATE` silently picked an
--    arbitrary row when more than one existing product already shared the same SKU for a
--    merchant. That is now an explicit, loud failure (`IMPORT_SKU_AMBIGUOUS`) instead of a
--    silent, non-deterministic UPDATE of one of several candidate rows.
-- B. Constraint-specific unique_violation: the slug-collision retry-with-suffix logic used to
--    catch ANY `unique_violation` on INSERT, which would silently swallow a violation of some
--    OTHER unique constraint (e.g. a future `merchant_sku` unique index) and misattribute it to
--    a slug collision. `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME` now checks the failing
--    constraint is actually `products_slug_key` before retrying; any other constraint
--    re-raises unchanged.
-- C. Payload integrity pre-pass (Phase 2.5, below): validates the ENTIRE payload — shape,
--    counters, per-row required fields (price/stock/discount/category/visibility/image) — in a
--    read-only pass BEFORE a single product write happens in Phase 3. This closes a gap where a
--    row with a tampered/out-of-range field (e.g. a negative price, or a `category_id` deleted
--    since preview) would have been written as-is by the old code.
-- D. Draft-merchant safety: a merchant that is not `status = 'active'` can never end up with a
--    publicly visible product via import, even if the JSON payload's normalized row claims
--    otherwise (e.g. a tampered/stale preview payload) — `is_active`, `is_published`,
--    `visibility_status`, and `stock` are force-overridden for every write while the merchant is
--    non-active. This is enforced here (the actual gatekeeper); the TS layer independently
--    rejects such CSV rows earlier as defense in depth (see product-import.service.ts).

-- 1) Extend the status check constraint to allow the transient 'processing' state used while a
--    confirm is in flight (between claim and finalize).
ALTER TABLE public.product_import_sessions
  DROP CONSTRAINT IF EXISTS product_import_sessions_status_check;

ALTER TABLE public.product_import_sessions
  ADD CONSTRAINT product_import_sessions_status_check
  CHECK (status IN ('previewed', 'processing', 'confirmed', 'expired', 'failed'));

-- 2) Atomic confirm RPC.
CREATE OR REPLACE FUNCTION public.product_import_confirm_atomic(
  p_import_id   UUID,
  p_merchant_id UUID,
  p_actor_id    UUID    DEFAULT NULL,
  p_actor_role  TEXT    DEFAULT NULL,
  p_write_audit BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session             public.product_import_sessions%ROWTYPE;
  v_probe               public.product_import_sessions%ROWTYPE;
  v_payload             JSONB;
  v_rows                JSONB;
  v_row                 JSONB;
  v_normalized          JSONB;
  v_status              TEXT;
  v_has_invalid         BOOLEAN := false;
  v_sku                 TEXT;
  v_slug                TEXT;
  v_final_slug          TEXT;
  v_existing_id         UUID;
  v_product_id          UUID;
  v_action              TEXT;
  v_row_number          INT;
  v_images              TEXT[];
  v_sizes               TEXT[];
  v_report_rows         JSONB := '[]'::jsonb;
  v_created             INT := 0;
  v_updated             INT := 0;
  v_skipped             INT := 0;
  v_total               INT := 0;
  v_report              JSONB;
  -- Merchant draft-safety.
  v_merchant_status     TEXT;
  v_force_draft_safety  BOOLEAN := false;
  v_eff_is_active       BOOLEAN;
  v_eff_is_published    BOOLEAN;
  v_eff_visibility      TEXT;
  v_eff_stock           INT;
  -- Phase 2.5 payload integrity pre-pass.
  v_integrity_valid_ct  INT := 0;
  v_seen_skus           TEXT[] := '{}';
  v_chk_sku             TEXT;
  v_chk_price           NUMERIC;
  v_chk_discount        NUMERIC;
  v_chk_stock           INT;
  v_chk_category        UUID;
  v_chk_visibility      TEXT;
  v_chk_image           TEXT;
  v_chk_row_number      TEXT;
  v_category_exists     BOOLEAN;
  -- Phase 3 SKU-ambiguity guard + constraint-specific unique_violation.
  v_match_count         INT;
  v_constraint_name     TEXT;
BEGIN
  -- Phase 1: one-time conditional claim.
  UPDATE public.product_import_sessions
  SET    status = 'processing'
  WHERE  id = p_import_id
    AND  merchant_id = p_merchant_id
    AND  status = 'previewed'
    AND  expires_at > now()
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    SELECT * INTO v_probe
    FROM   public.product_import_sessions
    WHERE  id = p_import_id AND merchant_id = p_merchant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'IMPORT_SESSION_NOT_FOUND';
    END IF;

    IF v_probe.status = 'previewed' AND v_probe.expires_at <= now() THEN
      RAISE EXCEPTION 'IMPORT_SESSION_EXPIRED';
    END IF;

    -- Either already 'processing' (a concurrent confirm is in flight), or already a terminal
    -- status ('confirmed' / 'failed' / 'expired') — either way this call cannot proceed.
    RAISE EXCEPTION 'IMPORT_SESSION_CLAIM_FAILED';
  END IF;

  v_payload := COALESCE(v_session.preview_payload, '{}'::jsonb);
  v_rows    := COALESCE(v_payload->'rows', '[]'::jsonb);
  v_total   := jsonb_array_length(v_rows);

  -- Phase 1.5: draft-merchant safety net. If the merchant is not (yet) active, force every
  -- product write in this batch to the safe/private defaults regardless of what the JSON
  -- payload's normalized row claims — a tampered or stale preview payload must never be able to
  -- publish a product for a merchant that has not gone live. See item D above.
  SELECT status INTO v_merchant_status FROM public.merchants WHERE id = p_merchant_id;
  v_force_draft_safety := (v_merchant_status IS DISTINCT FROM 'active');

  -- Phase 2: invalid-row guard — zero product writes if this trips.
  v_has_invalid := COALESCE(v_session.invalid_rows, 0) > 0;
  IF NOT v_has_invalid THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_rows) elem WHERE elem->>'status' = 'invalid'
    ) INTO v_has_invalid;
  END IF;

  IF v_has_invalid THEN
    -- Cosmetic only: this UPDATE is inside the same transaction as the RAISE below, so it is
    -- rolled back along with the Phase 1 claim. The session ends up back at 'previewed' either
    -- way (see design note above) — kept for readability of intent.
    UPDATE public.product_import_sessions SET status = 'previewed' WHERE id = p_import_id;
    RAISE EXCEPTION 'IMPORT_HAS_INVALID_ROWS';
  END IF;

  -- Phase 2.5: payload integrity pre-pass. Read-only — validates shape, counters, and every
  -- per-row field BEFORE a single product write happens in Phase 3. Any failure here means zero
  -- product writes for the whole batch (same rollback guarantee as every other failure mode).
  IF v_total IS DISTINCT FROM COALESCE(v_session.total_rows, 0) THEN
    RAISE EXCEPTION 'IMPORT_PAYLOAD_INTEGRITY_FAILED: rows length % does not match session.total_rows %', v_total, v_session.total_rows;
  END IF;

  IF COALESCE(v_session.invalid_rows, 0) <> 0 THEN
    -- Unreachable in practice (Phase 2 already raised IMPORT_HAS_INVALID_ROWS above whenever
    -- invalid_rows > 0), kept as an explicit, independent assertion per the integrity contract.
    RAISE EXCEPTION 'IMPORT_PAYLOAD_INTEGRITY_FAILED: session.invalid_rows is not zero';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) AS value
  LOOP
    v_status := COALESCE(v_row->>'status', '');
    v_chk_row_number := COALESCE(v_row->>'row_number', '?');

    -- By this point Phase 2 already guarantees no row has status='invalid'; anything other
    -- than 'valid'/'warning' here is an unknown/tampered status (e.g. 'foo') and must be
    -- rejected rather than silently skipped (silently skipping would corrupt the reported
    -- created/updated/skipped totals without signalling an error to the caller).
    IF v_status NOT IN ('valid', 'warning') THEN
      RAISE EXCEPTION 'IMPORT_PAYLOAD_INTEGRITY_FAILED: row % has unknown status %', v_chk_row_number, v_status;
    END IF;

    v_integrity_valid_ct := v_integrity_valid_ct + 1;
    v_normalized := v_row->'normalized';

    v_chk_sku := upper(btrim(COALESCE(v_normalized->>'sku', '')));
    IF v_chk_sku = '' THEN
      RAISE EXCEPTION 'IMPORT_PAYLOAD_INTEGRITY_FAILED: row % has an empty sku', v_chk_row_number;
    END IF;
    IF v_chk_sku = ANY(v_seen_skus) THEN
      RAISE EXCEPTION 'IMPORT_PAYLOAD_INTEGRITY_FAILED: duplicate sku % within payload (row %)', v_chk_sku, v_chk_row_number;
    END IF;
    v_seen_skus := array_append(v_seen_skus, v_chk_sku);

    -- Per-row field validation, before any write (item C, second bullet list).
    v_chk_price := NULLIF(v_normalized->>'price', '')::numeric;
    IF v_chk_price IS NULL OR v_chk_price <= 0 THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_PRICE: row % sku %', v_chk_row_number, v_chk_sku;
    END IF;

    v_chk_stock := NULLIF(v_normalized->>'stock', '')::int;
    IF v_chk_stock IS NULL OR v_chk_stock < 0 THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_STOCK: row % sku %', v_chk_row_number, v_chk_sku;
    END IF;

    v_chk_discount := NULLIF(v_normalized->>'discount_price', '')::numeric;
    IF v_chk_discount IS NOT NULL AND (v_chk_discount <= 0 OR v_chk_discount >= v_chk_price) THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_DISCOUNT_PRICE: row % sku %', v_chk_row_number, v_chk_sku;
    END IF;

    v_chk_category := NULLIF(v_normalized->>'category_id', '')::uuid;
    IF v_chk_category IS NULL THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_CATEGORY: row % sku % has no category_id', v_chk_row_number, v_chk_sku;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.categories WHERE id = v_chk_category) INTO v_category_exists;
    IF NOT v_category_exists THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_CATEGORY: row % sku % category_id % does not exist', v_chk_row_number, v_chk_sku, v_chk_category;
    END IF;

    v_chk_visibility := COALESCE(NULLIF(v_normalized->>'visibility_status', ''), 'private');
    IF v_chk_visibility NOT IN ('public', 'private', 'archived') THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_VISIBILITY: row % sku %', v_chk_row_number, v_chk_sku;
    END IF;

    v_chk_image := COALESCE(v_normalized->>'image_url', '');
    IF v_chk_image <> '' AND v_chk_image NOT LIKE 'https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/%' THEN
      RAISE EXCEPTION 'IMPORT_ROW_INVALID_IMAGE: row % sku %', v_chk_row_number, v_chk_sku;
    END IF;
  END LOOP;

  IF v_integrity_valid_ct IS DISTINCT FROM COALESCE(v_session.valid_rows, 0) THEN
    RAISE EXCEPTION 'IMPORT_PAYLOAD_INTEGRITY_FAILED: valid/warning row count % does not match session.valid_rows %', v_integrity_valid_ct, v_session.valid_rows;
  END IF;

  -- Phase 3: upsert every valid/warning row, in original row order. Phase 2.5 above already
  -- proved every row in this loop has a valid/warning status, a non-empty unique SKU, and
  -- passing field-level validation — this loop performs the actual writes.
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) AS value
  LOOP
    v_row_number := COALESCE((v_row->>'row_number')::int, 0);
    v_normalized := v_row->'normalized';
    v_sku := upper(btrim(COALESCE(v_normalized->>'sku', '')));
    IF v_sku = '' THEN
      -- Unreachable: Phase 2.5 already rejected empty SKUs. Kept as defense in depth.
      RAISE EXCEPTION 'IMPORT_ROW_MISSING_SKU';
    END IF;

    -- Serialize concurrent confirms touching the same (merchant, sku) pair. There is currently
    -- no DB-level UNIQUE(merchant_id, merchant_sku) constraint (see file header), so this
    -- advisory lock is the primary defense against a duplicate-insert race for the same SKU.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_merchant_id::text || ':' || v_sku, 0));

    -- Item A: ambiguous-SKU guard. Pre-existing duplicate (merchant_id, merchant_sku) data means
    -- more than one product row can already match — silently picking one (the old behaviour) is
    -- non-deterministic and can update the WRONG row. Fail loudly instead.
    SELECT count(*) INTO v_match_count
    FROM public.products
    WHERE merchant_id = p_merchant_id AND merchant_sku = v_sku;

    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'IMPORT_SKU_AMBIGUOUS: merchant % sku % matches % existing products', p_merchant_id, v_sku, v_match_count;
    ELSIF v_match_count = 1 THEN
      SELECT id INTO v_existing_id FROM public.products
      WHERE merchant_id = p_merchant_id AND merchant_sku = v_sku
      FOR UPDATE;
    ELSE
      v_existing_id := NULL;
    END IF;

    v_images := CASE
      WHEN COALESCE(v_normalized->>'image_url', '') <> '' THEN ARRAY[v_normalized->>'image_url']
      ELSE '{}'::text[]
    END;
    v_sizes := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_normalized->'sizes', '[]'::jsonb))),
      '{}'::text[]
    );

    -- Item D: draft-merchant safety — force safe defaults regardless of payload content while
    -- the merchant is not active. When active, use the normalized payload values as-is.
    IF v_force_draft_safety THEN
      v_eff_is_active := false;
      v_eff_is_published := false;
      v_eff_visibility := 'private';
      v_eff_stock := 0;
    ELSE
      v_eff_is_active := COALESCE((v_normalized->>'is_active')::boolean, false);
      v_eff_is_published := COALESCE((v_normalized->>'is_published')::boolean, false);
      v_eff_visibility := COALESCE(NULLIF(v_normalized->>'visibility_status', ''), 'private');
      v_eff_stock := COALESCE((v_normalized->>'stock')::int, 0);
    END IF;

    IF v_existing_id IS NOT NULL THEN
      -- Never change slug on update — stability for the same (merchant_id, sku) pair.
      UPDATE public.products SET
        name              = v_normalized->>'name',
        description       = COALESCE(v_normalized->>'description', ''),
        category_id       = NULLIF(v_normalized->>'category_id', '')::uuid,
        price             = COALESCE((v_normalized->>'price')::numeric, 0),
        discount_price    = NULLIF(v_normalized->>'discount_price', '')::numeric,
        stock             = v_eff_stock,
        brand             = NULLIF(v_normalized->>'brand', ''),
        sizes             = v_sizes,
        is_active         = v_eff_is_active,
        is_published      = v_eff_is_published,
        visibility_status = v_eff_visibility,
        images            = v_images
      WHERE id = v_existing_id AND merchant_id = p_merchant_id;

      v_product_id := v_existing_id;
      v_action := 'updated';
      v_updated := v_updated + 1;
    ELSE
      v_slug := NULLIF(v_normalized->>'slug', '');
      IF v_slug IS NULL THEN
        RAISE EXCEPTION 'IMPORT_ROW_MISSING_SLUG';
      END IF;
      v_final_slug := v_slug;

      BEGIN
        INSERT INTO public.products (
          merchant_id, slug, name, description, category_id, price, discount_price, stock,
          brand, sizes, is_active, is_published, visibility_status, images, merchant_sku,
          purchase_price, low_stock_threshold, is_featured, is_new, is_best_seller,
          loyalty_points_enabled
        ) VALUES (
          p_merchant_id, v_final_slug, v_normalized->>'name', COALESCE(v_normalized->>'description', ''),
          NULLIF(v_normalized->>'category_id', '')::uuid, COALESCE((v_normalized->>'price')::numeric, 0),
          NULLIF(v_normalized->>'discount_price', '')::numeric, v_eff_stock,
          NULLIF(v_normalized->>'brand', ''), v_sizes,
          v_eff_is_active, v_eff_is_published,
          v_eff_visibility, v_images, v_sku,
          0, 5, false, false, false, false
        )
        RETURNING id INTO v_product_id;
      EXCEPTION WHEN unique_violation THEN
        -- Item B: only retry-with-suffix on a genuine global UNIQUE(products.slug) collision.
        -- Any OTHER unique constraint violation (e.g. a future unique index on merchant_sku)
        -- must propagate unchanged instead of being silently reinterpreted as a slug clash.
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name IS DISTINCT FROM 'products_slug_key' THEN
          RAISE;
        END IF;

        -- Genuine slug collision with a DIFFERENT merchant's product. Retry once with a short,
        -- deterministic (non-random) merchant-hash suffix — never a random suffix, and this
        -- branch never fires on update (only on INSERT, above).
        v_final_slug := v_slug || '-' || substr(md5(p_merchant_id::text), 1, 6);
        INSERT INTO public.products (
          merchant_id, slug, name, description, category_id, price, discount_price, stock,
          brand, sizes, is_active, is_published, visibility_status, images, merchant_sku,
          purchase_price, low_stock_threshold, is_featured, is_new, is_best_seller,
          loyalty_points_enabled
        ) VALUES (
          p_merchant_id, v_final_slug, v_normalized->>'name', COALESCE(v_normalized->>'description', ''),
          NULLIF(v_normalized->>'category_id', '')::uuid, COALESCE((v_normalized->>'price')::numeric, 0),
          NULLIF(v_normalized->>'discount_price', '')::numeric, v_eff_stock,
          NULLIF(v_normalized->>'brand', ''), v_sizes,
          v_eff_is_active, v_eff_is_published,
          v_eff_visibility, v_images, v_sku,
          0, 5, false, false, false, false
        )
        RETURNING id INTO v_product_id;
      END;

      v_action := 'created';
      v_created := v_created + 1;
    END IF;

    v_report_rows := v_report_rows || jsonb_build_object(
      'row_number', v_row_number, 'sku', v_sku, 'action', v_action, 'product_id', v_product_id
    );
  END LOOP;

  v_skipped := v_total - v_created - v_updated;

  v_report := jsonb_build_object(
    'total', v_total, 'created', v_created, 'updated', v_updated,
    'skipped', v_skipped, 'failed', 0, 'errors', '[]'::jsonb, 'rows', v_report_rows
  );

  -- Phase 4: finalize. Merge confirm_result into the existing preview_payload (shallow merge
  -- via jsonb ||  preserves 'summary'/'rows', replaces any prior 'confirm_result').
  UPDATE public.product_import_sessions
  SET    status = 'confirmed',
         confirmed_at = now(),
         preview_payload = v_payload || jsonb_build_object('confirm_result', v_report)
  WHERE  id = p_import_id;

  -- Phase 5: optional audit row — same transaction as the product writes, so it can never be
  -- recorded without the writes actually having committed (or vice versa).
  IF p_write_audit AND p_actor_id IS NOT NULL AND p_actor_role IS NOT NULL THEN
    INSERT INTO public.audit_logs (event_type, actor_id, actor_role, merchant_id, resource_type, resource_id, payload)
    VALUES (
      'ADMIN_ACTION', p_actor_id, p_actor_role, p_merchant_id, 'product_import_session', p_import_id::text,
      jsonb_build_object(
        'merchant_id', p_merchant_id,
        'import_session_id', p_import_id,
        'filename', v_session.original_filename,
        'totals', jsonb_build_object('total', v_total, 'created', v_created, 'updated', v_updated, 'skipped', v_skipped, 'failed', 0),
        'actor_id', p_actor_id,
        'actor_role', p_actor_role,
        'timestamp', now()
      )
    );
  END IF;

  RETURN v_report;
END;
$$;

-- Security: restrict to service_role only — the NestJS backend uses the service-role key; no
-- JWT client should ever be able to call this directly (it bypasses RLS via SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.product_import_confirm_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_import_confirm_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.product_import_confirm_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.product_import_confirm_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO service_role;
