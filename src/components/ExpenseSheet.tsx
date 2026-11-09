import { useEffect, useState } from 'react'
import type { Expense, ExpenseCategory } from '../types'
import { useStore } from '../store/AppStore'
import { useUi } from './UiContext'
import { Button, Field, Input, Notice, Sheet, cx } from './ui'
import { CATEGORY_ICONS } from './TypeIcon'
import { EXPENSE_CATEGORIES } from '../lib/constants'
import { isValidISODate, todayISO } from '../lib/dates'
import { parseAmount } from '../lib/format'

export interface ExpenseSheetState { expense?: Expense; category?: ExpenseCategory }

export function ExpenseSheet({ state, onClose }: { state: ExpenseSheetState | null; onClose: () => void }) {
  const { activeVehicle, addExpense, updateExpense, deleteExpense } = useStore()
  const { toast, confirm } = useUi()
  const editing = state?.expense
  const [category, setCategory] = useState<ExpenseCategory>('carburante')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!state) return
    setCategory(state.expense?.category ?? state.category ?? 'carburante')
    setAmount(state.expense ? String(state.expense.amount).replace('.', ',') : '')
    setDate(state.expense?.date ?? todayISO())
    setDescription(state.expense?.description ?? '')
    setError('')
  }, [state])

  if (!activeVehicle) return null

  const save = () => {
    const a = parseAmount(amount)
    if (a === undefined || Number.isNaN(a) || a <= 0) return setError('Inserisci un importo maggiore di zero. Esempio: 45,50')
    if (!isValidISODate(date)) return setError('Inserisci una data valida.')
    const payload = { vehicleId: activeVehicle.id, category, amount: Math.round(a * 100) / 100, date, description: description.trim() || undefined }
    if (editing) updateExpense(editing.id, payload)
    else addExpense(payload)
    toast(editing ? 'Spesa aggiornata' : 'Spesa registrata')
    onClose()
  }

  const remove = async () => {
    if (!editing) return
    if (await confirm({ title: 'Eliminare la spesa?', message: 'La spesa verrà rimossa dai totali. Questa azione non si può annullare.', confirmLabel: 'Elimina', danger: true })) {
      deleteExpense(editing.id)
      toast('Spesa eliminata')
      onClose()
    }
  }

  return (
    <Sheet open={!!state} onClose={onClose} title={editing ? 'Modifica spesa' : 'Nuova spesa'} testId="expense-sheet"
      footer={<div className="flex gap-3">{editing && <Button variant="secondary" className="text-red-600" onClick={remove} data-testid="expense-delete">Elimina</Button>}<Button className="flex-1" size="lg" onClick={save} data-testid="expense-save">Salva spesa</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Categoria">
          {EXPENSE_CATEGORIES.map((c) => {
            const I = CATEGORY_ICONS[c.value]
            const on = c.value === category
            return (
              <button key={c.value} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c.value)}
                className={cx('flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-semibold ring-1 transition active:scale-95', on ? 'bg-electric-500 text-white ring-electric-500' : 'bg-slate-100 ring-transparent dark:bg-night-800')}>
                <I size={18} /> {c.label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importo (€)" htmlFor="exp-amount"><Input id="exp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" autoFocus /></Field>
          <Field label="Data" htmlFor="exp-date"><Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Descrizione (facoltativa)" htmlFor="exp-desc"><Input id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Es. Pieno, autolavaggio, parcheggio" /></Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">I costi degli interventi registrati vengono già conteggiati automaticamente: non serve inserirli di nuovo qui.</p>
        {error && <Notice tone="danger"><span role="alert" data-testid="form-error">{error}</span></Notice>}
      </div>
    </Sheet>
  )
}
