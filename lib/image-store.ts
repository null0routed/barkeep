/**
 * Scene-image persistence (TODO.MD #9.2).
 *
 * Generated image BYTES live in IndexedDB, keyed by a UUID, so the localStorage
 * chat record stays a tiny `{ id, alt }` reference. This is deliberate: a base64
 * image is multi-megabyte and would instantly trip the 4 MB localStorage budget
 * (see lib/storage-budget.ts, which measures each chat message with
 * `serializedBytes(JSON.stringify(m))`). By keeping only the reference in
 * localStorage, chat trimming is unaffected and the image survives reloads.
 *
 * No external dependencies: the IndexedDB calls use the native API behind small
 * promise wrappers, and EVERY operation resolves to a clean `{ ok, ... }` result
 * (never throws) so a missing browser IndexedDB — Node tests, SSR, or a private-
 * browsing mode without IDB — degrades gracefully. The renderer already handles
 * the "no image" case (alt text + an "image unavailable" note).
 */

/** A stored scene image. `id` is the IndexedDB key (a UUID). */
export interface StoredImage {
  id: string
  alt: string
  /** Data URL (from `b64_json`) or an http(s) URL (from `url`). */
  src: string
  /** MIME type, when known (informational; `src` already encodes it for data URLs). */
  mime?: string
}

/** Default per-image budget. A 720p frame well under this; a huge one is dropped. */
export const MAX_IMAGE_BYTES = 4_000_000

const DB_NAME = "barkeep"
const DB_VERSION = 1
const STORE = "images"

export interface IdbResult<T> {
  ok: boolean
  value?: T
  /** "no-idb" = IndexedDB unavailable, "too-large" = over the per-image budget. */
  reason?: string
}

/** True only when a usable IndexedDB global exists (browser; not Node/SSR). */
export function hasIdb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null
}

/**
 * Rough byte estimate of a `src` payload. A data URL's base64 body is ~4/3 the
 * original byte length, so we recover ~3/4 of the string length. Plain URLs are
 * tiny and pass through unchanged.
 */
export function estimateImageBytes(src: string): number {
  if (src.startsWith("data:")) return Math.floor((src.length * 3) / 4)
  return src.length
}

/** True when the payload would exceed the per-image budget (before writing). */
export function isOverImageCap(src: string, limit: number = MAX_IMAGE_BYTES): boolean {
  return estimateImageBytes(src) > limit
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIdb()) {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("failed to open image store"))
    request.onblocked = () => reject(new Error("image store open blocked"))
  })
}

/**
 * Store one scene image. Refuses payloads over the per-image cap (reports
 * `reason: "too-large"`) so a single huge image can never exhaust the quota.
 */
export async function putImage(image: StoredImage): Promise<IdbResult<void>> {
  if (!hasIdb()) return { ok: false, reason: "no-idb" }
  if (isOverImageCap(image.src)) return { ok: false, reason: "too-large" }
  let db: IDBDatabase | undefined
  try {
    db = await openDb()
    return await new Promise<IdbResult<void>>((resolve) => {
      const tx = db!.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(image)
      tx.oncomplete = () => {
        db!.close()
        resolve({ ok: true })
      }
      tx.onerror = () => {
        db!.close()
        resolve({ ok: false, reason: tx.error?.message ?? "write-failed" })
      }
      tx.onabort = () => {
        db!.close()
        resolve({ ok: false, reason: "aborted" })
      }
    })
  } catch {
    db?.close()
    return { ok: false, reason: "no-idb" }
  }
}

/** Read one scene image by id. `reason: "not-found"` when absent (or no IDB). */
export async function getImage(id: string): Promise<IdbResult<StoredImage>> {
  if (!hasIdb()) return { ok: false, reason: "no-idb" }
  let db: IDBDatabase | undefined
  try {
    db = await openDb()
    return await new Promise<IdbResult<StoredImage>>((resolve) => {
      const request = db!.transaction(STORE, "readonly").objectStore(STORE).get(id)
      request.onsuccess = () => {
        const value = request.result as StoredImage | undefined
        db!.close()
        if (value) resolve({ ok: true, value })
        else resolve({ ok: false, reason: "not-found" })
      }
      request.onerror = () => {
        db!.close()
        resolve({ ok: false, reason: request.error?.message ?? "read-failed" })
      }
    })
  } catch {
    db?.close()
    return { ok: false, reason: "no-idb" }
  }
}

/** Delete one scene image (no-op when absent). */
export async function deleteImage(id: string): Promise<IdbResult<void>> {
  if (!hasIdb()) return { ok: false, reason: "no-idb" }
  let db: IDBDatabase | undefined
  try {
    db = await openDb()
    return await new Promise<IdbResult<void>>((resolve) => {
      const tx = db!.transaction(STORE, "readwrite")
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => {
        db!.close()
        resolve({ ok: true })
      }
      tx.onerror = () => {
        db!.close()
        resolve({ ok: false, reason: tx.error?.message ?? "delete-failed" })
      }
      tx.onabort = () => {
        db!.close()
        resolve({ ok: false, reason: "aborted" })
      }
    })
  } catch {
    db?.close()
    return { ok: false, reason: "no-idb" }
  }
}

/** Remove every stored scene image (used by "clear chat history"). */
export async function clearImages(): Promise<IdbResult<void>> {
  if (!hasIdb()) return { ok: false, reason: "no-idb" }
  let db: IDBDatabase | undefined
  try {
    db = await openDb()
    return await new Promise<IdbResult<void>>((resolve) => {
      const tx = db!.transaction(STORE, "readwrite")
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => {
        db!.close()
        resolve({ ok: true })
      }
      tx.onerror = () => {
        db!.close()
        resolve({ ok: false, reason: tx.error?.message ?? "clear-failed" })
      }
      tx.onabort = () => {
        db!.close()
        resolve({ ok: false, reason: "aborted" })
      }
    })
  } catch {
    db?.close()
    return { ok: false, reason: "no-idb" }
  }
}
