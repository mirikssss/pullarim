-- Idempotent backfill: accounts, payment_method, ledger from expenses and salary payments.
-- Run after 013-balances-schema.sql.

-- 1) Create card/cash accounts for every user that has expenses or payments
INSERT INTO accounts (user_id, type, name)
SELECT DISTINCT user_id, 'card', 'Card'
FROM expenses
ON CONFLICT (user_id, type) DO NOTHING;

INSERT INTO accounts (user_id, type, name)
SELECT DISTINCT user_id, 'cash', 'Cash'
FROM expenses
ON CONFLICT (user_id, type) DO NOTHING;

INSERT INTO accounts (user_id, type, name)
SELECT DISTINCT user_id, 'card', 'Card'
FROM payments
ON CONFLICT (user_id, type) DO NOTHING;

INSERT INTO accounts (user_id, type, name)
SELECT DISTINCT user_id, 'cash', 'Cash'
FROM payments
ON CONFLICT (user_id, type) DO NOTHING;

-- 2) Set payment_method = 'card' for existing expenses where null
UPDATE expenses
SET payment_method = 'card'
WHERE payment_method IS NULL;

-- 3) Ledger OUT for expenses that don't have one yet
INSERT INTO ledger_entries (user_id, account_id, direction, amount, occurred_on, source_type, source_id, merchant, note)
SELECT e.user_id, a.id, 'out', e.amount, e.date, 'expense', e.id, e.merchant, e.note
FROM expenses e
JOIN accounts a ON a.user_id = e.user_id AND a.type = COALESCE(NULLIF(TRIM(e.payment_method), ''), 'card')
WHERE NOT EXISTS (
  SELECT 1 FROM ledger_entries l
  WHERE l.source_type = 'expense' AND l.source_id = e.id AND l.direction = 'out'
);

-- 4) Ledger IN for salary payments received that don't have one yet (card account only)
INSERT INTO ledger_entries (user_id, account_id, direction, amount, occurred_on, source_type, source_id, merchant, note)
SELECT p.user_id, a.id, 'in', p.amount, p.pay_date, 'salary_payment', p.id, NULL, 'Зарплата'
FROM payments p
JOIN accounts a ON a.user_id = p.user_id AND a.type = 'card'
WHERE p.received = true
AND NOT EXISTS (
  SELECT 1 FROM ledger_entries l
  WHERE l.source_type = 'salary_payment' AND l.source_id = p.id
);
