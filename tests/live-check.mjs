// Verifica del sito pubblicato: node tests/live-check.mjs [url]
import { chromium } from 'playwright'
const URL_ = process.argv[2] || 'https://autodav.github.io/automemo/'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
// profilo persistente (non incognito), necessario per il controllo di installabilità
const ctx = await chromium.launchPersistentContext(mkdtempSync(tmpdir() + '/automemo-'), { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'it-IT' })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
p.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`))
const ok = (c, m) => { console.log(c ? '✅' : '❌', m); if (!c) process.exitCode = 1 }
await p.goto(URL_)
await p.getByTestId('add-first-car').waitFor()
ok(true, 'App caricata')
await p.getByTestId('add-first-car').click()
await p.fill('#v-name', 'Volkswagen Golf'); await p.fill('#v-year', '2020'); await p.fill('#v-km', '42000')
await p.getByTestId('vehicle-save').click()
await p.getByTestId('dashboard').waitFor()
await p.reload()
await p.getByTestId('dashboard').waitFor()
ok((await p.getByTestId('vehicle-name').innerText()) === 'Volkswagen Golf', 'Veicolo persistito dopo reload')
const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active, script: r.active?.scriptURL } })
ok(sw.active && sw.scope.endsWith('/automemo/'), 'Service worker attivo: ' + JSON.stringify(sw))
const man = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); const j = await r.json(); const icons = await Promise.all(j.icons.map(async (i) => (await fetch(new URL(i.src, l.href))).status)); return { href: l.href, start: new URL(j.start_url, l.href).href, scope: new URL(j.scope, l.href).href, display: j.display, icons } })
ok(man.start.endsWith('/automemo/') && man.scope.endsWith('/automemo/') && man.icons.every((s) => s === 200) && man.display === 'standalone', 'Manifest valido: ' + JSON.stringify(man))
const cdp = await ctx.newCDPSession(p)
const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ err: e.message }))
ok(inst.installabilityErrors && inst.installabilityErrors.length === 0, 'Installabilità (Chrome): ' + JSON.stringify(inst))
await ctx.setOffline(true); await p.reload(); await p.getByTestId('dashboard').waitFor({ timeout: 8000 }); await ctx.setOffline(false)
ok(true, 'Funziona offline dopo il primo caricamento')
await p.screenshot({ path: new URL('../screenshots/live.png', import.meta.url).pathname })
ok(errors.length === 0, 'Nessun errore console/rete' + (errors.length ? ': ' + errors.join(' | ') : ''))
await ctx.close()
