const DB_NAME = "preserve";
const DB_VERSION = 1;

type OutboxItem = {
  id: string;
  incidentId: string;
  module: string;
  input: unknown;
  environment?: unknown;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("kv").objectStore("kv").get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function kvSet(key: string, value: unknown) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function kvDelete(key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction("kv", "readwrite").objectStore("kv").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function outboxAdd(item: OutboxItem) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction("outbox", "readwrite").objectStore("outbox").put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function outboxAll(): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("outbox").objectStore("outbox").getAll();
    request.onsuccess = () => resolve(request.result as OutboxItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function outboxRemove(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction("outbox", "readwrite").objectStore("outbox").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function outboxCount() {
  const items = await outboxAll();
  return items.length;
}
