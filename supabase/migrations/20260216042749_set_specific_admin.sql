-- Set the specified user as an admin when that auth user exists (fresh DBs may not have this user yet).
INSERT INTO public.profiles (id, email, role)
SELECT '77e3c964-427d-465c-b87e-a8cd392dd17d'::uuid, 'admin@admin.com', 'admin'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '77e3c964-427d-465c-b87e-a8cd392dd17d'::uuid)
ON CONFLICT (id) DO UPDATE SET role = 'admin', email = 'admin@admin.com';
