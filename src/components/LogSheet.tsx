import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, Info, Trash2 } from 'lucide-react'
import type { InterventionType, ServiceRecord } from '../types'
import { useStore } from '../store/AppStore'
import { useUi } from './UiContext'
import { Button, Field, Input, Notice, Sheet, Textarea, cx } from './ui'
import { TypeIcon } from './TypeIcon'
import { INTERVENTION_TYPES, MANUFACTURER_NOTE, REVISIONE_HINT, TYPE_ORDER } from '../lib/constants'
import { addMonths, formatDate, isValidISODate, todayISO } from '../lib/dates'
import { formatKm, parseAmount, parseKm } from '../lib/format'
import { compressImage } from '../lib/image'
import { deleteFile, getFile, saveFile } from '../lib/db'
import { uid } from '../lib/id'
import { computeDue, deadlineLabel } from '../lib/deadlines'

export interface LogSheetState { type?: InterventionType; customLabel?: string; record?: ServiceRecord }

export function LogSheet({ state, onClose }: { state: LogSheetState | null; onClose: () => void }) {
  const { activeVehicle, data, addRecord, updateRecord, deleteRecord, upsertDeadline } = useStore()
  const { toast, confirm } = useUi()
  const editing = state?.record
  const [type, setType] = useState<InterventionType | null>(null)
  const [customLabel, setCustomLabel] = useState('')
  const [cost, setCost] = useState('')
  const [km, setKm] = useState('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<string | undefined>()
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [nextMonths, setNextMonths] = useState('')
  const [nextKm, setNextKm] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state) return
    const r = state.record
    setType(r?.type ?? state.type ?? null)
    setCustomLabel(r?.customLabel ?? state.customLabel ?? '')
    setCost(r?.cost !== undefined ? String(r.cost).replace('.', ',') : '')
    setKm(r?.km !== undefined ? String(r.km) : activeVehicle ? String(activeVehicle.km) : '')
    setDate(r?.date ?? todayISO())
    setNotes(r?.notes ?? '')
    setPhoto(undefined)
    setPhotoChanged(false)
    setNextMonths(''); setNextKm(''); setNextDate(''); setError(''); setSaving(false)
    if (r?.attachmentId) getFile(r.attachmentId).then(setPhoto).catch(() => undefined)
  }, [state, activeVehicle])

  useEffect(() => {
    if (type && state && !editing) setTimeout(() => costRef.current?.focus(), 250)
  }, [type, state, editing])

  if (!activeVehicle) return null

  const existingDeadline = type ? data.deadlines.find((d) => d.vehicleId === activeVehicle.id && d.type === type && (type !== 'personalizzata' || (d.customLabel || '').toLowerCase() === customLabel.trim().toLowerCase())) : undefined
  const meta = type ? INTERVENTION_TYPES[type] : null

  const onPhoto = async (f?: File) => {
    if (!f) return
    setPhotoBusy(true)
    try {
      setPhoto(await compressImage(f))
      setPhotoChanged(true)
    } catch (e) {
      toast((e as Error).message || 'Impossibile allegare la foto.', 'error')
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    if (!type) return
    const c = parseAmount(cost)
    const k = parseKm(km)
    if (c !== undefined && (Number.isNaN(c) || c < 0)) return setError('Il costo inserito non è valido. Esempio: 89,90')
    if (k !== undefined && (Number.isNaN(k) || k < 0)) return setError('I chilometri inseriti non sono validi.')
    if (!isValidISODate(date)) return setError('Inserisci una data valida.')
    if (date > todayISO()) return setError('La data dell’intervento non può essere nel futuro. Per un intervento da fare usa “Scadenze”.')
    if (type === 'personalizzata' && !customLabel.trim()) return setError('Dai un nome all’intervento personalizzato.')
    const nm = nextMonths.trim() ? Number(nextMonths) : undefined
    const nk = parseKm(nextKm)
    if ((nm !== undefined && (!Number.isFinite(nm) || nm <= 0)) || (nk !== undefined && (Number.isNaN(nk) || nk <= 0))) return setError('Controlla l’intervallo della prossima scadenza.')
    if (nextDate && (!isValidISODate(nextDate) || nextDate <= date)) return setError('La prossima scadenza deve essere successiva alla data dell’intervento.')
    setSaving(true)
    try {
      let attachmentId = editing?.attachmentId
      if (photoChanged) {
        if (editing?.attachmentId) await deleteFile(editing.attachmentId)
        attachmentId = undefined
        if (photo) {
          attachmentId = uid('f')
          await saveFile(attachmentId, photo)
        }
      }
      const payload = {
        vehicleId: activeVehicle.id, type, customLabel: type === 'personalizzata' ? customLabel.trim() : undefined,
        date, km: k, cost: c, notes: notes.trim() || undefined, attachmentId,
      }
      if (editing) {
        updateRecord(editing.id, payload)
        if (existingDeadline && existingDeadline.lastDate === editing.date) upsertDeadline({ ...existingDeadline, lastDate: date, lastKm: k ?? existingDeadline.lastKm })
        toast('Intervento aggiornato')
      } else {
        addRecord(payload, nm || nk || nextDate ? { intervalMonths: nm, intervalKm: nk, fixedDate: nextDate || undefined } : undefined)
        toast(`${deadlineLabel({ type, customLabel })} salvato nello storico`)
      }
      onClose()
    } catch {
      setError('Non è stato possibile salvare. Riprova.')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    if (await confirm({ title: 'Eliminare l’intervento?', message: 'L’intervento, il suo costo e l’eventuale foto della fattura verranno eliminati dallo storico. Le scadenze non vengono modificate.', confirmLabel: 'Elimina', danger: true })) {
      await deleteRecord(editing.id)
      toast('Intervento eliminato')
      onClose()
    }
  }

  // Anteprima prossima scadenza
  let nextPreview: string | null = null
  if (type && !editing) {
    const k = parseKm(km)
    const months = nextMonths.trim() ? Number(nextMonths) : existingDeadline?.intervalMonths
    const kmInt = parseKm(nextKm) ?? existingDeadline?.intervalKm
    const parts: string[] = []
    if (nextDate) parts.push(formatDate(nextDate))
    else if (months && isValidISODate(date)) parts.push(formatDate(addMonths(date, months)))
    if (kmInt && k !== undefined && !Number.isNaN(k)) parts.push(formatKm(k + kmInt))
    if (parts.length) nextPreview = parts.join(' oppure ')
  }

  const title = editing ? 'Modifica intervento' : type ? deadlineLabel({ type, customLabel: customLabel || undefined }) : 'Registra intervento'

  return (
    <Sheet open={!!state} onClose={onClose} title={title} testId="log-sheet"
      footer={type ? (
        <div className="flex gap-3">
          {editing && <Button variant="secondary" size="lg" className="text-red-600 dark:text-red-400" onClick={remove} data-testid="log-delete">Elimina</Button>}
          <Button size="lg" className="flex-1" onClick={save} disabled={saving || photoBusy} data-testid="log-save">{saving ? 'Salvataggio…' : editing ? 'Salva modifiche' : 'Conferma e salva'}</Button>
        </div>
      ) : undefined}>
      {!type ? (
        <div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Che intervento hai fatto su <strong className="text-night-900 dark:text-white">{activeVehicle.name}</strong>?</p>
          <div className="grid grid-cols-3 gap-2.5" data-testid="type-grid">
            {TYPE_ORDER.map((t, i) => (
              <button key={t} type="button" onClick={() => setType(t)} style={{ animationDelay: `${i * 18}ms` }}
                className="flex animate-pop flex-col items-center gap-2 rounded-2xl bg-slate-100 px-2 py-3.5 text-center text-xs font-semibold leading-tight transition hover:bg-electric-500/10 active:scale-95 dark:bg-night-800 dark:hover:bg-night-700">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-electric-500 shadow-sm dark:bg-night-700 dark:text-electric-400"><TypeIcon type={t} /></span>
                {INTERVENTION_TYPES[t].label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {!editing && !state?.type && (
            <button type="button" onClick={() => setType(null)} className="-mt-1 inline-flex items-center gap-1 text-sm font-semibold text-electric-600 dark:text-electric-400"><ChevronLeft size={16} /> Cambia tipo</button>
          )}
          {type === 'personalizzata' && (
            <Field label="Nome intervento" htmlFor="log-label"><Input id="log-label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Es. Liquido refrigerante" /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo (€)" htmlFor="log-cost"><Input ref={costRef} id="log-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Chilometri" htmlFor="log-km"><Input id="log-km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Field>
          </div>
          <Field label="Data" htmlFor="log-date"><Input id="log-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>

          {!editing && (
            existingDeadline && (existingDeadline.intervalMonths || existingDeadline.intervalKm) && !nextMonths && !nextKm && !nextDate ? (
              <div className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm" data-testid="next-auto">
                La prossima scadenza verrà aggiornata con il tuo intervallo
                {existingDeadline.intervalMonths ? ` di ${existingDeadline.intervalMonths} mesi` : ''}{existingDeadline.intervalMonths && existingDeadline.intervalKm ? ' /' : ''}{existingDeadline.intervalKm ? ` ${formatKm(existingDeadline.intervalKm)}` : ''}
                {nextPreview && <>: <strong>{nextPreview}</strong></>}
              </div>
            ) : (
              <details className="rounded-2xl bg-slate-50 p-3 dark:bg-night-800/60" open={!existingDeadline}>
                <summary className="cursor-pointer text-sm font-semibold">Prossima scadenza {existingDeadline ? '' : '(facoltativa)'}</summary>
                <div className="mt-2 space-y-3">
                  {!existingDeadline && <p className="flex gap-2 text-xs text-slate-500 dark:text-slate-400"><Info size={14} className="mt-0.5 shrink-0" />{type === 'revisione' ? REVISIONE_HINT : MANUFACTURER_NOTE} Senza intervallo non potrò ricordarti la scadenza.</p>}
                  {meta?.admin ? (
                    <Field label="Prossima scadenza il" htmlFor="log-nextdate"><Input id="log-nextdate" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></Field>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tra (mesi)" htmlFor="log-nm"><Input id="log-nm" inputMode="numeric" value={nextMonths} onChange={(e) => setNextMonths(e.target.value)} placeholder="Da libretto" /></Field>
                      <Field label="Tra (km)" htmlFor="log-nk"><Input id="log-nk" inputMode="numeric" value={nextKm} onChange={(e) => setNextKm(e.target.value)} placeholder="Da libretto" /></Field>
                    </div>
                  )}
                  {type === 'revisione' && <Button size="sm" variant="ghost" onClick={() => setNextDate(addMonths(date, 24))}>Proponi +24 mesi (da verificare)</Button>}
                  {nextPreview && <p className="text-sm">Prossima scadenza: <strong data-testid="next-preview">{nextPreview}</strong></p>}
                </div>
              </details>
            )
          )}
          {editing && existingDeadline && <p className="text-xs text-slate-500">Le scadenze si modificano dalla sezione Scadenze. {computeDue(existingDeadline).dueDate ? `Prossima: ${formatDate(computeDue(existingDeadline).dueDate)}` : ''}</p>}

          <Field label="Note (facoltative)" htmlFor="log-notes"><Textarea id="log-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Officina, ricambi usati…" /></Field>
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} data-testid="log-photo-input" />
            {photo ? (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2 dark:bg-night-800">
                <img src={photo} alt="Foto fattura" className="h-16 w-16 rounded-xl object-cover" />
                <span className="flex-1 text-sm font-medium">Foto fattura allegata</span>
                <Button variant="ghost" size="sm" onClick={() => { setPhoto(undefined); setPhotoChanged(true) }} aria-label="Rimuovi foto"><Trash2 size={16} /></Button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className={cx('flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 dark:border-night-600 dark:text-slate-300', photoBusy && 'opacity-50')}>
                <Camera size={18} /> {photoBusy ? 'Compressione…' : 'Allega foto della fattura'}
              </button>
            )}
          </div>
          {error && <Notice tone="danger"><span role="alert" data-testid="form-error">{error}</span></Notice>}
        </div>
      )}
    </Sheet>
  )
}
