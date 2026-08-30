-- Add updated_at column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Update existing rows to have a value
UPDATE public.profiles SET updated_at = now() WHERE updated_at IS NULL;
