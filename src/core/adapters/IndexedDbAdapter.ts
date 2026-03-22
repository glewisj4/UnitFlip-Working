import { LocalDbAdapter } from './LocalDbAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';

const DB_NAME = 'unitflip';
const STORE_NAME = 'kv';
const BLOB_STORE_NAME = 'blobs';
const DB_VERSION = 3;

export class IndexedDbAdapter implements LocalDbAdapter {
  private dbPromise: Promise<IDBDatabase>;
  private fallbackAdapter: LocalStorageAdapter | null = null;

  constructor() {
    this.dbPromise = this.openDb().catch((error) => {
      console.warn('IndexedDB failed to open, falling back to LocalStorage', error);
      this.fallbackAdapter = new LocalStorageAdapter();
      // We return a rejected promise here so we can catch it in methods if needed,
      // but we also set the fallback adapter.
      throw error;
    });
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
          db.createObjectStore(BLOB_STORE_NAME);
        }
      };
    });
  }

  private async getDb(): Promise<IDBDatabase | null> {
    try {
      return await this.dbPromise;
    } catch (e) {
      return null;
    }
  }

  async getItem<T>(key: string): Promise<T | null> {
    const db = await this.getDb();
    if (!db) {
      return this.fallbackAdapter ? this.fallbackAdapter.getItem<T>(key) : null;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result;
          // Result is { key: string, value: string }
          if (result && result.value) {
            try {
              resolve(JSON.parse(result.value));
            } catch (e) {
              console.error('Error parsing JSON from IndexedDB', e);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      if (this.fallbackAdapter) {
        return this.fallbackAdapter.setItem<T>(key, value);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        // Store as { key, value: stringified }
        const request = store.put({ key, value: JSON.stringify(value) });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      if (this.fallbackAdapter) {
        return this.fallbackAdapter.removeItem(key);
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      if (this.fallbackAdapter) {
        return this.fallbackAdapter.clear();
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}
