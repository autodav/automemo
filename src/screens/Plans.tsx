import { ArrowLeft, Check, Crown } from 'lucide-react'
import { Card, IconButton, Notice } from '../components/ui'

const FREE = ['Un veicolo', 'Scadenze principali', 'Storico manutenzioni', 'Promemoria nell’app']
const PRO = ['Veicoli illimitati', 'Statistiche avanzate', 'Esportazione PDF', 'Promemoria avanzati', 'Backup cloud, quando disponibile']

export function Plans() {
  return (
    <div className="space-y-4 animate-fade-in" data-testid="plans">
      <div className="flex items-center gap-2">
        <IconButton label="Indietro" onClick={() => window.history.back()}><ArrowLeft size={20} /></IconButton>
        <h1 className="text-2xl font-extrabold">Piani</h1>
      </div>
      <Notice>Durante questa fase di test <strong>tutte le funzioni sono gratuite e sbloccate</strong>, anche con più veicoli. Non è previsto alcun pagamento: i piani qui sotto descrivono come evolverà AutoMemo.</Notice>
      <Card>
        <p className="text-sm font-semibold text-electric-600 dark:text-electric-400">AutoMemo Free</p>
        <p className="text-2xl font-extrabold">Gratis</p>
        <ul className="mt-3 space-y-2">{FREE.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><Check size={16} className="text-emerald-500" /> {f}</li>)}</ul>
      </Card>
      <Card className="relative overflow-hidden bg-gradient-to-br from-night-800 to-night-950 !text-white !ring-electric-500/40">
        <span className="absolute right-4 top-4 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-night-900">In arrivo</span>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-300"><Crown size={16} /> AutoMemo Pro</p>
        <p className="text-2xl font-extrabold">Prezzo da definire</p>
        <ul className="mt-3 space-y-2">{PRO.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><Check size={16} className="text-electric-400" /> {f}</li>)}</ul>
        <p className="mt-4 text-xs text-slate-400">Non ancora acquistabile. Nessun pagamento viene richiesto in questa versione.</p>
      </Card>
    </div>
  )
}
