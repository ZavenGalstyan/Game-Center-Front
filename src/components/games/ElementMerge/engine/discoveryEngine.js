/**
 * Element Merge — the one centralized recipe engine. No component ever
 * resolves a combination itself; everything routes through `combine()` here.
 */
import { ELEMENTS, ELEMENT_INDEX, STARTER_IDS } from "../data/elements.js";
import { RECIPES, recipeKey, buildRecipeIndex, buildRecipesByResult } from "../data/recipes.js";

const RECIPE_INDEX = buildRecipeIndex(RECIPES);
const RECIPES_BY_RESULT = buildRecipesByResult(RECIPES);

export function elementExists(id) {
  return ELEMENT_INDEX.has(id);
}

/**
 * Resolve two element ids. Returns:
 *   { ok: true, resultId }   — a recipe exists
 *   { ok: false }            — no reaction
 */
export function combine(idA, idB) {
  if (!elementExists(idA) || !elementExists(idB)) return { ok: false };
  const key = recipeKey(idA, idB);
  const resultId = RECIPE_INDEX.get(key);
  if (resultId === undefined) return { ok: false };
  return { ok: true, resultId };
}

/** Every known (a,b) pair that produces `resultId`, for the Discovery Book's recipe history. */
export function recipesForResult(resultId) {
  return RECIPES_BY_RESULT.get(resultId) || [];
}

/**
 * Breadth-first reachability simulation from a set of unlocked ids, applying
 * every recipe whose both inputs are unlocked, repeatedly, until nothing new
 * appears. Pure — does not touch game state. Used by the hint engine (to
 * know what's currently reachable) and by engine/validate.mjs (to check the
 * whole graph is connected to the four starters).
 */
export function simulateReachable(unlockedIds = STARTER_IDS) {
  const unlocked = new Set(unlockedIds);
  const discoveredVia = new Map(); // resultId -> [a,b] the simulation first used
  let changed = true;
  while (changed) {
    changed = false;
    for (const [a, b, result] of RECIPES) {
      if (unlocked.has(result)) continue;
      if (unlocked.has(a) && unlocked.has(b)) {
        unlocked.add(result);
        discoveredVia.set(result, [a, b]);
        changed = true;
      }
    }
  }
  return { unlocked, discoveredVia };
}

/**
 * Elements the player could discover RIGHT NOW with one more combination,
 * given what they've already unlocked — i.e. results one step beyond the
 * current unlocked set. Powers the hint engine; never suggests something
 * requiring an element the player doesn't have yet.
 */
export function nextReachable(unlockedIds) {
  const unlocked = new Set(unlockedIds);
  const found = [];
  for (const [a, b, result] of RECIPES) {
    if (unlocked.has(result)) continue;
    if (unlocked.has(a) && unlocked.has(b)) found.push({ a, b, result });
  }
  return found;
}

export { ELEMENTS, STARTER_IDS };
