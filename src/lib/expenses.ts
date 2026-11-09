import type { AppData, ExpenseCategory } from '../types'
import { INTERVENTION_TYPES } from './constants'
import { deadlineLabel } from './deadlines'

export interface ExpenseItem {
  id: string
  vehicleId: string
  category: ExpenseCategory
  date: string
  amount: number
  description: string
  source: 'manuale' | 'intervento'
  refId: string
}

/** Tutte le spese: manuali + costi degli interventi registrati (senza duplicati). */
export function allExpenses(data: AppData, vehicleId?: string): ExpenseItem[] {
  const items: ExpenseItem[] = []
  for (const e of data.expenses) {
    if (vehicleId && e.vehicleId !== vehicleId) continue
    items.push({ id: e.id, vehicleId: e.vehicleId, category: e.category, date: e.date, amount: e.amount, description: e.description || '', source: 'manuale', refId: e.id })
  }
  for (const r of data.records) {
    if (vehicleId && r.vehicleId !== vehicleId) continue
    if (!r.cost) continue
    items.push({
      id: 'rec-' + r.id, vehicleId: r.vehicleId, category: INTERVENTION_TYPES[r.type].expenseCategory,
      date: r.date, amount: r.cost, description: deadlineLabel(r), source: 'intervento', refId: r.id,
    })
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function sumBy(items: ExpenseItem[], pred: (e: ExpenseItem) => boolean): number {
  return Math.round(items.filter(pred).reduce((s, e) => s + e.amount, 0) * 100) / 100
}

export function yearTotal(items: ExpenseItem[], year: number) {
  return sumBy(items, (e) => e.date.startsWith(String(year)))
}

export function monthlyTotals(items: ExpenseItem[], year: number): number[] {
  const arr = new Array(12).fill(0)
  for (const e of items) {
    if (!e.date.startsWith(String(year))) continue
    const m = Number(e.date.slice(5, 7)) - 1
    arr[m] += e.amount
  }
  return arr.map((n) => Math.round(n * 100) / 100)
}
