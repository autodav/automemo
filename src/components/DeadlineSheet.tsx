import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import type { Deadline, InterventionType, ReminderDay } from '../types'
import { useStore } from '../store/AppStore'
import { useUi } from './UiContext'
import { Button, Field, Input, Notice, Select, Sheet, Textarea } from './ui'
import { ReminderPicker } from './ReminderPicker'
import { INTERVENTION_TYPES, MANUFACTURER_NOTE, REVISIONE_HINT, TYPE_ORDER } from '../lib/constants'
import { computeDue } from '../lib/deadlines'
import { formatDate, isValidISODate } from '../lib/dates'
import { formatKm, parseKm } from '../lib/format'

export interface DeadlineSheetState { deadline?: Deadline; type?: InterventionType }

export function DeadlineSheet({ state, onClose }: { state: DeadlineSheetState | null; onClose: () => void }) {
  const { activeVehicle, data, upsertDeadline, deleteDeadline } = useStore()
  const { toast, confirm } = useUi()
  const editing = state?.deadline
  const [type, setType] = useState<InterventionType>('tagliando')
  const [customLabel, setCustomLabel] = useState('')
  const [lastDate, setLastDate] = useState('')
  const [lastKm, setLastKm] = useState('')
  const [intervalMonths, setIntervalMonths] = useState('')
  const [intervalKm, setIntervalKm] = useState('')
  const [fixedDate, setFixedDate] = useState('')
  const [fixedKm, setFixedKm] = useState('')
  const [reminders, setReminders] = useState<ReminderDay[]>([30, 15, 7, 1])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!state) return
    const d = state.deadline
    setType(d?.type ?? state.type ?? 'tagliando')
    setCustomLabel(d?.customLabel ?? '')
    setLastDate(d?.lastDate ?? '')
    setLastKm(d?.lastKm !== undefined ? String(d.lastKm) : '')
    setIntervalMonths(d?.intervalMonths ? String(d.intervalMonths) : '')
    setIntervalKm(d?.intervalKm ? String(d.intervalKm) : '')
    setFixedDate(d?.fixedDate ?? '')
    setFixedKm(d?.fixedKm !== undefined ? String(d.fixedKm) : '')
    setReminders(d?.reminderDays ?? [30, 15, 7, 1])
    setNotes(d?.notes ?? '')
    setError('')
  }, [state])

  if (!activeVehicle) return null
  const meta = INTERVENTION_TYPES[type]

  const build = (): Omit<Deadline, 'id' | 'createdAt'> | string => {
    const lk = parseKm(lastKm), ik = parseKm(intervalKm), fk = parseKm(fixedKm)
    const im = intervalMonths.trim() ? Number(intervalMonths.replace(',', '.')) : undefined
    if ([lk, ik, fk].some((n) => Number.isNaN(n)) || (im !== undefined && (!Number.isFinite(im) || im <= 0 || im > 240))) return 'Controlla i valori numerici inseriti.'
    if (type === 'personalizzata' && !customLabel.trim()) return 'Dai un nome alla manutenzione personalizzata.'
    if (lastDate && !isValidISODate(lastDate)) return 'La data dell’ultima esecuzione non è valida.'
    if (fixedDate && !isValidISODate(fixedDate)) return 'La data di scadenza non è valida.'
    if (im && !lastDate && !fixedDate) return 'Per calcolare la scadenza dall’intervallo in mesi indica la data dell’ultima esecuzione.'
    if (ik && lk === undefined && fk === undefined) return 'Per calcolare la scadenza dall’intervallo in km indica i km dell’ultima esecuzione.'
    if (!fixedDate && !(im && lastDate) && fk === undefined && !(ik && lk !== undefined)) return 'Inserisci una data di scadenza oppure un intervallo (mesi o km) insieme all’ultima esecuzione.'
    return {
      vehicleId: activeVehicle.id, type, customLabel: type === 'personalizzata' ? customLabel.trim() : undefined,
      lastDate: lastDate || undefined, lastKm: lk, intervalMonths: im, intervalKm: ik || undefined,
      fixedDate: fixedDate || undefined, fixedKm: fk, reminderDays: reminders, notes: notes.trim() || undefined,
    }
  }

  const draft = build()
  const preview = typeof draft === 'string' ? null : computeDue(draft as Deadline)

  const save = () => {
    const d = build()
    if (typeof d === 'string') return setError(d)
    if (!editing && type !== 'personalizzata' && data.deadlines.some((x) => x.vehicleId === activeVehicle.id && x.type === type)) {
      return setError(`Esiste già una scadenza “${meta.label}” per questa auto: modificala dalla lista.`)
    }
    upsertDeadline({ ...d, id: editing?.id })
    toast(editing ? 'Scadenza aggiornata' : 'Scadenza salvata')
    onClose()
  }

  const remove = async () => {
    if (!editing) return
    if (await confirm({ title: 'Eliminare la scadenza?', message: 'Lo storico degli interventi non verrà toccato. Questa azione non si può annullare.', confirmLabel: 'Elimina', danger: true })) {
      deleteDeadline(editing.id)
      toast('Scadenza eliminata')
      onClose()
    }
  }

  return (
    <Sheet open={!!state} onClose={onClose} title={editing ? 'Modifica scadenza' : 'Nuova scadenza'} testId="deadline-sheet"
      footer={<div className="flex gap-3">{editing && <Button variant="secondary" onClick={remove} className="text-red-600" data-testid="deadline-delete">Elimina</Button>}<Button className="flex-1" onClick={save} data-testid="deadline-save">Salva scadenza</Button></div>}>
      <div className="space-y-4">
        <Field label="Tipo" htmlFor="dl-type">
          <Select id="dl-type" value={type} disabled={!!editing} onChange={(e) => setType(e.target.value as InterventionType)}>
            {TYPE_ORDER.map((t) => <option key={t} value={t}>{INTERVENTION_TYPES[t].label}</option>)}
          </Select>
        </Field>
        {type === 'personalizzata' && (
          <Field label="Nome manutenzione" htmlFor="dl-label"><Input id="dl-label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Es. Liquido refrigerante" /></Field>
        )}
        <Notice><div className="flex gap-2"><Info size={16} className="mt-0.5 shrink-0" /><span>{type === 'revisione' ? REVISIONE_HINT : MANUFACTURER_NOTE}</span></div></Notice>

        {meta.admin ? (
          <>
            <Field label="Data di scadenza" htmlFor="dl-fixed" hint="La trovi sul contratto, sull’avviso di pagamento o sulla carta di circolazione."><Input id="dl-fixed" type="date" value={fixedDate} onChange={(e) => setFixedDate(e.target.value)} /></Field>
            <details className="rounded-2xl bg-slate-50 p-3 dark:bg-night-800/60">
              <summary className="cursor-pointer text-sm font-semibold">Oppure calcola da un intervallo</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Ultima volta" htmlFor="dl-last"><Input id="dl-last" type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} /></Field>
                <Field label="Ogni (mesi)" htmlFor="dl-im"><Input id="dl-im" inputMode="numeric" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} placeholder="Es. 12" /></Field>
              </div>
              {type === 'revisione' && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setIntervalMonths('24')}>Usa 24 mesi (revisioni successive)</Button>}
              <p className="mt-2 text-xs text-slate-500">Se inserisci una data di scadenza, ha la precedenza sull’intervallo.</p>
            </details>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ultima esecuzione" htmlFor="dl-last"><Input id="dl-last" type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} /></Field>
              <Field label="Km ultima esecuzione" htmlFor="dl-lastkm"><Input id="dl-lastkm" inputMode="numeric" value={lastKm} onChange={(e) => setLastKm(e.target.value)} placeholder={String(activeVehicle.km)} /></Field>
              <Field label="Intervallo (mesi)" htmlFor="dl-im"><Input id="dl-im" inputMode="numeric" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} placeholder="Da libretto" /></Field>
              <Field label="Intervallo (km)" htmlFor="dl-ik"><Input id="dl-ik" inputMode="numeric" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} placeholder="Da libretto" /></Field>
            </div>
            <details className="rounded-2xl bg-slate-50 p-3 dark:bg-night-800/60">
              <summary className="cursor-pointer text-sm font-semibold">Oppure imposta una scadenza precisa</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Entro il" htmlFor="dl-fixed"><Input id="dl-fixed" type="date" value={fixedDate} onChange={(e) => setFixedDate(e.target.value)} /></Field>
                <Field label="Entro i km" htmlFor="dl-fk"><Input id="dl-fk" inputMode="numeric" value={fixedKm} onChange={(e) => setFixedKm(e.target.value)} /></Field>
              </div>
            </details>
          </>
        )}

        {preview && (preview.dueDate || preview.dueKm !== undefined) && (
          <div className="rounded-2xl bg-electric-500/10 px-4 py-3 text-sm" data-testid="deadline-preview">
            Prossima scadenza: <strong>{[preview.dueDate && formatDate(preview.dueDate), preview.dueKm !== undefined && formatKm(preview.dueKm)].filter(Boolean).join(' oppure ')}</strong>
            {preview.dueDate && preview.dueKm !== undefined && <span className="block text-xs text-slate-500">Vale il limite raggiunto per primo.</span>}
          </div>
        )}

        <Field label="Promemoria nell’app" hint="Riceverai un avviso dentro AutoMemo quando mancano questi giorni. Le notifiche push non sono disponibili in questa versione.">
          <ReminderPicker value={reminders} onChange={setReminders} />
        </Field>
        <Field label="Note (facoltative)" htmlFor="dl-notes"><Textarea id="dl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Es. intervallo indicato a pag. 210 del libretto" /></Field>
        {error && <Notice tone="danger"><span role="alert" data-testid="form-error">{error}</span></Notice>}
      </div>
    </Sheet>
  )
}
