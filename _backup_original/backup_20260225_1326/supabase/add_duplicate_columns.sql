ALTER TABLE imported_transactions ADD COLUMN IF NOT EXISTS potential_duplicate BOOLEAN DEFAULT false;
ALTER TABLE imported_transactions ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;

ALTER TABLE imported_card_transactions ADD COLUMN IF NOT EXISTS potential_duplicate BOOLEAN DEFAULT false;
ALTER TABLE imported_card_transactions ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
