import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { Button, Sheet } from './ui'

type ToastTone = 'success' | 'error' | 'info'
interface ConfirmOpts { title: string; message: string; confirmLabel?: string; danger?: boolean }
interface Ui {
  toast: (msg: string, tone?: ToastTone) => void
  confirm: (o: ConfirmOpts) => Promise<boolean>
}
const Ctx = createContext<Ui | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: ToastTone }[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmOpts | null>(null)
  const resolver = useRef<(v: boolean) => void>(undefined)

  const toast = useCallback((msg: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-1), { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    resolver.current = resolve
    setConfirmState(o)
  }), [])

  const close = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = undefined
    setConfirmState(null)
  }

  const icons = { success: <CheckCircle2 size={18} />, error: <XCircle size={18} />, info: <Info size={18} /> }
  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4 safe-top" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" data-testid="toast" className={`pointer-events-auto flex max-w-md animate-pop items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${t.tone === 'error' ? 'bg-red-600 text-white' : t.tone === 'info' ? 'bg-night-800 text-white' : 'bg-emerald-600 text-white'}`}>
            {icons[t.tone]} {t.msg}
          </div>
        ))}
      </div>
      <Sheet open={!!confirmState} onClose={() => close(false)} title={confirmState?.title ?? ''} testId="confirm-dialog"
        footer={<div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => close(false)}>Annulla</Button><Button variant={confirmState?.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => close(true)} data-testid="confirm-ok">{confirmState?.confirmLabel ?? 'Conferma'}</Button></div>}>
        <div className="flex gap-3">
          {confirmState?.danger && <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={22} />}
          <p className="text-[15px] text-slate-600 dark:text-slate-300">{confirmState?.message}</p>
        </div>
      </Sheet>
    </Ctx.Provider>
  )
}

export function useUi(): Ui {
  const u = useContext(Ctx)
  if (!u) throw new Error('useUi fuori dal provider')
  return u
}
