// Verifica live delle notifiche push: sito pubblicato + Worker in produzione + vero Chrome/FCM.
// Uso: CRON_HOOK=1 xvfb-run -a node tests/live-push.mjs   (il passo cron richiede un trigger temporaneo, vedi sotto)
import { chromium } from 'playwright'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url)), W = root + 'worker'
const APP = 'https://autodav.github.io/automemo/', API = 'https://automemo-push.davidedallalonga.workers.dev'
let pass = 0, fail = 0
const ok = (c, m, x = '') => { if (c) { pass++; console.log('✅', m) } else { fail++; console.log('❌', m, x) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'automemo-push', '--remote', '--json', '--command', q], { cwd: W, encoding: 'utf8' }))[0].results
const deploy = (crons) => execFileSync('npx', ['wrangler', 'deploy', ...crons.flatMap((c) => ['--triggers', c])], { cwd: W, stdio: 'ignore' })
const CRON = '*/2 6-10 * * *'

const ctx = await chromium.launchPersistentContext(mkdtempSync(tmpdir() + '/am-live-'), { executablePath: '/usr/bin/google-chrome', headless: false, viewport: { width: 390, height: 844 }, locale: 'it-IT', args: ['--no-first-run'] })
await ctx.grantPermissions(['notifications'], { origin: 'https://autodav.github.io' })
const errors = []
const page = ctx.pages()[0] || await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const tid = (id) => page.getByTestId(id)
const notes = (tag) => page.evaluate(async (tag) => (await (await navigator.serviceWorker.ready).getNotifications(tag ? { tag } : {})).map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data })), tag)
let deviceId = null, cronHooked = false
try {
  await page.goto(APP)
  await tid('add-first-car').click()
  await page.fill('#v-name', 'Test Live'); await page.fill('#v-year', '2019'); await page.fill('#v-plate', 'zz999zz'); await page.fill('#v-km', '12345')
  await tid('vehicle-save').click(); await tid('dashboard').waitFor()
  await tid('setup-revisione').click(); await page.fill('#dl-fixed', plus(7)); await page.fill('#dl-notes', 'nota privata live'); await tid('deadline-save').click()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto(APP + '#/impostazioni'); await tid('push-settings').waitFor()
  await tid('push-enable').click()
  await tid('push-enabled').waitFor({ timeout: 25000 }).catch(async () => console.log('   errore UI:', await tid('push-error').innerText().catch(() => '-')))
  const endpoint = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint)
  await sleep(3000)
  const dev = sql(`SELECT id, endpoint FROM devices WHERE endpoint = '${endpoint}'`)
  deviceId = dev[0]?.id
  ok(endpoint?.startsWith('https://fcm.googleapis.com/') && dev.length === 1, 'sottoscrizione reale Chrome/FCM salvata nel D1 di produzione', endpoint?.slice(0, 50))
  const rows = deviceId ? sql(`SELECT * FROM deadlines WHERE device_id = '${deviceId}'`) : []
  ok(rows.length === 1 && rows[0].label === 'Revisione' && rows[0].due_date === plus(7), 'scadenza minima sincronizzata in produzione', JSON.stringify(rows))
  ok(!/ZZ999ZZ|Test Live|nota privata|12345/i.test(JSON.stringify(rows) + JSON.stringify(dev)), 'nessun dato personale sul server')

  await tid('push-test').click()
  let t = []
  for (let i = 0; i < 40 && !t.length; i++) { await sleep(1000); t = await notes('automemo-test') }
  ok(t.length === 1, 'notifica di prova consegnata via FCM dal Worker live', JSON.stringify(t))
  await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).forEach((n) => n.close()))

  // job pianificato reale: trigger cron temporaneo ogni minuto sul Worker deployato
  // i nuovi trigger cron impiegano qualche minuto a propagarsi: HOOK_READY=1 se già attivo
  if (!process.env.HOOK_READY) deploy([CRON, '* * * * *']); cronHooked = true
  console.log('    trigger cron temporaneo attivo', new Date().toLocaleTimeString('it-IT'))
  let n = []
  for (let i = 0; i < 500 && !n.length; i++) { await sleep(1500); n = (await notes()).filter((x) => x.tag !== 'automemo-test') }
  ok(n.length === 1 && n[0].title === 'AutoMemo · Revisione' && n[0].body.startsWith('Mancano 7 giorni'), 'cron del Worker live → FCM → notifica di scadenza mostrata', JSON.stringify(n))
  const after = sql(`SELECT sent, next_send_date FROM deadlines WHERE device_id = '${deviceId}'`)
  ok(after[0] && after[0].sent > 0, 'stato invio registrato (nessun duplicato)', JSON.stringify(after))
  await sleep(65000)
  // Chrome può chiudere da sé la notifica già mostrata: si verifica che non ne arrivino altre e che il server l'abbia segnata
  ok((await notes()).filter((x) => x.tag !== 'automemo-test').length <= 1 && sql(`SELECT next_send_date FROM deadlines WHERE device_id = '${deviceId}'`)[0]?.next_send_date !== plus(0), 'esecuzione cron successiva: nessuna notifica duplicata')
} finally {
  if (cronHooked) { deploy([CRON]); console.log('    trigger ripristinato:', CRON) }
}
try {
  await page.goto(APP + '#/impostazioni'); await tid('push-disable').click(); await tid('confirm-ok').click()
  await tid('push-enable').waitFor({ timeout: 15000 })
  await sleep(2000)
  ok(deviceId && sql(`SELECT COUNT(*) AS n FROM devices WHERE id = '${deviceId}'`)[0].n === 0 && sql(`SELECT COUNT(*) AS n FROM deadlines WHERE device_id = '${deviceId}'`)[0].n === 0, 'pulizia: “Disattiva notifiche” ha cancellato i dati di test dal server')
  ok(errors.length === 0, 'nessun errore in console', errors.join(' | '))
} finally { await ctx.close() }
console.log(`\n${pass}/${pass + fail} verifiche live superate`)
process.exit(fail ? 1 : 0)
