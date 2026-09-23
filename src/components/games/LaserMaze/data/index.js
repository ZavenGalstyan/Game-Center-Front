/**
 * Laser Maze — level access for the UI. Compiles maps lazily (once) and
 * attaches the validator-generated par + guided solution.
 */
import { LEVEL_DEFS } from "./levels.js";
import { SOLUTIONS } from "./solutions.js";
import { compileLevel } from "../engine/level.js";

export const TOTAL_LEVELS = LEVEL_DEFS.length;

const cache = new Map();

export function getLevel(id) {
  if (cache.has(id)) return cache.get(id);
  const def = LEVEL_DEFS[id - 1];
  if (!def) return null;
  const level = compileLevel(def);
  const sol = SOLUTIONS[id];
  level.par = sol ? sol.par : null;
  level.solution = sol ? sol.solution : null;
  level.worldId = Math.ceil(id / 10);
  cache.set(id, level);
  return level;
}
