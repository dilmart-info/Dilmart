-- DILMART — STAGE B PASS 2
-- SCRIPT 6: LIVE DATA COUNTS & DISPOSITION CHECK (READ-ONLY)

SELECT 'public.store_carts' AS object_name, 'table' AS object_type, count(*)::bigint AS non_null_or_row_count FROM public.store_carts
UNION ALL
SELECT 'public.store_cart_items', 'table', count(*)::bigint FROM public.store_cart_items
UNION ALL
SELECT 'public.store_linked_profiles', 'table', count(*)::bigint FROM public.store_linked_profiles
UNION ALL
SELECT 'public.store_federated_session_families', 'table', count(*)::bigint FROM public.store_federated_session_families
UNION ALL
SELECT 'public.store_federated_refresh_tokens', 'table', count(*)::bigint FROM public.store_federated_refresh_tokens
UNION ALL
SELECT 'public.store_federated_session_audit_events', 'table', count(*)::bigint FROM public.store_federated_session_audit_events
UNION ALL
SELECT 'public.dilmart_customer_handoffs', 'table', count(*)::bigint FROM public.dilmart_customer_handoffs
UNION ALL
SELECT 'public.dilmart_customer_handoff_audit_events', 'table', count(*)::bigint FROM public.dilmart_customer_handoff_audit_events
UNION ALL
SELECT 'public.dilmart_barber_handoffs', 'table', count(*)::bigint FROM public.dilmart_barber_handoffs
UNION ALL
SELECT 'public.dilmart_barber_handoff_audit_events', 'table', count(*)::bigint FROM public.dilmart_barber_handoff_audit_events
UNION ALL
SELECT 'public.dilmart_barber_web_sessions', 'table', count(*)::bigint FROM public.dilmart_barber_web_sessions
UNION ALL
SELECT 'orders.dilmart_barbershop_id', 'column', count(dilmart_barbershop_id)::bigint FROM public.orders
UNION ALL
SELECT 'orders.dilmart_user_id', 'column', count(dilmart_user_id)::bigint FROM public.orders
UNION ALL
SELECT 'orders.store_cart_id', 'column', count(store_cart_id)::bigint FROM public.orders
UNION ALL
SELECT 'orders.store_linked_profile_id', 'column', count(store_linked_profile_id)::bigint FROM public.orders
UNION ALL
SELECT 'checkout_attempts.store_cart_id', 'column', count(store_cart_id)::bigint FROM public.checkout_attempts
UNION ALL
SELECT 'checkout_attempts.store_linked_profile_id', 'column', count(store_linked_profile_id)::bigint FROM public.checkout_attempts
UNION ALL
SELECT 'products.requires_verified_salon', 'column', count(CASE WHEN requires_verified_salon = true THEN 1 END)::bigint FROM public.products;
