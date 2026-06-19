-- 1. Drop the trigger from card_transactions specifically (it shouldn't be there)
DROP TRIGGER IF EXISTS trg_update_account_balance ON card_transactions;

-- 2. Create or replace the trigger function with JSONB safety
-- This version handles different table schemas by using to_jsonb(NEW)
CREATE OR REPLACE FUNCTION update_account_balance_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_data JSONB;
    old_data JSONB;
    tx_type TEXT;
    tx_is_paid BOOLEAN;
    old_is_paid BOOLEAN;
    tx_account_id UUID;
    old_account_id UUID;
    tx_amount DECIMAL;
    old_amount DECIMAL;
BEGIN
    -- Use JSONB to avoid "field not found" errors on NEW/OLD for tables with different schemas
    new_data := to_jsonb(NEW);
    old_data := to_jsonb(OLD);

    -- If this table doesn't have account_id, it's not a bank transaction that updates account balances
    IF NOT (new_data ? 'account_id') AND NOT (old_data ? 'account_id') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Extract values safely
    tx_type := COALESCE(new_data ->> 'type', old_data ->> 'type', 'EXPENSE');
    tx_is_paid := COALESCE((new_data ->> 'is_paid')::BOOLEAN, FALSE);
    old_is_paid := COALESCE((old_data ->> 'is_paid')::BOOLEAN, FALSE);
    tx_account_id := (new_data ->> 'account_id')::UUID;
    old_account_id := (old_data ->> 'account_id')::UUID;
    tx_amount := COALESCE((new_data ->> 'amount')::DECIMAL, 0);
    old_amount := COALESCE((old_data ->> 'amount')::DECIMAL, 0);

    -- HANDLE DELETE
    IF (TG_OP = 'DELETE') THEN
        IF old_is_paid AND old_account_id IS NOT NULL THEN
            UPDATE accounts 
            SET current_balance = current_balance + (CASE WHEN tx_type = 'EXPENSE' THEN old_amount ELSE -old_amount END)
            WHERE id = old_account_id;
        END IF;
        RETURN OLD;
    END IF;

    -- HANDLE INSERT
    IF (TG_OP = 'INSERT') THEN
        IF tx_is_paid AND tx_account_id IS NOT NULL THEN
            UPDATE accounts 
            SET current_balance = current_balance + (CASE WHEN tx_type = 'EXPENSE' THEN -tx_amount ELSE tx_amount END)
            WHERE id = tx_account_id;
        END IF;
        RETURN NEW;
    END IF;

    -- HANDLE UPDATE
    IF (TG_OP = 'UPDATE') THEN
        -- If paid status changed or amount changed or account changed
        IF (tx_is_paid <> old_is_paid OR tx_amount <> old_amount OR tx_account_id <> old_account_id OR tx_type <> (old_data ->> 'type')) THEN
            
            -- 1. Reverse old transaction if it was paid
            IF old_is_paid AND old_account_id IS NOT NULL THEN
                UPDATE accounts 
                SET current_balance = current_balance + (CASE WHEN (old_data ->> 'type') = 'EXPENSE' THEN old_amount ELSE -old_amount END)
                WHERE id = old_account_id;
            END IF;

            -- 2. Apply new transaction if it is paid
            IF tx_is_paid AND tx_account_id IS NOT NULL THEN
                UPDATE accounts 
                SET current_balance = current_balance + (CASE WHEN tx_type = 'EXPENSE' THEN -tx_amount ELSE tx_amount END)
                WHERE id = tx_account_id;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
