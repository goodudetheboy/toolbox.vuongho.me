import type { PageRedactions } from '../types';

const DB_NAME = 'pdf-redactor';
const DB_VERSION = 1;
const STORE = 'history';

export interface HistoryEntry {
  id: string;
  filename: string;
  uploadedAt: number;
  pageCount: number;
  pdfBytes: ArrayBuffer;
  redactions: PageRedactions;
}

export type HistorySummary = Omit<HistoryEntry, 'pdfBytes'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  await withStore('readwrite', (store) => store.put(entry));
}

export async function listHistorySummaries(): Promise<HistorySummary[]> {
  const entries = await withStore<HistoryEntry[]>('readonly', (store) => store.getAll());
  return entries
    .map(({ pdfBytes: _pdfBytes, ...summary }) => summary)
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  return withStore('readonly', (store) => store.get(id));
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function clearHistory(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}
