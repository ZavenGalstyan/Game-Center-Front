/**
 * Stonewild — world content save/load.
 *
 * Bridges the runtime (ChunkManager's edit list, player position, the
 * gameStore's inventory/health/hunger) and one IndexedDB record per world.
 * Only the seed + edits are stored, never generated terrain (spec
 * requirement) — see ChunkManager.exportModifications/loadModifications.
 */

import { dbGetWorld, dbPutWorld } from "./db.js";

const SAVE_VERSION = 1;

export function buildSaveRecord({ worldId, seed, chunkManager, player, store }) {
  const s = store.get();
  return {
    id: worldId,
    version: SAVE_VERSION,
    seed,
    modifications: chunkManager.exportModifications(),
    player: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch },
    health: s.health,
    hunger: s.hunger,
    inventory: s.inventory,
    savedAt: Date.now(),
  };
}

export async function saveWorldContent(record) {
  return dbPutWorld(record);
}

export async function loadWorldContent(worldId) {
  const record = await dbGetWorld(worldId);
  if (!record || record.version !== SAVE_VERSION) return null;
  return record;
}
