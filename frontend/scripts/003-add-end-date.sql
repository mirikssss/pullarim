-- Add end_date to salary_modes for inactive modes (period: start_date..end_date inclusive)
ALTER TABLE salary_modes ADD COLUMN IF NOT EXISTS end_date DATE;
