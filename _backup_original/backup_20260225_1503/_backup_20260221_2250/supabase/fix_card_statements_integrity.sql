-- 1. FUNÇÃO PARA RECALCULAR O TOTAL DA FATURA DE CARTÃO
CREATE OR REPLACE FUNCTION public.recalculate_card_statement_total(p_statement_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total DECIMAL(12,2);
BEGIN
    -- Soma todas as transações vinculadas a esta fatura
    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.card_transactions
    WHERE statement_id = p_statement_id;

    -- Atualiza a fatura com o novo total
    UPDATE public.card_statements
    SET total_amount = v_total
    WHERE id = p_statement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. TRIGGER PARA ATUALIZAR AUTOMATICAMENTE QUANDO HOUVER MUDANÇAS EM CARD_TRANSACTIONS
CREATE OR REPLACE FUNCTION public.on_card_transaction_change_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF (NEW.statement_id IS NOT NULL) THEN
            PERFORM public.recalculate_card_statement_total(NEW.statement_id);
        END IF;
    END IF;
    
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        IF (OLD.statement_id IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.statement_id <> NEW.statement_id)) THEN
            PERFORM public.recalculate_card_statement_total(OLD.statement_id);
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_card_statement_total ON public.card_transactions;
CREATE TRIGGER trg_update_card_statement_total
AFTER INSERT OR UPDATE OR DELETE ON public.card_transactions
FOR EACH ROW EXECUTE FUNCTION public.on_card_transaction_change_trigger();

-- 3. FORÇAR RECALCULO DE TODAS AS FATURAS PARA CORRIGIR DESSINCRONIA ATUAL
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.card_statements LOOP
        PERFORM public.recalculate_card_statement_total(r.id);
    END LOOP;
END $$;
