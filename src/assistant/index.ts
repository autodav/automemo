import type { AssistantContext, AssistantProvider } from './types'
import { RuleBasedProvider } from './ruleProvider'

export type { AssistantProvider, AssistantAnswer, AssistantContext } from './types'

/**
 * Registro dei provider. Per aggiungere un modello AI in futuro:
 * 1. creare una classe che implementa AssistantProvider (es. AiProvider con chiamata a un backend proprio);
 * 2. passarle come contesto solo i dati dell'utente (buildContextSummary), mai inventare dati tecnici;
 * 3. registrarla qui in testa alla lista: verrà usata se isAvailable() è true, altrimenti si ricade sulle regole locali.
 */
const providers: AssistantProvider[] = [new RuleBasedProvider()]

export function getProvider(): AssistantProvider {
  return providers.find((p) => p.isAvailable()) ?? providers[providers.length - 1]
}

export async function ask(question: string, ctx: AssistantContext) {
  return getProvider().answer(question, ctx)
}

/** Riassunto testuale dei dati locali, pronto da passare come contesto a un futuro modello AI. Non include la targa. */
export function buildContextSummary(ctx: AssistantContext): string {
  const v = ctx.vehicle
  if (!v) return 'Nessun veicolo.'
  const recs = ctx.data.records.filter((r) => r.vehicleId === v.id)
  return JSON.stringify({ veicolo: { nome: v.name, anno: v.year, alimentazione: v.fuel, km: v.km }, interventi: recs.map(({ type, customLabel, date, km, cost }) => ({ type, customLabel, date, km, cost })), oggi: ctx.today })
}
