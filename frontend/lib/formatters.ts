// Pure formatting utilities for UZS and dates

export function formatUZS(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " сум"
}

export function formatUZSShort(amount: number): string {
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(1).replace(".0", "") + "М"
  }
  if (amount >= 1_000) {
    return (amount / 1_000).toFixed(0) + "К"
  }
  return amount.toString()
}

export const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const

export const SUGGESTION_CHIPS = [
  "Сколько потратил вчера?",
  "Расходы за 7 дней",
  "Сколько получу 20-го?",
  "Запиши 32000 такси вчера",
]
