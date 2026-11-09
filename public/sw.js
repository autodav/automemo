/* AutoMemo service worker: cache dell'app per l'uso offline + notifiche push (Web Push). */
const CACHE = 'automemo-v2'
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icons/icon-192.png', './icons/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // network-first per la pagina, fallback alla cache se offline
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res }).catch(() => caches.match('./index.html')))
    return
  }
  // cache-first per gli asset (hanno hash nel nome)
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
    return res
  })))
})

// ---------- Notifiche push
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { body: e.data && e.data.text() } }
  const title = data.title || 'AutoMemo'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Hai una scadenza in arrivo.',
    tag: data.tag || 'automemo',
    renotify: true,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    lang: 'it',
    data: { url: data.url || './#/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = new URL((e.notification.data && e.notification.data.url) || './#/', self.registration.scope).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins.find((w) => w.url.startsWith(self.registration.scope))
    if (win) {
      // app già aperta: la porta in primo piano e apre la scadenza giusta
      win.postMessage({ type: 'automemo-open', url: target })
      return win.focus()
    }
    return self.clients.openWindow(target)
  })())
})

// Il browser ha rinnovato la sottoscrizione: la comunichiamo al server (stesso id anonimo).
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const cfg = await readMeta('push')
    if (!cfg || !cfg.deviceId || !cfg.apiUrl) return
    const old = e.oldSubscription
    const sub = e.newSubscription || (old && await self.registration.pushManager.subscribe(old.options))
    if (!sub) return
    await fetch(`${cfg.apiUrl}/api/devices/${cfg.deviceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
  })().catch(() => undefined))
})

function readMeta(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open('automemo')
    req.onerror = () => resolve(null)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('meta')) { db.close(); return resolve(null) }
      const g = db.transaction('meta').objectStore('meta').get(key)
      g.onsuccess = () => { resolve(g.result || null); db.close() }
      g.onerror = () => { resolve(null); db.close() }
    }
  })
}
