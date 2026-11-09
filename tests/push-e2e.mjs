// Test end-to-end delle notifiche push con un VERO Chrome e il VERO push service (FCM):
// app (build con VITE_PUSH_API_URL locale) + Worker in locale (wrangler dev) + cron simulato.
// Uso: xvfb-run -a node tests/push-e2e.mjs   (Chrome in modalità finestra: il push non arriva in headless)
import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const W = root + 'worker'
const API_PORT = 8799, APP_PORT = 4319, STATE = '/tmp/automemo-push-e2e'
const APP = `http://localhost:${APP_PORT}/`
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome'
let pass = 0, fail = 0
const ok = (c, m, extra = '') => { if (c) { pass++; console.log('✅', m) } else { fail++; console.log('❌', m, extra) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const sql = (q) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'automemo-push', '--local', '--persist-to', STATE, '--json', '--command', q], { cwd: W, encoding: 'utf8' }))[0].results

// 1. build dell'app puntata al backend locale
execFileSync('npx', ['vite', 'build', '--outDir', 'dist-push'], { cwd: root, env: { ...process.env, VITE_PUSH_API_URL: `http://localhost:${API_PORT}` }, stdio: 'ignore' })
// 2. Worker locale
rmSync(STATE, { recursive: true, force: true })
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'automemo-push', '--local', '--persist-to', STATE], { cwd: W, stdio: 'ignore' })
const wr = spawn('npx', ['wrangler', 'dev', '--local', '--test-scheduled', '--port', String(API_PORT), '--persist-to', STATE, '--show-interactive-dev-session=false'], { cwd: W, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
let wrLog = ''; wr.stdout.on('data', (d) => (wrLog += d)); wr.stderr.on('data', (d) => (wrLog += d))
const app = spawn('npx', ['vite', 'preview', '--outDir', 'dist-push', '--port', String(APP_PORT), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true })
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API_PORT}/health`)).ok && (await fetch(APP)).ok) break } catch {} await sleep(500) }

const ctx = await chromium.launchPersistentContext(mkdtempSync(tmpdir() + '/am-push-'), { executablePath: CHROME, headless: false, viewport: { width: 390, height: 844 }, locale: 'it-IT', args: ['--no-first-run'] })
const errors = []
try {
  await ctx.grantPermissions(['notifications'], { origin: `http://localhost:${APP_PORT}` })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const tid = (id) => page.getByTestId(id)
  await page.goto(APP)
  await tid('add-first-car').click()
  await page.fill('#v-name', 'Fiat Panda'); await page.fill('#v-year', '2019'); await page.fill('#v-plate', 'test01'); await page.fill('#v-km', '85000')
  await tid('vehicle-save').click(); await tid('dashboard').waitFor()
  await tid('setup-revisione').click(); await page.fill('#dl-fixed', plus(7)); await page.fill('#dl-notes', 'nota privata'); await tid('deadline-save').click()
  await tid('setup-assicurazione').click(); await page.fill('#dl-fixed', plus(60)); await tid('deadline-save').click()
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready)

  // consenso esplicito: nessuna richiesta automatica al caricamento
  ok(await page.evaluate(() => Notification.permission) === 'granted', 'permesso concesso dal test (simula il tocco su “Consenti”)')
  ok(sql('SELECT COUNT(*) AS n FROM devices')[0].n === 0, 'nessuna sottoscrizione prima del tocco su “Attiva notifiche”')

  await page.goto(APP + '#/impostazioni')
  await tid('push-settings').waitFor()
  await tid('push-enable').click()
  await tid('push-enabled').waitFor({ timeout: 20000 }).catch(async () => console.log('   errore UI:', await tid('push-error').innerText().catch(() => '-')))
  const dev = sql('SELECT * FROM devices')
  ok(dev.length === 1 && dev[0].endpoint.startsWith('https://fcm.googleapis.com/'), 'sottoscrizione reale Chrome/FCM salvata dal Worker', JSON.stringify(dev.map((d) => d.endpoint.slice(0, 40))))
  const rows = sql('SELECT * FROM deadlines ORDER BY due_date')
  ok(rows.length === 2 && rows[0].label === 'Revisione' && rows[0].due_date === plus(7), 'scadenze minime sincronizzate', JSON.stringify(rows))
  const dump = JSON.stringify(rows) + JSON.stringify(dev)
  ok(!/TEST01|Panda|nota privata|85000/i.test(dump), 'nessun dato personale sul server (targa, nome auto, note, km)')
  await page.screenshot({ path: root + 'screenshots/push-settings-attive.png' })

  // ri-sincronizzazione automatica su modifica delle preferenze
  await page.goto(APP + '#/scadenze')
  await tid('deadline-item').filter({ hasText: 'Assicurazione' }).getByRole('button', { name: 'Modifica' }).click()
  await page.getByRole('button', { name: '30 giorni' }).click() // toglie 30
  await tid('deadline-save').click()
  await sleep(3500)
  const thr = sql("SELECT thresholds FROM deadlines WHERE label = 'Assicurazione'")[0].thresholds
  ok(thr === 7, 'preferenze aggiornate automaticamente sul server (15/7/1 → mask 7)', 'mask=' + thr)

  // cron → FCM → service worker → notifica di sistema
  await fetch(`http://localhost:${API_PORT}/__scheduled?cron=*/2+6-10+*+*+*`)
  let notes = []
  for (let i = 0; i < 40 && !notes.length; i++) {
    await sleep(1000)
    notes = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data })))
  }
  const cronLine = (wrLog.match(/cron \{.*\}/g) || []).pop()
  console.log('    ', cronLine)
  ok(/"sent":1/.test(cronLine || ''), 'FCM ha accettato il payload cifrato (201)', cronLine)
  ok(notes.length === 1 && notes[0].title === 'AutoMemo · Revisione' && notes[0].body.startsWith('Mancano 7 giorni'), 'notifica ricevuta e mostrata dal service worker', JSON.stringify(notes))
  if (notes[0]) console.log('     notifica:', JSON.stringify(notes[0]))

  // deduplica
  await fetch(`http://localhost:${API_PORT}/__scheduled?cron=*/2+6-10+*+*+*`)
  await sleep(1500)
  ok(/"candidates":0/.test((wrLog.match(/cron \{.*\}/g) || []).pop() || ''), 'secondo cron: nessun invio duplicato')

  // clic sulla notifica (simulato nel service worker) → apre la scadenza giusta
  await page.goto(APP + '#/')
  await tid('dashboard').waitFor()
  const sw = ctx.serviceWorkers()[0]
  await sw.evaluate(async () => {
    const [n] = await self.registration.getNotifications()
    self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n }))
  }).catch((e) => console.log('   evaluate:', e.message))
  await page.waitForFunction(() => location.hash.startsWith('#/scadenze'), null, { timeout: 5000 }).catch(() => {})
  ok(page.url().includes('#/scadenze') && (await page.locator('[data-highlighted]').innerText().catch(() => '')).includes('Revisione'), 'clic sulla notifica apre Scadenze con la revisione evidenziata', page.url())

  // notifica di prova
  await page.goto(APP + '#/impostazioni')
  await tid('push-test').click()
  let test = []
  for (let i = 0; i < 30 && !test.length; i++) { await sleep(1000); test = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'automemo-test' })).map((n) => n.body)) }
  ok(test.length === 1, 'notifica di prova ricevuta via FCM', JSON.stringify(test))

  // disattivazione
  await tid('push-disable').click()
  await tid('confirm-ok').click()
  await page.getByTestId('push-enable').waitFor({ timeout: 10000 })
  ok(sql('SELECT COUNT(*) AS n FROM devices')[0].n === 0 && sql('SELECT COUNT(*) AS n FROM deadlines')[0].n === 0, '“Disattiva notifiche” cancella i dati dal server')
  ok(await page.evaluate(async () => !(await (await navigator.serviceWorker.ready).pushManager.getSubscription())), 'sottoscrizione annullata nel browser')
  ok(errors.length === 0, 'nessun errore in console', errors.join(' | '))
} finally {
  await ctx.close()
}

