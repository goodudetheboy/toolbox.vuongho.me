import type { TranscriptRecord } from '../types';
import { normalizeTranscript } from './transcript';

const DB_NAME = 'transcriber-v1';
const DB_VERSION = 2;
const STORE = 'transcripts';
// File System Access handles to each transcript's original recording, keyed by
// transcript id. Only a handle (a pointer to the file on disk) is stored, never
// the media bytes, so history stays small. Chromium-only; other browsers just
// never write here.
const MEDIA_STORE = 'mediaHandles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTranscript(record: TranscriptRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllTranscripts(): Promise<TranscriptRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('createdAt').getAll();
    req.onsuccess = () => resolve((req.result as TranscriptRecord[]).reverse().map(normalizeTranscript));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTranscript(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, MEDIA_STORE], 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.objectStore(MEDIA_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveMediaHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMediaHandle(id: string): Promise<FileSystemFileHandle | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const req = tx.objectStore(MEDIA_STORE).get(id);
    req.onsuccess = () => resolve(req.result as FileSystemFileHandle | undefined);
    req.onerror = () => reject(req.error);
  });
}
