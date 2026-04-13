-- fix_transfers.sql
-- Essa função corrige o cálculo de saldo do banco de dados, para que Transferências
-- descontem o valor da conta Origem e adicionem o valor na conta Destino.

CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
BEGIN
    SELECT initial_balance INTO v_initial_balance FROM public.accounts WHERE id = p_account_id;
    
    SELECT COALESCE(SUM(
        CASE 
            WHEN type = 'INCOME' THEN amount 
            WHEN type = 'EXPENSE' OR type = 'BILL_PAYMENT' THEN -amount 
            WHEN type = 'ADJUSTMENT' THEN amount 
            WHEN type = 'TRANSFER' AND metadata->>'transfer_side' = 'DESTINATION' THEN amount
            WHEN type = 'TRANSFER' AND metadata->>'transfer_side' = 'SOURCE' THEN -amount
            ELSE 0 
        END
    ), 0) INTO v_total_transactions 
    FROM public.transactions 
    WHERE account_id = p_account_id AND is_deleted = false AND is_paid = true;

    UPDATE public.accounts 
    SET current_balance = v_initial_balance + v_total_transactions 
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
