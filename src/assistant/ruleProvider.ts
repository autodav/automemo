import type { InterventionType } from '../types'
import type { AssistantAnswer, AssistantContext, AssistantProvider } from './types'
import { vehicleDeadlines, deadlineLabel, type DeadlineInfo } from '../lib/deadlines'
import { allExpenses, sumBy } from '../lib/expenses'
import { EXPENSE_CATEGORIES, INTERVENTION_TYPES } from '../lib/constants'
import { formatDateLong, monthName, relativeDays, daysBetween } from '../lib/dates'
import { formatEuro, formatKm } from '../lib/format'

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9€\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const TYPE_KEYWORDS: [InterventionType, RegExp][] = [
  ['olio_cambio', /olio (del )?cambio|cambio automatico|olio atf|\batf\b/],
  ['tagliando', /tagliando|tagliandi/],
  ['olio', /\bolio\b/],
  ['filtri', /filtr/],
  ['distribuzione', /distribuzione|cinghia/],
  ['pneumatici', /gomm|pneumatic|ruot|invernal|estiv/],
  ['revisione', /revision/],
  ['assicurazione', /assicura|rca|polizza/],
  ['bollo', /bollo/],
  ['batteria', /batteri/],
  ['freni', /fren|pastiglie|dischi/],
]

function detectType(q: string): InterventionType | undefined {
  for (const [t, re] of TYPE_KEYWORDS) if (re.test(q)) return t
  return undefined
}

const DIAGNOSIS = /(rumor|spia|perde|perdita|fumo|vibra|guasto|non parte|si spegne|strano|cigol|surriscald|diagnos|cosa ha|problema|danno|odore)/

function describeDue(i: DeadlineInfo): string {
  const parts: string[] = []
  if (i.dueDate !== undefined && i.daysLeft !== undefined) {
    parts.push(i.daysLeft < 0 ? `era prevista il ${formatDateLong(i.dueDate)} (${relativeDays(i.daysLeft)})` : `è prevista il ${formatDateLong(i.dueDate)} (${relativeDays(i.daysLeft)})`)
  }
  if (i.dueKm !== undefined && i.kmLeft !== undefined) {
    parts.push(i.kmLeft < 0 ? `a ${formatKm(i.dueKm)} (superata di ${formatKm(-i.kmLeft)})` : `a ${formatKm(i.dueKm)} (mancano ${formatKm(i.kmLeft)})`)
  }
  return parts.join(' oppure ')
}

export class RuleBasedProvider implements AssistantProvider {
  id = 'rules'
  name = 'AutoMemo (regole locali)'
  isAvailable() { return true }

  async answer(question: string, ctx: AssistantContext): Promise<AssistantAnswer> {
    return { ...this.respond(question, ctx), provider: this.id }
  }

  private respond(question: string, ctx: AssistantContext): Omit<AssistantAnswer, 'provider'> {
    const q = normalize(question)
    const v = ctx.vehicle
    if (!q) return { text: 'Scrivi una domanda, ad esempio “Qual è il prossimo intervento?”.' }
    if (!v) return { text: 'Non hai ancora aggiunto un veicolo. Aggiungi la tua auto e potrò rispondere usando i tuoi dati.', actions: [{ label: 'Aggiungi auto', route: '/veicolo/nuovo' }] }

    if (/^(ciao|salve|buongiorno|buonasera|hey)\b/.test(q) && q.split(' ').length <= 3) {
      return { text: `Ciao! Sono l’assistente di AutoMemo. Posso dirti scadenze, spese e storico della tua ${v.name}. Prova uno dei suggerimenti qui sotto.` }
    }
    if (/aiuto|cosa (sai|puoi) fare|come funzion/.test(q)) return { text: this.help() }

    if (DIAGNOSIS.test(q) && !/quando|quanto/.test(q)) {
      return { text: 'Non posso fare diagnosi meccaniche né valutare guasti: le mie risposte si basano solo sui dati che hai salvato. Per un problema all’auto rivolgiti a un’officina qualificata o al servizio assistenza del costruttore.' }
    }

    const records = ctx.data.records.filter((r) => r.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1))
    const infos = vehicleDeadlines(ctx.data, v.id)
    const type = detectType(q)

    // Chilometri
    if (/quanti (km|chilometri)|chilometraggio|km attuali|quanti chilometri/.test(q) && !type) {
      return { text: `L’ultimo chilometraggio registrato per la ${v.name} è ${formatKm(v.km)} (aggiornato il ${formatDateLong(v.kmUpdatedAt)}).` }
    }

    // Spese
    if (/quanto (ho )?(speso|spes|pagato|costato|costa)|spese|spesa|totale|costi/.test(q)) {
      return this.spending(q, ctx, type)
    }

