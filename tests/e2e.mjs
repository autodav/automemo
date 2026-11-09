// Test end-to-end dei flussi principali di AutoMemo (Playwright + Chrome headless).
// Uso: node tests/e2e.mjs   (richiede AutoMemo.html già generato e, per il test PWA, dist/)
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const SHOTS = root + 'screenshots/'
mkdirSync(SHOTS, { recursive: true })
const FILE_URL = 'file://' + root + 'AutoMemo.html'

const results = []
let failed = 0
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('✅', name) }
  catch (e) {
    failed++; results.push(['FAIL', name, e.message]); console.log('❌', name, '\n   ', e.message.split('\n')[0])
    try { await page.keyboard.press('Escape'); await page.keyboard.press('Escape') } catch { /* */ }
  }
}
function assert(c, msg) { if (!c) throw new Error(msg) }

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = new Date()
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
const monthsAgo = (m, plusDays = 0) => { const d = new Date(); d.setMonth(d.getMonth() - m); d.setDate(d.getDate() + plusDays); return iso(d) }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, locale: 'it-IT', colorScheme: 'light' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const tid = (id) => page.getByTestId(id)
const closeSheet = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(150) }
const shot = async (name) => {
  await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), null, { timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + name })
}
async function confirmDialog(ok = true) {
  await tid('confirm-dialog').waitFor()
  if (ok) await tid('confirm-ok').click()
  else await tid('confirm-dialog').getByRole('button', { name: 'Annulla' }).click()
  await page.waitForTimeout(150)
}
async function logIntervention({ typeLabel, cost, km, date, months, kmInterval, nextDate, notes, photo }) {
  await tid('fab').click()
  await tid('type-grid').getByRole('button', { name: typeLabel, exact: true }).click()
  if (cost !== undefined) await page.fill('#log-cost', String(cost))
  if (km !== undefined) await page.fill('#log-km', String(km))
  if (date) await page.fill('#log-date', date)
  if (months) await page.fill('#log-nm', String(months))
  if (kmInterval) await page.fill('#log-nk', String(kmInterval))
  if (nextDate) await page.fill('#log-nextdate', nextDate)
  if (notes) await page.fill('#log-notes', notes)
  if (photo) { await tid('log-photo-input').setInputFiles(photo); await page.getByAltText('Foto fattura').waitFor() }
  await tid('log-save').click()
  await tid('log-sheet').waitFor({ state: 'detached' })
}
async function setDeadline(type, fill) {
  await tid(`setup-${type}`).click()
  await tid('deadline-sheet').waitFor()
  for (const [sel, v] of Object.entries(fill)) await page.fill(sel, v)
  await tid('deadline-save').click()
  await tid('deadline-sheet').waitFor({ state: 'detached' })
}

// ---------- 1. Home / onboarding
await page.goto(FILE_URL)
await step('Schermata iniziale con logo, slogan e pulsante', async () => {
  await tid('slogan').waitFor()
  assert((await tid('slogan').innerText()).includes('La tua auto. Tutto sotto controllo.'), 'slogan mancante')
  assert(await tid('add-first-car').isVisible(), 'pulsante mancante')
  await shot('01-home-onboarding.png')
})

await step('Aggiungi veicolo: validazione campi obbligatori', async () => {
  await tid('add-first-car').click()
  await tid('vehicle-save').click()
  const alerts = await page.getByRole('alert').allInnerTexts()
  assert(alerts.length >= 3, 'attesi errori di validazione, trovati ' + alerts.length)
})

await step('Aggiungi veicolo (Fiat Panda) e apri dashboard', async () => {
  await page.fill('#v-name', 'Fiat Panda 1.2')
  await page.fill('#v-year', '2019')
  await page.selectOption('#v-fuel', 'benzina')
  await page.fill('#v-plate', 'test01')
  await page.fill('#v-km', '85000')
  await tid('vehicle-save').click()
  await tid('dashboard').waitFor()
  assert((await tid('vehicle-name').innerText()) === 'Fiat Panda 1.2', 'nome errato')
  assert((await tid('vehicle-km').innerText()).includes('85.000'), 'km errati')
  const body = await page.locator('body').innerText()
  assert(!body.includes('TEST01'), 'la targa è visibile in chiaro (dovrebbe essere mascherata)')
})

await step('Modifica rapida km + conferma se inferiori', async () => {
  await tid('km-button').click()
  await page.fill('#km-input', '86.500')
  await tid('km-save').click()
  await page.waitForTimeout(200)
  assert((await tid('vehicle-km').innerText()).includes('86.500'), 'km non aggiornati')
  await tid('km-button').click()
  await page.fill('#km-input', '80000')
  await tid('km-save').click()
  await confirmDialog(false)
  await closeSheet()
  assert((await tid('vehicle-km').innerText()).includes('86.500'), 'km cambiati nonostante annulla')
})

