import { useEffect, useState } from 'react'
import { BellOff, BellRing, Info, Lock, Send, Share, ShieldCheck, Smartphone } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useUi } from './UiContext'
import { Button, Card, Notice } from './ui'
import { buildPushDeadlines, disablePush, enablePush, isIOS, loadPushState, permission, pushSupport, sendTestPush, type PushState } from '../lib/push'

export function usePushState(): PushState {
  const [st, setSt] = useState(loadPushState)
  useEffect(() => {
    const on = () => setSt(loadPushState())
    window.addEventListener('automemo-push', on)
    window.addEventListener('storage', on)
    return () => { window.removeEventListener('automemo-push', on); window.removeEventListener('storage', on) }
  }, [])
  return st
}

export function PushPrivacyNotice() {
  return (
    <Notice className="flex gap-2 text-xs">
      <Lock size={14} className="mt-0.5 shrink-0" />
      <span>
        <strong>Privacy.</strong> Per avvisarti anche ad app chiusa, AutoMemo salva sul proprio server solo: un codice anonimo casuale del dispositivo,
        l’indirizzo tecnico per le notifiche fornito dal browser e, per ogni scadenza con data, il tipo (es. “Revisione”), la data e i giorni di preavviso scelti.
        <strong> Non vengono mai inviati targa, nome dell’auto, chilometri, note, foto o costi.</strong> Il contenuto delle notifiche è cifrato fino al tuo dispositivo.
        Con “Disattiva notifiche” questi dati vengono cancellati dal server.
      </span>
    </Notice>
  )
}

export function PushSettings() {
  const { data } = useStore()
  const { toast, confirm } = useUi()
  const st = usePushState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const support = pushSupport()
  const perm = permission()
  const synced = buildPushDeadlines(data).length
  const kmOnly = data.deadlines.filter((d) => d.reminderDays.length && !d.fixedDate && !(d.lastDate && d.intervalMonths)).length

  const enable = async () => {
    setBusy(true); setError('')
    try {
      await enablePush(data)
      toast('Notifiche attivate')
    } catch (e) {
      setError((e as Error).message || 'Impossibile attivare le notifiche.')
    } finally { setBusy(false) }
  }
  const disable = async () => {
    if (!(await confirm({ title: 'Disattivare le notifiche?', message: 'Non riceverai più notifiche ad app chiusa e i dati delle notifiche verranno cancellati dal server. I promemoria dentro l’app restano attivi.', confirmLabel: 'Disattiva' }))) return
    setBusy(true); setError('')
    const r = await disablePush()
    setBusy(false)
    toast(r.serverDeleted ? 'Notifiche disattivate e dati cancellati dal server' : 'Notifiche disattivate. La cancellazione dal server verrà completata appena sarai online.', r.serverDeleted ? 'success' : 'info')
  }
  const test = async () => {
    setBusy(true); setError('')
    try { await sendTestPush(); toast('Notifica di prova inviata', 'info') } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  let body: React.ReactNode
  if (support === 'not-configured') {
    body = <Notice className="flex gap-2"><BellOff size={16} className="mt-0.5 shrink-0" /><span>Le notifiche push ad app chiusa non sono ancora attive in questa versione: per ora vedi i promemoria quando apri AutoMemo.</span></Notice>
  } else if (support === 'no-https') {
    body = <Notice className="flex gap-2"><Info size={16} className="mt-0.5 shrink-0" /><span>Le notifiche push funzionano solo aprendo AutoMemo dal sito <strong>https://autodav.github.io/automemo/</strong>, non dal file scaricato.</span></Notice>
  } else if (support === 'ios-needs-install') {
    body = (
      <div className="space-y-3" data-testid="push-ios-guide">
        <Notice className="flex gap-2"><Smartphone size={16} className="mt-0.5 shrink-0" /><span>Su iPhone e iPad le notifiche funzionano solo se AutoMemo è aggiunta alla schermata Home da <strong>Safari</strong> (iOS 16.4 o successivo).</span></Notice>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Apri <strong>autodav.github.io/automemo</strong> in Safari.</li>
          <li>Tocca <Share size={14} className="inline" /> <strong>Condividi</strong> e poi <strong>“Aggiungi alla schermata Home”</strong>.</li>
          <li>Apri AutoMemo dall’icona sulla Home, vai in Impostazioni e tocca <strong>“Attiva notifiche”</strong>.</li>
        </ol>
        <p className="text-xs text-slate-500 dark:text-slate-400">Nota: l’app aggiunta alla Home ha un archivio separato da Safari. Prima esporta un backup qui (Backup e dati) e poi importalo nell’app dalla Home.</p>
      </div>
    )
  } else if (support === 'ios-too-old') {
    body = <Notice tone="warning">Questa versione di iOS non supporta le notifiche web. Aggiorna l’iPhone a iOS 16.4 o successivo.</Notice>
  } else if (support === 'unsupported') {
    body = <Notice tone="warning">Questo browser non supporta le notifiche push. Prova con Chrome, Edge, Firefox o Safari aggiornati.</Notice>
  } else if (st.enabled) {
    body = (
      <div className="space-y-3" data-testid="push-enabled">
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-300">
          <BellRing size={20} />
          <span className="text-sm"><strong>Notifiche attive</strong> su questo dispositivo.<span className="block text-xs opacity-80">{synced} {synced === 1 ? 'scadenza sincronizzata' : 'scadenze sincronizzate'}{st.lastSyncAt ? ` · ultimo aggiornamento ${new Date(st.lastSyncAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span></span>
        </div>
        {kmOnly > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Le scadenze impostate solo a chilometri restano promemoria dentro l’app (il server non conosce i tuoi km).</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={test} disabled={busy} data-testid="push-test"><Send size={16} /> Invia notifica di prova</Button>
          <Button variant="secondary" className="flex-1 text-red-600 dark:text-red-400" onClick={disable} disabled={busy} data-testid="push-disable"><BellOff size={16} /> Disattiva notifiche</Button>
        </div>
      </div>
    )
  } else if (perm === 'denied') {
    body = <Notice tone="warning" className="flex gap-2"><BellOff size={16} className="mt-0.5 shrink-0" /><span data-testid="push-denied">Le notifiche per AutoMemo sono bloccate nel browser. Per attivarle apri le impostazioni del sito (icona accanto all’indirizzo, oppure Impostazioni → Notifiche del telefono), consenti le notifiche e ricarica la pagina.</span></Notice>
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">Ricevi un avviso sul telefono anche ad app chiusa, ai giorni di preavviso scelti per ogni scadenza (30, 15, 7, 1). L’invio avviene una volta al giorno, dalle 8:00.</p>
        <Button className="w-full" onClick={enable} disabled={busy} data-testid="push-enable"><BellRing size={18} /> {busy ? 'Attivazione…' : 'Attiva notifiche'}</Button>
        {isIOS() && <p className="text-xs text-slate-500">Il permesso verrà chiesto da iOS dopo il tocco.</p>}
      </div>
    )
  }

  return (
    <Card className="space-y-3" data-testid="push-settings">
      <p className="flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-electric-500" /> Notifiche push</p>
      {body}
      {(st.lastError || error) && <Notice tone="danger"><span role="alert" data-testid="push-error">{error || st.lastError}</span></Notice>}
      {support !== 'not-configured' && <PushPrivacyNotice />}
    </Card>
  )
}
