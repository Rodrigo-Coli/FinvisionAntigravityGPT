-- 1. Atualizar a função de recálculo de saldo para considerar transações pagas + investimentos vinculados
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
    v_total_investments DECIMAL(12,2);
    v_account_type TEXT;
BEGIN
    -- Obter o saldo inicial e tipo da conta
    SELECT initial_balance, type INTO v_initial_balance, v_account_type FROM public.accounts WHERE id = p_account_id;
    
    -- Somar transações vinculadas a esta conta que não foram excluídas
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

    -- Somar os investimentos vinculados se for conta de investimento
    IF v_account_type = 'INVESTMENT' THEN
        SELECT COALESCE(SUM(estimated_value), 0) INTO v_total_investments
        FROM public.physical_assets
        WHERE category = 'INVESTMENT' AND is_archived = false AND metadata->>'brokerAccountId' = p_account_id::text;
    ELSE
        v_total_investments := 0;
    END IF;
    
    -- Atualizar o saldo atual da conta
    UPDATE public.accounts 
    SET current_balance = v_initial_balance + v_total_transactions + v_total_investments
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Criar trigger na tabela physical_assets para disparar o recálculo ao alterar investimentos vinculados
CREATE OR REPLACE FUNCTION public.on_physical_asset_change_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_broker_id TEXT;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        v_broker_id := OLD.metadata->>'brokerAccountId';
        IF v_broker_id IS NOT NULL AND v_broker_id <> '' AND v_broker_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            PERFORM public.recalculate_account_balance(v_broker_id::UUID);
        END IF;
        
        v_broker_id := NEW.metadata->>'brokerAccountId';
        IF v_broker_id IS NOT NULL AND v_broker_id <> '' AND v_broker_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            PERFORM public.recalculate_account_balance(v_broker_id::UUID);
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        v_broker_id := NEW.metadata->>'brokerAccountId';
        IF v_broker_id IS NOT NULL AND v_broker_id <> '' AND v_broker_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            PERFORM public.recalculate_account_balance(v_broker_id::UUID);
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        v_broker_id := OLD.metadata->>'brokerAccountId';
        IF v_broker_id IS NOT NULL AND v_broker_id <> '' AND v_broker_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            PERFORM public.recalculate_account_balance(v_broker_id::UUID);
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trg_on_physical_asset_change ON public.physical_assets;

CREATE TRIGGER trg_on_physical_asset_change
AFTER INSERT OR UPDATE OR DELETE ON public.physical_assets
FOR EACH ROW EXECUTE FUNCTION public.on_physical_asset_change_trigger();

-- 3. Recalcular todas as contas de investimentos para atualizar saldos existentes
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.accounts WHERE type = 'INVESTMENT' AND is_archived = false LOOP
        PERFORM public.recalculate_account_balance(r.id);
    END LOOP;
END $$;
