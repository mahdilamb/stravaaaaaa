const DB_NAME = 'stravaaaaaa'
const DB_VERSION = 1

type StoreName = 'activities' | 'streams' | 'geocode' | 'boundary'
const STORES: StoreName[] = ['activities', 'streams', 'geocode', 'boundary']

interface Entry<T> {
  value: T
  expiresAt?: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!req.result.objectStoreNames.contains(store)) {
          req.result.createObjectStore(store)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

let dbPromise: Promise<IDBDatabase> | null = null
function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB()
  return dbPromise
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => {
      const entry = req.result as Entry<T> | undefined
      if (!entry) { resolve(null); return }
      if (entry.expiresAt && Date.now() > entry.expiresAt) { resolve(null); return }
      resolve(entry.value)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function idbSet(
  store: StoreName,
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const db = await getDB()
  const entry: Entry<unknown> = { value }
  if (ttlSeconds) entry.expiresAt = Date.now() + ttlSeconds * 1000
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).put(entry, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetBatch<T>(store: StoreName, keys: string[]): Promise<(T | null)[]> {
  if (!keys.length) return []
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const objStore = tx.objectStore(store)
    const results: (T | null)[] = new Array(keys.length).fill(null)
    const now = Date.now()
    let pending = keys.length
    keys.forEach((key, i) => {
      const req = objStore.get(key)
      req.onsuccess = () => {
        const entry = req.result as Entry<T> | undefined
        if (entry && (!entry.expiresAt || now <= entry.expiresAt)) results[i] = entry.value
        if (--pending === 0) resolve(results)
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function idbDel(store: StoreName, key: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetAll<T>(store: StoreName): Promise<Record<string, T>> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const objStore = tx.objectStore(store)
    const results: Record<string, T> = {}
    const now = Date.now()

    const keysReq = objStore.getAllKeys()
    keysReq.onsuccess = () => {
      const keys = keysReq.result as string[]
      const valReq = objStore.getAll()
      valReq.onsuccess = () => {
        const vals = valReq.result as Entry<T>[]
        for (let i = 0; i < keys.length; i++) {
          const entry = vals[i]
          if (!entry) continue
          if (entry.expiresAt && now > entry.expiresAt) continue
          results[keys[i]] = entry.value
        }
        resolve(results)
      }
      valReq.onerror = () => reject(valReq.error)
    }
    keysReq.onerror = () => reject(keysReq.error)
  })
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function idbClearByPrefix(store: StoreName, prefix: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const objStore = tx.objectStore(store)
    const req = objStore.getAllKeys()
    req.onsuccess = () => {
      const keys = req.result as string[]
      const toDelete = keys.filter(k => k.startsWith(prefix))
      if (!toDelete.length) { resolve(); return }
      let pending = toDelete.length
      for (const key of toDelete) {
        const del = objStore.delete(key)
        del.onsuccess = () => { if (--pending === 0) resolve() }
        del.onerror = () => reject(del.error)
      }
    }
    req.onerror = () => reject(req.error)
  })
}
