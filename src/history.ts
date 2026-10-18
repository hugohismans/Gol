// Instantanés du monde dans IndexedDB, pour revenir en arrière.
// Rétention : tous les instantanés des SNAPSHOT_RECENT_DAYS derniers jours,
// puis un par jour simulé.

import { SNAPSHOT_RECENT_DAYS, TICKS_PER_DAY } from './sim/config';
import { compress, decompress } from './persistence';

const STORE = 'instantanes';

/** Une base par taille de monde, pour que les essais en petit ne touchent pas au vrai monde. */
let dbName = 'organisme-256';
let dbPromise: Promise<IDBDatabase> | null = null;

export function useWorldSize(size: number): void {
  dbName = `organisme-${size}`;
  dbPromise = null;
}

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** File d'écriture : les instantanés sont compressés et stockés un par un. */
let queue: Promise<unknown> = Promise.resolve();

export function putFrame(tick: number, frame: Uint8Array): void {
  queue = queue
    .then(async () => {
      const z = await compress(frame);
      return run('readwrite', (s) => s.put(z, tick));
    })
    .catch((e) => console.warn('Instantané non enregistré', e));
}

export async function getFrame(tick: number): Promise<Uint8Array | null> {
  const v = (await run('readonly', (s) => s.get(tick))) as Uint8Array | undefined;
  return v ? decompress(v) : null;
}

export async function listTicks(): Promise<number[]> {
  await queue;
  const keys = (await run('readonly', (s) => s.getAllKeys())) as number[];
  return keys.sort((a, b) => a - b);
}

/** Supprime les instantanés du futur (après chargement d'une sauvegarde plus ancienne) et éclaircit les anciens. */
export async function pruneFrames(currentTick: number): Promise<void> {
  const ticks = await listTicks();
  const recent = currentTick - SNAPSHOT_RECENT_DAYS * TICKS_PER_DAY;
  for (const t of ticks) {
    if (t > currentTick || (t < recent && t % TICKS_PER_DAY !== 0)) await run('readwrite', (s) => s.delete(t));
  }
}

export async function clearFrames(): Promise<void> {
  await queue;
  await run('readwrite', (s) => s.clear());
}