const killTree = (c) => { try { process.kill(-c.pid, 'SIGTERM') } catch {} }
process.on('exit', () => { killTree(wr); killTree(app) })
// permesso negato
{
  const c = await chromium.launchPersistentContext(mkdtempSync(tmpdir() + '/am-push-'), { executablePath: CHROME, headless: false, viewport: { width: 390, height: 844 } })
  const p = c.pages()[0]
  await p.goto(APP)
  await p.getByTestId('add-first-car').click()
  await p.fill('#v-name', 'Test'); await p.fill('#v-year', '2020'); await p.fill('#v-km', '1000'); await p.getByTestId('vehicle-save').click()
  await p.evaluate(() => navigator.serviceWorker.ready)
  await p.goto(APP + '#/impostazioni')
  // l'utente ha bloccato le notifiche per il sito
  const cdp = await c.browser()?.newBrowserCDPSession?.() ?? await c.newCDPSession(p)
  await cdp.send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: `http://localhost:${APP_PORT}` })
  await p.reload()
  await p.getByTestId('push-settings').waitFor()
  const st = await p.evaluate(() => Notification.permission)
  const msg = await p.getByTestId('push-denied').innerText({ timeout: 5000 }).catch(() => '')
  ok(st === 'denied' && /bloccate/.test(msg) && !(await p.getByTestId('push-enable').count()), 'permesso negato: messaggio chiaro, nessun pulsante inutile', st + ' ' + msg)
  await c.close()
}
// iPhone in Safari (non aggiunta alla Home): guida invece del pulsante
{
  const c = await chromium.launchPersistentContext(mkdtempSync(tmpdir() + '/am-push-'), { executablePath: CHROME, headless: false, viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' })
  const p = c.pages()[0]
  await p.goto(APP)
  await p.getByTestId('add-first-car').click()
  await p.fill('#v-name', 'Test'); await p.fill('#v-year', '2020'); await p.fill('#v-km', '1000'); await p.getByTestId('vehicle-save').click()
  await p.goto(APP + '#/impostazioni')
  await p.getByTestId('push-ios-guide').waitFor({ timeout: 5000 }).catch(() => {})
  ok(await p.getByTestId('push-ios-guide').isVisible() && !(await p.getByTestId('push-enable').count()), 'iPhone non installata: guida “Aggiungi alla schermata Home”, nessun pulsante')
  await p.getByTestId('push-settings').scrollIntoViewIfNeeded()
  await p.getByTestId('push-settings').screenshot({ path: root + 'screenshots/push-iphone-guida.png' })
  await c.close()
}

killTree(wr); killTree(app)
rmSync(root + 'dist-push', { recursive: true, force: true })
console.log(`\n${pass}/${pass + fail} test push superati`)
if (fail) console.log(wrLog.slice(-2500))
process.exit(fail ? 1 : 0)
