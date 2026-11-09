/**
 * AutoMemo Push – Cloudflare Worker
 *  - API (CORS limitato all'origin dell'app) per salvare/aggiornare/eliminare la sottoscrizione di un dispositivo
 *  - Cron: controlla ogni giorno le scadenze e invia le notifiche alle soglie scelte (30/15/7/1 giorni)
 * Dati salvati: id anonimo del dispositivo, sottoscrizione push, e per ogni scadenza tipo, data e soglie. Nient'altro.
 */
import { sendPush, type PushSubscriptionJSON, type VapidKeys } from './webpush.ts'
import { daysBetween, initialSent, localNow, markSent, nextSendDate, notificationFor, toMask } from './schedule.ts'

export interface Env {
  DB: D1Database
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string // secret: `wrangler secret put VAPID_PRIVATE_KEY`
  VAPID_SUBJECT: string
  ALLOWED_ORIGINS: string // separati da virgola
  TIME_ZONE?: string // default Europe/Rome
  SEND_HOUR?: string // ora locale dalla quale inviare (default 8)
  MAX_PUSHES_PER_RUN?: string // limite per esecuzione (piano Free: 50 subrequest esterne)
  ALLOW_TEST_ENDPOINTS?: string // solo sviluppo locale: accetta endpoint http://localhost
}

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/]
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const DEVICE_RE = /^[A-Za-z0-9_-]{32,64}$/
const B64URL = /^[A-Za-z0-9_-]+$/
const MAX_DEADLINES = 200
const MAX_BODY = 64 * 1024

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  const h: Record<string, string> = { Vary: 'Origin' }
  if (allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'GET, PUT, POST, DELETE, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'Content-Type'
    h['Access-Control-Max-Age'] = '86400'
  }
  return h
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })
}

function vapid(env: Env): VapidKeys {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new HttpError(500, 'Chiavi VAPID non configurate')
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
}

function validSubscription(s: unknown, env: Env): PushSubscriptionJSON {
  const sub = s as PushSubscriptionJSON
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') throw new HttpError(400, 'Sottoscrizione non valida')
  let url: URL
  try { url = new URL(sub.endpoint) } catch { throw new HttpError(400, 'Endpoint non valido') }
  const testOk = env.ALLOW_TEST_ENDPOINTS === '1' && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (!testOk && (url.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(url.hostname)))) throw new HttpError(400, 'Push service non riconosciuto')
  if (sub.endpoint.length > 1024 || !B64URL.test(sub.keys.p256dh) || sub.keys.p256dh.length !== 87 || !B64URL.test(sub.keys.auth) || sub.keys.auth.length !== 22) throw new HttpError(400, 'Chiavi della sottoscrizione non valide')
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }
}

interface InDeadline { id: string; vehicleId: string; label: string; dueDate: string; thresholds: number[] }
function validDeadlines(list: unknown): InDeadline[] {
  if (!Array.isArray(list)) throw new HttpError(400, 'Elenco scadenze non valido')
  if (list.length > MAX_DEADLINES) throw new HttpError(400, 'Troppe scadenze')
  return list.map((d: InDeadline) => {
    if (!d || !ID_RE.test(d.id) || !ID_RE.test(d.vehicleId) || typeof d.label !== 'string' || !d.label.trim() || d.label.length > 60
      || typeof d.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) || !Array.isArray(d.thresholds)) throw new HttpError(400, 'Scadenza non valida')
    // solo questi campi vengono conservati
    return { id: d.id, vehicleId: d.vehicleId, label: d.label.trim(), dueDate: d.dueDate, thresholds: d.thresholds.filter((t) => typeof t === 'number') }
  })
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('Content-Length') || 0)
  if (len > MAX_BODY) throw new HttpError(413, 'Richiesta troppo grande')
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'Richiesta troppo grande')
  try { return JSON.parse(text) } catch { throw new HttpError(400, 'JSON non valido') }
}

const nowISO = () => new Date().toISOString()

