/**
 * Mario Adventure 3D — the level list. Levels are built lazily (once) from
 * their world scripts; ids run 1‥30, six per world, the sixth is the boss.
 */
import { WORLD1 } from "./world1.js";
import { WORLD2 } from "./world2.js";
import { WORLD3 } from "./world3.js";
import { WORLD4 } from "./world4.js";
import { WORLD5 } from "./world5.js";

const SCRIPTS = [...WORLD1, ...WORLD2, ...WORLD3, ...WORLD4, ...WORLD5];
const cache = new Map();

export const LEVEL_COUNT = 30;
export const BUILT_COUNT = SCRIPTS.length;

export function levelById(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > SCRIPTS.length) return null;
  if (!cache.has(n)) cache.set(n, SCRIPTS[n - 1]());
  return cache.get(n);
}

export function allLevels() {
  return SCRIPTS.map((_, i) => levelById(i + 1));
}
