-- fix_security_warnings.sql
-- Resolves "Function Search Path Mutable" warnings in Supabase Security Advisor by adding `SET search_path = public` to all affected functions.

-- 1. update_card_statement_total
CREATE OR REPLACE FUNCTION public.update_card_statement_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_statement_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'CREDIT_CARD' THEN
      v_statement_id := (OLD.metadata->>'statement_id')::uuid;
      IF v_statement_id IS NOT NULL THEN
        PERFORM recalculate_card_statement_total(v_statement_id);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.type = 'CREDIT_CARD' THEN
    v_statement_id := (NEW.metadata->>'statement_id')::uuid;
    IF v_statement_id IS NOT NULL THEN
      PERFORM recalculate_card_statement_total(v_statement_id);
    END IF;
    
    -- if it moved from one statement to another
    IF TG_OP = 'UPDATE' AND OLD.type = 'CREDIT_CARD' THEN
      DECLARE
        old_stmt_id uuid := (OLD.metadata->>'statement_id')::uuid;
      BEGIN
        IF old_stmt_id IS NOT NULL AND old_stmt_id != v_statement_id THEN
          PERFORM recalculate_card_statement_total(old_stmt_id);
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. update_liabilities_updated_at
CREATE OR REPLACE FUNCTION public.update_liabilities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- 3. update_account_balance_trigger
CREATE OR REPLACE FUNCTION public.update_account_balance_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM recalculate_account_balance(NEW.account_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.account_id <> NEW.account_id THEN
            PERFORM recalculate_account_balance(OLD.account_id);
            PERFORM recalculate_account_balance(NEW.account_id);
        ELSE
            PERFORM recalculate_account_balance(NEW.account_id);
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM recalculate_account_balance(OLD.account_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$function$;

-- 4. recalculate_account_balance
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_initial_balance numeric;
  v_total_income numeric := 0;
  v_total_expense numeric := 0;
BEGIN
  -- block triggers temporarily if possible, but here we just do basic update
  SELECT COALESCE(initial_balance, 0) INTO v_initial_balance
  FROM accounts
  WHERE id = p_account_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_income
  FROM transactions
  WHERE account_id = p_account_id
    AND is_deleted = false
    AND is_reconciled = true
    AND type = 'INCOME';

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_expense
  FROM transactions
  WHERE account_id = p_account_id
    AND is_deleted = false
    AND is_reconciled = true
    AND type = 'EXPENSE';

  UPDATE accounts
  SET current_balance = v_initial_balance + v_total_income - v_total_expense,
      updated_at = now()
  WHERE id = p_account_id;
END;
$function$;

-- 5. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 6. recalculate_card_statement_total
CREATE OR REPLACE FUNCTION public.recalculate_card_statement_total(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_total numeric := 0;
BEGIN
  -- Sum up valid transactions connected to this statement
  SELECT COALESCE(SUM(ABS(amount)), 0)
  INTO v_total
  FROM transactions
  WHERE is_deleted = false
    AND type = 'CREDIT_CARD'
    AND metadata->>'statement_id' = p_statement_id::text;

  UPDATE card_statements
  SET total_amount = v_total,
      updated_at = now()
  WHERE id = p_statement_id;
END;
$function$;

-- 7. on_card_transaction_change_trigger
CREATE OR REPLACE FUNCTION public.on_card_transaction_change_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.type = 'CREDIT_CARD' AND NEW.metadata->>'statement_id' IS NOT NULL THEN
      PERFORM recalculate_card_statement_total((NEW.metadata->>'statement_id')::uuid);
    END IF;
    -- If update changes statement
    IF TG_OP = 'UPDATE' AND OLD.type = 'CREDIT_CARD' AND OLD.metadata->>'statement_id' IS NOT NULL AND OLD.metadata->>'statement_id' <> NEW.metadata->>'statement_id' THEN
      PERFORM recalculate_card_statement_total((OLD.metadata->>'statement_id')::uuid);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type = 'CREDIT_CARD' AND OLD.metadata->>'statement_id' IS NOT NULL THEN
      PERFORM recalculate_card_statement_total((OLD.metadata->>'statement_id')::uuid);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

-- 8. update_account_balance (if this is different from _trigger)
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recalculate_account_balance(NEW.account_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.account_id <> NEW.account_id THEN
      PERFORM recalculate_account_balance(OLD.account_id);
      PERFORM recalculate_account_balance(NEW.account_id);
    ELSE
      PERFORM recalculate_account_balance(NEW.account_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recalculate_account_balance(OLD.account_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 9. exec_sql function (sometimes added manually or by plugins, if it exists, let's patch it)
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $function$
BEGIN
  EXECUTE sql_query;
END;
$function$;