// ---------- 2. Scadenze
await step('Scadenza revisione tra 10 giorni → gialla', async () => {
  await setDeadline('revisione', { '#dl-fixed': daysFrom(10) })
  const dot = tid('tile-revisione').locator('[data-status]')
  assert((await dot.getAttribute('data-status')) === 'warning', 'stato atteso warning')
  assert((await tid('tile-revisione').innerText()).includes('10'), 'giorni mancanti non mostrati')
})
await step('Scadenza assicurazione superata → rossa', async () => {
  await setDeadline('assicurazione', { '#dl-fixed': daysFrom(-3) })
  assert((await tid('tile-assicurazione').locator('[data-status]').getAttribute('data-status')) === 'overdue', 'stato atteso overdue')
})
await step('Scadenza bollo tra 120 giorni → verde', async () => {
  await setDeadline('bollo', { '#dl-fixed': daysFrom(120) })
})
await step('Validazione scadenza senza dati', async () => {
  await tid('setup-tagliando').click()
  await tid('deadline-save').click()
  assert(await tid('form-error').isVisible(), 'errore atteso')
  await closeSheet()
})

// ---------- 3. Registra intervento
await step('Registra intervento in 2 tocchi (tagliando + intervallo utente 12 mesi / 15.000 km)', async () => {
  await tid('fab').click()
  await tid('type-grid').waitFor()
  await shot('03-registra-intervento-tipo.png')
  await tid('type-grid').getByRole('button', { name: 'Tagliando motore', exact: true }).click()
  assert((await page.inputValue('#log-date')) === iso(today), 'data odierna non proposta')
  assert((await page.inputValue('#log-km')) === '86500', 'km non precompilati')
  await page.fill('#log-cost', '189,90')
  await page.fill('#log-nm', '12')
  await page.fill('#log-nk', '15000')
  assert((await tid('next-preview').innerText()).includes('101.500 km'), 'anteprima prossima scadenza errata')
  await shot('04-registra-intervento-form.png')
  await tid('log-save').click()
  await tid('log-sheet').waitFor({ state: 'detached' })
  await tid('toast').first().waitFor()
})
await step('Cambio olio di ~11 mesi fa con intervallo 12 mesi → giallo', async () => {
  await logIntervention({ typeLabel: 'Cambio olio', cost: '75', km: '78000', date: monthsAgo(11, -20), months: 12, kmInterval: 15000 })
  const st = await tid('alert-row').filter({ hasText: 'Cambio olio' }).getAttribute('data-status')
  assert(st === 'warning', 'stato olio atteso warning, trovato ' + st)
})
await step('Pneumatici (10/04/2026) con foto fattura', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYAAAvIAP9n0n9MQAAAABJRU5ErkJggg==', 'base64')
  await logIntervention({ typeLabel: 'Pneumatici', cost: '420', km: '82000', date: '2026-04-10', notes: 'Gomme invernali', photo: { name: 'fattura.png', mimeType: 'image/png', buffer: png } })
})
await step('Intervento personalizzato senza intervallo + validazione nome', async () => {
  await tid('fab').click()
  await tid('type-grid').getByRole('button', { name: 'Personalizzata', exact: true }).click()
  await tid('log-save').click()
  assert(await tid('form-error').isVisible(), 'errore nome mancante atteso')
  await page.fill('#log-label', 'Lavaggio interni')
  await page.fill('#log-cost', '25')
  await tid('log-save').click()
  await tid('log-sheet').waitFor({ state: 'detached' })
})
await step('Errore su data futura', async () => {
  await tid('fab').click()
  await tid('type-grid').getByRole('button', { name: 'Freni', exact: true }).click()
  await page.fill('#log-date', daysFrom(5))
  await tid('log-save').click()
  assert((await tid('form-error').innerText()).includes('futuro'), 'errore data futura atteso')
  await closeSheet()
})

