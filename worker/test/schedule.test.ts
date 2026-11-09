import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, daysBetween, fromMask, initialSent, localNow, markSent, nextSendDate, toMask } from '../src/schedule.ts'

const today = '2026-11-09'
const ALL = toMask([30, 15, 7, 1])

test('bitmask soglie', () => {
  assert.equal(ALL, 15)
  assert.deepEqual(fromMask(toMask([7, 30])), [30, 7])
  assert.equal(toMask([5, 99]), 0)
})
test('date', () => {
  assert.equal(daysBetween('2026-11-09', '2026-12-09'), 30)
  assert.equal(addDays('2026-03-28', 2), '2026-03-30') // cambio ora legale non influisce
  assert.equal(localNow('Europe/Rome', new Date('2026-11-09T07:00:00Z')).hour, 8)
  assert.equal(localNow('Europe/Rome', new Date('2026-07-09T06:00:00Z')).hour, 8)
  assert.equal(localNow('Europe/Rome', new Date('2026-11-09T23:30:00Z')).date, '2026-11-10')
})
test('scadenza lontana: primo invio a 30 giorni', () => {
  const due = addDays(today, 60)
  const sent = initialSent(due, ALL, today)
  assert.equal(sent, 0)
  assert.equal(nextSendDate(due, ALL, sent, today), addDays(due, -30))
})
test('scadenza tra 10 giorni: 30 e 15 saltate, prossimo invio a 7 giorni', () => {
  const due = addDays(today, 10)
  const sent = initialSent(due, ALL, today)
  assert.deepEqual(fromMask(sent), [30, 15])
  assert.equal(nextSendDate(due, ALL, sent, today), addDays(due, -7))
})
test('scadenza esattamente tra 7 giorni: invio oggi', () => {
  const due = addDays(today, 7)
  const sent = initialSent(due, ALL, today)
  assert.equal(nextSendDate(due, ALL, sent, today), today)
})
test('deduplica: dopo l\'invio a 7 giorni la prossima è a 1 giorno, mai due volte la stessa', () => {
  const due = addDays(today, 7)
  let sent = initialSent(due, ALL, today)
  sent = markSent(ALL, sent, 7)
  assert.deepEqual(fromMask(sent), [30, 15, 7])
  assert.equal(nextSendDate(due, ALL, sent, today), addDays(due, -1))
  sent = markSent(ALL, sent, 1)
  assert.equal(nextSendDate(due, ALL, sent, today), null)
})
test('recupero se un giorno il cron non è girato', () => {
  const due = addDays(today, 5) // la soglia 7 era 2 giorni fa e non è stata inviata
  assert.equal(nextSendDate(due, ALL, toMask([30, 15]), today), today)
  assert.deepEqual(fromMask(markSent(ALL, toMask([30, 15]), 5)), [30, 15, 7])
})
test('scadenza passata o senza soglie: nessun invio', () => {
  assert.equal(nextSendDate(addDays(today, -1), ALL, 0, today), null)
  assert.equal(nextSendDate(addDays(today, 40), 0, 0, today), null)
  assert.equal(nextSendDate(addDays(today, 40), toMask([7]), 0, today), addDays(today, 33))
})
