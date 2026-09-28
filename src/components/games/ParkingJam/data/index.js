/**
 * Parking Jam — compiled level access. Levels compile lazily and are cached,
 * so opening the game never compiles all 100 boards up front.
 */
import { LEVEL_DEFS } from "./levels.js";
import { worldOf } from "./worlds.js";
import { compileLevel } from "../engine/level.js";

export const TOTAL_LEVELS = LEVEL_DEFS.length;
const cache = new Map();

export function getLevel(id) {
  if (!cache.has(id)) {
    const def = LEVEL_DEFS[id - 1];
    if (!def) return null;
    const world = worldOf(id);
    cache.set(id, compileLevel(def, { id, world: world.id, typePool: world.typePool }));
  }
  return cache.get(id);
}