    // Scadute / urgenti
    if (/scadut|in ritardo|urgent|avvis|scadenze|cosa (devo|scade)|da fare/.test(q) && !type) {
      const urgent = infos.filter((i) => i.status === 'overdue' || i.status === 'warning')
      if (!infos.length) return { text: 'Non hai ancora impostato scadenze per questa auto. Aggiungine una indicando l’intervallo previsto dal costruttore.', actions: [{ label: 'Imposta scadenza', intent: 'deadline' }] }
      if (!urgent.length) return { text: `Tutto regolare: nessuna scadenza superata o vicina per la ${v.name}. ${this.nextText(infos)}` }
      return { text: 'Ecco le scadenze che richiedono attenzione:\n' + urgent.map((i) => `• ${i.label}: ${i.reason.toLowerCase()}`).join('\n'), actions: [{ label: 'Vedi scadenze', route: '/scadenze' }] }
    }

    // Prossimo intervento
    if (/prossim|next|cosa (viene|tocca)|che (manutenzione|intervento)/.test(q) && !type) {
      if (!infos.some((i) => i.status !== 'unset')) return { text: 'Non ci sono scadenze con data o chilometraggio impostati, quindi non posso calcolare il prossimo intervento. Imposta gli intervalli del costruttore nella sezione Scadenze.', actions: [{ label: 'Imposta scadenza', intent: 'deadline' }] }
      return { text: this.nextText(infos), actions: [{ label: 'Vedi scadenze', route: '/scadenze' }] }
    }

    // Passato: quando ho fatto X / ultima volta
    const past = /quando ho|ultim|l ho|ho fatto|ho cambiato|ho sostituito|ho pagato|ho rinnovato|fatto l|cambiato|sostituit|storico/.test(q)
    if (type && past) {
      const rel = records.filter((r) => r.type === type || (type === 'olio' && r.type === 'tagliando' && /olio/i.test(r.notes || '')))
      const label = INTERVENTION_TYPES[type].label.toLowerCase()
      if (!rel.length) {
        return { text: `Non ho trovato interventi di tipo “${label}” registrati per la ${v.name}.` + (type === 'olio' && records.some((r) => r.type === 'tagliando') ? ' Ho però dei tagliandi registrati: se il cambio olio era compreso, puoi indicarlo nelle note.' : ''), actions: [{ label: 'Registra intervento', intent: 'log' }] }
      }
      const last = rel[0]
      const ago = daysBetween(last.date, ctx.today)
      let text = `L’ultimo intervento “${deadlineLabel(last).toLowerCase()}” risale al ${formatDateLong(last.date)} (${relativeDays(-ago)})`
      if (last.km !== undefined) text += `, a ${formatKm(last.km)}`
      if (last.cost) text += `, costo ${formatEuro(last.cost)}`
      text += '.'
      if (last.km !== undefined && v.km >= last.km) text += ` Da allora hai percorso ${formatKm(v.km - last.km)}.`
      if (rel.length > 1) text += ` In totale ne hai registrati ${rel.length}.`
      return { text, actions: [{ label: 'Apri storico', route: '/storico' }] }
    }

    // Futuro: quando devo fare X
    if (type) {
      const dl = infos.find((i) => i.deadline.type === type)
      const label = INTERVENTION_TYPES[type].label.toLowerCase()
      if (!dl) {
        let text = `Non hai ancora impostato una scadenza per “${label}”. Non uso intervalli standard: controlla il libretto di uso e manutenzione o chiedi alla tua officina, poi inserisci l’intervallo.`
        if (type === 'olio') {
          const tag = infos.find((i) => i.deadline.type === 'tagliando' && i.status !== 'unset')
          if (tag) text += ` Ho però una scadenza per il tagliando: ${describeDue(tag)}. Se il cambio olio è compreso nel tagliando, fai riferimento a quella.`
        }
        return { text, actions: [{ label: 'Imposta scadenza', intent: 'deadline' }] }
      }
      if (dl.status === 'unset') return { text: `La scadenza “${label}” esiste ma non ha né data né intervallo: modificala inserendo l’intervallo indicato dal costruttore.`, actions: [{ label: 'Vedi scadenze', route: '/scadenze' }] }
      const head = dl.status === 'overdue' ? '⚠️ Attenzione: la scadenza è superata. ' : dl.status === 'warning' ? 'Ci siamo quasi. ' : ''
      let text = `${head}Scadenza “${INTERVENTION_TYPES[type].label}”: ${describeDue(dl).replace(/^è prevista/, 'prevista').replace(/^era prevista/, 'era prevista')}, in base ai dati che hai inserito.`
      if (dl.deadline.lastDate) text += ` Ultima esecuzione registrata: ${formatDateLong(dl.deadline.lastDate)}${dl.deadline.lastKm !== undefined ? ` a ${formatKm(dl.deadline.lastKm)}` : ''}.`
      if (dl.dueDate && dl.dueKm !== undefined) text += ' Vale il limite che arriva prima.'
      return { text, actions: [{ label: 'Registra intervento', intent: 'log' }] }
    }

