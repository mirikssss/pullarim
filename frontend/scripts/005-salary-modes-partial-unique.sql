-- Partial unique: only one active salary mode per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_modes_user_active_unique
  ON salary_modes (user_id)
  WHERE active = true;
