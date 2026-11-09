import { useRef, useState } from 'react'
import { Car, Check, ChevronRight, Crown, Download, FileSpreadsheet, Monitor, Moon, Pencil, Plus, ShieldAlert, Smartphone, Sun, Trash2, Upload, BellOff } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useUi } from '../components/UiContext'
import { Button, Card, Field, Input, Notice, PageHeader, Segmented, cx } from '../components/ui'
import { navigate } from '../lib/router'
import { useExportBackup, useImportBackup } from './useBackup'
import { expensesToCSV } from '../lib/csv'
import { downloadText } from '../lib/download'
import { todayISO } from '../lib/dates'
import { formatKm, parseKm } from '../lib/format'
import { isStandalone, useInstallPrompt, canUseServiceWorker } from '../lib/pwa'
import type { ThemeMode } from '../types'

export function Settings() {
  const { data, activeVehicle, setActiveVehicle, updateSettings, resetAll } = useStore()
  const { toast, confirm } = useUi()
  const exportBackup = useExportBackup()
  const importBackup = useImportBackup()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kmWarn, setKmWarn] = useState(String(data.settings.kmWarning))
  const install = useInstallPrompt()
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  const saveKmWarn = () => {
    const k = parseKm(kmWarn)
    if (k === undefined || Number.isNaN(k) || k < 0 || k > 50000) { toast('Inserisci un valore tra 0 e 50.000 km.', 'error'); return }
    updateSettings({ kmWarning: k })
    toast('Soglia aggiornata')
  }

  const wipe = async () => {
    if (!(await confirm({ title: 'Cancellare tutti i dati?', message: 'Verranno eliminati definitivamente tutti i veicoli, interventi, scadenze, spese e foto salvati su questo dispositivo. Ti consigliamo di esportare prima un backup.', confirmLabel: 'Cancella tutto', danger: true }))) return
    await resetAll()
    toast('Tutti i dati sono stati cancellati')
    navigate('/', true)
  }

  return (
    <div className="space-y-5 animate-fade-in" data-testid="settings">
      <PageHeader title="Impostazioni" />

      <Section title="I miei veicoli">
        <Card className="divide-y divide-slate-100 !py-1 dark:divide-night-700">
          {data.vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-3 py-3" data-testid="vehicle-row">
              <button type="button" onClick={() => { setActiveVehicle(v.id); toast(`${v.name} selezionata`, 'info'); navigate('/') }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl', v.id === activeVehicle?.id ? 'bg-electric-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-night-800')}><Car size={20} /></span>
                <span className="min-w-0"><span className="block truncate font-semibold">{v.name}</span><span className="block text-xs text-slate-500">{v.year} · {formatKm(v.km)}</span></span>
                {v.id === activeVehicle?.id && <Check size={18} className="text-electric-500" />}
              </button>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/veicolo/${v.id}`)} aria-label={`Modifica ${v.name}`} data-testid="edit-vehicle"><Pencil size={16} /> Modifica</Button>
            </div>
          ))}
        </Card>
        <Button variant="secondary" className="mt-2 w-full" onClick={() => navigate('/veicolo/nuovo')} data-testid="add-vehicle"><Plus size={18} /> Aggiungi un altro veicolo</Button>
      </Section>

      <Section title="Aspetto">
        <Segmented<ThemeMode> value={data.settings.theme} onChange={(t) => updateSettings({ theme: t })} options={[{ value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }, { value: 'system', label: 'Automatico' }]} />
        <p className="mt-2 flex items-center gap-2 px-1 text-xs text-slate-500"><Sun size={14} /><Moon size={14} /><Monitor size={14} /> “Automatico” segue le impostazioni del dispositivo.</p>
      </Section>

      <Section title="Promemoria">
        <Card className="space-y-3">
          <Field label="Avvisami quando mancano (km)" htmlFor="km-warn" hint="Per le scadenze a chilometri: lo stato diventa giallo sotto questa soglia.">
            <div className="flex gap-2"><Input id="km-warn" inputMode="numeric" value={kmWarn} onChange={(e) => setKmWarn(e.target.value)} /><Button onClick={saveKmWarn}>Salva</Button></div>
          </Field>
          <Notice className="flex gap-2"><BellOff size={16} className="mt-0.5 shrink-0" /><span>I promemoria (30, 15, 7 e 1 giorno prima) si impostano su ogni scadenza e compaiono <strong>dentro l’app</strong>. Le notifiche push con l’app chiusa non sono ancora disponibili: richiedono un server dedicato che questa versione non ha.</span></Notice>
        </Card>
      </Section>

      <Section title="Backup e dati">
        <Card className="space-y-2">
          <Button variant="secondary" className="w-full justify-start" onClick={() => exportBackup(true)} data-testid="export-json"><Download size={18} /> Esporta backup (JSON)</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="import-json" onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = '' }} />
          <Button variant="secondary" className="w-full justify-start" onClick={() => fileRef.current?.click()}><Upload size={18} /> Importa backup (JSON)</Button>
          <Button variant="secondary" className="w-full justify-start" onClick={() => {
            if (!data.expenses.length && !data.records.some((r) => r.cost)) return toast('Non ci sono spese da esportare.', 'info')
            downloadText(`automemo-spese-tutti-${todayISO()}.csv`, expensesToCSV(data), 'text/csv;charset=utf-8'); toast('File CSV esportato')
          }}><FileSpreadsheet size={18} /> Esporta spese di tutti i veicoli (CSV)</Button>
          <Notice tone="warning" className="!mt-3 flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0" /><span>I dati sono salvati <strong>solo su questo dispositivo e in questo browser</strong>: nessun account, nessun server. Se cancelli i dati di navigazione, usi la navigazione privata o cambi telefono, andranno persi. Esporta regolarmente un backup e conservalo in un posto sicuro: contiene targhe e dati personali, non condividerlo pubblicamente.</span></Notice>
        </Card>
      </Section>

      <Section title="App">
        <Card className="space-y-3">
          {isStandalone() ? <p className="flex items-center gap-2 text-sm"><Smartphone size={16} /> AutoMemo è installata su questo dispositivo.</p>
            : install.available ? <Button className="w-full" onClick={async () => { if (await install.install()) toast('AutoMemo installata') }}><Smartphone size={18} /> Installa AutoMemo</Button>
            : <p className="text-sm text-slate-500 dark:text-slate-400"><Smartphone size={16} className="mr-1 inline" />{canUseServiceWorker() ? (isIOS ? 'Per installarla su iPhone: tocca Condividi e poi “Aggiungi alla schermata Home”.' : 'Puoi installare AutoMemo dal menu del browser (“Installa app” o “Aggiungi a schermata Home”).') : 'L’installazione come app è disponibile quando AutoMemo è pubblicata su un sito https. In questa versione locale funziona comunque tutto nel browser.'}</p>}
          <button type="button" onClick={() => navigate('/piani')} className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-night-800 to-night-700 p-3 text-left text-white" data-testid="open-plans">
            <Crown className="text-amber-300" /><span className="flex-1"><span className="block font-semibold">Piani AutoMemo</span><span className="block text-xs text-slate-300">Free e Pro (in arrivo)</span></span><ChevronRight />
          </button>
        </Card>
      </Section>

      <Section title="Zona pericolosa">
        <Button variant="secondary" className="w-full text-red-600 dark:text-red-400" onClick={wipe} data-testid="wipe"><Trash2 size={18} /> Cancella tutti i dati</Button>
      </Section>
      <p className="pb-4 text-center text-xs text-slate-400">AutoMemo v{__APP_VERSION__} · Nessuna pubblicità · Nessun tracciamento</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>{children}</section>
}
