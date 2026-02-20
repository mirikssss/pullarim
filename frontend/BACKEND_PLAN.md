# План реализации бэкенда Pullarim

## Обзор

Полная замена mock-данных на Supabase (Auth + Postgres) + Next.js Route Handlers.

---

## Этапы реализации

### Этап 0: Подготовка
- [x] Создать `lib/types.ts` — типы (Expense, Category, SalaryMode, Payment и т.д.)
- [x] Вынести `formatUZS`, `formatUZSShort`, `MONTHS_RU` в `lib/formatters.ts` или оставить в types
- [x] Установить зависимости: `@supabase/supabase-js`, `@supabase/ssr`, `swr`

### Этап 1: SQL скрипты
- [ ] `scripts/001-init.sql` — таблицы, индексы, RLS
- [ ] `scripts/002-seed-categories.sql` — дефолтные категории

### Этап 2: Supabase клиенты
- [ ] `lib/supabase/client.ts` — createBrowserClient
- [ ] `lib/supabase/server.ts` — createServerClient (cookies)
- [ ] `.env.example` — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

### Этап 3: Auth flow
- [ ] Обновить `/auth` — signUp, signInWithPassword, signOut
- [ ] `middleware.ts` — защита `/app/*`, редирект на `/auth`

### Этап 4: API Routes (основные)
- [ ] `app/api/profile/route.ts` — GET, PATCH
- [ ] `app/api/categories/route.ts` — GET, POST
- [ ] `app/api/expenses/route.ts` — GET (фильтры), POST
- [ ] `app/api/expenses/[id]/route.ts` — PATCH, DELETE

### Этап 5: API Routes (зарплата)
- [ ] `app/api/salary/modes/route.ts` — GET, POST
- [ ] `app/api/salary/exceptions/route.ts` — GET, POST, DELETE
- [ ] `app/api/salary/forecast/route.ts` — GET
- [ ] `app/api/salary/payments/route.ts` — GET, POST, PATCH

### Этап 6: Замена mock data в UI
- [ ] Dashboard — SpendingSummary, DashboardCards, QuickAdd, SpendingChart, CategoryChart
- [ ] Expenses — список, фильтры
- [ ] Add — форма POST /api/expenses
- [ ] Salary — календарь, режимы, прогноз, история
- [ ] Settings — профиль, logout
- [ ] Assistant — пока оставить mock (AI SDK позже)

### Этап 7: Финализация
- [ ] Удалить `lib/mock-data.ts`
- [ ] Обновить README — инструкции по Supabase, скриптам, env

---

## Инструкции по запуску (будут в README)

### 1. Создание Supabase проекта
1. Зайти на https://supabase.com
2. Создать новый проект
3. В Settings → API скопировать:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Выполнение SQL скриптов
1. Supabase Dashboard → SQL Editor
2. Выполнить `scripts/001-init.sql`
3. Выполнить `scripts/002-seed-categories.sql`

### 3. Переменные окружения
Создать `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4. Запуск приложения
```bash
pnpm install
pnpm dev
```
