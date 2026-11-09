import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CalendarClock, Car, Check, ChevronDown, House, MessageCircle, Plus, Settings as SettingsIcon, Wallet } from 'lucide-react'
import { AppStoreProvider, useStore } from './store/AppStore'
import { UiProvider } from './components/UiContext'
import { ActionsCtx, type Actions } from './components/Actions'
import { LogSheet, type LogSheetState } from './components/LogSheet'
import { DeadlineSheet, type DeadlineSheetState } from './components/DeadlineSheet'
import { ExpenseSheet, type ExpenseSheetState } from './components/ExpenseSheet'
import { NotificationsSheet } from './components/NotificationsSheet'
import { Button, IconButton, Notice, Sheet, cx } from './components/ui'
import { LogoMark } from './components/Logo'
import { Welcome } from './screens/Welcome'
import { VehicleForm } from './screens/VehicleForm'
import { Dashboard } from './screens/Dashboard'
import { Maintenance } from './screens/Maintenance'
import { Expenses } from './screens/Expenses'
import { Assistant } from './screens/Assistant'
import { Settings } from './screens/Settings'
import { Plans } from './screens/Plans'
import { navigate, useRoute } from './lib/router'
import { activeReminders } from './lib/deadlines'
import { formatKm } from './lib/format'
import { requestPersistence } from './lib/db'

export default function App() {
  return (
    <UiProvider>
      <AppStoreProvider>
        <Shell />
      </AppStoreProvider>
    </UiProvider>
  )
}

function useTheme(mode: 'system' | 'light' | 'dark') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#050B1A' : '#0A1430')
    }
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [mode])
}

