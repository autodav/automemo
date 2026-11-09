import { useRef } from 'react'
import { BellRing, CalendarClock, Lock, Upload, Wallet } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { Button } from '../components/ui'
import { navigate } from '../lib/router'
import { useImportBackup } from './useBackup'

export function Welcome() {
  const fileRef = useRef<HTMLInputElement>(null)
  const importBackup = useImportBackup()
  const features = [
    { icon: CalendarClock, t: 'Scadenze sotto controllo', d: 'Tagliando, revisione, bollo, assicurazione e altro.' },
    { icon: BellRing, t: 'Promemoria nell’app', d: 'Avvisi a 30, 15, 7 e 1 giorno dalla scadenza.' },
    { icon: Wallet, t: 'Spese chiare', d: 'Totali mensili e annuali, grafico ed export CSV.' },
    { icon: Lock, t: 'Nessuna registrazione', d: 'I dati restano solo sul tuo dispositivo.' },
  ]
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-night-900 text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-electric-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-56 w-56 rounded-full bg-cyan-glow/20 blur-3xl" />
      <div className="safe-top relative mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-14">
        <div className="animate-fade-in">
          <div className="inline-block rounded-[22px] shadow-2xl shadow-electric-500/40 ring-1 ring-white/15"><LogoMark size={72} /></div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight">Auto<span className="text-electric-400">Memo</span></h1>
          <p className="mt-2 text-xl font-medium text-slate-300" data-testid="slogan">La tua auto. Tutto sotto controllo.</p>
        </div>
        <ul className="mt-10 space-y-4">
          {features.map(({ icon: I, t, d }, i) => (
            <li key={t} className="flex animate-fade-in gap-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-electric-300"><I size={20} /></span>
              <span><span className="block font-semibold">{t}</span><span className="block text-sm text-slate-400">{d}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-3 pt-10">
          <Button size="lg" className="w-full text-lg" onClick={() => navigate('/veicolo/nuovo')} data-testid="add-first-car">Aggiungi la mia auto</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="welcome-import" onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-slate-300 hover:text-white">
            <Upload size={16} /> Ripristina da un backup
          </button>
        </div>
      </div>
    </div>
  )
}
