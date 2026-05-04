-- Adiciona coluna owner_name se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'transactions' AND COLUMN_NAME = 'owner_name') THEN
        ALTER TABLE transactions ADD COLUMN owner_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'card_transactions' AND COLUMN_NAME = 'owner_name') THEN
        ALTER TABLE card_transactions ADD COLUMN owner_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'imported_transactions' AND COLUMN_NAME = 'owner_name') THEN
        ALTER TABLE imported_transactions ADD COLUMN owner_name TEXT;
    END IF;
END $$;
