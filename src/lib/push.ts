import type { AppData } from '../types'
import { PUSH_API_URL } from '../config'
import { INTERVENTION_TYPES } from './constants'
import { computeDue } from './deadlines'
import { todayISO } from './dates'
import { deleteMeta, setMeta } from './db'
import { canUseServiceWorker, isStandalone } from './pwa'

/**
 * Notifiche push reali (Web Push + VAPID).
 * Al server vengono inviati SOLO: id anonimo del dispositivo, sottoscrizione push e, per ogni scadenza con data,
 * id casuale, id casuale del veicolo, tipo (es. "Revisione"), data di scadenza e soglie di preavviso.
 * Mai targhe, note, foto, costi, nomi dei veicoli o chilometri.
 */

const LS_KEY = 'automemo-push' // prefisso diverso da "automemo:" così non viene cancellato da import/reset dei dati

export interface PushState {
  enabled: boolean
  deviceId?: string
  endpoint?: string
  lastSyncAt?: string
  lastHash?: string
  lastError?: string
  /** eliminazione sul server non riuscita (offline): da ritentare */
  pendingDelete?: string
}

export type PushSupport =
  | 'not-configured' // backend non ancora configurato
  | 'no-https' // file locale / http: service worker non disponibile
  | 'ios-needs-install' // iPhone/iPad in Safari: serve "Aggiungi alla schermata Home"
  | 'ios-too-old' // app installata ma iOS < 16.4
  | 'unsupported'
  | 'supported'

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function pushSupport(): PushSupport {
  if (!PUSH_API_URL) return 'not-configured'
  if (!canUseServiceWorker()) return 'no-https'
  const hasPush = 'PushManager' in window && 'Notification' in window && 'showNotification' in ServiceWorkerRegistration.prototype
  if (isIOS()) {
    if (!isStandalone()) return 'ios-needs-install'
    if (!hasPush) return 'ios-too-old'
  }
  return hasPush ? 'supported' : 'unsupported'
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export function loadPushState(): PushState {
  try { return { enabled: false, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } } catch { return { enabled: false } }
}
function savePushState(s: PushState) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
  window.dispatchEvent(new Event('automemo-push'))
}

function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function urlB64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface PushDeadline { id: string; vehicleId: string; label: string; dueDate: string; thresholds: number[] }

/** Dati minimi delle scadenze da sincronizzare (solo quelle con una data e almeno un preavviso). */
export function buildPushDeadlines(data: AppData): PushDeadline[] {
  const today = todayISO()
  const vehicles = new Set(data.vehicles.map((v) => v.id))
  const out: PushDeadline[] = []
  for (const d of data.deadlines) {
    if (!vehicles.has(d.vehicleId) || !d.reminderDays?.length) continue
    const { dueDate } = computeDue(d)
    if (!dueDate || dueDate < today) continue
    out.push({
      id: d.id,
      vehicleId: d.vehicleId,
      // per le manutenzioni personalizzate non inviamo il nome scritto dall'utente
      label: d.type === 'personalizzata' ? 'Manutenzione personalizzata' : INTERVENTION_TYPES[d.type].label,
      dueDate,
      thresholds: [...d.reminderDays].sort((a, b) => b - a),
    })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(PUSH_API_URL + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    let msg = `Errore del server (${res.status})`
    try { msg = (await res.json()).error || msg } catch { /* */ }
    throw new Error(msg)
  }
  return res
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Service worker non disponibile. Ricarica la pagina e riprova.')), 10000)),
  ])
  return reg
}

/** Attiva le notifiche: chiede il permesso (solo dopo il tocco dell'utente), crea la sottoscrizione e la invia al server. */
export async function enablePush(data: AppData): Promise<PushState> {
  const support = pushSupport()
  if (support !== 'supported') throw new Error('Le notifiche push non sono disponibili su questo browser.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? 'Hai bloccato le notifiche per AutoMemo. Per attivarle, consenti le notifiche per questo sito nelle impostazioni del browser e riprova.'
      : 'Permesso non concesso. Tocca di nuovo “Attiva notifiche” e scegli “Consenti”.')
  }
  const { publicKey } = await (await api('GET', '/api/vapid-public-key')).json()
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  const key = urlB64ToUint8(publicKey)
  if (sub && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey)
    if (cur.length !== key.length || cur.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const prev = loadPushState()
  const deviceId = prev.deviceId || randomId()
  const deadlines = buildPushDeadlines(data)
  await api('PUT', `/api/devices/${deviceId}`, { subscription: sub.toJSON(), deadlines })
  const state: PushState = { enabled: true, deviceId, endpoint: sub.endpoint, lastSyncAt: new Date().toISOString(), lastHash: JSON.stringify(deadlines) + sub.endpoint }
  savePushState(state)
  await setMeta('push', { deviceId, apiUrl: PUSH_API_URL }).catch(() => undefined)
  return state
}

/** Disattiva: elimina i dati dal server e annulla la sottoscrizione nel browser. */
export async function disablePush(): Promise<{ serverDeleted: boolean }> {
  const st = loadPushState()
  let serverDeleted = true
  if (st.deviceId) {
    try { await api('DELETE', `/api/devices/${st.deviceId}`) } catch { serverDeleted = false }
  }
  try {
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
    await sub?.unsubscribe()
  } catch { /* nessuna sottoscrizione */ }
  await deleteMeta('push').catch(() => undefined)
  savePushState({ enabled: false, pendingDelete: serverDeleted ? undefined : st.deviceId })
  return { serverDeleted }
}

let syncing: Promise<void> | null = null

/** Ri-sincronizza scadenze e preferenze se sono cambiate (o una volta al giorno). */
export async function syncPush(data: AppData, force = false): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const st = loadPushState()
    if (!PUSH_API_URL || !navigator.onLine) return
    if (st.pendingDelete) {
      try { await api('DELETE', `/api/devices/${st.pendingDelete}`); savePushState({ ...loadPushState(), pendingDelete: undefined }) } catch { /* riprova più tardi */ }
    }
    if (!st.enabled || !st.deviceId || pushSupport() !== 'supported') return
    if (permission() !== 'granted') {
      savePushState({ ...st, enabled: false, lastError: 'Il permesso per le notifiche è stato revocato nelle impostazioni del browser.' })
      api('DELETE', `/api/devices/${st.deviceId}`).catch(() => undefined)
      return
    }
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
    if (!sub) {
      savePushState({ ...st, enabled: false, lastError: 'La sottoscrizione alle notifiche non è più valida: riattivale.' })
      return
    }
    const deadlines = buildPushDeadlines(data)
    const hash = JSON.stringify(deadlines) + sub.endpoint
    const stale = !st.lastSyncAt || Date.now() - Date.parse(st.lastSyncAt) > 24 * 3600 * 1000
    if (!force && hash === st.lastHash && !stale) return
    try {
      await api('PUT', `/api/devices/${st.deviceId}`, { subscription: sub.toJSON(), deadlines })
      savePushState({ ...st, endpoint: sub.endpoint, lastHash: hash, lastSyncAt: new Date().toISOString(), lastError: undefined })
    } catch (e) {
      savePushState({ ...st, lastError: `Sincronizzazione non riuscita: ${(e as Error).message}` })
    }
  })().finally(() => { syncing = null })
  return syncing
}

export async function sendTestPush(): Promise<void> {
  const st = loadPushState()
  if (!st.deviceId) throw new Error('Notifiche non attive.')
  await api('POST', `/api/devices/${st.deviceId}/test`)
}
