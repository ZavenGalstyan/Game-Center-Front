/**
 * Color Platforms — all levels, compiled once from the compact chapter data.
 * Ids are 1-based and contiguous; chapter = ceil(id / 10).
 */
import { compileLevel, validateLevel } from "../levelFormat.js";
import { CHAPTER1 } from "./chapter1.js";
import { CHAPTER2 } from "./chapter2.js";
import { CHAPTER3 } from "./chapter3.js";
import { CHAPTER4 } from "./chapter4.js";
import { CHAPTER5 } from "./chapter5.js";

const RAW = [CHAPTER1, CHAPTER2, CHAPTER3, CHAPTER4, CHAPTER5];

export const LEVELS = [];
RAW.forEach((defs, ci) => {
  defs.forEach((def) => {
    LEVELS.push(compileLevel(def, LEVELS.length + 1, ci + 1));
  });
});

export const getLevel = (id) => LEVELS[id - 1] || null;

if (import.meta.env?.DEV) {
  const errs = LEVELS.flatMap(validateLevel);
  if (errs.length) console.warn("[Color Platforms] level validation:\n" + errs.join("\n"));
}
