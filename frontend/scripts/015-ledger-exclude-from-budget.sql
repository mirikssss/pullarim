-- Удалить из леджера записи по расходам с «Учитывать в бюджете» = false (переводы, Наличка и т.п.).
-- Такие операции не должны минусовать баланс. Запустить после 013/014.

DELETE FROM ledger_entries
WHERE source_type = 'expense'
  AND source_id IN (SELECT id FROM expenses WHERE exclude_from_budget = true);
