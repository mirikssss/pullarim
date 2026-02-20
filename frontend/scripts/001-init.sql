-- Pullarim: Initial schema
-- Run in Supabase SQL Editor

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  currency TEXT NOT NULL DEFAULT 'UZS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories (pre-seeded defaults + user custom)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  amount BIGINT NOT NULL,
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Salary modes
CREATE TABLE IF NOT EXISTS salary_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount BIGINT NOT NULL,
  start_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE
);

-- Work exceptions (only days that differ from Mon-Fri default)
CREATE TABLE IF NOT EXISTS work_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  UNIQUE(user_id, date)
);

-- Payment history
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  pay_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  received BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_salary_modes_user ON salary_modes(user_id);
CREATE INDEX IF NOT EXISTS idx_work_exceptions_user ON work_exceptions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Profiles: user can read/update own
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories: default (user_id NULL, is_default=true) - SELECT for all, no writes
-- User categories - CRUD when auth.uid()=user_id
DROP POLICY IF EXISTS "Anyone can read default categories" ON categories;
CREATE POLICY "Anyone can read default categories" ON categories
  FOR SELECT USING (is_default = true AND user_id IS NULL);

DROP POLICY IF EXISTS "Users can read own categories" ON categories;
CREATE POLICY "Users can read own categories" ON categories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own categories" ON categories;
CREATE POLICY "Users can insert own categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_default = false);

DROP POLICY IF EXISTS "Users can update own categories" ON categories;
CREATE POLICY "Users can update own categories" ON categories
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own categories" ON categories;
CREATE POLICY "Users can delete own categories" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Expenses
DROP POLICY IF EXISTS "Users can CRUD own expenses" ON expenses;
CREATE POLICY "Users can CRUD own expenses" ON expenses FOR ALL USING (auth.uid() = user_id);

-- Salary modes
DROP POLICY IF EXISTS "Users can CRUD own salary modes" ON salary_modes;
CREATE POLICY "Users can CRUD own salary modes" ON salary_modes FOR ALL USING (auth.uid() = user_id);

-- Work exceptions
DROP POLICY IF EXISTS "Users can CRUD own exceptions" ON work_exceptions;
CREATE POLICY "Users can CRUD own exceptions" ON work_exceptions FOR ALL USING (auth.uid() = user_id);

-- Payments
DROP POLICY IF EXISTS "Users can CRUD own payments" ON payments;
CREATE POLICY "Users can CRUD own payments" ON payments FOR ALL USING (auth.uid() = user_id);

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
