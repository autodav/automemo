/**
 * Web Push senza dipendenze, solo WebCrypto (funziona su Cloudflare Workers e Node >= 20).
 * - Cifratura del payload: RFC 8291 (Message Encryption for Web Push) con content coding aes128gcm (RFC 8188)
 * - Autenticazione del server: RFC 8292 (VAPID) con JWT ES256
 */

export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidKeys {
  /** chiave pubblica P-256 non compressa (65 byte) in base64url */
  publicKey: string
  /** scalare privato "d" (32 byte) in base64url */
  privateKey: string
  /** mailto: o https: per contatto del push service */
  subject: string
}

const enc = new TextEncoder()

export function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const len = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(new ArrayBuffer(len))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as Uint8Array<ArrayBuffer>))
}

/** HKDF-SHA256 con output <= 32 byte (un solo blocco), come richiesto da RFC 8291. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmac(salt, ikm)
  const okm = await hmac(prk, concat(info, new Uint8Array([1])))
  return okm.slice(0, length)
}

export interface EncryptOptions {
  /** solo per test (vettori RFC 8291): sale e chiave effimera fissi */
  salt?: Uint8Array<ArrayBuffer>
  asKeyPair?: { privateKey: CryptoKey; publicRaw: Uint8Array<ArrayBuffer> }
  recordSize?: number
}

/** Cifra il payload per una sottoscrizione (RFC 8291, aes128gcm, un solo record). */
export async function encryptPayload(sub: PushSubscriptionJSON, plaintext: Uint8Array, opts: EncryptOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = b64urlDecode(sub.keys.p256dh)
  const authSecret = b64urlDecode(sub.keys.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh non valida')
  if (authSecret.length !== 16) throw new Error('auth non valida')

  let asPrivate: CryptoKey
  let asPublic: Uint8Array<ArrayBuffer>
  if (opts.asKeyPair) {
    asPrivate = opts.asKeyPair.privateKey
    asPublic = opts.asKeyPair.publicRaw
  } else {
    const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    asPrivate = kp.privateKey
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer)
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey, $public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, asPrivate, 256))

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const rs = opts.recordSize ?? 4096
  if (plaintext.length + 1 + 16 > rs) throw new Error('payload troppo grande')
  const padded = concat(plaintext, new Uint8Array([2])) // delimitatore dell'ultimo record, nessun padding
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded))

  const header = new Uint8Array(new ArrayBuffer(16 + 4 + 1 + asPublic.length))
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

const jwtCache = new Map<string, { token: string; exp: number }>()

async function importVapidPrivate(v: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(v.publicKey)
  if (pub.length !== 65) throw new Error('VAPID public key non valida')
  return crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: false,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** JWT VAPID (ES256) per l'origin del push service; in cache finché non sta per scadere. */
export async function vapidJwt(audience: string, v: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const cached = jwtCache.get(audience)
  if (cached && cached.exp - nowSec > 3600) return cached.token
  const exp = nowSec + 12 * 3600
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp, sub: v.subject })))
  const unsigned = `${header}.${claims}`
  const key = await importVapidPrivate(v)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)) // r||s (P1363), formato JWS
  const token = `${unsigned}.${b64urlEncode(sig)}`
  jwtCache.set(audience, { token, exp })
  return token
}

export interface PushRequest { url: string; init: RequestInit }

export async function buildPushRequest(sub: PushSubscriptionJSON, payload: unknown, v: VapidKeys, opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } = {}): Promise<PushRequest> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)))
  const audience = new URL(sub.endpoint).origin
  const jwt = await vapidJwt(audience, v)
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: String(opts.ttl ?? 86400),
    Urgency: opts.urgency ?? 'normal',
    Authorization: `vapid t=${jwt}, k=${v.publicKey}`,
  }
  if (opts.topic) headers.Topic = opts.topic
  return { url: sub.endpoint, init: { method: 'POST', headers, body } }
}

export interface PushResult { status: number; ok: boolean; gone: boolean; text?: string }

export async function sendPush(sub: PushSubscriptionJSON, payload: unknown, v: VapidKeys, opts?: Parameters<typeof buildPushRequest>[3], fetchImpl: typeof fetch = fetch): Promise<PushResult> {
  const req = await buildPushRequest(sub, payload, v, opts)
  const res = await fetchImpl(req.url, req.init)
  const text = res.ok ? undefined : (await res.text().catch(() => '')).slice(0, 300)
  return { status: res.status, ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, text }
}

/** Genera una coppia di chiavi VAPID (base64url). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer)
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d! }
}
