import type { AppData, Deadline, ReminderDay, Vehicle } from '../types'
import { INTERVENTION_TYPES } from './constants'
import { addMonths, daysFromToday } from './dates'

export type Status = 'ok' | 'warning' | 'overdue' | 'unset'

export interface DeadlineInfo {
  deadline: Deadline
  label: string
  dueDate?: string
  dueKm?: number
  daysLeft?: number
  kmLeft?: number
  status: Status
  /** promemoria attivo (30/15/7/1) */
  reminderStage?: ReminderDay | 'overdue'
  reason: string
}

export function deadlineLabel(d: { type: Deadline['type']; customLabel?: string }): string {
  if (d.type === 'personalizzata') return d.customLabel?.trim() || 'Manutenzione personalizzata'
  return INTERVENTION_TYPES[d.type].label
}

export function computeDue(d: Deadline): { dueDate?: string; dueKm?: number } {
  let dueDate: string | undefined
  let dueKm: number | undefined
  if (d.fixedDate) dueDate = d.fixedDate
  else if (d.lastDate && d.intervalMonths && d.intervalMonths > 0) dueDate = addMonths(d.lastDate, d.intervalMonths)
  if (d.fixedKm !== undefined) dueKm = d.fixedKm
  else if (d.lastKm !== undefined && d.intervalKm && d.intervalKm > 0) dueKm = d.lastKm + d.intervalKm
  return { dueDate, dueKm }
}

export function analyzeDeadline(d: Deadline, vehicle: Vehicle, kmWarning: number): DeadlineInfo {
  const { dueDate, dueKm } = computeDue(d)
  const label = deadlineLabel(d)
  const daysLeft = dueDate ? daysFromToday(dueDate) : undefined
  const kmLeft = dueKm !== undefined ? dueKm - vehicle.km : undefined
  const reminders = [...(d.reminderDays || [])].sort((a, b) => a - b)
  const warnDays = reminders.length ? Math.max(...reminders) : 30

  if (daysLeft === undefined && kmLeft === undefined) {
    return { deadline: d, label, status: 'unset', reason: 'Intervallo o data non impostati' }
  }
  const overdueByDate = daysLeft !== undefined && daysLeft < 0
  const overdueByKm = kmLeft !== undefined && kmLeft < 0
  if (overdueByDate || overdueByKm) {
    const parts: string[] = []
    if (overdueByDate) parts.push(`scaduta da ${Math.abs(daysLeft!)} ${Math.abs(daysLeft!) === 1 ? 'giorno' : 'giorni'}`)
    if (overdueByKm) parts.push(`superata di ${Math.abs(kmLeft!).toLocaleString('it-IT')} km`)
    return { deadline: d, label, dueDate, dueKm, daysLeft, kmLeft, status: 'overdue', reminderStage: 'overdue', reason: cap(parts.join(' e ')) }
  }
  let stage: ReminderDay | undefined
  if (daysLeft !== undefined) {
    for (const r of reminders) {
      if (daysLeft <= r) { stage = r; break }
    }
  }
  const nearByDate = daysLeft !== undefined && daysLeft <= warnDays
  const nearByKm = kmLeft !== undefined && kmLeft <= kmWarning
  const parts: string[] = []
  if (daysLeft !== undefined) parts.push(daysLeft === 0 ? 'scade oggi' : `mancano ${daysLeft} ${daysLeft === 1 ? 'giorno' : 'giorni'}`)
  if (kmLeft !== undefined) parts.push(`${kmLeft.toLocaleString('it-IT')} km rimanenti`)
  return {
    deadline: d, label, dueDate, dueKm, daysLeft, kmLeft,
    status: nearByDate || nearByKm ? 'warning' : 'ok',
    reminderStage: stage,
    reason: cap(parts.join(' · ')),
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const statusRank: Record<Status, number> = { overdue: 0, warning: 1, ok: 2, unset: 3 }

export function sortInfos(list: DeadlineInfo[]): DeadlineInfo[] {
  return [...list].sort((a, b) => {
    const r = statusRank[a.status] - statusRank[b.status]
    if (r !== 0) return r
    const da = a.daysLeft ?? Number.POSITIVE_INFINITY
    const db = b.daysLeft ?? Number.POSITIVE_INFINITY
    if (da !== db) return da - db
    return (a.kmLeft ?? Infinity) - (b.kmLeft ?? Infinity)
  })
}

export function vehicleDeadlines(data: AppData, vehicleId: string): DeadlineInfo[] {
  const v = data.vehicles.find((x) => x.id === vehicleId)
  if (!v) return []
  return sortInfos(data.deadlines.filter((d) => d.vehicleId === vehicleId).map((d) => analyzeDeadline(d, v, data.settings.kmWarning)))
}

export interface ActiveReminder {
  key: string
  info: DeadlineInfo
  vehicle: Vehicle
}

/** Promemoria in-app attivi (per tutte le auto). La chiave cambia a ogni soglia, così un avviso chiuso ricompare alla soglia successiva. */
export function activeReminders(data: AppData): ActiveReminder[] {
  const out: ActiveReminder[] = []
  for (const v of data.vehicles) {
    for (const info of vehicleDeadlines(data, v.id)) {
      const kmNear = info.kmLeft !== undefined && info.kmLeft <= data.settings.kmWarning
      if (info.status === 'overdue' || info.reminderStage || (info.status === 'warning' && kmNear)) {
        const stage = info.status === 'overdue' ? 'overdue' : info.reminderStage ?? 'km'
        const key = `${info.deadline.id}|${stage}|${info.dueDate ?? ''}|${info.dueKm ?? ''}`
        out.push({ key, info, vehicle: v })
      }
    }
  }
  return out
}

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'Regolare',
  warning: 'In scadenza',
  overdue: 'Scaduta',
  unset: 'Da impostare',
}
