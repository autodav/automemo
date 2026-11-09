import type { ExpenseCategory, Fuel, InterventionType, ReminderDay } from '../types'

export const FUELS: { value: Fuel; label: string }[] = [
  { value: 'benzina', label: 'Benzina' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'gpl', label: 'GPL' },
  { value: 'metano', label: 'Metano' },
  { value: 'ibrida', label: 'Ibrida' },
  { value: 'ibrida_plugin', label: 'Ibrida plug-in' },
  { value: 'elettrica', label: 'Elettrica' },
  { value: 'altro', label: 'Altro' },
]

export interface TypeMeta {
  label: string
  short: string
  /** scadenza tipicamente legata alla data (amministrativa) */
  admin: boolean
  expenseCategory: ExpenseCategory
}

export const INTERVENTION_TYPES: Record<InterventionType, TypeMeta> = {
  tagliando: { label: 'Tagliando motore', short: 'Tagliando', admin: false, expenseCategory: 'manutenzione' },
  olio: { label: 'Cambio olio', short: 'Olio', admin: false, expenseCategory: 'manutenzione' },
  filtri: { label: 'Filtri', short: 'Filtri', admin: false, expenseCategory: 'manutenzione' },
  distribuzione: { label: 'Distribuzione', short: 'Distribuzione', admin: false, expenseCategory: 'manutenzione' },
  olio_cambio: { label: 'Olio cambio automatico', short: 'Olio cambio', admin: false, expenseCategory: 'manutenzione' },
  pneumatici: { label: 'Pneumatici', short: 'Gomme', admin: false, expenseCategory: 'pneumatici' },
  revisione: { label: 'Revisione', short: 'Revisione', admin: true, expenseCategory: 'manutenzione' },
  assicurazione: { label: 'Assicurazione', short: 'Assicurazione', admin: true, expenseCategory: 'assicurazione' },
  bollo: { label: 'Bollo', short: 'Bollo', admin: true, expenseCategory: 'bollo' },
  batteria: { label: 'Batteria', short: 'Batteria', admin: false, expenseCategory: 'manutenzione' },
  freni: { label: 'Freni', short: 'Freni', admin: false, expenseCategory: 'manutenzione' },
  personalizzata: { label: 'Personalizzata', short: 'Altro', admin: false, expenseCategory: 'manutenzione' },
}

export const TYPE_ORDER: InterventionType[] = [
  'tagliando', 'olio', 'filtri', 'distribuzione', 'olio_cambio', 'pneumatici',
  'revisione', 'assicurazione', 'bollo', 'batteria', 'freni', 'personalizzata',
]

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'manutenzione', label: 'Manutenzione', color: '#2F7BFF' },
  { value: 'assicurazione', label: 'Assicurazione', color: '#22D3EE' },
  { value: 'bollo', label: 'Bollo', color: '#A78BFA' },
  { value: 'carburante', label: 'Carburante', color: '#F59E0B' },
  { value: 'pneumatici', label: 'Pneumatici', color: '#10B981' },
  { value: 'altro', label: 'Altre spese', color: '#94A3B8' },
]

export const REMINDER_OPTIONS: ReminderDay[] = [30, 15, 7, 1]

export const MANUFACTURER_NOTE =
  'AutoMemo non applica intervalli standard: inserisci quelli indicati dal costruttore nel libretto di uso e manutenzione o dalla tua officina.'

export const REVISIONE_HINT =
  'In Italia, per le autovetture, la prima revisione è di norma entro 4 anni dalla prima immatricolazione, poi ogni 2 anni. Verifica sempre la data sulla carta di circolazione o sul Portale dell\u2019Automobilista.'