async function upsertDevice(env: Env, deviceId: string, body: Record<string, unknown>) {
  const sub = validSubscription(body.subscription, env)
  const tz = env.TIME_ZONE || 'Europe/Rome'
  const today = localNow(tz).date
  const now = nowISO()
  // un endpoint appartiene a un solo dispositivo: rimuove eventuali vecchi id con lo stesso endpoint
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM deadlines WHERE device_id IN (SELECT id FROM devices WHERE endpoint = ?1 AND id <> ?2)').bind(sub.endpoint, deviceId),
    env.DB.prepare('DELETE FROM devices WHERE endpoint = ?1 AND id <> ?2').bind(sub.endpoint, deviceId),
    env.DB.prepare(`INSERT INTO devices (id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at`).bind(deviceId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now),
  ]
  let count: number | undefined
  if (body.deadlines !== undefined) {
    const incoming = validDeadlines(body.deadlines)
    const { results } = await env.DB.prepare('SELECT deadline_id, due_date, thresholds, sent FROM deadlines WHERE device_id = ?1').bind(deviceId).all<{ deadline_id: string; due_date: string; thresholds: number; sent: number }>()
    const old = new Map(results.map((r) => [r.deadline_id, r]))
    stmts.push(env.DB.prepare('DELETE FROM deadlines WHERE device_id = ?1').bind(deviceId))
    for (const d of incoming) {
      const thr = toMask(d.thresholds)
      if (!thr || d.dueDate < today) continue
      const prev = old.get(d.id)
      let sent: number
      if (prev && prev.due_date === d.dueDate) sent = (prev.sent & thr) | initialSent(d.dueDate, thr & ~prev.thresholds, today)
      else sent = initialSent(d.dueDate, thr, today)
      stmts.push(env.DB.prepare('INSERT INTO deadlines (device_id, deadline_id, vehicle_id, label, due_date, thresholds, sent, next_send_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
        .bind(deviceId, d.id, d.vehicleId, d.label, d.dueDate, thr, sent, nextSendDate(d.dueDate, thr, sent, today)))
    }
    count = stmts.length - 4
  }
  await env.DB.batch(stmts)
  return { ok: true, deadlines: count }
}

async function deleteDevice(env: Env, deviceId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM deadlines WHERE device_id = ?1').bind(deviceId),
    env.DB.prepare('DELETE FROM devices WHERE id = ?1').bind(deviceId),
  ])
}

async function sendTest(env: Env, deviceId: string) {
  const dev = await env.DB.prepare('SELECT endpoint, p256dh, auth, last_test_at FROM devices WHERE id = ?1').bind(deviceId).first<{ endpoint: string; p256dh: string; auth: string; last_test_at: string | null }>()
  if (!dev) throw new HttpError(404, 'Dispositivo non registrato')
  if (dev.last_test_at && Date.now() - Date.parse(dev.last_test_at) < 60_000) throw new HttpError(429, 'Attendi un minuto prima di un nuovo test')
  await env.DB.prepare('UPDATE devices SET last_test_at = ?1 WHERE id = ?2').bind(nowISO(), deviceId).run()
  const r = await sendPush({ endpoint: dev.endpoint, keys: { p256dh: dev.p256dh, auth: dev.auth } },
    { title: 'AutoMemo', body: 'Notifiche attive! Ti avviseremo prima delle tue scadenze.', tag: 'automemo-test', url: './#/' }, vapid(env), { ttl: 600, urgency: 'high' })
  if (r.gone) { await deleteDevice(env, deviceId); throw new HttpError(410, 'Sottoscrizione scaduta: riattiva le notifiche') }
  if (!r.ok) throw new HttpError(502, `Il push service ha risposto ${r.status}`)
  return { ok: true }
}

