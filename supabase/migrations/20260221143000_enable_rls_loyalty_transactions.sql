-- Enable RLS for loyalty_transactions
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own loyalty transactions
CREATE POLICY "Users can view their own loyalty transactions" ON public.loyalty_transactions
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- 2. Admins have full access to all loyalty transactions
CREATE POLICY "Admins have full access to loyalty transactions" ON public.loyalty_transactions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 3. (Optional) Service role has full access
CREATE POLICY "Service role has full access" ON public.loyalty_transactions
    FOR ALL TO service_role USING (true);
