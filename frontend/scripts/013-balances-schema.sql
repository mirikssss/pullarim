-- Balances & Ledger: accounts, ledger_entries, transfers; expenses.payment_method
-- Run after 001-init, 010-expenses-budget-exclude. Idempotent.

-- 1) accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('card', 'cash')),
  name TEXT NOT NULL,
  opening_balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

-- 2) ledger_entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  occurred_on DATE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('expense', 'income', 'transfer', 'salary_payment', 'cash_withdrawal')),
  source_id UUID,
  merchant TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_account_occurred ON ledger_entries(user_id, account_id, occurred_on DESC);

-- Prevent duplicate ledger rows per source (one expense = one out entry per account)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_source_unique
  ON ledger_entries (source_type, source_id, account_id, direction)
  WHERE source_id IS NOT NULL;

-- 3) expenses: add payment_method
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('card', 'cash'));
-- Default for existing rows
UPDATE expenses SET payment_method = 'card' WHERE payment_method IS NULL;
ALTER TABLE expenses ALTER COLUMN payment_method SET DEFAULT 'card';

-- 4) transfers
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(user_id, date DESC);

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own accounts" ON accounts;
CREATE POLICY "Users can CRUD own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can CRUD own ledger_entries" ON ledger_entries;
CREATE POLICY "Users can CRUD own ledger_entries" ON ledger_entries FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can CRUD own transfers" ON transfers;
CREATE POLICY "Users can CRUD own transfers" ON transfers FOR ALL USING (auth.uid() = user_id);
