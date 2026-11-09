import type { AppData } from '../types'
import { EXPENSE_CATEGORIES } from './constants'
import { formatDate } from './dates'
import { allExpenses } from './expenses'

const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** CSV con separatore ";" e decimali con la virgola (compatibile con Excel in italiano). La targa non viene esportata. */
export function expensesToCSV(data: AppData, vehicleId?: string): string {
  const header = ['Data', 'Veicolo', 'Categoria', 'Descrizione', 'Importo (EUR)', 'Origine']
  const rows = allExpenses(data, vehicleId).map((e) => {
    const v = data.vehicles.find((x) => x.id === e.vehicleId)
    const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category
    return [formatDate(e.date), v?.name ?? '', cat, e.description, e.amount.toFixed(2).replace('.', ','), e.source === 'intervento' ? 'Intervento' : 'Spesa']
  })
  return '\uFEFF' + [header, ...rows].map((r) => r.map((c) => esc(String(c))).join(';')).join('\r\n')
}