function Shell() {
  const { data, ready, saveError, activeVehicle, setActiveVehicle } = useStore()
  const route = useRoute()
  useTheme(data.settings.theme)
  const [log, setLog] = useState<LogSheetState | null>(null)
  const [deadline, setDeadline] = useState<DeadlineSheetState | null>(null)
  const [expense, setExpense] = useState<ExpenseSheetState | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  useEffect(() => { if (data.vehicles.length) requestPersistence() }, [data.vehicles.length])

  const actions: Actions = useMemo(() => ({
    openLog: (s) => setLog(s ?? {}),
    openDeadline: (s) => setDeadline(s ?? {}),
    openExpense: (s) => setExpense(s ?? {}),
    openNotifications: () => setNotifOpen(true),
  }), [])
  const closeLog = useCallback(() => setLog(null), [])
  const closeDeadline = useCallback(() => setDeadline(null), [])
  const closeExpense = useCallback(() => setExpense(null), [])

  const tabKey = route === '/' ? 'home' : route.slice(1)
  useEffect(() => { window.scrollTo(0, 0) }, [tabKey])

  const reminders = activeReminders(data)
  const unread = reminders.filter((r) => !data.settings.dismissedReminders.includes(r.key))

  if (!ready) {
    return <div className="flex min-h-dvh items-center justify-center bg-night-900"><div className="animate-pulse"><LogoMark size={64} /></div></div>
  }

  if (route.startsWith('/veicolo/')) {
    const id = route.slice('/veicolo/'.length)
    return <VehicleForm key={id} vehicleId={id === 'nuovo' ? undefined : id} />
  }
  if (!data.vehicles.length) return <Welcome />

  const tab = route === '/' ? 'home' : route.slice(1)
  let screen: React.ReactNode
  switch (tab) {
    case 'scadenze': screen = <Maintenance tab="scadenze" />; break
    case 'storico': screen = <Maintenance tab="storico" />; break
    case 'spese': screen = <Expenses />; break
    case 'chiedi': screen = <Assistant />; break
    case 'impostazioni': screen = <Settings />; break
    case 'piani': screen = <Plans />; break
    default: screen = <Dashboard />
  }

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="mx-auto min-h-dvh max-w-2xl">
        <header className="safe-top sticky top-0 z-30 border-b border-slate-200/60 bg-slate-50/85 backdrop-blur-lg dark:border-night-800 dark:bg-night-950/85">
          <div className="flex h-14 items-center gap-2 px-4">
            <button type="button" onClick={() => navigate('/')} aria-label="Home"><LogoMark size={32} /></button>
            <button type="button" onClick={() => setSwitcherOpen(true)} className="flex min-w-0 flex-1 items-center gap-1 rounded-xl px-2 py-1 text-left hover:bg-slate-200/60 dark:hover:bg-night-800" data-testid="vehicle-switcher">
              <span className="truncate font-bold">{activeVehicle?.name}</span>
              <ChevronDown size={16} className="shrink-0 text-slate-400" />
            </button>
            <IconButton label="Promemoria" onClick={() => setNotifOpen(true)} data-testid="bell">
              <Bell size={20} />
              {unread.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white" data-testid="bell-badge">{unread.length}</span>}
            </IconButton>
            <IconButton label="Impostazioni" onClick={() => navigate('/impostazioni')} data-testid="settings-btn"><SettingsIcon size={20} /></IconButton>
          </div>
        </header>

        <main className="px-4 pb-32 pt-4">
          {saveError && <Notice tone="danger" className="mb-4">{saveError}</Notice>}
          {unread.length > 0 && tab === 'home' && (
            <button type="button" onClick={() => setNotifOpen(true)} className="mb-4 flex w-full animate-pop items-center gap-3 rounded-2xl bg-night-900 p-3 text-left text-white shadow-lg dark:bg-night-800" data-testid="reminder-banner">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-night-900"><Bell size={18} /></span>
              <span className="flex-1 text-sm"><strong>{unread.length} {unread.length === 1 ? 'nuovo promemoria' : 'nuovi promemoria'}</strong><span className="block text-slate-300">{unread[0].info.label}: {unread[0].info.reason.toLowerCase()}</span></span>
            </button>
          )}
          <div key={tab}>{screen}</div>
        </main>

        <BottomNav tab={tab} onPlus={() => setLog({})} />
      </div>

      <LogSheet state={log} onClose={closeLog} />
      <DeadlineSheet state={deadline} onClose={closeDeadline} />
      <ExpenseSheet state={expense} onClose={closeExpense} />
      <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} onOpenDeadlines={(vid) => { setActiveVehicle(vid); setNotifOpen(false); navigate('/scadenze') }} />
      <Sheet open={switcherOpen} onClose={() => setSwitcherOpen(false)} title="I tuoi veicoli">
        <div className="space-y-2">
          {data.vehicles.map((v) => (
            <button key={v.id} type="button" onClick={() => { setActiveVehicle(v.id); setSwitcherOpen(false) }} className={cx('flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1', v.id === activeVehicle?.id ? 'bg-electric-500/10 ring-electric-500' : 'ring-slate-200 dark:ring-night-700')}>
              <Car className="text-electric-500" />
              <span className="flex-1"><span className="block font-semibold">{v.name}</span><span className="block text-xs text-slate-500">{v.year} · {formatKm(v.km)}</span></span>
              {v.id === activeVehicle?.id && <Check className="text-electric-500" />}
            </button>
          ))}
          <Button variant="secondary" className="w-full" onClick={() => { setSwitcherOpen(false); navigate('/veicolo/nuovo') }}><Plus size={18} /> Aggiungi veicolo</Button>
        </div>
      </Sheet>
    </ActionsCtx.Provider>
  )
}

function BottomNav({ tab, onPlus }: { tab: string; onPlus: () => void }) {
  const items = [
    { id: 'home', label: 'Home', icon: House, path: '/' },
    { id: 'scadenze', label: 'Scadenze', icon: CalendarClock, path: '/scadenze', also: ['storico'] },
    null,
    { id: 'spese', label: 'Spese', icon: Wallet, path: '/spese' },
    { id: 'chiedi', label: 'Chiedi', icon: MessageCircle, path: '/chiedi' },
  ]
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-lg dark:border-night-800 dark:bg-night-900/90" aria-label="Navigazione principale">
      <div className="relative mx-auto grid h-16 max-w-2xl grid-cols-5 items-center">
        {items.map((it) => it === null ? (
          <div key="fab" className="flex flex-col items-center">
            <button type="button" onClick={onPlus} aria-label="Registra intervento" data-testid="fab"
              className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-electric-400 to-electric-600 text-white shadow-xl shadow-electric-500/40 ring-4 ring-slate-50 transition active:scale-90 dark:ring-night-950">
              <Plus size={28} strokeWidth={2.5} />
            </button>
            <span className="mt-0.5 text-[10px] font-bold text-electric-600 dark:text-electric-400">Registra</span>
          </div>
        ) : (
          <button key={it.id} type="button" onClick={() => navigate(it.path)} data-testid={`nav-${it.id}`}
            className={cx('flex flex-col items-center gap-0.5 text-[11px] font-semibold transition', tab === it.id || it.also?.includes(tab) ? 'text-electric-500' : 'text-slate-400')}>
            <it.icon size={22} />
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
