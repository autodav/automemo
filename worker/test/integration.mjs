// Test di integrazione: Worker reale in locale (wrangler dev + D1 locale + cron simulato)
// e un finto push service che verifica la firma VAPID e DECIFRA i payload (RFC 8291).
// Uso: npm run test:integration
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { rmSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { decryptPayload } from './helpers.ts'
import { b64urlDecode } from '../src/webpush.ts'

const PORT = 8799, PUSH_PORT = 9911, STATE = '/tmp/automemo-wrangler-test'
const API = `http://localhost:${PORT}`
const ORIGIN = 'https://autodav.github.io'
const devVars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)))

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('✅', name) } catch (e) { fail++; console.log('❌', name, '\n   ', e.message) }
}
const pad = (n) => String(n).padStart(2, '0')
const romeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
const plus = (n) => { const [y, m, d] = romeToday().split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10) }
const it = (iso) => iso.split('-').reverse().join('/')

// ---- finto push service
const received = []
const subscribers = new Map() // path -> { priv, pub, auth }
async function makeSubscriber(path) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const pub = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url')
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')
  subscribers.set(path, { priv: kp.privateKey, pub, auth })
  return { endpoint: `http://localhost:${PUSH_PORT}${path}`, keys: { p256dh: pub, auth } }
}
const pushServer = createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = new Uint8Array(Buffer.concat(chunks))
  const entry = { path: req.url, headers: req.headers, ok: false }
  try {
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(req.headers.authorization || '')
    assert.ok(m, 'Authorization VAPID mancante')
    const [h, c, s] = m[1].split('.')
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    assert.equal(claims.aud, `http://localhost:${PUSH_PORT}`)
    assert.equal(m[2], devVars.VAPID_PUBLIC_KEY)
    const key = await crypto.subtle.importKey('raw', b64urlDecode(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`)), 'firma VAPID non valida')
    assert.equal(req.headers['content-encoding'], 'aes128gcm')
    assert.ok(Number(req.headers.ttl) > 0)
    const sub = subscribers.get(req.url)
    entry.payload = JSON.parse(await decryptPayload(body, sub.priv, sub.pub, sub.auth))
    entry.ok = true
  } catch (e) { entry.error = e.message }
  received.push(entry)
  if (req.url.includes('gone')) { res.writeHead(410); res.end('gone'); return }
  res.writeHead(entry.ok ? 201 : 400); res.end()
})
await new Promise((r) => pushServer.listen(PUSH_PORT, r))

// ---- Worker locale
rmSync(STATE, { recursive: true, force: true })
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'automemo-push', '--local', '--persist-to', STATE], { stdio: 'ignore' })
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--test-scheduled', '--port', String(PORT), '--persist-to', STATE, '--show-interactive-dev-session=false'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
let wrLog = ''
wr.stdout.on('data', (d) => (wrLog += d)); wr.stderr.on('data', (d) => (wrLog += d))
for (let i = 0; i < 60; i++) { try { if ((await fetch(API + '/health')).ok) break } catch {} await new Promise((r) => setTimeout(r, 500)) }
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'automemo-push', '--local', '--persist-to', STATE, '--json', '--command', q], { encoding: 'utf8' }))[0].results
const call = (method, path, body, origin = ORIGIN) => fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined })
const runCron = async () => { const n = received.length; await fetch(API + '/__scheduled?cron=*/2+6-10+*+*+*'); await new Promise((r) => setTimeout(r, 1500)); return received.slice(n) }
const devA = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
const devB = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
const subA = await makeSubscriber('/push/device-a')
const subB = await makeSubscriber('/push/gone-b')
const dl = (id, label, due, thresholds = [30, 15, 7, 1], extra = {}) => ({ id, vehicleId: 'vehicle_panda_1', label, dueDate: due, thresholds, ...extra })

try {
  await t('health e chiave pubblica VAPID', async () => {
    assert.equal((await (await fetch(API + '/health')).json()).ok, true)
    assert.equal((await (await fetch(API + '/api/vapid-public-key')).json()).publicKey, devVars.VAPID_PUBLIC_KEY)
  })
  await t('CORS: origin consentito ok, altri rifiutati', async () => {
    const ok = await fetch(API + `/api/devices/${devA}`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'PUT' } })
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN)
    const bad = await fetch(API + `/api/devices/${devA}`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null)
    assert.equal((await call('PUT', `/api/devices/${devA}`, { subscription: subA, deadlines: [] }, 'https://evil.example')).status, 403)
    assert.equal((await call('PUT', `/api/devices/${devA}`, { subscription: subA, deadlines: [] }, null)).status, 403)
  })
  await t('validazione: endpoint non push, id non valido, troppe scadenze', async () => {
    assert.equal((await call('PUT', `/api/devices/${devA}`, { subscription: { ...subA, endpoint: 'https://evil.example/x' }, deadlines: [] })).status, 400)
    assert.equal((await call('PUT', '/api/devices/corto', { subscription: subA, deadlines: [] })).status, 400)
    const many = Array.from({ length: 201 }, (_, i) => dl('deadline_' + i, 'Bollo', plus(50)))
    assert.equal((await call('PUT', `/api/devices/${devA}`, { subscription: subA, deadlines: many })).status, 400)
  })
  await t('salvataggio sottoscrizione + scadenze (solo i campi minimi)', async () => {
    const r = await call('PUT', `/api/devices/${devA}`, { subscription: subA, deadlines: [
      dl('deadline_rev7', 'Revisione', plus(7), [30, 15, 7, 1], { plate: 'TEST01', notes: 'segreto', cost: 99 }),
      dl('deadline_ass10', 'Assicurazione', plus(10)),
      dl('deadline_bollo40', 'Bollo', plus(40)),
      dl('deadline_olio1', 'Cambio olio', plus(1), [1]),
      dl('deadline_old', 'Freni', plus(-2)),
      dl('deadline_nothr', 'Batteria', plus(3), []),
    ] })
    assert.equal(r.status, 200, await r.clone().text())
    assert.equal((await r.json()).deadlines, 4)
    const rows = sql('SELECT * FROM deadlines ORDER BY deadline_id')
    assert.equal(rows.length, 4)
    assert.deepEqual(Object.keys(rows[0]).sort(), ['deadline_id', 'device_id', 'due_date', 'label', 'next_send_date', 'sent', 'thresholds', 'vehicle_id'])
    const dump = JSON.stringify(sql('SELECT * FROM deadlines')) + JSON.stringify(sql('SELECT * FROM devices'))
    assert.ok(!/TEST01|segreto|99/.test(dump.replace(/"(p256dh|auth|endpoint|id|device_id)":"[^"]*"/g, '')), 'dati non richiesti salvati')
    const ass = rows.find((x) => x.deadline_id === 'deadline_ass10')
    assert.equal(ass.next_send_date, plus(3)) // 30 e 15 saltate: prossima a 7 giorni
    const bollo = rows.find((x) => x.deadline_id === 'deadline_bollo40')
    assert.equal(bollo.next_send_date, plus(10))
  })
  await t('secondo dispositivo con sottoscrizione scaduta (risponderà 410)', async () => {
    assert.equal((await call('PUT', `/api/devices/${devB}`, { subscription: subB, deadlines: [dl('deadline_b7', 'Bollo', plus(7))] })).status, 200)
  })
  let first
  await t('cron giornaliero: invia le notifiche dovute oggi, cifrate e firmate', async () => {
    first = await runCron()
    assert.equal(first.length, 3, 'attese 3 richieste, ricevute ' + first.length + ' ' + JSON.stringify(first.map((x) => x.error)))
    for (const r of first) assert.ok(r.ok, r.error)
    const a = first.filter((x) => x.path === '/push/device-a').map((x) => x.payload)
    const rev = a.find((p) => p.title === 'AutoMemo · Revisione')
    assert.ok(rev && rev.body.startsWith('Mancano 7 giorni') && rev.body.includes(it(plus(7))), JSON.stringify(a))
    assert.equal(rev.url, './#/scadenze?v=vehicle_panda_1&d=deadline_rev7')
    const olio = a.find((p) => p.title === 'AutoMemo · Cambio olio')
    assert.ok(olio && olio.body.startsWith('Scade domani'))
    console.log('    payload decifrato:', JSON.stringify(rev))
  })
  await t('sottoscrizione 404/410 eliminata dal database', async () => {
    assert.equal(sql(`SELECT COUNT(*) AS n FROM devices WHERE id = '${devB}'`)[0].n, 0)
    assert.equal(sql(`SELECT COUNT(*) AS n FROM deadlines WHERE device_id = '${devB}'`)[0].n, 0)
  })
  await t('deduplica: un secondo cron lo stesso giorno non invia nulla', async () => {
    assert.equal((await runCron()).length, 0)
    const rev = sql("SELECT * FROM deadlines WHERE deadline_id = 'deadline_rev7'")[0]
    assert.equal(rev.next_send_date, plus(6)) // prossima: soglia 1 giorno
  })
  await t('ri-sincronizzazione: data cambiata → nuova soglia, sent preservato per le invariate', async () => {
    const r = await call('PUT', `/api/devices/${devA}`, { subscription: subA, deadlines: [
      dl('deadline_rev7', 'Revisione', plus(15)), // data spostata: notifica a 15 giorni oggi
      dl('deadline_ass10', 'Assicurazione', plus(10)),
      dl('deadline_olio1', 'Cambio olio', plus(1), [1]), // invariata: già inviata
    ] })
    assert.equal(r.status, 200)
    assert.equal(sql("SELECT COUNT(*) AS n FROM deadlines WHERE deadline_id = 'deadline_bollo40'")[0].n, 0, 'scadenza rimossa non eliminata')
    const sent = await runCron()
    assert.equal(sent.length, 1, JSON.stringify(sent.map((s) => s.payload)))
    assert.ok(sent[0].payload.body.startsWith('Mancano 15 giorni'))
  })
  await t('aggiornamento solo sottoscrizione (senza scadenze) mantiene le scadenze', async () => {
    const before = sql(`SELECT COUNT(*) AS n FROM deadlines WHERE device_id = '${devA}'`)[0].n
    assert.equal((await call('PUT', `/api/devices/${devA}`, { subscription: subA })).status, 200)
    assert.equal(sql(`SELECT COUNT(*) AS n FROM deadlines WHERE device_id = '${devA}'`)[0].n, before)
  })
  await t('notifica di prova + limite di 1 al minuto', async () => {
    const n = received.length
    assert.equal((await call('POST', `/api/devices/${devA}/test`)).status, 200)
    assert.equal(received.length, n + 1); assert.ok(received[n].payload.body.includes('Notifiche attive'))
    assert.equal((await call('POST', `/api/devices/${devA}/test`)).status, 429)
  })
  await t('disattivazione: DELETE elimina dispositivo e scadenze', async () => {
    assert.equal((await call('DELETE', `/api/devices/${devA}`)).status, 200)
    assert.equal(sql('SELECT COUNT(*) AS n FROM devices')[0].n, 0)
    assert.equal(sql('SELECT COUNT(*) AS n FROM deadlines')[0].n, 0)
  })
} finally {
  try { process.kill(-wr.pid, 'SIGTERM') } catch {}
  pushServer.close()
  if (fail) console.log('\n--- log wrangler ---\n' + wrLog.slice(-3000))
}
console.log(`\n${pass}/${pass + fail} test di integrazione superati`)
process.exit(fail ? 1 : 0)
