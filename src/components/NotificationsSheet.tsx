import { BellOff, CheckCheck } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { activeReminders } from '../lib/deadlines'
import { formatDate } from '../lib/dates'
import { formatKm } from '../lib/format'
import { Button, EmptyState, Notice, Sheet, STATUS_STYLES, cx } from './ui'

export function NotificationsSheet({ open, onClose, onOpenDeadlines }: { open: boolean; onClose: () => void; onOpenDeadlines: (vehicleId: string) => void }) {
  const { data, dismissReminder } = useStore()
  const all = activeReminders(data)
  const unread = all.filter((r) => !data.settings.dismissedReminders.includes(r.key))
  return (
    <Sheet open={open} onClose={onClose} title="Promemoria" testId="notifications-sheet"
      footer={unread.length > 0 ? <Button variant="secondary" className="w-full" onClick={() => unread.forEach((r) => dismissReminder(r.key))}><CheckCheck size={18} /> Segna tutti come letti</Button> : undefined}>
      <div className="space-y-3">
        {all.length === 0 ? (
          <EmptyState icon={<BellOff />} title="Nessun promemoria" text="Quando una scadenza si avvicina (30, 15, 7 o 1 giorno prima, secondo le tue impostazioni) la vedrai qui." />
        ) : (
          all.map((r) => {
            const read = data.settings.dismissedReminders.includes(r.key)
            const s = STATUS_STYLES[r.info.status]
            return (
              <button key={r.key} type="button" onClick={() => { dismissReminder(r.key); onOpenDeadlines(r.vehicle.id) }} data-testid="notification-item"
                className={cx('flex w-full items-start gap-3 rounded-2xl p-3 text-left ring-1', s.bg, s.ring, read && 'opacity-60')}>
                <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', s.dot)} />
                <span className="flex-1">
                  <span className="block font-semibold">{r.info.label} · {r.vehicle.name}</span>
                  <span className={cx('block text-sm', s.text)}>{r.info.reason}</span>
                  <span className="block text-xs text-slate-500">{[r.info.dueDate && `Scadenza ${formatDate(r.info.dueDate)}`, r.info.dueKm !== undefined && `a ${formatKm(r.info.dueKm)}`].filter(Boolean).join(' · ')}</span>
                </span>
                {!read && <span className="mt-1 rounded-full bg-electric-500 px-2 py-0.5 text-[10px] font-bold text-white">NUOVO</span>}
              </button>
            )
          })
        )}
        <Notice>I promemoria sono visibili quando apri AutoMemo. Le notifiche push con l’app chiusa non sono disponibili in questa versione.</Notice>
      </div>
    </Sheet>
  )
}
