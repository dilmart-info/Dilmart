-- FRA-S2-001 (P0) — block profiles role self-escalation.
--
-- Confirmed on Production before this migration: `authenticated` held both
-- table-level UPDATE on public.profiles and column-level UPDATE on
-- public.profiles.role, while the PERMISSIVE policy
-- "Users can update their own profiles" (FOR UPDATE, roles {public},
-- USING/WITH CHECK `auth.uid() = id`) placed no restriction on which columns a
-- row owner may write. Because both the backend actor resolver and
-- app_private.is_admin() derive authority from public.profiles.role, any
-- authenticated customer could PATCH their own row through PostgREST and become
-- a platform administrator — and, via the "Admins can update any profile"
-- policy, then write every other profile.
--
-- Containment: browser roles lose UPDATE on this table entirely. Profile edits
-- already travel exclusively through the backend (PATCH /profiles/me →
-- ProfilesService → service_role), which derives the actor from the verified
-- token and writes only an allowlisted set of columns, so no application path
-- depends on the privilege being removed here.
--
-- Deliberately NOT changed by this emergency migration: the admin UPDATE policy,
-- app_private.is_admin(), any profile row, any role value, and the
-- user_metadata fallback in the backend actor resolver (FRA-S2-002, still open).

BEGIN;

-- Remove table-level UPDATE authority from every browser-accessible role.
REVOKE UPDATE ON TABLE public.profiles
FROM PUBLIC, anon, authenticated;

-- Remove any explicit column-level UPDATE grants that could survive the
-- table-level REVOKE. This covers current and future columns present at
-- migration execution time.
DO $profiles_acl$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(
    format('%I', a.attname),
    ', ' ORDER BY a.attnum
  )
  INTO v_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.profiles'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE UPDATE (%s) ON TABLE public.profiles FROM PUBLIC, anon, authenticated',
      v_columns
    );
  END IF;
END
$profiles_acl$;

-- Customer profile updates now go exclusively through the backend,
-- which derives actor identity and allowlists mutable fields.
DROP POLICY IF EXISTS "Users can update their own profiles"
ON public.profiles;

-- Preserve only the browser read capability required by existing
-- owner/admin SELECT policies.
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Preserve backend functionality explicitly.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.profiles
TO service_role;

COMMIT;