// ---------- 4. Avvisi
await step('Dashboard: avvisi rossi e gialli + promemoria in-app', async () => {
  await page.goto(FILE_URL + '#/')
  await tid('dashboard').waitFor()
  const statuses = await tid('urgent-alerts').locator('[data-testid="alert-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
  assert(statuses.includes('overdue') && statuses.includes('warning'), 'attesi rosso e giallo, trovati ' + statuses.join(','))
  assert(statuses[0] === 'overdue', 'gli scaduti devono essere in cima')
  const badge = Number(await tid('bell-badge').innerText())
  assert(badge >= 3, 'badge promemoria atteso >= 3, trovato ' + badge)
  assert(await tid('reminder-banner').isVisible(), 'banner promemoria mancante')
})
await step('Centro promemoria: apri e segna come letto', async () => {
  await tid('bell').click()
  await tid('notifications-sheet').waitFor()
  const n = await tid('notification-item').count()
  assert(n >= 3, 'promemoria attesi')
  await page.getByRole('button', { name: 'Segna tutti come letti' }).click()
  await closeSheet()
  assert(!(await tid('bell-badge').count()), 'badge dovrebbe sparire')
})

// ---------- 5. Spese
await step('Aggiungi spese (carburante, altre) e controlla totali', async () => {
  await tid('nav-spese').click()
  await tid('expenses').waitFor()
  const add = async (cat, amount, date, desc) => {
    await tid('add-expense').click()
    await tid('expense-sheet').getByRole('radio', { name: cat }).click()
    await page.fill('#exp-amount', amount)
    await page.fill('#exp-date', date)
    if (desc) await page.fill('#exp-desc', desc)
    await tid('expense-save').click()
    await tid('expense-sheet').waitFor({ state: 'detached' })
  }
  await tid('add-expense').click()
  await tid('expense-save').click()
  assert(await tid('form-error').isVisible(), 'errore importo atteso')
  await closeSheet()
  await add('Carburante', '65,50', iso(today), 'Pieno')
  await add('Carburante', '58', '2026-09-14', 'Pieno')
  await add('Carburante', '61,20', '2026-07-03', 'Pieno')
  await add('Altre spese', '12', '2026-08-20', 'Autolavaggio')
  await add('Assicurazione', '480', '2026-02-15', 'RCA annuale')
  const year = await tid('year-total').innerText()
  // 189,90 + 75(se nell'anno) + 420 + 25 + 65,5 + 58 + 61,2 + 12 + 480
  const oil = monthsAgo(11, -20).startsWith(String(today.getFullYear())) ? 75 : 0
  const expected = (189.9 + oil + 420 + 25 + 65.5 + 58 + 61.2 + 12 + 480).toFixed(2).replace('.', ',')
  assert(year.replace(/\./g, '').includes(expected), `totale annuo ${year}, atteso ${expected}`)
  const month = await tid('month-total').innerText()
  assert(month.includes('280,40'), 'totale mese atteso 280,40 (189,90+65,50+25), trovato ' + month)
  assert(await tid('expense-chart').locator('rect').count() > 12, 'grafico mancante')
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('05-spese-grafico.png')
})
let csvText = ''
await step('Esporta CSV', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), tid('export-csv').click()])
  csvText = readFileSync(await dl.path(), 'utf8')
  assert(dl.suggestedFilename().endsWith('.csv'), 'nome file')
  assert(csvText.includes('Data;Veicolo;Categoria;Descrizione;Importo (EUR);Origine'), 'intestazione CSV')
  assert(csvText.includes('189,90') && csvText.includes('Carburante'), 'righe CSV')
  assert(!csvText.includes('TEST01'), 'la targa non deve essere nel CSV')
})
await step('Modifica e elimina spesa (con conferma)', async () => {
  await tid('expense-item').filter({ hasText: 'Pieno' }).first().click()
  await page.fill('#exp-amount', '70')
  await tid('expense-save').click()
  await tid('expense-sheet').waitFor({ state: 'detached' })
  assert((await tid('month-total').innerText()).includes('284,90'), 'modifica spesa non applicata')
  await tid('expense-item').filter({ hasText: 'Pieno' }).first().click()
  await tid('expense-delete').click()
  await confirmDialog(true)
  assert((await tid('month-total').innerText()).includes('214,90'), 'eliminazione spesa non applicata')
})

// ---------- 6. Storico
await step('Storico: elenco, ricerca, allegato', async () => {
  await page.goto(FILE_URL + '#/storico')
  await tid('history-list').waitFor()
  assert((await tid('history-item').count()) === 4, 'attesi 4 interventi')
  await page.getByPlaceholder('Cerca negli interventi').fill('invernali')
  assert((await tid('history-item').count()) === 1, 'ricerca non funziona')
  await tid('history-item').first().click()
  await page.getByAltText('Foto fattura').waitFor()
  await closeSheet()
})

