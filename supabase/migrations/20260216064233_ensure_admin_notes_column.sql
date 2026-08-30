-- Ensure admin_notes column exists in orders table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'orders' 
        AND column_name = 'admin_notes'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN admin_notes TEXT;
    END IF;
END $$;
