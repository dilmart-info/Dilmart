-- Add email column to profiles table if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Index for better searching by email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
