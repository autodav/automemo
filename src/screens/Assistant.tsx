import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useActions } from '../components/Actions'
import { Button, PageHeader, cx } from '../components/ui'
import { ask, type AssistantAnswer } from '../assistant'
import { todayISO } from '../lib/dates'
import { navigate } from '../lib/router'

interface Msg { id: number; role: 'user' | 'bot'; text: string; actions?: AssistantAnswer['actions'] }

const SUGGESTIONS = [
  'Quando devo cambiare l’olio?',
  'Quanto ho speso quest’anno?',
  'Quando ho cambiato le gomme?',
  'Qual è il prossimo intervento?',
  'Ho scadenze superate?',
  'Quando scade l’assicurazione?',
]

export function Assistant() {
  const { data, activeVehicle } = useStore()
  const { openLog, openDeadline } = useActions()
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'bot', text: `Ciao! Rispondo usando solo i dati salvati in AutoMemo${activeVehicle ? ` per la tua ${activeVehicle.name}` : ''}. Non faccio diagnosi meccaniche. Cosa vuoi sapere?` }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }) }, [msgs])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    setMsgs((m) => [...m, { id: Date.now(), role: 'user', text: q }])
    setBusy(true)
    try {
      const a = await ask(q, { data, vehicle: activeVehicle, today: todayISO() })
      setMsgs((m) => [...m, { id: Date.now() + 1, role: 'bot', text: a.text, actions: a.actions }])
    } catch {
      setMsgs((m) => [...m, { id: Date.now() + 1, role: 'bot', text: 'Si è verificato un errore. Riprova.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col animate-fade-in" data-testid="assistant">
      <PageHeader title="Chiedi ad AutoMemo" subtitle="Risposte basate sui tuoi dati, elaborate sul dispositivo" />
      <div className="flex-1 space-y-3 pb-2" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={cx('flex animate-fade-in', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'bot' && <span className="mr-2 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric-500 text-white"><Sparkles size={16} /></span>}
            <div className={cx('max-w-[82%] whitespace-pre-line rounded-3xl px-4 py-3 text-[15px] leading-relaxed', m.role === 'user' ? 'rounded-br-lg bg-electric-500 text-white' : 'rounded-bl-lg bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-night-800 dark:ring-night-700')} data-testid={m.role === 'bot' ? 'bot-msg' : 'user-msg'}>
              {m.text}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.actions.map((a) => (
                    <Button key={a.label} size="sm" variant="secondary" onClick={() => (a.intent === 'log' ? openLog() : a.intent === 'deadline' ? openDeadline({}) : a.route && navigate(a.route))}>{a.label}</Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="pl-10 text-sm text-slate-400">Sto controllando i tuoi dati…</p>}
        <div ref={endRef} style={{ scrollMarginBottom: '13rem' }} />
      </div>
      <div className="sticky bottom-24 mt-4 space-y-2 bg-gradient-to-t from-slate-50 via-slate-50 pt-2 dark:from-night-950 dark:via-night-950">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} className="shrink-0 rounded-full bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-slate-200 transition active:scale-95 dark:bg-night-800 dark:ring-night-600" data-testid="suggestion">{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Scrivi una domanda…" aria-label="Domanda per AutoMemo" data-testid="assistant-input"
            className="h-12 flex-1 rounded-2xl bg-white px-4 text-[16px] ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-electric-500 dark:bg-night-800 dark:ring-night-600" />
          <button type="submit" aria-label="Invia" disabled={!input.trim() || busy} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-electric-500 text-white transition active:scale-95 disabled:opacity-40"><Send size={18} /></button>
        </form>
      </div>
    </div>
  )
}
