-- FRA-S5-001 (P0) — block browser updates to order financial state.
--
-- Confirmed on Production by the Stage 5 catalog query before this migration:
-- `public.orders` granted SELECT, INSERT, UPDATE and DELETE to both `anon` and
-- `authenticated`, and carried two PERMISSIVE UPDATE policies with no column
-- restriction:
--
--   'Agents can update their assigned orders'
--     USING/WITH CHECK (auth.uid() = agent_id)                    roles={authenticated}
--   'Merchant members can update own merchant orders'
--     USING/WITH CHECK app_private.is_merchant_member(merchant_id) roles={public}
--
-- PostgreSQL RLS cannot restrict columns, and the table has no column-level
-- grants, so both policies authorised a write to EVERY column of a matching row.
-- 49 sensitive columns were browser-writable, among them cash_expected_amount,
-- cash_received_amount, cash_actual_remitted_amount, cash_remittance_difference,
-- collection_status, courier_fee_payable, commission_rule_id and agent_id. A
-- delivery agent could rewrite the cash owed on any order assigned to them and a
-- merchant member the commission and settlement state of any of their orders,
-- with one authenticated PATCH through PostgREST — bypassing place_order's
-- immutable financial snapshot, cancel_order_atomic's CAS and terminal-state
-- guards, order_finance_events' UNIQUE (idempotency_key) and the Jenni
-- amount-change review. COD is the only payment model, so these columns are the
-- money.
--
-- Containment: browser roles lose UPDATE on this table entirely and the two
-- policies are dropped. Order mutation stays backend-authoritative. This is safe
-- because no client path depends on the removed privilege: no frontend file
-- references the orders table, issues a REST PATCH/PUT/DELETE to /rest/v1/orders,
-- or calls .update() on any Supabase query, and all 22 backend order-write call
-- sites go through SupabaseAdminService (service_role).
--
-- Deliberately NOT changed: RLS stays enabled; every SELECT and INSERT policy is
-- untouched; no replacement browser UPDATE policy is created; no SECURITY DEFINER
-- workaround is added; no function, trigger, constraint or default privilege is
-- altered; and FRA-S5-002, FRA-S5-003, FRA-S5-004 and every other finding are
-- left exactly as they are.

BEGIN;

-- Remove table-level UPDATE authority from every browser-accessible role.
REVOKE UPDATE ON TABLE public.orders
FROM PUBLIC, anon, authenticated;

-- Remove any column-level UPDATE grant that could survive the table-level
-- REVOKE. Repository replay and the Stage 5 catalog result both show none exists
-- today (every dangerous column privilege was inherited from the table grant),
-- so this is a no-op that makes the intended end state unconditional rather than
-- dependent on that observation remaining true at execution time.
DO $orders_acl$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(
    format('%I', a.attname),
    ', ' ORDER BY a.attnum
  )
  INTO v_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.orders'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE UPDATE (%s) ON TABLE public.orders FROM PUBLIC, anon, authenticated',
      v_columns
    );
  END IF;
END
$orders_acl$;

-- Drop exactly the two vulnerable policies. Agent and merchant order actions are
-- already implemented server-side (OrdersController delivery routes with
-- assertAgentCanOperate, and the merchant decision RPCs), so the product
-- behaviour is preserved through the backend rather than through direct writes.
DROP POLICY IF EXISTS "Agents can update their assigned orders"
ON public.orders;

DROP POLICY IF EXISTS "Merchant members can update own merchant orders"
ON public.orders;

-- Preserve backend functionality explicitly.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.orders
TO service_role;

COMMIT;
