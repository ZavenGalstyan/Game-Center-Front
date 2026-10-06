/**
 * Lost Toy — every level, in order. Levels are data (built through the kit
 * once, on first use) — one engine, one renderer, fifty rooms.
 */
import level01 from "./level01.js";
import { level02, level03, level04, level05, level06, level07, level08, level09, level10 } from "./world1.js";
import { level11, level12, level13, level14, level15, level16, level17, level18, level19, level20 } from "./world2.js";

const BUILDERS = [level01, level02, level03, level04, level05, level06, level07, level08, level09, level10, level11, level12, level13, level14, level15, level16, level17, level18, level19, level20];

const cache = new Map();
export const LEVEL_COUNT = BUILDERS.length;
export function levelById(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > BUILDERS.length) return null;
  if (!cache.has(n)) cache.set(n, BUILDERS[n - 1]());
  return cache.get(n);
}
export function levelIds() {
  return BUILDERS.map((_, i) => i + 1);
}
