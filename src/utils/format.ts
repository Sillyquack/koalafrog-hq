export const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
export const formatMoney = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'NOK', minimumFractionDigits: 2 }).format(value)
export const initials = (value: string) => value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
