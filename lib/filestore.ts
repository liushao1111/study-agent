// Browser-only: uses indexedDB global — only import in client components

const DB_NAME = 'study-agent-files'
const STORE_NAME = 'files'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'localId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface LocalFile {
  localId: string      // uuid
  bytes: Uint8Array
  filename: string
  mimeType: string     // original browser mime type
}

export async function saveFileLocally(file: LocalFile): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(file)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getLocalFile(localId: string): Promise<LocalFile | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(localId)
    req.onsuccess = () => resolve((req.result as LocalFile) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteLocalFile(localId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(localId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
