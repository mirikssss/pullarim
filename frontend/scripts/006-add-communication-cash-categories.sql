-- Add Связь (communication) and Наличка (cash) categories
INSERT INTO categories (id, label, color, user_id, is_default) VALUES
  ('communication', 'Связь', 'bg-chart-2', NULL, true),
  ('cash', 'Наличка', 'bg-muted-foreground', NULL, true)
ON CONFLICT (id) DO NOTHING;
