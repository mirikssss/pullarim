-- Pullarim: Seed default categories
-- Run AFTER 001-init.sql in Supabase SQL Editor

INSERT INTO categories (id, label, color, user_id, is_default) VALUES
  ('food', 'Еда', 'bg-chart-1', NULL, true),
  ('transport', 'Транспорт', 'bg-chart-2', NULL, true),
  ('shopping', 'Покупки', 'bg-chart-3', NULL, true),
  ('entertainment', 'Развлечения', 'bg-chart-4', NULL, true),
  ('bills', 'Счета', 'bg-chart-5', NULL, true),
  ('health', 'Здоровье', 'bg-primary', NULL, true),
  ('other', 'Прочее', 'bg-muted-foreground', NULL, true)
ON CONFLICT (id) DO NOTHING;
