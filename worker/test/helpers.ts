// Decifratura lato "browser" (RFC 8291) usata dai test e dal finto push service locale.
import { b64urlDecode } from '../src/webpush.ts'

const enc = new TextEncoder()
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
async function hmac(k: Uint8Array, d: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', k as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, d as BufferSource))
}
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => (await hmac(await hmac(salt, ikm), cat(info, new Uint8Array([1])))).slice(0, len)

export async function decryptPayload(body: Uint8Array, uaPrivate: CryptoKey, uaPublicB64: string, authB64: string): Promise<string> {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ct = body.slice(21 + idlen)
  const uaPublic = b64urlDecode(uaPublicB64)
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivate, 256))
  const ikm = await hkdf(b64urlDecode(authB64), secret, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, ['decrypt'])
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, ct as BufferSource))
  let end = pt.length - 1
  while (end >= 0 && pt[end] === 0) end--
  if (pt[end] !== 2) throw new Error('delimitatore record mancante')
  return new TextDecoder().decode(pt.slice(0, end))
}
