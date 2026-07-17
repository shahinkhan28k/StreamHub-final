// Robust IndexedDB helper to store and retrieve large local media files (Videos & Thumbnails)
const DB_NAME = 'StreamHubLocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'local_media';

export function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Stores a File or Blob in IndexedDB and returns a local uri format "indexeddb://<key>"
 */
export async function storeLocalMedia(key: string, blob: Blob | File): Promise<string> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, key);
    request.onsuccess = () => resolve(`indexeddb://${key}`);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves a stored Blob/File from IndexedDB by its key
 */
export async function getLocalMedia(key: string): Promise<Blob | null> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a stored item from IndexedDB
 */
export async function deleteLocalMedia(key: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Track object URLs we've generated to revoke them on unmount to prevent memory leaks
const activeObjectUrls: Record<string, string> = {};

/**
 * Resolves a media URL. If it's an "indexeddb://" protocol, it loads the Blob from IndexedDB
 * and returns a temporary local object URL (blob:...). Otherwise, returns the original URL.
 */
export async function resolveMediaUrl(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('indexeddb://')) {
    const key = url.replace('indexeddb://', '');
    try {
      // If we already have an active object URL for this key, reuse it to prevent redundant creations
      if (activeObjectUrls[key]) {
        return activeObjectUrls[key];
      }
      const blob = await getLocalMedia(key);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        activeObjectUrls[key] = objectUrl;
        return objectUrl;
      }
    } catch (err) {
      console.error("Error resolving indexeddb URL:", err);
    }
    // Fallback if failed
    return '';
  }
  return url;
}

/**
 * Revokes any active object URLs created for a key
 */
export function revokeMediaUrl(url: string): void {
  if (url && url.startsWith('indexeddb://')) {
    const key = url.replace('indexeddb://', '');
    const activeUrl = activeObjectUrls[key];
    if (activeUrl) {
      try {
        URL.revokeObjectURL(activeUrl);
        delete activeObjectUrls[key];
      } catch (e) {
        console.warn("Error revoking object URL:", e);
      }
    }
  }
}
