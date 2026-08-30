-- Fix the trigger function to handle TG_OP correctly
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
