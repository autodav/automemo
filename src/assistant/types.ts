import type { AppData, Vehicle } from '../types'

export interface AssistantContext {
  data: AppData
  vehicle?: Vehicle
  today: string
}

export interface AssistantAnswer {
  text: string
  /** azioni suggerite (es. navigare in una sezione) */
  actions?: { label: string; route?: string; intent?: 'log' | 'deadline' }[]
  /** quale provider ha risposto */
  provider: string
}

/**
 * Interfaccia per i "cervelli" dell'assistente.
 * Oggi: RuleBasedProvider (locale, gratuito, deterministico).
 * Domani: un provider basato su un modello AI può implementare la stessa interfaccia
 * ricevendo come contesto SOLO i dati salvati nell'app (vedi buildContextSummary).
 */
export interface AssistantProvider {
  id: string
  name: string
  isAvailable(): boolean
  answer(question: string, ctx: AssistantContext): Promise<AssistantAnswer>
}
