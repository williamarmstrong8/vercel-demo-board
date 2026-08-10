"use client"

// Image elements embed their upload as a base64 data URL. That's fine in
// Postgres (no practical size limit on a JSONB column) but it's exactly what
// blows past localStorage's ~5MB quota once mirrored into the local
// crash-recovery draft — so the draft keeps only the element id and the
// actual bytes live here instead, keyed by that same id.

const DB_NAME = "whiteboard-images"
const STORE_NAME = "images"
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

export async function putImage(id: string, dataUrl: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.objectStore(STORE_NAME).put(dataUrl, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}

export async function getImage(id: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  const result = await new Promise<string | null>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
    req.onerror = () => resolve(null)
  })
  db.close()
  return result
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    for (const id of ids) store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}
