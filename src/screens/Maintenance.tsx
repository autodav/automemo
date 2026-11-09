import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, History, Paperclip, Plus, Search } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useActions } from '../components/Actions'
import { Button, Card, EmptyState, Input, PageHeader, Segmented, StatusBadge, STATUS_STYLES, cx } from '../components/ui'
import { TypeIcon } from '../components/TypeIcon'
import { vehicleDeadlines, STATUS_LABEL, deadlineLabel } from '../lib/deadlines'
import { formatDate } from '../lib/dates'
import { formatEuro, formatKm } from '../lib/format'
import { navigate } from '../lib/router'
import { normalize } from '../assistant/ruleProvider'

export function Maintenance({ tab, highlight }: { tab: 'scadenze' | 'storico'; highlight?: string }) {
  return (
    <div className="animate-fade-in">
      <PageHeader title={tab === 'scadenze' ? 'Scadenze' : 'Storico'} subtitle={tab === 'scadenze' ? 'Cosa fare e quando' : 'Tutti gli interventi registrati'} />
      <Segmented className="mb-4" value={tab} onChange={(t) => navigate('/' + t, true)} options={[{ value: 'scadenze', label: 'Scadenze' }, { value: 'storico', label: 'Storico' }]} />
      {tab === 'scadenze' ? <DeadlineList highlight={highlight} /> : <HistoryList />}
    </div>
  )
}

function DeadlineList({ highlight }: { highlight?: string }) {
  const { data, activeVehicle: v } = useStore()
  const { openDeadline, openLog } = useActions()
  const [flash, setFlash] = useState(highlight)
  useEffect(() => {
    if (!highlight) return
    setFlash(highlight)
    const el = document.getElementById('deadline-' + highlight)
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFlash(undefined), 4000)
    return () => clearTimeout(t)
  }, [highlight])
  if (!v) return null
  const infos = vehicleDeadlines(data, v.id)
  return (
    <div className="space-y-3" data-testid="deadline-list">
      <Button className="w-full" variant="secondary" onClick={() => openDeadline({})} data-testid="new-deadline"><Plus size={18} /> Nuova scadenza</Button>
      {infos.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title="Nessuna scadenza" text="Aggiungi revisione, assicurazione, bollo e le manutenzioni con gli intervalli indicati dal costruttore." />
      ) : infos.map((i) => {
        const s = STATUS_STYLES[i.status]
        return (
          <div key={i.deadline.id} id={'deadline-' + i.deadline.id} data-highlighted={flash === i.deadline.id || undefined}>
          <Card className={cx('ring-2 transition-shadow', flash === i.deadline.id ? 'ring-electric-500 shadow-lg shadow-electric-500/30' : s.ring)} data-testid="deadline-item">
            <div className="flex items-start gap-3">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.bg, s.text)}><TypeIcon type={i.deadline.type} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-bold">{i.label}</p>
                  <StatusBadge status={i.status} label={STATUS_LABEL[i.status]} />
                </div>
                <p className={cx('text-sm', s.text)}>{i.reason}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {[i.dueDate && `Entro il ${formatDate(i.dueDate)}`, i.dueKm !== undefined && `entro ${formatKm(i.dueKm)}`].filter(Boolean).join(' · ') || 'Imposta data o intervallo'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {[i.deadline.intervalMonths && `Ogni ${i.deadline.intervalMonths} mesi`, i.deadline.intervalKm && `ogni ${formatKm(i.deadline.intervalKm)}`].filter(Boolean).join(' · ')}
                  {i.deadline.reminderDays.length ? ` · Avvisi: ${i.deadline.reminderDays.join(', ')} gg` : ' · Nessun promemoria'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => openDeadline({ deadline: i.deadline })}>Modifica</Button>
              <Button size="sm" className="flex-1" onClick={() => openLog({ type: i.deadline.type, customLabel: i.deadline.customLabel })}>Segna come fatto</Button>
            </div>
          </Card>
          </div>
        )
      })}
    </div>
  )
}

function HistoryList() {
  const { data, activeVehicle: v } = useStore()
  const { openLog } = useActions()
  const [q, setQ] = useState('')
  const records = useMemo(() => {
    if (!v) return []
    const nq = normalize(q)
    return data.records.filter((r) => r.vehicleId === v.id && (!nq || normalize(deadlineLabel(r) + ' ' + (r.notes || '')).includes(nq))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)))
  }, [data.records, v, q])
  if (!v) return null
  const all = data.records.filter((r) => r.vehicleId === v.id)
  if (!all.length) return <EmptyState icon={<History />} title="Storico vuoto" text="Gli interventi che registri compariranno qui, con data, chilometri, costo e fattura." action={<Button onClick={() => openLog()}><Plus size={18} /> Registra intervento</Button>} />
  const byYear = records.reduce<Record<string, typeof records>>((acc, r) => { (acc[r.date.slice(0, 4)] ||= []).push(r); return acc }, {})
  return (
    <div className="space-y-4" data-testid="history-list">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca negli interventi" className="pl-10" aria-label="Cerca negli interventi" />
      </div>
      {records.length === 0 && <p className="text-center text-sm text-slate-500">Nessun intervento corrisponde alla ricerca.</p>}
      {Object.keys(byYear).sort().reverse().map((y) => (
        <section key={y}>
          <h3 className="mb-2 px-1 text-sm font-bold text-slate-500">{y}</h3>
          <Card className="divide-y divide-slate-100 !py-1 dark:divide-night-700">
            {byYear[y].map((r) => (
              <button key={r.id} type="button" onClick={() => openLog({ record: r })} className="flex w-full items-center gap-3 py-3 text-left" data-testid="history-item">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric-500/10 text-electric-500"><TypeIcon type={r.type} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">{deadlineLabel(r)} {r.attachmentId && <Paperclip size={13} className="text-slate-400" aria-label="Fattura allegata" />}</span>
                  <span className="block text-xs text-slate-500">{formatDate(r.date)}{r.km !== undefined ? ` · ${formatKm(r.km)}` : ''}</span>
                  {r.notes && <span className="block truncate text-xs text-slate-400">{r.notes}</span>}
                </span>
                <span className="font-semibold tabular-nums">{r.cost ? formatEuro(r.cost) : '—'}</span>
              </button>
            ))}
          </Card>
        </section>
      ))}
    </div>
  )
}
