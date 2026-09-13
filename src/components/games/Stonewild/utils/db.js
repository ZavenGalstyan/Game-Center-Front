/**
 * Stonewild — tiny IndexedDB wrapper.
 *
 * One database, one object store (`worlds`), keyed by world id. This is
 * where actual world CONTENT lives (seed's edits, inventory, player state) —
 * see utils/worldSave.js. World LIST metadata (name/seed/difficulty/
 * timestamps) stays in localStorage (utils/storage.js); that's small,
 * list-shaped data IndexedDB would be overkill for.
 *
 * Every call is promisified; nothing here is fire-and-forget — an unawaited
 * IndexedDB request is a classic source of "save silently didn't happen"
 * bugs.
 */

const DB_NAME = "stonewild-db";
const DB_VERSION = 1;
const STORE = "worlds";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function dbGetWorld(id) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // no IndexedDB / private mode — treat as "no save yet"
  }
}

export async function dbPutWorld(record) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false; // save failed silently rather than crashing gameplay
  }
}

export async function dbDeleteWorld(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}
