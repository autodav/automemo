// Genera le icone PNG della PWA a partire dal logo SVG (usa Chrome headless via Playwright).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' })
const page = await browser.newPage()
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, round: true },
  { file: 'icon-512.png', size: 512, pad: 0, round: true },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, round: false },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.16, round: false },
]
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  const inner = Math.round(t.size * (1 - t.pad * 2))
  const svgSized = svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace(t.round ? '' : 'rx="18"', t.round ? '' : 'rx="0"')
  await page.setContent(`<html><body style="margin:0;background:${t.round ? 'transparent' : '#0A1430'};display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">${svgSized}</body></html>`)
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: t.round })
}
await browser.close()
console.log('Icone generate')
