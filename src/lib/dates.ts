const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = parseISODate(s)
  return toISODate(d) === s
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return toISODate(target)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISODate(fromISO)
  const b = parseISODate(toISO)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function daysFromToday(iso: string): number {
  return daysBetween(todayISO(), iso)
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
export const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export function monthName(i: number): string {
  return MONTHS[i]
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = parseISODate(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateLong(iso?: string): string {
  if (!iso) return '—'
  const d = parseISODate(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function relativeDays(days: number): string {
  if (days === 0) return 'oggi'
  if (days === 1) return 'domani'
  if (days === -1) return 'ieri'
  if (days > 0) return `tra ${days} giorni`
  return `${Math.abs(days)} giorni fa`
}