export async function handleFetch(req: Request, env: Env): Promise<Response> {
  const headers = cors(req, env)
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { status: headers['Access-Control-Allow-Origin'] ? 204 : 403, headers })
  try {
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, service: 'automemo-push' }, 200, headers)
    if (url.pathname === '/api/vapid-public-key' && req.method === 'GET') return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, headers)
    const m = url.pathname.match(/^\/api\/devices\/([^/]+)(\/test)?$/)
    if (m) {
      // le scritture sono accettate solo dall'app (origin consentito)
      if (!headers['Access-Control-Allow-Origin']) throw new HttpError(403, 'Origin non consentito')
      const id = m[1]
      if (!DEVICE_RE.test(id)) throw new HttpError(400, 'Id dispositivo non valido')
      if (m[2] && req.method === 'POST') return json(await sendTest(env, id), 200, headers)
      if (!m[2] && req.method === 'PUT') return json(await upsertDevice(env, id, await readBody(req)), 200, headers)
      if (!m[2] && req.method === 'DELETE') { await deleteDevice(env, id); return json({ ok: true }, 200, headers) }
    }
    throw new HttpError(404, 'Non trovato')
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Errore' }, status, headers)
  }
}

interface DueRow { device_id: string; deadline_id: string; vehicle_id: string; label: string; due_date: string; thresholds: number; sent: number; endpoint: string; p256dh: string; auth: string }

export interface RunReport { skipped?: string; today: string; candidates: number; sent: number; gone: number; failed: number; removedPast: number }

/** Job giornaliero: invia le notifiche dovute oggi (con recupero) entro il limite per esecuzione. */
export async function runScheduled(env: Env, now = new Date(), fetchImpl: typeof fetch = fetch): Promise<RunReport> {
  const tz = env.TIME_ZONE || 'Europe/Rome'
  const { date: today, hour } = localNow(tz, now)
  const report: RunReport = { today, candidates: 0, sent: 0, gone: 0, failed: 0, removedPast: 0 }
  if (hour < Number(env.SEND_HOUR ?? 8)) return { ...report, skipped: `prima delle ${env.SEND_HOUR ?? 8}:00 (${tz})` }
  const past = await env.DB.prepare('DELETE FROM deadlines WHERE due_date < ?1').bind(today).run()
  report.removedPast = past.meta.changes ?? 0
  const limit = Math.max(1, Math.min(45, Number(env.MAX_PUSHES_PER_RUN ?? 10)))
  const { results } = await env.DB.prepare(`SELECT d.device_id, d.deadline_id, d.vehicle_id, d.label, d.due_date, d.thresholds, d.sent, v.endpoint, v.p256dh, v.auth
    FROM deadlines d JOIN devices v ON v.id = d.device_id
    WHERE d.next_send_date IS NOT NULL AND d.next_send_date <= ?1 AND d.due_date >= ?1
    ORDER BY d.next_send_date LIMIT ?2`).bind(today, limit).all<DueRow>()
  report.candidates = results.length
  if (!results.length) return report
  const keys = vapid(env)
  const updates: D1PreparedStatement[] = []
  const goneDevices = new Set<string>()
  const queue = [...results]
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if (goneDevices.has(row.device_id)) continue
      const left = daysBetween(today, row.due_date)
      try {
        const r = await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, notificationFor(row, left), keys, { ttl: 20 * 3600, topic: row.deadline_id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) }, fetchImpl)
        if (r.ok) {
          report.sent++
          const sent = markSent(row.thresholds, row.sent, left)
          updates.push(env.DB.prepare('UPDATE deadlines SET sent = ?1, next_send_date = ?2 WHERE device_id = ?3 AND deadline_id = ?4')
            .bind(sent, nextSendDate(row.due_date, row.thresholds, sent, today), row.device_id, row.deadline_id))
        } else if (r.gone) {
          report.gone++
          goneDevices.add(row.device_id)
        } else {
          report.failed++ // 429/5xx: verrà ritentato alla prossima esecuzione
          console.warn('push fallita', r.status, r.text)
        }
      } catch (e) {
        report.failed++
        console.warn('push errore', e)
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker)) // max 6 connessioni simultanee
  for (const id of goneDevices) {
    updates.push(env.DB.prepare('DELETE FROM deadlines WHERE device_id = ?1').bind(id), env.DB.prepare('DELETE FROM devices WHERE id = ?1').bind(id))
  }
  if (updates.length) await env.DB.batch(updates)
  return report
}

export default {
  fetch: handleFetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env).then((r) => console.log('cron', JSON.stringify(r))))
  },
} satisfies ExportedHandler<Env>
