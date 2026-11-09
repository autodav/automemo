import type { AppData } from '../types'

/**
 * Persistenza locale: IndexedDB (preferito) con fallback su localStorage.
 * Store "state": documento unico con tutti i dati dell'app.
 * Store "files": foto delle fatture (data URL compressi).
 */
const DB_NAME = 'automemo'
const DB_VERSION = 2
const LS_STATE = 'automemo:state'
const LS_FILE_PREFIX = 'automemo:file:'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state')
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
        // "meta": configurazione tecnica (es. notifiche push) letta anche dal service worker; non fa parte del backup
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function storageBackend(): Promise<'indexeddb' | 'localstorage'> {
  return (await openDB()) ? 'indexeddb' : 'localstorage'
}

export async function loadState(): Promise<AppData | null> {
  const db = await openDB()
  if (db) {
    try {
      const v = await tx<AppData | undefined>(db, 'state', 'readonly', (s) => s.get('app') as IDBRequest<AppData | undefined>)
      if (v) return v
    } catch { /* fallthrough */ }
  }
  try {
    const raw = localStorage.getItem(LS_STATE)
    return raw ? (JSON.parse(raw) as AppData) : null
  } catch {
    return null
  }
}

export async function saveState(data: AppData): Promise<void> {
  const db = await openDB()
  if (db) {
    await tx(db, 'state', 'readwrite', (s) => s.put(data, 'app'))
    return
  }
  localStorage.setItem(LS_STATE, JSON.stringify(data))
}

export async function saveFile(id: string, dataUrl: string): Promise<void> {
  const db = await openDB()
  if (db) {
    await tx(db, 'files', 'readwrite', (s) => s.put(dataUrl, id))
    return
  }
  localStorage.setItem(LS_FILE_PREFIX + id, dataUrl)
}

export async function getFile(id: string): Promise<string | undefined> {
  const db = await openDB()
  if (db) {
    const v = await tx<string | undefined>(db, 'files', 'readonly', (s) => s.get(id) as IDBRequest<string | undefined>)
    if (v) return v
  }
  return localStorage.getItem(LS_FILE_PREFIX + id) ?? undefined
}

export async function deleteFile(id: string): Promise<void> {
  const db = await openDB()
  if (db) await tx(db, 'files', 'readwrite', (s) => s.delete(id))
  localStorage.removeItem(LS_FILE_PREFIX + id)
}

export async function clearAll(): Promise<void> {
  const db = await openDB()
  if (db) {
    await tx(db, 'state', 'readwrite', (s) => s.clear())
    await tx(db, 'files', 'readwrite', (s) => s.clear())
  }
  Object.keys(localStorage).filter((k) => k.startsWith('automemo:')).forEach((k) => localStorage.removeItem(k))
}

/** Chiede al browser di non cancellare automaticamente i dati (se supportato). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch { /* ignore */ }
  return false
}

/** Metadati tecnici (non inclusi nel backup e non cancellati da clearAll). */
export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  if (db) await tx(db, 'meta', 'readwrite', (s) => s.put(value, key))
}
export async function deleteMeta(key: string): Promise<void> {
  const db = await openDB()
  if (db) await tx(db, 'meta', 'readwrite', (s) => s.delete(key))
}
