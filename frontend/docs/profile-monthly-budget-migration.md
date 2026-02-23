# Колонка monthly_budget в profiles

Для работы «Бюджета на месяц» в настройках и на дашборде в таблице `profiles` должна быть колонка `monthly_budget`.

Если вы используете Supabase и колонки ещё нет, выполните в SQL Editor:

```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS monthly_budget integer DEFAULT NULL;
```

После этого в Настройках → Редактировать профиль можно задать бюджет на месяц (в сумах), и он будет отображаться на дашборде в блоке «Потрачено» при выборе периода «Месяц».
