import { BatteryCharging, ClipboardCheck, Cog, Disc3, Droplet, Filter, Landmark, PenLine, Settings2, ShieldCheck, Wrench, CircleDot, Fuel, Receipt, type LucideIcon } from 'lucide-react'
import type { ExpenseCategory, InterventionType } from '../types'

export const TYPE_ICONS: Record<InterventionType, LucideIcon> = {
  tagliando: Wrench,
  olio: Droplet,
  filtri: Filter,
  distribuzione: Cog,
  olio_cambio: Settings2,
  pneumatici: CircleDot,
  revisione: ClipboardCheck,
  assicurazione: ShieldCheck,
  bollo: Landmark,
  batteria: BatteryCharging,
  freni: Disc3,
  personalizzata: PenLine,
}

export const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  manutenzione: Wrench,
  assicurazione: ShieldCheck,
  bollo: Landmark,
  carburante: Fuel,
  pneumatici: CircleDot,
  altro: Receipt,
}

export function TypeIcon({ type, size = 20, className }: { type: InterventionType; size?: number; className?: string }) {
  const I = TYPE_ICONS[type]
  return <I size={size} className={className} />
}
