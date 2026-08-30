-- M29: B2B Server-side Cart for DilMart Barber App
-- Phase 4B — Cart APIs using X-Store-Session and store_linked_profiles.
--
-- Design decisions:
--   - Cart ownership = store_linked_profile_id (NOT web user_id)
--   - One active cart per linked profile (enforced via partial unique index)
--   - Partial unique index (status='active') allows multiple archived carts per profile
--   - Single-merchant constraint: merchant_id enforced at cart level in the backend
--   - Prices are stored as snapshot at add-time; backend re-validates from DB
--   - RLS enabled; service_role (NestJS) is sole accessor — no public policies
--
-- References:
--   DilMart_Store_Integration_Docs/06_DATA_MODEL_AND_MIGRATIONS.md (M27, M28)
--   M27: store_linked_profiles
--   M26: product segmentation (visible_in, target_audience, business_type_tags, min/max_order_qty)

-- ─── 1. store_carts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_carts (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership: always a linked profile from session exchange (never a raw web user_id)
  store_linked_profile_id  UUID        NOT NULL
    REFERENCES public.store_linked_profiles(id) ON DELETE CASCADE,

  -- Source tracking
  source_app               TEXT        NOT NULL DEFAULT 'barber_app',
  segment                  TEXT        NULL,        -- snapshot of profile segment at cart creation
  business_type            TEXT        NULL,        -- snapshot of profile business_type

  -- Single-merchant constraint enforced by backend; stored here for fast queries
  merchant_id              UUID        NULL
    REFERENCES public.merchants(id) ON DELETE RESTRICT,

  -- Cart lifecycle
  status                   TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'checkout_in_progress', 'converted', 'abandoned', 'cleared')),

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active cart per linked profile (partial unique index)
-- Allows archived / converted carts to co-exist for history
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_carts_active_profile
  ON public.store_carts(store_linked_profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_store_carts_merchant_id
  ON public.store_carts(merchant_id)
  WHERE merchant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_carts_status
  ON public.store_carts(status);

-- ─── 2. store_cart_items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_cart_items (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership via cart
  cart_id                  UUID        NOT NULL
    REFERENCES public.store_carts(id) ON DELETE CASCADE,

  -- Product reference (not ON DELETE CASCADE: product deletion must be handled explicitly)
  product_id               UUID        NOT NULL
    REFERENCES public.products(id) ON DELETE RESTRICT,

  -- Denormalised merchant_id for fast lookups without joining products
  merchant_id              UUID        NOT NULL
    REFERENCES public.merchants(id) ON DELETE RESTRICT,

  -- Quantity: enforced ≥ 1 by CHECK; backend also validates against min/max_order_qty
  quantity                 INTEGER     NOT NULL CHECK (quantity > 0),

  -- Price snapshot at time of add/update (backend computes from DB, client never sends price)
  product_name             TEXT        NOT NULL,
  product_slug             TEXT        NULL,
  product_image_url        TEXT        NULL,
  unit_price               NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  effective_unit_price     NUMERIC(12, 2) NOT NULL CHECK (effective_unit_price >= 0),
  -- effective_unit_price = discount_price if discount applies, otherwise unit_price
  line_total               NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
  -- line_total = effective_unit_price * quantity (backend-computed, not trusted from client)

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per product per cart
  UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_cart_items_cart_id
  ON public.store_cart_items(cart_id);

CREATE INDEX IF NOT EXISTS idx_store_cart_items_product_id
  ON public.store_cart_items(product_id);

-- ─── 3. RLS — service_role only ──────────────────────────────────────────────

ALTER TABLE public.store_carts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cart_items ENABLE ROW LEVEL SECURITY;

-- No public policies: all access is from NestJS using service_role key.
-- Frontend/mobile clients never access these tables directly.

-- ─── 4. Column comments ──────────────────────────────────────────────────────

COMMENT ON TABLE public.store_carts IS
  'B2B server-side carts for DilMart Barber App users. Owned by store_linked_profile_id. Single-merchant per active cart.';

COMMENT ON COLUMN public.store_carts.store_linked_profile_id IS
  'Refers to store_linked_profiles.id — established during X-Store-Session exchange. Never a raw web user_id.';

COMMENT ON COLUMN public.store_carts.merchant_id IS
  'Enforced single-merchant rule: all items in a cart must belong to this merchant. Set when first item is added.';

COMMENT ON COLUMN public.store_carts.status IS
  'active: in use | checkout_in_progress: being processed | converted: order placed | abandoned: timed out | cleared: explicitly cleared.';

COMMENT ON TABLE public.store_cart_items IS
  'Individual line items in a store_cart. Prices are backend-computed snapshots; client only provides productId and quantity.';

COMMENT ON COLUMN public.store_cart_items.effective_unit_price IS
  'discount_price if a discount applies and discount_price < unit_price, otherwise unit_price. Computed by backend from DB.';

COMMENT ON COLUMN public.store_cart_items.line_total IS
  'effective_unit_price * quantity. Always backend-computed.';