// ---------- 7. Assistente
await step('Chiedi ad AutoMemo: risposte dai dati salvati', async () => {
  await tid('nav-chiedi').click()
  await tid('assistant').waitFor()
  const askQ = async (q) => {
    const before = await tid('bot-msg').count()
    await tid('assistant-input').fill(q)
    await tid('assistant-input').press('Enter')
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="bot-msg"]').length > n, before)
    return (await tid('bot-msg').last().innerText())
  }
  const a1 = await askQ('Quando devo cambiare l’olio?')
  assert(/prevista/.test(a1) && /km/.test(a1), 'risposta olio: ' + a1)
  const a2 = await askQ('Quanto ho speso quest’anno?')
  assert(/Hai speso/.test(a2), 'risposta spese: ' + a2)
  const a3 = await askQ('Quando ho cambiato le gomme?')
  assert(/10 aprile 2026/.test(a3), 'risposta gomme: ' + a3)
  const a4 = await askQ('Qual è il prossimo intervento?')
  assert(/prossimo intervento/i.test(a4), 'risposta prossimo: ' + a4)
  const a5 = await askQ('Sento un rumore strano dai freni, cosa ha la macchina?')
  assert(/diagnosi/.test(a5), 'deve rifiutare diagnosi: ' + a5)
  const a6 = await askQ('Quando devo cambiare la distribuzione?')
  assert(/Non hai ancora impostato/.test(a6) && /costruttore|libretto/.test(a6), 'non deve inventare intervalli: ' + a6)
  const a7 = await askQ('Ho scadenze superate?')
  assert(/Assicurazione/.test(a7), 'scadenze urgenti: ' + a7)
  console.log('   Esempi risposte:\n   - ' + [a1, a2, a3, a4].map((s) => s.replace(/\n/g, ' ')).join('\n   - '))
})
await step('Chiedi ad AutoMemo: suggerimenti cliccabili + screenshot', async () => {
  await page.goto(FILE_URL + '#/chiedi')
  await tid('assistant').waitFor()
  await tid('suggestion').nth(3).click()
  await page.waitForTimeout(200)
  await tid('suggestion').nth(1).click()
  await page.waitForTimeout(300)
  await shot('06-chiedi-ad-automemo.png')
})

// ---------- 8. Dashboard screenshot (light)
await step('Screenshot dashboard con dati e avvisi', async () => {
  await page.goto(FILE_URL + '#/')
  await tid('dashboard').waitFor()
  await shot('02-dashboard-avvisi.png')
  await page.goto(FILE_URL + '#/scadenze')
  await tid('deadline-list').waitFor()
  await shot('08-scadenze.png')
})

// ---------- 9. Backup JSON
let backupPath = ''
await step('Esporta backup JSON (con foto)', async () => {
  await page.goto(FILE_URL + '#/impostazioni')
  await tid('settings').waitFor()
  const [dl] = await Promise.all([page.waitForEvent('download'), tid('export-json').click()])
  backupPath = await dl.path()
  const json = JSON.parse(readFileSync(backupPath, 'utf8'))
  assert(json.format === 'automemo-backup' && json.data.vehicles.length === 1, 'backup non valido')
  assert(json.data.records.length === 4 && json.data.deadlines.length === 5, `contenuto backup: ${json.data.records.length} rec, ${json.data.deadlines.length} scad`)
  assert(Object.keys(json.files).length === 1, 'foto non inclusa')
})

// ---------- 10. Persistenza
await step('Persistenza dopo ricaricamento', async () => {
  await page.goto(FILE_URL + '#/')
  await page.reload()
  await tid('dashboard').waitFor()
  assert((await tid('vehicle-km').innerText()).includes('86.500'), 'km non persistiti')
  assert((await tid('alert-row').count()) >= 2, 'avvisi non persistiti')
})

// ---------- 11. Modifica veicolo, più veicoli, eliminazione
await step('Modifica veicolo', async () => {
  await page.goto(FILE_URL + '#/impostazioni')
  await tid('edit-vehicle').first().click()
  await page.fill('#v-name', 'Fiat Panda 1.2 Lounge')
  await tid('vehicle-save').click()
  await tid('settings').waitFor()
  assert((await tid('vehicle-row').first().innerText()).includes('Lounge'), 'nome non aggiornato')
})
await step('Aggiungi secondo veicolo e poi eliminalo (annulla + conferma)', async () => {
  await tid('add-vehicle').click()
  await page.fill('#v-name', 'Tesla Model 3')
  await page.fill('#v-year', '2023')
  await page.selectOption('#v-fuel', 'elettrica')
  await page.fill('#v-km', '12000')
  await tid('vehicle-save').click()
  await tid('dashboard').waitFor()
  assert((await tid('vehicle-name').innerText()) === 'Tesla Model 3', 'secondo veicolo non attivo')
  await page.goto(FILE_URL + '#/impostazioni')
  assert((await tid('vehicle-row').count()) === 2, 'attesi 2 veicoli')
  await tid('edit-vehicle').nth(1).click()
  await tid('vehicle-delete').click()
  await confirmDialog(false)
  assert(await tid('vehicle-form').isVisible(), 'annulla non deve eliminare')
  await tid('vehicle-delete').click()
  await confirmDialog(true)
  await tid('settings').waitFor()
  assert((await tid('vehicle-row').count()) === 1, 'veicolo non eliminato')
})

