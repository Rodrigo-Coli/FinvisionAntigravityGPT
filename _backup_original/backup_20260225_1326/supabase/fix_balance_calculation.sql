-- 1. Atualizar a função de recálculo de saldo para considerar apenas o que foi REALMENTE PAGO
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
BEGIN
    -- Obter o saldo inicial da conta
    SELECT initial_balance INTO v_initial_balance FROM public.accounts WHERE id = p_account_id;
    
    -- Somar transações vinculadas a esta conta que não foram excluídas
    -- Importante: Agora somamos o 'paid_amount', que representa o valor efetivamente liquidado/pago.
    -- Se uma transação for reaberta (is_paid=false, paid_amount=0), ela deixará de afetar o saldo.
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

    -- Atualizar o saldo atual da conta
    UPDATE public.accounts 
    SET current_balance = v_initial_balance + v_total_transactions 
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar o trigger para disparar recálculo quando is_paid ou paid_amount mudarem
CREATE OR REPLACE FUNCTION public.update_account_balance_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM public.recalculate_account_balance(NEW.account_id);
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Verificamos se algum campo que afeta o saldo financeiro foi alterado
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Recalcular o saldo de todas as contas para garantir consistência com a nova regra
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.accounts WHERE is_archived = false LOOP
        PERFORM public.recalculate_account_balance(r.id);
    END LOOP;
END $$;
