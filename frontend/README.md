# Pullarim - Personal Finance & Salary Tracker

Pullarim -- мобильное веб-приложение для трекинга расходов и зарплаты, ориентированное на рынок Узбекистана (валюта UZS). Использует **Supabase** (Auth + Postgres) и Next.js Route Handlers.

---

## Tech Stack

| Слой | Технология |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS design tokens (oklch) |
| UI Library | shadcn/ui |
| Animations | Framer Motion |
| Charts | Recharts |
| Fonts | Wix Madefor Display (UI), Playfair Display (logo) |
| Theme | Light only (forest-green accent) |
| Backend | Supabase (Auth + Postgres), SWR |

---

## Быстрый старт (Supabase)

### 1. Создание проекта Supabase

1. Перейдите на [supabase.com](https://supabase.com) и создайте аккаунт.
2. Создайте новый проект (Organization → New Project).
3. В **Settings → API** скопируйте:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (Legacy: anon key) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Выполнение SQL-скриптов

1. В Supabase Dashboard откройте **SQL Editor**.
2. Выполните `scripts/001-init.sql` (создание таблиц, индексов, RLS).
3. Выполните `scripts/002-seed-categories.sql` (дефолтные категории).
4. Выполните `scripts/003-add-end-date.sql` (поле end_date для режимов зарплаты).

### 3. Переменные окружения

Создайте `.env.local` в корне проекта (или скопируйте из `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> **Важно:** Без этих переменных приложение не запустится. Для локальной сборки можно временно использовать placeholder-значения.

### 4. Запуск

```bash
pnpm install
pnpm dev
```

Откройте http://localhost:3000 → редирект на `/auth`. Зарегистрируйтесь и войдите.

---

## Project Structure

```
app/
  layout.tsx              # Root layout: fonts, meta, viewport
  page.tsx                # Redirect --> /auth
  globals.css             # Design tokens, base styles
  auth/
    page.tsx              # Auth screen (login / signup)
  app/
    layout.tsx            # App shell: sidebar + bottom nav + FAB
    dashboard/
      page.tsx            # Dashboard screen
    salary/
      page.tsx            # Salary calendar + forecasts
    expenses/
      page.tsx            # Expense list with filters
    add/
      page.tsx            # New expense form + voice input
    assistant/
      page.tsx            # AI chat assistant
    settings/
      page.tsx            # User settings

components/
  bottom-nav.tsx          # Mobile bottom tab bar
  desktop-sidebar.tsx     # Desktop sidebar navigation
  assistant-fab.tsx       # Floating action button for assistant
  dashboard/
    dashboard-cards.tsx   # Next payout card
    spending-summary.tsx  # Spending totals + segmented range
    spending-chart.tsx    # Weekly area chart
    category-chart.tsx    # Category bar chart
    quick-add.tsx         # Quick expense input

lib/
  types.ts                # Shared types
  formatters.ts           # formatUZS, formatUZSShort, MONTHS_RU
  api.ts                  # API key helpers for SWR
  supabase/
    client.ts             # Browser Supabase client
    server.ts             # Server Supabase client
  api-auth.ts             # getAuthUser, unauthorized
  utils.ts                # cn() utility (shadcn)
```

---

## Screens & Features

### 1. Auth (`/auth`)
- Segmented control: Вход / Регистрация
- Email + password fields, "Запомнить меня", "Забыли пароль"
- Magic link option
- Dark gradient background (auth-only, app itself is light)
- Supabase Auth: signInWithPassword, signUp, signInWithOtp (magic link)

### 2. Dashboard (`/app/dashboard`)
- Month selector (chevron navigation)
- **SpendingSummary:** segmented range (Сегодня / 7 дней / 15 дней / Месяц), total + budget bar (month view) + sparkline
- **DashboardCards:** next payout card with countdown progress bar
- **QuickAdd:** inline expense form (amount + category)
- **SpendingChart:** area chart (daily totals)
- **CategoryChart:** horizontal bar chart (category breakdown)

### 3. Salary (`/app/salary`)
- Calendar grid (February 2026, Mon-Fri auto-selected)
- Toggle exceptions (click any day to flip worked/not)
- Two forecast cards:
  - "Выплата 20-го" (days 1-15)
  - "Выплата 5-го" (days 16-end)
- Salary modes list (Full-time / Part-time) with active indicator
- Payment history

### 4. Expenses (`/app/expenses`)
- Quick range filters (Сегодня / 7 дней / 15 дней / Месяц)
- Period total + count
- Cards / Table view toggle
- Collapsible advanced filters (search + category select)
- Color-coded category pills

### 5. Add Expense (`/app/add`)
- Large numeric input (one-handed use)
- Merchant name, category select, note
- Voice input button with animated waveform
- Confirmation dialog

### 6. Assistant (`/app/assistant`)
- Chat interface with user/assistant bubbles
- Tool cards (expense_added, query_result)
- Suggestion chips
- **Backend hookup:** AI SDK streaming + tool calling

### 7. Settings (`/app/settings`)
- Profile card (avatar initials + name + email)
- Currency (UZS, fixed)
- Language selector
- Export data (CSV)
- Delete account (with confirmation dialog)
- Logout

---

## Navigation

| Viewport | Component | Details |
|---|---|---|
| Mobile (<768px) | `BottomNav` | 5 tabs: Главная, Зарплата, + (Add), Расходы, Ещё. Center "+" button is elevated primary-colored circle |
| Desktop (>=768px) | `DesktopSidebar` | 6 items: Главная, Зарплата, Добавить, Расходы, Ассистент, Настройки. Spring-animated active indicator |
| Both | `AssistantFAB` | Floating button (hidden on assistant page) |

---

## Design System

### Color Palette (oklch)
```
Primary:       oklch(0.40 0.12 160)   -- deep forest green
Background:    oklch(0.97 0.005 155)  -- warm off-white
Card:          oklch(1.0 0 0)          -- pure white
Border:        oklch(0.90 0.008 155)  -- light gray-green
Muted FG:     oklch(0.50 0.02 155)   -- medium gray
Foreground:    oklch(0.15 0.02 155)   -- near-black
Destructive:   oklch(0.55 0.2 25)     -- red
```

### Fonts
- **UI (sans):** Wix Madefor Display -- clean, modern, with cyrillic support
- **Logo (serif):** Playfair Display (weight 700-900) -- bold, high-contrast serif

### Radius
- `--radius: 0.75rem` (12px), cards use `rounded-xl`

---

## Data Model (Mock -> Real)

### Types defined in `lib/mock-data.ts`:

```typescript
interface Expense {
  id: string
  merchant: string
  category: Category
  amount: number          // in UZS (integer, no decimals)
  date: string            // ISO date "YYYY-MM-DD"
  note?: string
}

type Category = "food" | "transport" | "shopping" | "entertainment" | "bills" | "health" | "other"

interface SalaryMode {
  id: string
  label: string           // "Full-time", "Part-time"
  amount: number          // monthly net amount in UZS
  startDate: string       // ISO date
  active: boolean
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCard?: {
    type: "expense_added" | "query_result"
    data: Record<string, string | number>
  }
}
```

### Utility functions:
- `formatUZS(amount)` -- "1 250 000 сум"
- `formatUZSShort(amount)` -- "1.2М" / "85К"

---

## Backend Integration Plan

### Recommended Stack
- **Database:** Supabase (PostgreSQL) or Neon
- **Auth:** Supabase Auth (email/password + magic link)
- **AI Assistant:** Vercel AI SDK + AI Gateway
- **File storage:** Vercel Blob (for receipts/photos)

### Database Schema (Proposed)

```sql
-- Users (managed by Supabase Auth, extended with profiles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  currency TEXT NOT NULL DEFAULT 'UZS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories (pre-seeded, user can add custom)
CREATE TABLE categories (
  id TEXT PRIMARY KEY,          -- "food", "transport", etc.
  label TEXT NOT NULL,          -- "Еда"
  color TEXT NOT NULL,          -- "bg-chart-1"
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT FALSE
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  amount BIGINT NOT NULL,       -- UZS as integer
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Salary modes
CREATE TABLE salary_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,           -- "Full-time"
  amount BIGINT NOT NULL,        -- monthly net in UZS
  start_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE
);

-- Salary work day exceptions (stores ONLY exceptions from Mon-Fri default)
CREATE TABLE work_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  UNIQUE(user_id, date)
);

-- Payment history
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period TEXT NOT NULL,          -- "1-15 февраля"
  pay_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  received BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX idx_expenses_user_category ON expenses(user_id, category_id);
CREATE INDEX idx_salary_modes_user ON salary_modes(user_id);
CREATE INDEX idx_work_exceptions_user ON work_exceptions(user_id, date);

-- Row Level Security (Supabase)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can CRUD own expenses"
  ON expenses FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own salary modes"
  ON salary_modes FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own exceptions"
  ON work_exceptions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own payments"
  ON payments FOR ALL USING (auth.uid() = user_id);
```

### API Routes (to create)

```
app/
  api/
    expenses/
      route.ts            GET (list, filtered) / POST (create)
      [id]/route.ts       PATCH / DELETE
    salary/
      modes/route.ts      GET / POST
      exceptions/route.ts GET / POST / DELETE
      payments/route.ts   GET
    assistant/
      route.ts            POST (AI SDK streamText)
    export/
      route.ts            GET (CSV generation)
    profile/
      route.ts            GET / PATCH
```

### Реализованные API Routes

- `GET/PATCH /api/profile` — профиль пользователя
- `GET/POST /api/categories` — категории (дефолтные + пользовательские)
- `GET/POST /api/expenses` — расходы (фильтры: range, category_id, search)
- `PATCH/DELETE /api/expenses/[id]` — редактирование/удаление расхода
- `GET/POST /api/salary/modes` — режимы зарплаты
- `GET/POST/DELETE /api/salary/exceptions` — исключения рабочих дней
- `GET /api/salary/forecast` — прогноз выплат за месяц
- `GET/POST/PATCH /api/salary/payments` — история выплат

### State Management
- **SWR** for all server data (expenses, salary, profile)
- **React state** for UI-only state (filters, view mode, modals)
- Mutate SWR cache after successful writes for optimistic updates

### Auth Flow
```
/auth (login/signup)
  -> Supabase signIn/signUp
  -> Set session cookie
  -> Redirect to /app/dashboard

/app/* (middleware check)
  -> If no session -> redirect to /auth
  -> If session -> render page

Logout
  -> Supabase signOut
  -> Clear session
  -> Redirect to /auth
```

---

## File-by-File Reference

| File | Exports | Client? | Dependencies |
|---|---|---|---|
| `app/layout.tsx` | `RootLayout` | No (RSC) | Fonts, globals.css |
| `app/page.tsx` | redirect | No (RSC) | next/navigation |
| `app/auth/page.tsx` | `AuthPage` | Yes | framer-motion, shadcn |
| `app/app/layout.tsx` | `AppLayout` | Yes | BottomNav, DesktopSidebar, AssistantFAB |
| `app/app/dashboard/page.tsx` | `DashboardPage` | Yes | SWR, framer-motion, dashboard/* |
| `app/app/salary/page.tsx` | `SalaryPage` | Yes | SWR, framer-motion |
| `app/app/expenses/page.tsx` | `ExpensesPage` | Yes | SWR, framer-motion, shadcn |
| `app/app/add/page.tsx` | `AddPage` | Yes | SWR, framer-motion, shadcn |
| `app/app/assistant/page.tsx` | `AssistantPage` | Yes | framer-motion |
| `app/app/settings/page.tsx` | `SettingsPage` | Yes | SWR, framer-motion, shadcn |
| `components/dashboard/*` | — | Yes | SWR, formatters, api |
| `lib/types.ts` | types | No | — |
| `lib/formatters.ts` | formatUZS, MONTHS_RU | No | — |
| `lib/utils.ts` | `cn` | No | clsx, tailwind-merge |

---

## Key Patterns for Backend Developer

1. **All pages are `"use client"`** -- they use hooks (useState, framer-motion). When adding data fetching, use SWR at the page level or create wrapper RSC pages that pass initial data.

2. **Types** в `lib/types.ts`, **форматтеры** в `lib/formatters.ts`. Данные загружаются через SWR и API routes.

3. **Navigation** — route-based (`/app/dashboard`, `/app/salary` и т.д.). `middleware.ts` защищает `/app/*` и редиректит на `/auth` при отсутствии сессии.

6. **All amounts are stored as integers** (UZS has no decimal subdivisions in practice). Use `BIGINT` in PostgreSQL.

7. **Calendar logic** is date-based -- `work_exceptions` table stores only days that differ from the default Mon-Fri pattern, keeping storage minimal.

8. **AI assistant** is ready for AI SDK -- the chat UI, tool cards, and suggestion chips already have the structure. Just replace the simulated responses with `useChat()` from `@ai-sdk/react`.
