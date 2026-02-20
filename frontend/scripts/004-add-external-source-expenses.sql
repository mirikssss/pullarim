-- Add external_source and external_id for Payme import deduplication
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS external_source TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Unique index: one external record per user per source
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_external
  ON expenses (user_id, external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
