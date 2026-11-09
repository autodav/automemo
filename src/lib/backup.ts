import type { AppData, Deadline, Expense, ServiceRecord, Settings, Vehicle } from '../types'
import { REMINDER_OPTIONS, TYPE_ORDER, EXPENSE_CATEGORIES, FUELS } from './constants'
import { isValidISODate } from './dates'

export const BACKUP_FORMAT = 'automemo-backup'

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: string
  data: AppData
  files: Record<string, string>
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  kmWarning: 1000,
  dismissedReminders: [],
  hidePlate: true,
  storageNoticeSeen: false,
}

export function emptyData(): AppData {
  return { version: 1, vehicles: [], records: [], deadlines: [], expenses: [], settings: { ...DEFAULT_SETTINGS } }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const optNum = (v: unknown) => v === undefined || v === null || isNum(v)
const optStr = (v: unknown) => v === undefined || v === null || isStr(v)
const types = new Set<string>(TYPE_ORDER)
const cats = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.value))
const fuels = new Set<string>(FUELS.map((f) => f.value))

export class BackupError extends Error {}

function check(cond: boolean, msg: string) {
  if (!cond) throw new BackupError(msg)
}

/** Valida un backup e lo normalizza. Lancia BackupError con un messaggio comprensibile. */
export function parseBackup(text: string): BackupFile {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError('Il file non è un JSON valido.')
  }
  check(isObj(json), 'Formato del file non riconosciuto.')
  const root = json as Record<string, unknown>
  check(root.format === BACKUP_FORMAT, 'Questo file non è un backup di AutoMemo.')
  check(root.version === 1, 'Versione del backup non supportata.')
  check(isObj(root.data), 'Il backup non contiene dati.')
  const d = root.data as Record<string, unknown>
  for (const k of ['vehicles', 'records', 'deadlines', 'expenses']) check(Array.isArray(d[k]), `Sezione "${k}" mancante o non valida.`)

  const vehicles = d.vehicles as Vehicle[]
  vehicles.forEach((v, i) => {
    check(isObj(v) && isStr(v.id) && isStr(v.name) && isNum(v.year) && isNum(v.km) && fuels.has(v.fuel) && optStr(v.plate), `Veicolo n. ${i + 1} non valido.`)
  })
  const ids = new Set(vehicles.map((v) => v.id))
  const records = d.records as ServiceRecord[]
  records.forEach((r, i) => {
    check(isObj(r) && isStr(r.id) && ids.has(r.vehicleId) && types.has(r.type) && isValidISODate(r.date) && optNum(r.km) && optNum(r.cost), `Intervento n. ${i + 1} non valido.`)
  })
  const deadlines = d.deadlines as Deadline[]
  deadlines.forEach((x, i) => {
    check(isObj(x) && isStr(x.id) && ids.has(x.vehicleId) && types.has(x.type) && Array.isArray(x.reminderDays), `Scadenza n. ${i + 1} non valida.`)
    check((!x.lastDate || isValidISODate(x.lastDate)) && (!x.fixedDate || isValidISODate(x.fixedDate)), `Data non valida nella scadenza n. ${i + 1}.`)
    check(optNum(x.intervalKm) && optNum(x.intervalMonths) && optNum(x.lastKm) && optNum(x.fixedKm), `Valori non validi nella scadenza n. ${i + 1}.`)
    x.reminderDays = x.reminderDays.filter((r) => (REMINDER_OPTIONS as number[]).includes(r))
  })
  const expenses = d.expenses as Expense[]
  expenses.forEach((e, i) => {
    check(isObj(e) && isStr(e.id) && ids.has(e.vehicleId) && cats.has(e.category) && isValidISODate(e.date) && isNum(e.amount), `Spesa n. ${i + 1} non valida.`)
  })
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(isObj(d.settings) ? (d.settings as Partial<Settings>) : {}) }
  if (settings.activeVehicleId && !ids.has(settings.activeVehicleId)) settings.activeVehicleId = vehicles[0]?.id
  if (!Array.isArray(settings.dismissedReminders)) settings.dismissedReminders = []

  const files: Record<string, string> = {}
  if (isObj(root.files)) {
    for (const [k, v] of Object.entries(root.files)) if (isStr(v) && v.startsWith('data:image/')) files[k] = v
  }
  return {
    format: BACKUP_FORMAT, version: 1, exportedAt: isStr(root.exportedAt) ? root.exportedAt : '',
    data: { version: 1, vehicles, records, deadlines, expenses, settings }, files,
  }
}
