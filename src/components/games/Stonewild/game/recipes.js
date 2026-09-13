/**
 * Stonewild — crafting recipes.
 *
 * Two tiers, matching the spec: a small personal crafting list (available
 * from the Inventory screen at any time) and the Workbench list (needs a
 * placed, nearby Workbench to open). Both are read by the same
 * `craftRecipe()` in crafting.js — there is no separate "fake" UI path.
 *
 * `category` drives the Inventory/Workbench crafting panel's tabs (see
 * components/CraftingPanel.jsx) — ALL / BASIC / TOOLS / BUILDING / SURVIVAL.
 */

import { ITEM } from "./items.js";

export const CATEGORIES = ["all", "basic", "tools", "building", "survival"];

export const PERSONAL_RECIPES = [
  {
    id: "planksFromWildwood",
    name: "Planks",
    category: "basic",
    inputs: [{ item: ITEM.WILDWOOD_LOG, count: 1 }],
    output: { item: ITEM.PLANKS, count: 4 },
  },
  {
    id: "planksFromPine",
    name: "Planks",
    category: "basic",
    inputs: [{ item: ITEM.PINE_LOG, count: 1 }],
    output: { item: ITEM.PLANKS, count: 4 },
  },
  {
    id: "sticks",
    name: "Sticks",
    category: "basic",
    inputs: [{ item: ITEM.PLANKS, count: 2 }],
    output: { item: ITEM.STICK, count: 4 },
  },
  {
    id: "workbench",
    name: "Workbench",
    category: "building",
    inputs: [{ item: ITEM.PLANKS, count: 4 }],
    output: { item: ITEM.WORKBENCH, count: 1 },
  },
];

export const WORKBENCH_RECIPES = [
  {
    id: "woodAxe",
    name: "Wood Axe",
    category: "tools",
    inputs: [
      { item: ITEM.PLANKS, count: 3 },
      { item: ITEM.STICK, count: 2 },
    ],
    output: { item: ITEM.WOOD_AXE, count: 1 },
  },
  {
    id: "woodPickaxe",
    name: "Wood Pickaxe",
    category: "tools",
    inputs: [
      { item: ITEM.PLANKS, count: 3 },
      { item: ITEM.STICK, count: 2 },
    ],
    output: { item: ITEM.WOOD_PICKAXE, count: 1 },
  },
  {
    id: "woodShovel",
    name: "Wood Shovel",
    category: "tools",
    inputs: [
      { item: ITEM.PLANKS, count: 1 },
      { item: ITEM.STICK, count: 2 },
    ],
    output: { item: ITEM.WOOD_SHOVEL, count: 1 },
  },
  {
    id: "stoneAxe",
    name: "Stone Axe",
    category: "tools",
    inputs: [
      { item: ITEM.STONE, count: 3 },
      { item: ITEM.STICK, count: 2 },
    ],
    output: { item: ITEM.STONE_AXE, count: 1 },
  },
  {
    id: "stonePickaxe",
    name: "Stone Pickaxe",
    category: "tools",
    inputs: [
      { item: ITEM.STONE, count: 3 },
      { item: ITEM.STICK, count: 2 },
    ],
    output: { item: ITEM.STONE_PICKAXE, count: 1 },
  },
  {
    id: "stoneShovel",
    name: "Stone Shovel",
    category: "tools",
    inputs: [
      { item: ITEM.STONE, count: 1 },
      { item: ITEM.STICK, count: 2 },
    ],
    output: { item: ITEM.STONE_SHOVEL, count: 1 },
  },
];

export function findRecipe(id) {
  return PERSONAL_RECIPES.find((r) => r.id === id) || WORKBENCH_RECIPES.find((r) => r.id === id) || null;
}
