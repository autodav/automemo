/** Logica pura delle soglie di promemoria (testabile senza Worker). */

export const THRESHOLDS = [30, 15, 7, 1] as const
export type Threshold = (typeof THRESHOLDS)[number]
const BIT: Record<Threshold, number> = { 30: 8, 15: 4, 7: 2, 1: 1 }

export function toMask(list: number[]): number {
  let m = 0
  for (const t of list) if ((THRESHOLDS as readonly number[]).includes(t)) m |= BIT[t as Threshold]
  return m
}
export function fromMask(mask: number): Threshold[] {
  return THRESHOLDS.filter((t) => mask & BIT[t])
}

/** Data locale (YYYY-MM-DD) e ora in un fuso orario IANA. */
export function localNow(timeZone: string, now = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const g = (t: string) => parts.find((p) => p.type === t)!.value
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) }
}

const dayMs = 86400000
const toUTC = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / dayMs)
}
export function addDays(iso: string, n: number): string {
  return new Date(toUTC(iso) + n * dayMs).toISOString().slice(0, 10)
}

/** Giorno del prossimo invio: la soglia non inviata più alta. Se è già passata, l'invio è "oggi" (recupero). */
export function nextSendDate(dueDate: string, thresholds: number, sent: number, today: string): string | null {
  const pending = fromMask(thresholds & ~sent)
  if (!pending.length || dueDate < today) return null
  const t = Math.max(...pending)
  const d = addDays(dueDate, -t)
  return d < today ? today : d
}

/**
 * Stato iniziale per una scadenza nuova o con data cambiata:
 * le soglie già superate al momento della sincronizzazione vengono saltate (niente raffiche di notifiche),
 * tranne quando la scadenza cade esattamente su una soglia oggi.
 */
export function initialSent(dueDate: string, thresholds: number, today: string): number {
  const left = daysBetween(today, dueDate)
  let sent = 0
  for (const t of fromMask(thresholds)) if (t > left) sent |= BIT[t]
  return sent
}

/** Dopo un invio con "left" giorni rimanenti: tutte le soglie >= left risultano inviate (deduplica). */
export function markSent(thresholds: number, sent: number, left: number): number {
  let s = sent
  for (const t of fromMask(thresholds)) if (t >= left) s |= BIT[t]
  return s
}

export function formatIT(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function notificationFor(row: { label: string; due_date: string; deadline_id: string; vehicle_id: string }, left: number) {
  const when = left === 0 ? 'Scade oggi' : left === 1 ? 'Scade domani' : `Mancano ${left} giorni`
  return {
    title: `AutoMemo · ${row.label}`,
    body: `${when}: scadenza il ${formatIT(row.due_date)}. Tocca per vedere i dettagli.`,
    tag: `dl-${row.deadline_id}`,
    url: `./#/scadenze?v=${encodeURIComponent(row.vehicle_id)}&d=${encodeURIComponent(row.deadline_id)}`,
  }
}