// ---------- 12. Elimina intervento
await step('Elimina intervento dallo storico (con conferma)', async () => {
  await page.goto(FILE_URL + '#/storico')
  await tid('history-item').filter({ hasText: 'Lavaggio interni' }).click()
  await tid('log-delete').click()
  await confirmDialog(true)
  assert((await tid('history-item').count()) === 3, 'intervento non eliminato')
})

// ---------- 13. Modalità scura
await step('Modalità scura', async () => {
  await page.goto(FILE_URL + '#/impostazioni')
  await page.getByRole('tab', { name: 'Scuro' }).click()
  assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'classe dark mancante')
  await page.goto(FILE_URL + '#/')
  await page.reload()
  await tid('dashboard').waitFor()
  assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'tema scuro non persistito')
  await shot('07-dark-mode-dashboard.png')
  await page.goto(FILE_URL + '#/spese')
  await tid('expenses').waitFor()
  await shot('09-dark-mode-spese.png')
})
await step('Piani Free/Pro senza pagamenti', async () => {
  await page.goto(FILE_URL + '#/impostazioni')
  await tid('open-plans').click()
  await tid('plans').waitFor()
  const t = await tid('plans').innerText()
  assert(t.includes('AutoMemo Free') && t.includes('AutoMemo Pro') && t.includes('In arrivo'), 'piani')
  assert(!(await tid('plans').getByRole('button', { name: /acquista|abbonati|paga/i }).count()), 'non devono esserci pulsanti di pagamento')
  await shot('10-piani.png')
  await page.getByRole('tab', { name: 'Chiaro' }).count()
})

// ---------- 14. Import
await step('Import backup non valido → errore comprensibile', async () => {
  await page.goto(FILE_URL + '#/impostazioni')
  await tid('import-json').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"ciao":1}') })
  await page.getByText('Questo file non è un backup di AutoMemo.').waitFor()
})
await step('Cancella tutti i dati e ripristina dal backup', async () => {
  await tid('wipe').click()
  await confirmDialog(true)
  await tid('add-first-car').waitFor()
  await tid('welcome-import').setInputFiles(backupPath)
  await tid('dashboard').waitFor()
  assert((await tid('vehicle-name').innerText()) === 'Fiat Panda 1.2', 'dati non ripristinati')
  await page.goto(FILE_URL + '#/storico')
  assert((await tid('history-item').count()) === 4, 'storico non ripristinato')
  await tid('history-item').filter({ hasText: 'invernali' }).click()
  await page.getByAltText('Foto fattura').waitFor()
  await closeSheet()
  await page.reload()
  await tid('history-list').waitFor()
  assert((await tid('history-item').count()) === 4, 'ripristino non persistito')
})

await step('Nessun errore JavaScript in console', async () => {
  assert(errors.length === 0, errors.join(' | '))
})
await ctx.close()

// ---------- 15. PWA (build https-like su localhost)
await step('PWA: manifest e service worker registrati (vite preview su localhost)', async () => {
  const srv = spawn('npx', ['vite', 'preview', '--port', '4319', '--strictPort'], { cwd: root, stdio: 'pipe' })
  try {
    await new Promise((r) => setTimeout(r, 2500))
    const c = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const p = await c.newPage()
    await p.goto('http://localhost:4319/')
    await p.getByTestId('add-first-car').waitFor()
    const swOk = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active })
    assert(swOk, 'service worker non attivo')
    const man = await p.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json())
    assert(man.name === 'AutoMemo' && man.icons.length >= 2, 'manifest non valido')
    // offline
    await p.reload(); await p.waitForTimeout(500)
    await c.setOffline(true)
    await p.reload()
    await p.getByTestId('add-first-car').waitFor({ timeout: 5000 })
    await c.close()
  } finally { srv.kill() }
})

await browser.close()
writeFileSync(root + 'tests/e2e-results.txt', results.map((r) => r.join(' | ')).join('\n') + `\n\n${results.length - failed}/${results.length} superati\n`)
console.log(`\n${results.length - failed}/${results.length} test superati`)
process.exit(failed ? 1 : 0)
