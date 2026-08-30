-- Drop the existing role check constraint and recreate it to include 'agent'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('customer', 'admin', 'agent'));
