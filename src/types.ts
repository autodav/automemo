export type Fuel = 'benzina' | 'diesel' | 'gpl' | 'metano' | 'ibrida' | 'ibrida_plugin' | 'elettrica' | 'altro'

export type InterventionType =
  | 'tagliando'
  | 'olio'
  | 'filtri'
  | 'distribuzione'
  | 'olio_cambio'
  | 'pneumatici'
  | 'revisione'
  | 'assicurazione'
  | 'bollo'
  | 'batteria'
  | 'freni'
  | 'personalizzata'

export type ExpenseCategory = 'manutenzione' | 'assicurazione' | 'bollo' | 'carburante' | 'pneumatici' | 'altro'

export type ReminderDay = 30 | 15 | 7 | 1

export interface Vehicle {
  id: string
  name: string // marca e modello
  year: number
  fuel: Fuel
  plate?: string
  km: number
  kmUpdatedAt: string // ISO date
  createdAt: string
}

/** Intervento effettuato (storico) */
export interface ServiceRecord {
  id: string
  vehicleId: string
  type: InterventionType
  customLabel?: string
  date: string // YYYY-MM-DD
  km?: number
  cost?: number
  notes?: string
  attachmentId?: string
  createdAt: string
}

/** Scadenza / promemoria impostato dall'utente */
export interface Deadline {
  id: string
  vehicleId: string
  type: InterventionType
  customLabel?: string
  /** Ultima esecuzione nota (base per il calcolo) */
  lastDate?: string
  lastKm?: number
  /** Intervalli impostati dall'utente (mai predefiniti dall'app) */
  intervalMonths?: number
  intervalKm?: number
  /** Scadenza precisa impostata manualmente (prevale sull'intervallo in mesi) */
  fixedDate?: string
  fixedKm?: number
  reminderDays: ReminderDay[]
  notes?: string
  createdAt: string
}

export interface Expense {
  id: string
  vehicleId: string
  category: ExpenseCategory
  date: string
  amount: number
  description?: string
  createdAt: string
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  kmWarning: number
  activeVehicleId?: string
  dismissedReminders: string[]
  hidePlate: boolean
  storageNoticeSeen: boolean
}

export interface AppData {
  version: 1
  vehicles: Vehicle[]
  records: ServiceRecord[]
  deadlines: Deadline[]
  expenses: Expense[]
  settings: Settings
}
