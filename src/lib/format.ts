const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('it-IT')

export const formatEuro = (n: number) => eur.format(n || 0)
export const formatKm = (n?: number) => (n === undefined || n === null || Number.isNaN(n) ? '—' : `${num.format(Math.round(n))} km`)
export const formatNumber = (n: number) => num.format(n)

/** Accetta "1.234,50", "1234.5", "1234,5" */
export function parseAmount(input: string): number | undefined {
  const s = input.trim().replace(/\s|€/g, '')
  if (!s) return undefined
  let normalized = s
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

export function parseKm(input: string): number | undefined {
  const s = input.trim().replace(/[\s.']/g, '').replace(/km$/i, '')
  if (!s) return undefined
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : NaN
}

export function maskPlate(plate: string): string {
  const p = plate.replace(/\s/g, '').toUpperCase()
  if (p.length <= 4) return '••••'
  return p.slice(0, 2) + '•'.repeat(p.length - 4) + p.slice(-2)
}
