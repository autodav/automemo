import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Wallet } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useActions } from '../components/Actions'
import { useUi } from '../components/UiContext'
import { Button, Card, EmptyState, IconButton, PageHeader } from '../components/ui'
import { MonthlyBarChart } from '../components/BarChart'
import { CATEGORY_ICONS } from '../components/TypeIcon'
import { allExpenses, monthlyTotals, sumBy } from '../lib/expenses'
import { EXPENSE_CATEGORIES } from '../lib/constants'
import { formatDate, monthName, todayISO } from '../lib/dates'
import { formatEuro } from '../lib/format'
import { expensesToCSV } from '../lib/csv'
import { downloadText } from '../lib/download'

export function Expenses() {
  const { data, activeVehicle: v } = useStore()
  const { openExpense, openLog } = useActions()
  const { toast } = useUi()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  if (!v) return null
  const items = allExpenses(data, v.id)
  const yearItems = items.filter((e) => e.date.startsWith(String(year)))
  const monthly = monthlyTotals(items, year)
  const yearTotal = sumBy(yearItems, () => true)
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthItems = items.filter((e) => e.date.startsWith(monthKey))
  const monthTotal = sumBy(monthItems, () => true)
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: sumBy(yearItems, (e) => e.category === c.value) }))
  const minYear = Math.min(now.getFullYear(), ...items.map((e) => Number(e.date.slice(0, 4))))

  const exportCsv = () => {
    if (!items.length) return toast('Non ci sono spese da esportare.', 'info')
    downloadText(`automemo-spese-${todayISO()}.csv`, expensesToCSV(data, v.id), 'text/csv;charset=utf-8')
    toast('File CSV esportato')
  }

  return (
    <div className="space-y-4 animate-fade-in" data-testid="expenses">
      <PageHeader title="Spese" subtitle={v.name} right={<Button size="sm" variant="secondary" onClick={exportCsv} data-testid="export-csv"><Download size={16} /> CSV</Button>} />
      <Card>
        <div className="flex items-center justify-between">
          <IconButton label="Anno precedente" onClick={() => setYear(year - 1)} disabled={year <= minYear - 1}><ChevronLeft size={20} /></IconButton>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500">Totale {year}</p>
            <p className="text-3xl font-extrabold tabular-nums" data-testid="year-total">{formatEuro(yearTotal)}</p>
          </div>
          <IconButton label="Anno successivo" onClick={() => setYear(year + 1)} disabled={year >= now.getFullYear()}><ChevronRight size={20} /></IconButton>
        </div>
        <div className="mt-3"><MonthlyBarChart values={monthly} selected={month} onSelect={setMonth} /></div>
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-night-800">
          <span className="text-sm font-semibold capitalize">{monthName(month)} {year}</span>
          <span className="font-bold tabular-nums" data-testid="month-total">{formatEuro(monthTotal)}</span>
        </div>
      </Card>

      <Card>
        <p className="mb-3 font-bold">Per categoria · {year}</p>
        <div className="space-y-2.5">
          {byCat.map((c) => {
            const I = CATEGORY_ICONS[c.value]
            const pct = yearTotal ? (c.total / yearTotal) * 100 : 0
            return (
              <div key={c.value} className="flex items-center gap-3" data-testid={`cat-${c.value}`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: c.color + '22', color: c.color }}><I size={16} /></span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm"><span>{c.label}</span><span className="font-semibold tabular-nums">{formatEuro(c.total)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-night-800"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: c.color }} /></div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Button className="w-full" size="lg" onClick={() => openExpense({})} data-testid="add-expense"><Plus size={20} /> Aggiungi spesa</Button>

      <section>
        <h3 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">Movimenti di {monthName(month)}</h3>
        {monthItems.length === 0 ? (
          <EmptyState icon={<Wallet />} title="Nessuna spesa in questo mese" text="Registra carburante, assicurazione, bollo e altre spese. I costi degli interventi vengono aggiunti in automatico." />
        ) : (
          <Card className="divide-y divide-slate-100 !py-1 dark:divide-night-700">
            {monthItems.map((e) => {
              const c = EXPENSE_CATEGORIES.find((x) => x.value === e.category)!
              const I = CATEGORY_ICONS[e.category]
              return (
                <button key={e.id} type="button" data-testid="expense-item" className="flex w-full items-center gap-3 py-3 text-left"
                  onClick={() => {
                    if (e.source === 'manuale') openExpense({ expense: data.expenses.find((x) => x.id === e.refId) })
                    else openLog({ record: data.records.find((r) => r.id === e.refId) })
                  }}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: c.color + '22', color: c.color }}><I size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.description || c.label}</span>
                    <span className="block text-xs text-slate-500">{formatDate(e.date)} · {c.label}{e.source === 'intervento' ? ' · da intervento' : ''}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatEuro(e.amount)}</span>
                </button>
              )
            })}
          </Card>
        )}
      </section>
    </div>
  )
}
