-- M13 seed: default merchant plans + baseline commercial rules.

INSERT INTO public.merchant_plans (
  name,
  code,
  default_commission_type,
  default_commission_rate,
  default_assisted_fee_rate,
  default_platform_fee_rate,
  default_delivery_billing_mode,
  features,
  is_active
)
VALUES
  (
    'Basic',
    'basic',
    'percentage',
    8,
    1.5,
    0,
    'customer_pays',
    '{"priority_support":false,"featured_slots":false}'::jsonb,
    true
  ),
  (
    'Pro',
    'pro',
    'percentage',
    6,
    1,
    0,
    'customer_pays',
    '{"priority_support":true,"featured_slots":true}'::jsonb,
    true
  ),
  (
    'Premium',
    'premium',
    'percentage',
    4,
    0.5,
    0,
    'customer_pays',
    '{"priority_support":true,"featured_slots":true,"strategic_partner":true}'::jsonb,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  default_commission_type = EXCLUDED.default_commission_type,
  default_commission_rate = EXCLUDED.default_commission_rate,
  default_assisted_fee_rate = EXCLUDED.default_assisted_fee_rate,
  default_platform_fee_rate = EXCLUDED.default_platform_fee_rate,
  default_delivery_billing_mode = EXCLUDED.default_delivery_billing_mode,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.commercial_rules (
  name,
  rule_type,
  scope_type,
  scope_reference_id,
  priority,
  value_type,
  value,
  conditions,
  is_active,
  start_at,
  end_at,
  created_by
)
VALUES
  (
    'Global default commission',
    'commission',
    'global',
    NULL,
    10,
    'percentage',
    8,
    '{}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  ),
  (
    'Web checkout commission override',
    'commission',
    'channel',
    NULL,
    100,
    'percentage',
    6,
    '{"channel":"web_checkout"}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  ),
  (
    'WhatsApp assisted commission override',
    'commission',
    'channel',
    NULL,
    100,
    'percentage',
    9,
    '{"channel":"whatsapp_assisted"}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  ),
  (
    'Manual assisted commission override',
    'commission',
    'channel',
    NULL,
    100,
    'percentage',
    10,
    '{"channel":"manual_assisted"}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  ),
  (
    'WhatsApp assisted fee',
    'assisted_fee',
    'channel',
    NULL,
    100,
    'percentage',
    2,
    '{"channel":"whatsapp_assisted"}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  ),
  (
    'Manual assisted fee',
    'assisted_fee',
    'channel',
    NULL,
    100,
    'percentage',
    2.5,
    '{"channel":"manual_assisted"}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  ),
  (
    'Default delivery billing mode',
    'delivery_billing',
    'global',
    NULL,
    10,
    'fixed',
    0,
    '{"delivery_billing_mode":"customer_pays"}'::jsonb,
    true,
    now(),
    NULL,
    NULL
  )
ON CONFLICT DO NOTHING;
