-- Add source column to merchant_category_map (seed, manual, ai, rule)
ALTER TABLE merchant_category_map ADD COLUMN IF NOT EXISTS source TEXT;
-- Add include_in_budget_override for transfers that user wants in budget
ALTER TABLE merchant_category_map ADD COLUMN IF NOT EXISTS include_in_budget_override BOOLEAN DEFAULT NULL;
