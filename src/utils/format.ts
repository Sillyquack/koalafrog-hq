export const formatDate = (value: string | null | undefined, missing = 'Not set') => {
  if (value == null || value.trim() === '') return missing
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  const date = new Date(input)
  if (!Number.isFinite(date.getTime())) return 'Invalid date'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}
export const formatMoney = (value: number, currency = 'NOK') => new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
export const initials = (value: string) => value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
