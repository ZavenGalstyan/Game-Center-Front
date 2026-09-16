/**
 * Farm Life — persistence.
 *
 * One farm per player, so unlike Stonewild's multi-world IndexedDB store
 * this needs only a single record — but the spec is explicit that a farm's
 * state is "serious persistence" (tiles, crops, animals, inventory,
 * buildings...) and large enough that a single fragile localStorage string
 * is the wrong tool, so it still goes to IndexedDB. A versioned envelope
 * (`saveVersion`) means a future field addition can migrate old saves
 * instead of wiping them.
 */
import { SAVE_VERSION, STARTING_MONEY } from "./constants.js";
import { createEmptyInventory, addItem } from "./inventory.js";
import { createFarmGrid } from "./farmGrid.js";
import { STARTER_TOOLS, ITEM } from "../data/items.js";
import { PLAYER_SPAWN } from "./terrain.js";

const DB_NAME = "farmlife-db";
const DB_VERSION = 1;
const STORE = "farm";
const RECORD_ID = "main";

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
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function loadFarmRecord() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null; // no IndexedDB / private mode — treat as "no save yet"
  }
}

export async function saveFarmRecord(record) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...record, id: RECORD_ID });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteFarmRecord() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

/** Fresh farm: starter tools on the hotbar, a handful of free wheat seeds,
 *  a small purse, an untouched field. Matches the spec's "player begins
 *  with a small farmhouse, a small piece of land, a few farming tools, a
 *  small amount of money, a few basic seeds". */
export function createNewFarmState() {
  let inventory = createEmptyInventory();
  STARTER_TOOLS.forEach((toolId, i) => {
    inventory.hotbar[i] = { itemId: toolId, qty: 1 };
  });
  inventory = addItem(inventory, ITEM.WHEAT_SEED, 5).inv;

  return {
    saveVersion: SAVE_VERSION,
    player: { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, facing: PLAYER_SPAWN.yaw },
    money: STARTING_MONEY,
    inventory,
    selectedHotbar: 0,
    wateringCan: { water: 8, capacity: 8 },
    farmTiles: createFarmGrid(),
    chickens: [],
    eggs: [], // { id, x, z } sitting in the coop, waiting to be collected
    clock: { totalMinutes: 6 * 60, day: 1 },
    tutorial: { step: 0, done: false },
    stats: { cropsHarvested: 0, itemsSold: 0, eggsCollected: 0 },
  };
}

/** Merges a loaded record onto a fresh default so a save written before a
 *  field was added still loads cleanly (additive migration, never a wipe). */
export function migrateFarmState(record) {
  if (!record) return createNewFarmState();
  const fresh = createNewFarmState();
  return {
    ...fresh,
    ...record,
    inventory: record.inventory
      ? { hotbar: record.inventory.hotbar || fresh.inventory.hotbar, backpack: record.inventory.backpack || fresh.inventory.backpack }
      : fresh.inventory,
    wateringCan: { ...fresh.wateringCan, ...record.wateringCan },
    farmTiles: Array.isArray(record.farmTiles) && record.farmTiles.length === fresh.farmTiles.length ? record.farmTiles : fresh.farmTiles,
    clock: { ...fresh.clock, ...record.clock },
    tutorial: { ...fresh.tutorial, ...record.tutorial },
    stats: { ...fresh.stats, ...record.stats },
    saveVersion: SAVE_VERSION,
  };
}
