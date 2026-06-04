import { UploadedFile, Folder } from '../types.js';

const DB_NAME = 'SafeVaultOffline';
const DB_VERSION = 1;

export interface CachedFileBlob {
  id: string;
  name: string;
  mimeType: string;
  blob: Blob;
  cachedAt: string;
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open offline database'));
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Store 1: files list metadata index
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
      
      // Store 2: folders list metadata index
      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders', { keyPath: 'id' });
      }
      
      // Store 3: actual raw file objects (Blobs) for recently pre-loaded/cached preview files
      if (!db.objectStoreNames.contains('file_blobs')) {
        db.createObjectStore('file_blobs', { keyPath: 'id' });
      }
    };
  });
}

export const offlineDb = {
  // Save all files meta
  saveFiles: async (files: UploadedFile[]): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      
      // Clear old listings
      store.clear();
      
      for (const file of files) {
        store.put(file);
      }
      
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('LocalStorage / IDB fallback enabled: files schema could not be written', e);
    }
  },

  // Get all cached files
  getFiles: async (): Promise<UploadedFile[]> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const request = store.getAll();

      return new Promise<UploadedFile[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Using LocalStorage or raw state backup for getFiles', e);
      return [];
    }
  },

  // Save folders meta
  saveFolders: async (folders: Folder[]): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      
      store.clear();
      
      for (const folder of folders) {
        store.put(folder);
      }
      
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IDB folders schema write failed', e);
    }
  },

  // Get all cached folders
  getFolders: async (): Promise<Folder[]> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('folders', 'readonly');
      const store = tx.objectStore('folders');
      const request = store.getAll();

      return new Promise<Folder[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return [];
    }
  },

  // Cache file binary raw content inside IndexedDB
  cacheFileBlob: async (fileId: string, name: string, mimeType: string, blob: Blob): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('file_blobs', 'readwrite');
      const store = tx.objectStore('file_blobs');
      
      const record: CachedFileBlob = {
        id: fileId,
        name,
        mimeType,
        blob,
        cachedAt: new Date().toISOString()
      };
      
      store.put(record);
      
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to cache file binary blob', e);
    }
  },

  // Fetch cached raw file binary / blob
  getFileBlob: async (fileId: string): Promise<CachedFileBlob | null> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('file_blobs', 'readonly');
      const store = tx.objectStore('file_blobs');
      const request = store.get(fileId);

      return new Promise<CachedFileBlob | null>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return null;
    }
  },

  // Quick check of cached file contents presence
  hasFileBlob: async (fileId: string): Promise<boolean> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('file_blobs', 'readonly');
      const store = tx.objectStore('file_blobs');
      const request = store.getKey(fileId);

      return new Promise<boolean>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result !== undefined);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return false;
    }
  },

  // Clear obsolete or deleted file caching records
  removeFileBlob: async (fileId: string): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction('file_blobs', 'readwrite');
      const store = tx.objectStore('file_blobs');
      store.delete(fileId);
    } catch (e) {
      // Ignore
    }
  }
};
