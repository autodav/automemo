// Genera una coppia di chiavi VAPID (P-256). La privata NON va mai committata:
//   npx wrangler secret put VAPID_PRIVATE_KEY   (incolla il valore "privateKey")
// La pubblica va in wrangler.toml (VAPID_PUBLIC_KEY).
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
const b64u = (b) => Buffer.from(b).toString('base64url')
console.log(JSON.stringify({ publicKey: b64u(raw), privateKey: jwk.d }, null, 2))
