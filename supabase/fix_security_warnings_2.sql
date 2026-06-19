-- fix_security_warnings_2.sql
-- Resolves "Function Search Path Mutable" for trg_update_card_statement_total

CREATE OR REPLACE FUNCTION public.trg_update_card_statement_total()
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
