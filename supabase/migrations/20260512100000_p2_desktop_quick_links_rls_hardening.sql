-- P2 hardening: remove JWT-admin direct-write path for desktop_quick_links.
--
-- Before: desktop_quick_links_admin_all allowed any JWT session with
--         profiles.role = 'admin' to INSERT/UPDATE/DELETE directly via
--         the Supabase client, bypassing the NestJS backend entirely.
--
-- After:  No RLS policy grants writes to any JWT role.
--         The NestJS backend uses the service-role key, which bypasses
--         RLS at the Postgres level — admin CRUD is unaffected.
--         Public read (active rows only) is preserved unchanged.

drop policy if exists "desktop_quick_links_admin_all" on public.desktop_quick_links;
