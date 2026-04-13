-- fix_security_warnings_3_emergency.sql
-- Restores the correct math for recalculate_account_balance and update_account_balance_trigger 
-- which were accidentally swapped with an older template causing the "is_reconciled column not found" error during Category updates.

-- 1. Restore the true recalculate_account_balance
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id UUID)
RETURNS VOID 
LANGUAGE plpgsql 
SET search_path = public
SECURITY DEFINER
AS $$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
BEGIN
    SELECT initial_balance INTO v_initial_balance FROM public.accounts WHERE id = p_account_id;
    
    SELECT COALESCE(SUM(
        CASE 
            WHEN type = 'INCOME' THEN COALESCE(paid_amount, 0)
            WHEN type = 'EXPENSE' OR type = 'BILL_PAYMENT' THEN -COALESCE(paid_amount, 0)
            WHEN type = 'ADJUSTMENT' THEN COALESCE(paid_amount, 0)
            ELSE 0 
        END
    ), 0) INTO v_total_transactions 
    FROM public.transactions 
    WHERE account_id = p_account_id AND is_deleted = false;

    UPDATE public.accounts 
    SET current_balance = v_initial_balance + v_total_transactions 
    WHERE id = p_account_id;
END;
$$;

-- 2. Restore the true update_account_balance_trigger
CREATE OR REPLACE FUNCTION public.update_account_balance_trigger()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SET search_path = public
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM public.recalculate_account_balance(NEW.account_id);
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.account_id <> NEW.account_id 
            OR OLD.amount <> NEW.amount 
            OR OLD.is_deleted <> NEW.is_deleted 
            OR OLD.type <> NEW.type
            OR COALESCE(OLD.is_paid, false) <> COALESCE(NEW.is_paid, false)
            OR COALESCE(OLD.paid_amount, 0) <> COALESCE(NEW.paid_amount, 0)) THEN
            
            PERFORM public.recalculate_account_balance(OLD.account_id);
            IF (OLD.account_id <> NEW.account_id) THEN
                PERFORM public.recalculate_account_balance(NEW.account_id);
            END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        PERFORM public.recalculate_account_balance(OLD.account_id);
    END IF;
    RETURN NULL;
END;
$$;
