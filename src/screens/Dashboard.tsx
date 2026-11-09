import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, EyeOff, Gauge, Pencil, Sparkles, Database, X, Plus } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useActions } from '../components/Actions'
import { useUi } from '../components/UiContext'
import { Button, Card, Field, Input, Notice, Sheet, StatusBadge, STATUS_STYLES, cx } from '../components/ui'
import { TypeIcon } from '../components/TypeIcon'
import { vehicleDeadlines, STATUS_LABEL, deadlineLabel, type DeadlineInfo, type Status } from '../lib/deadlines'
import { allExpenses, yearTotal } from '../lib/expenses'
import { formatDate, relativeDays, daysFromToday } from '../lib/dates'
import { formatEuro, formatKm, maskPlate, parseKm } from '../lib/format'
import { FUELS, INTERVENTION_TYPES } from '../lib/constants'
import { navigate } from '../lib/router'
import type { InterventionType } from '../types'

export function Dashboard() {
  const { data, activeVehicle: v, updateSettings } = useStore()
  const { openLog, openDeadline } = useActions()
  const [kmOpen, setKmOpen] = useState(false)
  if (!v) return null

  const infos = vehicleDeadlines(data, v.id)
  const urgent = infos.filter((i) => i.status === 'overdue' || i.status === 'warning')
  const worst: Status = urgent.some((i) => i.status === 'overdue') ? 'overdue' : urgent.length ? 'warning' : infos.some((i) => i.status === 'ok') ? 'ok' : 'unset'
  const year = new Date().getFullYear()
  const spentYear = yearTotal(allExpenses(data, v.id), year)
  const nextMaint = infos.find((i) => !INTERVENTION_TYPES[i.deadline.type].admin && i.status !== 'unset')
  const find = (t: InterventionType) => infos.find((i) => i.deadline.type === t)
  const revisione = find('revisione')
  const assicurazione = find('assicurazione')
  const bollo = find('bollo')
  const records = data.records.filter((r) => r.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3)
  const missing = (['revisione', 'assicurazione', 'bollo', 'tagliando'] as InterventionType[]).filter((t) => !find(t))
  const fuel = FUELS.find((f) => f.value === v.fuel)?.label

  return (
    <div className="space-y-4 animate-fade-in" data-testid="dashboard">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-night-800 via-night-900 to-night-950 p-5 text-white shadow-xl shadow-night-900/20 ring-1 ring-white/5">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-electric-500/30 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-electric-300">{v.year} · {fuel}</p>
            <h2 className="break-words text-2xl font-extrabold leading-tight" data-testid="vehicle-name">{v.name}</h2>
            {v.plate && (
              <button type="button" onClick={() => updateSettings({ hidePlate: !data.settings.hidePlate })} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-0.5 font-mono text-sm tracking-widest" aria-label={data.settings.hidePlate ? 'Mostra targa' : 'Nascondi targa'}>
                {data.settings.hidePlate ? maskPlate(v.plate) : v.plate} {data.settings.hidePlate ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap"><StatusBadge status={worst} label={worst === 'ok' ? 'Tutto ok' : worst === 'unset' ? 'Da configurare' : worst === 'overdue' ? 'Scaduto' : 'In scadenza'} /></span>
        </div>
        <button type="button" onClick={() => setKmOpen(true)} className="relative mt-5 flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-left transition hover:bg-white/15 active:scale-[0.99]" data-testid="km-button">
          <Gauge className="text-electric-300" />
          <span className="flex-1">
            <span className="block text-xs text-slate-300">Chilometri attuali</span>
            <span className="block text-2xl font-bold tabular-nums" data-testid="vehicle-km">{formatKm(v.km)}</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-electric-300"><Pencil size={14} /> Aggiorna</span>
        </button>
        <button type="button" onClick={() => openLog()} className="relative mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-base font-bold text-night-900 shadow-lg transition active:scale-[0.98]" data-testid="register-intervention">
          <Plus size={20} strokeWidth={2.75} className="text-electric-500" /> Registra intervento
        </button>
      </div>

      {!data.settings.storageNoticeSeen && (
        <Notice className="flex items-start gap-2">
          <Database size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">I tuoi dati sono salvati <strong>solo su questo dispositivo</strong>. Se cancelli i dati del browser andranno persi: esporta un backup da Impostazioni.</span>
          <button type="button" aria-label="Chiudi avviso" onClick={() => updateSettings({ storageNoticeSeen: true })}><X size={16} /></button>
        </Notice>
      )}

      {/* Avvisi */}
      <section aria-label="Avvisi urgenti">
        {urgent.length > 0 ? (
          <div className="space-y-2" data-testid="urgent-alerts">
            <h3 className="flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500"><AlertTriangle size={16} className="text-amber-500" /> Avvisi</h3>
            {urgent.map((i) => <AlertRow key={i.deadline.id} info={i} onDone={() => openLog({ type: i.deadline.type, customLabel: i.deadline.customLabel })} onEdit={() => openDeadline({ deadline: i.deadline })} />)}
          </div>
        ) : infos.some((i) => i.status === 'ok') ? (
          <div className="flex items-center gap-3 rounded-3xl bg-emerald-500/10 p-4 text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-300" data-testid="all-ok">
            <CheckCircle2 /> <span className="text-sm font-semibold">Nessuna scadenza vicina. Tutto sotto controllo.</span>
          </div>
        ) : null}
      </section>

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3">
        <Tile title="Prossima manutenzione" info={nextMaint} empty="Imposta un intervallo" onClick={() => (nextMaint ? openDeadline({ deadline: nextMaint.deadline }) : openDeadline({ type: 'tagliando' }))} testId="tile-next">
          {nextMaint && <><p className="truncate font-bold">{nextMaint.label}</p><p className="text-xs text-slate-500 dark:text-slate-400">{shortDue(nextMaint)}</p></>}
        </Tile>
        <Tile title="Revisione" info={revisione} empty="Imposta la data" onClick={() => openDeadline(revisione ? { deadline: revisione.deadline } : { type: 'revisione' })} testId="tile-revisione">
          {revisione?.daysLeft !== undefined && <><p className="text-2xl font-extrabold tabular-nums">{Math.abs(revisione.daysLeft)}<span className="ml-1 text-sm font-semibold">{revisione.daysLeft < 0 ? 'gg di ritardo' : 'giorni'}</span></p><p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(revisione.dueDate)}</p></>}
        </Tile>
        <Tile title="Assicurazione" info={assicurazione} empty="Aggiungi scadenza" onClick={() => openDeadline(assicurazione ? { deadline: assicurazione.deadline } : { type: 'assicurazione' })} testId="tile-assicurazione">
          {assicurazione?.dueDate && <><p className="font-bold">{formatDate(assicurazione.dueDate)}</p><p className="text-xs text-slate-500 dark:text-slate-400">{relativeDays(daysFromToday(assicurazione.dueDate))}</p></>}
        </Tile>
        <Card onClick={() => navigate('/spese')} className="!p-4" data-testid="tile-spese">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Spese {year}</p>
          <p className="mt-2 text-xl font-extrabold tabular-nums">{formatEuro(spentYear)}</p>
          <p className="text-xs text-electric-600 dark:text-electric-400">Vedi dettaglio</p>
        </Card>
      </div>
      {bollo && (bollo.status === 'ok') && <p className="px-1 text-xs text-slate-500">Bollo: scadenza {formatDate(bollo.dueDate)}</p>}

      {missing.length > 0 && (
        <Card>
          <p className="font-bold">Completa le tue scadenze</p>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Inserisci date e intervalli indicati dal costruttore o dai tuoi documenti: AutoMemo non li inventa.</p>
          <div className="flex flex-wrap gap-2">
            {missing.map((t) => (
              <button key={t} type="button" onClick={() => openDeadline({ type: t })} className="inline-flex items-center gap-1.5 rounded-full bg-electric-500/10 px-3 py-2 text-sm font-semibold text-electric-700 transition active:scale-95 dark:text-electric-300" data-testid={`setup-${t}`}>
                <Plus size={14} /> {INTERVENTION_TYPES[t].label}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card onClick={() => navigate('/chiedi')} className="flex items-center gap-3 bg-gradient-to-r from-electric-500 to-electric-600 !text-white !ring-0">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20"><Sparkles /></span>
        <span className="flex-1"><span className="block font-bold">Chiedi ad AutoMemo</span><span className="block text-sm text-white/80">“Qual è il prossimo intervento?”</span></span>
        <ChevronRight />
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Ultimi interventi</h3>
          <button type="button" className="text-sm font-semibold text-electric-600 dark:text-electric-400" onClick={() => navigate('/storico')}>Storico completo</button>
        </div>
        {records.length === 0 ? (
          <Card><p className="text-sm text-slate-500 dark:text-slate-400">Nessun intervento registrato. Tocca <strong>+</strong> per aggiungere il primo.</p></Card>
        ) : (
          <Card className="divide-y divide-slate-100 !py-1 dark:divide-night-700">
            {records.map((r) => (
              <button key={r.id} type="button" onClick={() => openLog({ record: r })} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric-500/10 text-electric-500"><TypeIcon type={r.type} size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{deadlineLabel(r)}</span><span className="block text-xs text-slate-500">{formatDate(r.date)}{r.km !== undefined ? ` · ${formatKm(r.km)}` : ''}</span></span>
                {r.cost ? <span className="font-semibold tabular-nums">{formatEuro(r.cost)}</span> : null}
              </button>
            ))}
          </Card>
        )}
      </section>
      <KmSheet open={kmOpen} onClose={() => setKmOpen(false)} />
    </div>
  )
}

function shortDue(i: DeadlineInfo) {
  return [i.dueDate && formatDate(i.dueDate), i.dueKm !== undefined && formatKm(i.dueKm)].filter(Boolean).join(' · ')
}

function Tile({ title, info, empty, onClick, children, testId }: { title: string; info?: DeadlineInfo; empty: string; onClick: () => void; children?: React.ReactNode; testId: string }) {
  const status: Status = info?.status ?? 'unset'
  const s = STATUS_STYLES[status]
  const hasData = info && info.status !== 'unset'
  return (
    <Card onClick={onClick} className={cx('!p-4', hasData && `ring-2 ${s.ring}`)} data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        <span className={cx('h-2.5 w-2.5 rounded-full', s.dot)} data-status={status} title={STATUS_LABEL[status]} />
      </div>
      <div className="mt-2">{hasData ? children : <p className="text-sm font-semibold text-electric-600 dark:text-electric-400">{empty}</p>}</div>
    </Card>
  )
}

function AlertRow({ info, onDone, onEdit }: { info: DeadlineInfo; onDone: () => void; onEdit: () => void }) {
  const s = STATUS_STYLES[info.status]
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl p-3 ring-1', s.bg, s.ring)} data-status={info.status} data-testid="alert-row">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-night-900', s.text)}><TypeIcon type={info.deadline.type} size={20} /></span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{info.label}</span>
          <span className={cx('block text-sm', s.text)}>{info.reason}</span>
        </span>
      </button>
      <Button size="sm" variant="secondary" onClick={onDone}>Fatto</Button>
    </div>
  )
}

function KmSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeVehicle: v, updateKm } = useStore()
  const { toast, confirm } = useUi()
  const [val, setVal] = useState('')
  const [err, setErr] = useState('')
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) { setLastOpen(open); if (open && v) { setVal(String(v.km)); setErr('') } }
  if (!v) return null
  const save = async () => {
    const k = parseKm(val)
    if (k === undefined || Number.isNaN(k) || k < 0) return setErr('Inserisci un numero valido di chilometri.')
    if (k < v.km && !(await confirm({ title: 'Chilometri inferiori', message: `Il valore inserito (${formatKm(k)}) è inferiore all’ultimo registrato (${formatKm(v.km)}). Vuoi correggerlo comunque?`, confirmLabel: 'Sì, correggi' }))) return
    updateKm(v.id, k)
    toast('Chilometri aggiornati')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Aggiorna chilometri" testId="km-sheet" footer={<Button size="lg" className="w-full" onClick={save} data-testid="km-save">Salva</Button>}>
      <Field label="Chilometri attuali" htmlFor="km-input" error={err} hint={`Ultimo valore: ${formatKm(v.km)} (${formatDate(v.kmUpdatedAt)})`}>
        <Input id="km-input" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} className="text-2xl font-bold" />
      </Field>
    </Sheet>
  )
}
