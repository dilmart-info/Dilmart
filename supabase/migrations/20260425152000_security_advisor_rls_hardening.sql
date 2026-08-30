-- M16: Security Advisor hardening
-- Goal: eliminate "RLS Disabled in Public" findings on private operational tables.

-- Keep helper aligned with marketplace policies in case this migration runs independently.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('super_admin', 'admin')
  );
$$;

ALTER TABLE IF EXISTS public.whatsapp_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.outbound_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.outbound_dispatch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.governance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_policy_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_commercial_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.collection_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_payout_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courier_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_finance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courier_payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.courier_payout_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commercial_rules ENABLE ROW LEVEL SECURITY;

-- Admin full access for operational finance/governance tables.
DROP POLICY IF EXISTS "Admins can manage whatsapp_intents" ON public.whatsapp_intents;
CREATE POLICY "Admins can manage whatsapp_intents"
ON public.whatsapp_intents
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage outbound_dead_letters" ON public.outbound_dead_letters;
CREATE POLICY "Admins can manage outbound_dead_letters"
ON public.outbound_dead_letters
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage audit_logs" ON public.audit_logs;
CREATE POLICY "Admins can manage audit_logs"
ON public.audit_logs
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage outbound_dispatch_attempts" ON public.outbound_dispatch_attempts;
CREATE POLICY "Admins can manage outbound_dispatch_attempts"
ON public.outbound_dispatch_attempts
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage governance_tasks" ON public.governance_tasks;
CREATE POLICY "Admins can manage governance_tasks"
ON public.governance_tasks
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_policy_assignments" ON public.merchant_policy_assignments;
CREATE POLICY "Admins can manage merchant_policy_assignments"
ON public.merchant_policy_assignments
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_commercial_terms" ON public.merchant_commercial_terms;
CREATE POLICY "Admins can manage merchant_commercial_terms"
ON public.merchant_commercial_terms
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage collection_event_log" ON public.collection_event_log;
CREATE POLICY "Admins can manage collection_event_log"
ON public.collection_event_log
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_payout_batches" ON public.merchant_payout_batches;
CREATE POLICY "Admins can manage merchant_payout_batches"
ON public.merchant_payout_batches
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_payout_batch_items" ON public.merchant_payout_batch_items;
CREATE POLICY "Admins can manage merchant_payout_batch_items"
ON public.merchant_payout_batch_items
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_ledger_entries" ON public.merchant_ledger_entries;
CREATE POLICY "Admins can manage merchant_ledger_entries"
ON public.merchant_ledger_entries
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage courier_ledger_entries" ON public.courier_ledger_entries;
CREATE POLICY "Admins can manage courier_ledger_entries"
ON public.courier_ledger_entries
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage order_finance_events" ON public.order_finance_events;
CREATE POLICY "Admins can manage order_finance_events"
ON public.order_finance_events
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage courier_payout_batches" ON public.courier_payout_batches;
CREATE POLICY "Admins can manage courier_payout_batches"
ON public.courier_payout_batches
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage courier_payout_batch_items" ON public.courier_payout_batch_items;
CREATE POLICY "Admins can manage courier_payout_batch_items"
ON public.courier_payout_batch_items
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_plan_assignments" ON public.merchant_plan_assignments;
CREATE POLICY "Admins can manage merchant_plan_assignments"
ON public.merchant_plan_assignments
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage merchant_plans" ON public.merchant_plans;
CREATE POLICY "Admins can manage merchant_plans"
ON public.merchant_plans
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage commercial_rules" ON public.commercial_rules;
CREATE POLICY "Admins can manage commercial_rules"
ON public.commercial_rules
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());
