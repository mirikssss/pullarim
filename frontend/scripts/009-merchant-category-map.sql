-- User merchant memory: learn from manual category corrections
CREATE TABLE IF NOT EXISTS merchant_category_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_norm TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_norm)
);

CREATE INDEX IF NOT EXISTS idx_merchant_category_map_user ON merchant_category_map(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_category_map_lookup ON merchant_category_map(user_id, merchant_norm);

ALTER TABLE merchant_category_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own merchant maps" ON merchant_category_map;
CREATE POLICY "Users can CRUD own merchant maps"
  ON merchant_category_map FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
