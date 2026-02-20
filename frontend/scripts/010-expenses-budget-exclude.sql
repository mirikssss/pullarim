-- Add exclude_from_budget and source_type to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exclude_from_budget BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type TEXT;