    if (/storico|interventi|cosa ho fatto/.test(q)) {
      if (!records.length) return { text: 'Nello storico non ci sono ancora interventi.', actions: [{ label: 'Registra intervento', intent: 'log' }] }
      return { text: 'Ultimi interventi registrati:\n' + records.slice(0, 5).map((r) => `• ${formatDateLong(r.date)} – ${deadlineLabel(r)}${r.cost ? ` (${formatEuro(r.cost)})` : ''}`).join('\n'), actions: [{ label: 'Apri storico', route: '/storico' }] }
    }

    return { text: 'Non sono sicuro di aver capito. ' + this.help() }
  }

  private nextText(infos: DeadlineInfo[]): string {
    const next = infos.find((i) => i.status !== 'unset')
    if (!next) return ''
    return `Il prossimo intervento in scadenza è “${next.label}”: ${describeDue(next)}.`
  }

  private spending(q: string, ctx: AssistantContext, type?: InterventionType): Omit<AssistantAnswer, 'provider'> {
    const v = ctx.vehicle!
    const items = allExpenses(ctx.data, v.id)
    const year = Number(ctx.today.slice(0, 4))
    const monthIdx = Number(ctx.today.slice(5, 7)) - 1
    const yearMatch = q.match(/\b(20\d{2})\b/)
    let period: 'anno' | 'mese' | 'totale' = 'anno'
    let y = year
    if (yearMatch) y = Number(yearMatch[1])
    else if (/anno scorso/.test(q)) y = year - 1
    else if (/questo mese|mese/.test(q)) period = 'mese'
    else if (/totale|in tutto|da sempre|sempre/.test(q)) period = 'totale'

    const catMap: Record<string, string> = { carburante: 'carburante', benzina: 'carburante', gasolio: 'carburante', rifornim: 'carburante', pieno: 'carburante' }
    let category = Object.entries(catMap).find(([k]) => q.includes(k))?.[1]
    if (!category && type) category = INTERVENTION_TYPES[type].expenseCategory
    if (!category && /manutenzion/.test(q)) category = 'manutenzione'

    const inPeriod = (d: string) => (period === 'totale' ? true : period === 'mese' ? d.startsWith(`${year}-${String(monthIdx + 1).padStart(2, '0')}`) : d.startsWith(String(y)))
    const periodLabel = period === 'totale' ? 'in totale' : period === 'mese' ? `a ${monthName(monthIdx)} ${year}` : y === year ? 'quest’anno' : `nel ${y}`
    const byType = type && INTERVENTION_TYPES[type].expenseCategory === 'manutenzione' ? type : undefined
    const filtered = items.filter((e) => inPeriod(e.date) && (byType
      ? e.source === 'intervento' && ctx.data.records.find((r) => r.id === e.refId)?.type === byType
      : !category || e.category === category))
    const total = sumBy(filtered, () => true)
    const catLabel = byType ? INTERVENTION_TYPES[byType].label.toLowerCase() : category ? EXPENSE_CATEGORIES.find((c) => c.value === category)?.label.toLowerCase() : undefined
    if (!filtered.length) return { text: `Non risultano spese${catLabel ? ` per ${catLabel}` : ''} ${periodLabel} per la ${v.name}.`, actions: [{ label: 'Aggiungi spesa', route: '/spese' }] }
    let text = `Hai speso ${formatEuro(total)}${catLabel ? ` per ${catLabel}` : ''} ${periodLabel} per la ${v.name} (${filtered.length} ${filtered.length === 1 ? 'voce' : 'voci'}).`
    if (!category) {
      const byCat = EXPENSE_CATEGORIES.map((c) => ({ c, s: sumBy(filtered, (e) => e.category === c.value) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
      if (byCat.length > 1) text += '\n' + byCat.map((x) => `• ${x.c.label}: ${formatEuro(x.s)}`).join('\n')
    }
    return { text, actions: [{ label: 'Apri spese', route: '/spese' }] }
  }

  private help(): string {
    return 'Posso rispondere usando i dati salvati, per esempio:\n• Quando devo cambiare l’olio?\n• Quanto ho speso quest’anno?\n• Quando ho cambiato le gomme?\n• Qual è il prossimo intervento?\n• Ho scadenze superate?\n• Quando scade l’assicurazione?'
  }
}

