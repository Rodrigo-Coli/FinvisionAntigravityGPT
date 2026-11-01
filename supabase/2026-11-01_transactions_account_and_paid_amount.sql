-- Nenhum lançamento EM ABERTO sem conta.
--
-- Provisões geradas automaticamente (aluguel, condomínio, IPTU, IPVA, seguro,
-- licenciamento, parcelas de consórcio/dívida, parcelas de venda...) eram
-- gravadas sem conta. Esta trava preenche a conta na criação, só para
-- lançamentos em aberto (não pagos) de receita/despesa — por isso não mexe em
-- saldo nenhum (em aberto não soma no saldo).
--
-- Ordem da conta escolhida:
--   1. a conta do último pagamento da mesma dívida (liability_id);
--   2. do mesmo consórcio (consortium_id);
--   3. do mesmo bem (metadata.linked_asset_id);
--   4. do mesmo grupo de recorrência/parcelamento;
--   5. a conta mais usada nos pagamentos dos últimos 90 dias;
--   6. a primeira conta ativa do usuário.
-- A conta continua editável no app.

CREATE OR REPLACE FUNCTION public.fill_open_transaction_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
BEGIN
  IF NEW.account_id IS NOT NULL
     OR COALESCE(NEW.is_paid, false)
     OR COALESCE(NEW.is_deleted, false)
     OR NEW.type NOT IN ('INCOME', 'EXPENSE')
     OR (NEW.metadata ? 'card_statement_id') THEN
    RETURN NEW;
  END IF;

  SELECT p.account_id INTO v_acc
  FROM transactions p
  JOIN accounts a ON a.id = p.account_id AND COALESCE(a.is_archived, false) = false
  WHERE p.user_id = NEW.user_id
    AND p.is_deleted = false
    AND p.is_paid = true
    AND p.account_id IS NOT NULL
    AND (
      (NEW.liability_id IS NOT NULL AND p.liability_id = NEW.liability_id)
      OR (NEW.consortium_id IS NOT NULL AND p.consortium_id = NEW.consortium_id)
      OR (NEW.metadata->>'linked_asset_id' IS NOT NULL AND p.metadata->>'linked_asset_id' = NEW.metadata->>'linked_asset_id')
      OR (NEW.recurrence_group_id IS NOT NULL AND p.recurrence_group_id = NEW.recurrence_group_id)
      OR (NEW.installment_group_id IS NOT NULL AND p.installment_group_id = NEW.installment_group_id)
    )
  ORDER BY
    (NEW.liability_id IS NOT NULL AND p.liability_id = NEW.liability_id) DESC,
    (NEW.consortium_id IS NOT NULL AND p.consortium_id = NEW.consortium_id) DESC,
    (NEW.metadata->>'linked_asset_id' IS NOT NULL AND p.metadata->>'linked_asset_id' = NEW.metadata->>'linked_asset_id') DESC,
    p.date DESC
  LIMIT 1;

  IF v_acc IS NULL THEN
    SELECT p.account_id INTO v_acc
    FROM transactions p
    JOIN accounts a ON a.id = p.account_id AND COALESCE(a.is_archived, false) = false
    WHERE p.user_id = NEW.user_id
      AND p.is_deleted = false
      AND p.is_paid = true
      AND p.account_id IS NOT NULL
      AND p.date >= now() - interval '90 days'
      AND a.type IS DISTINCT FROM 'INVESTMENT'
    GROUP BY p.account_id
    ORDER BY count(*) DESC
    LIMIT 1;
  END IF;

  IF v_acc IS NULL THEN
    SELECT a.id INTO v_acc
    FROM accounts a
    WHERE a.user_id = NEW.user_id AND COALESCE(a.is_archived, false) = false
    ORDER BY (a.type = 'INVESTMENT'), a.created_at
    LIMIT 1;
  END IF;

  IF v_acc IS NOT NULL THEN
    NEW.account_id := v_acc;
    IF NEW.account_name IS NULL THEN
      SELECT COALESCE(a.institution, a.name) INTO NEW.account_name FROM accounts a WHERE a.id = v_acc;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_open_transaction_account ON public.transactions;
CREATE TRIGGER trg_fill_open_transaction_account
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fill_open_transaction_account();

-- ---------------------------------------------------------------------------
-- Pago = valor pago preenchido.
--
-- O saldo da conta soma paid_amount (não amount). Lançamento marcado como pago
-- sem paid_amount (importação, pagamento pelo WhatsApp, "marcar como pago")
-- ficava fora do saldo. Ao inserir pago, ou ao passar de em aberto para pago,
-- sem valor pago, o valor pago passa a ser o valor cheio.
-- Exceção: registros neutros de propósito (metadata.balance_neutral = true,
-- ex.: ajuste de caixa livre da corretora, que já vai no saldo inicial).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fill_paid_amount_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_paid, false)
     AND COALESCE(NEW.paid_amount, 0) = 0
     AND COALESCE(NEW.amount, 0) > 0
     AND COALESCE(NEW.metadata->>'balance_neutral', '') <> 'true'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_paid, false) = false) THEN
    NEW.paid_amount := NEW.amount;
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := COALESCE(NEW.date, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_paid_amount_on_paid ON public.transactions;
CREATE TRIGGER trg_fill_paid_amount_on_paid
  BEFORE INSERT OR UPDATE OF is_paid ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fill_paid_amount_on_paid();
