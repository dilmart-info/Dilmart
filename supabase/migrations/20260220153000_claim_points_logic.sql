-- Function to claim pending points from previous orders by phone number
CREATE OR REPLACE FUNCTION public.claim_pending_points(p_user_id UUID, p_phone TEXT)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Find all delivered orders with this phone number that don't have a user_id yet
    -- and were placed within the last year (or any duration you prefer)
    FOR v_order IN 
        SELECT id, points_earned, order_number, created_at
        FROM public.orders 
        WHERE customer_phone = p_phone 
        AND user_id IS NULL 
        AND status = 'delivered'
        AND points_earned > 0
        AND created_at > (now() - interval '1 year')
    LOOP
        -- Check if these points were already claimed (prevent duplicates)
        IF NOT EXISTS (SELECT 1 FROM public.loyalty_transactions WHERE order_id = v_order.id AND transaction_type = 'earn') THEN
            -- Update the order to belong to the user
            UPDATE public.orders SET user_id = p_user_id WHERE id = v_order.id;
            
            -- Insert the loyalty transaction
            INSERT INTO public.loyalty_transactions (user_id, order_id, amount, transaction_type, description, expires_at)
            VALUES (
                p_user_id, 
                v_order.id, 
                v_order.points_earned, 
                'earn', 
                'نقاط مسترجعة من طلب سابق #' || v_order.order_number,
                v_order.created_at + interval '1 year'
            );
        END IF;
    END LOOP;

    -- Update the profile total points cache
    UPDATE public.profiles SET points = public.get_available_points(p_user_id) WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call claim_pending_points when a profile is created or phone is updated
CREATE OR REPLACE FUNCTION public.handle_profile_points_claim()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.phone IS NOT NULL) OR 
       (TG_OP = 'UPDATE' AND NEW.phone IS NOT NULL AND (OLD.phone IS NULL OR OLD.phone != NEW.phone)) THEN
        PERFORM public.claim_pending_points(NEW.id, NEW.phone);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_claim_points ON public.profiles;
CREATE TRIGGER on_profile_claim_points
    AFTER INSERT OR UPDATE OF phone ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_profile_points_claim();
