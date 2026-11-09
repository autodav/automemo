// Test della cifratura Web Push con il vettore ufficiale di RFC 8291 §5 e verifica della firma VAPID.
// Esecuzione: node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { b64urlDecode, b64urlEncode, encryptPayload, vapidJwt, generateVapidKeys } from '../src/webpush.ts'
import { decryptPayload } from './helpers.ts'

const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  expected: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

async function importEcdhPrivate(d: string, pub: string) {
  const p = b64urlDecode(pub)
  return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d, x: b64urlEncode(p.slice(1, 33)), y: b64urlEncode(p.slice(33)) }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
}

test('RFC 8291 §5: output identico al vettore di test', async () => {
  const privateKey = await importEcdhPrivate(V.asPrivate, V.asPublic)
  const out = await encryptPayload({ endpoint: 'https://example.com', keys: { p256dh: V.uaPublic, auth: V.auth } }, new TextEncoder().encode(V.plaintext), {
    salt: b64urlDecode(V.salt), asKeyPair: { privateKey, publicRaw: b64urlDecode(V.asPublic) },
  })
  assert.equal(b64urlEncode(out), V.expected)
})

test('Cifratura casuale decifrabile dal destinatario (round trip)', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const uaPub = b64urlEncode(await crypto.subtle.exportKey('raw', ua.publicKey) as ArrayBuffer)
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)))
  const msg = JSON.stringify({ title: 'AutoMemo · Revisione', body: 'Mancano 7 giorni' })
  const body = await encryptPayload({ endpoint: 'https://x', keys: { p256dh: uaPub, auth } }, new TextEncoder().encode(msg))
  assert.equal(await decryptPayload(body, ua.privateKey, uaPub, auth), msg)
})

test('JWT VAPID ES256 verificabile con la chiave pubblica', async () => {
  const keys = await generateVapidKeys()
  const jwt = await vapidJwt('https://fcm.googleapis.com', { ...keys, subject: 'https://autodav.github.io/automemo/' })
  const [h, c, s] = jwt.split('.')
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)))
  assert.equal(claims.aud, 'https://fcm.googleapis.com')
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600)
  const pub = await crypto.subtle.importKey('raw', b64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`)))
})
