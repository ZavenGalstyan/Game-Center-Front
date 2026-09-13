/**
 * Stonewild — crafting logic.
 *
 * `craftRecipe` is atomic: it checks resources, removes every input, adds
 * the output, and if the output can't fit (inventory full) it aborts
 * WITHOUT consuming anything — never destroys materials, never duplicates.
 */

import { hasAtLeast, removeItem, addItem } from "./inventory.js";
import { getItem } from "./items.js";

export function canCraftRecipe(inv, recipe) {
  return recipe.inputs.every((c) => hasAtLeast(inv, c.item, c.count));
}

export function craftRecipe(store, recipe) {
  const inv = store.get().inventory;
  if (!canCraftRecipe(inv, recipe)) return false;

  let next = inv;
  for (const cost of recipe.inputs) {
    next = removeItem(next, cost.item, cost.count);
    if (!next) return false; // defensive — hasAtLeast already guaranteed this succeeds
  }

  const { inventory: withOutput, leftover } = addItem(next, recipe.output.item, recipe.output.count);
  if (leftover > 0) {
    store.showToast("Inventory full");
    return false; // abort — original `inv` was never touched in the store
  }

  store.set({ inventory: withOutput });
  const def = getItem(recipe.output.item);
  const qty = recipe.output.count > 1 ? `${recipe.output.count} ` : "";
  store.showToast(`Crafted ${qty}${def ? def.name : recipe.output.item}`);

  const OBJECTIVE_FOR_RECIPE = {
    planksFromWildwood: 2,
    planksFromPine: 2,
    workbench: 3,
    woodPickaxe: 4,
    stonePickaxe: 6,
    stoneAxe: 6,
    stoneShovel: 6,
  };
  if (OBJECTIVE_FOR_RECIPE[recipe.id] != null) store.advanceObjective(OBJECTIVE_FOR_RECIPE[recipe.id]);

  return true;
}
