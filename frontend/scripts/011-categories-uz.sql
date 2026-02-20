-- Add UZ-specific categories: taxi, groceries, clothes, subscriptions, transfers
INSERT INTO categories (id, label, color, user_id, is_default) VALUES
  ('taxi', 'Такси', 'bg-chart-2', NULL, true),
  ('groceries', 'Продукты', 'bg-chart-1', NULL, true),
  ('clothes', 'Одежда', 'bg-chart-3', NULL, true),
  ('subscriptions', 'Подписки', 'bg-chart-5', NULL, true),
  ('transfers', 'Переводы', 'bg-muted-foreground', NULL, true)
ON CONFLICT (id) DO NOTHING;
