/**
 * Stonewild — centralized item registry.
 *
 * Every item players can hold is defined exactly once, here. Nothing else
 * (inventory, crafting, hotbar, held-item renderer, icons) hardcodes item
 * metadata — they all look it up by id through this table, per the spec's
 * explicit "do not scatter item metadata across random components" rule.
 */

import { BLOCK } from "./blocks.js";
import { STACK_SIZE_BLOCK, STACK_SIZE_FOOD, STACK_SIZE_TOOL } from "./constants.js";

export const ITEM = {
  DIRT: "dirt",
  STONE: "stone",
  WILDWOOD_LOG: "wildwoodLog",
  PINE_LOG: "pineLog",
  WILDWOOD_SAPLING: "wildwoodSapling",
  PINE_SAPLING: "pineSapling",
  PLANKS: "planks",
  STICK: "stick",
  WORKBENCH: "workbench",
  WOOD_AXE: "woodAxe",
  WOOD_PICKAXE: "woodPickaxe",
  WOOD_SHOVEL: "woodShovel",
  STONE_AXE: "stoneAxe",
  STONE_PICKAXE: "stonePickaxe",
  STONE_SHOVEL: "stoneShovel",
};

// Simple, reused icon descriptors — see components/ItemIcon.jsx.
const icon = (shape, color, accent) => ({ shape, color, accent });

export const ITEMS = {
  [ITEM.DIRT]: {
    id: ITEM.DIRT,
    name: "Dirt",
    category: "block",
    block: BLOCK.DIRT,
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("block", "#6b4a34"),
  },
  [ITEM.STONE]: {
    id: ITEM.STONE,
    name: "Stone",
    category: "block",
    block: BLOCK.STONE,
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("block", "#9a978d"),
  },
  [ITEM.WILDWOOD_LOG]: {
    id: ITEM.WILDWOOD_LOG,
    name: "Wildwood Log",
    category: "block",
    block: BLOCK.WILDWOOD_LOG,
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("log", "#5c3d27"),
  },
  [ITEM.PINE_LOG]: {
    id: ITEM.PINE_LOG,
    name: "Pine Log",
    category: "block",
    block: BLOCK.PINE_LOG,
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("log", "#4c3524"),
  },
  [ITEM.WILDWOOD_SAPLING]: {
    id: ITEM.WILDWOOD_SAPLING,
    name: "Wildwood Sapling",
    category: "resource",
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("sapling", "#4d7f38"),
  },
  [ITEM.PINE_SAPLING]: {
    id: ITEM.PINE_SAPLING,
    name: "Pine Sapling",
    category: "resource",
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("sapling", "#2f5c3a"),
  },
  [ITEM.PLANKS]: {
    id: ITEM.PLANKS,
    name: "Planks",
    category: "block",
    block: BLOCK.PLANKS,
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("block", "#9e753f"),
  },
  [ITEM.STICK]: {
    id: ITEM.STICK,
    name: "Stick",
    category: "resource",
    stackSize: STACK_SIZE_BLOCK,
    icon: icon("stick", "#8a6a3f"),
  },
  [ITEM.WORKBENCH]: {
    id: ITEM.WORKBENCH,
    name: "Workbench",
    category: "block",
    block: BLOCK.WORKBENCH,
    stackSize: STACK_SIZE_TOOL === 1 ? 8 : STACK_SIZE_BLOCK, // small stack — you rarely need more than one
    icon: icon("block", "#8c6335", "#b98a4a"),
  },
  [ITEM.WOOD_AXE]: {
    id: ITEM.WOOD_AXE,
    name: "Wood Axe",
    category: "tool",
    stackSize: STACK_SIZE_TOOL,
    tool: { toolType: "axe", tier: "wood", durability: 60, damage: 4 },
    icon: icon("axe", "#a9793f", "#c9c9c9"),
  },
  [ITEM.WOOD_PICKAXE]: {
    id: ITEM.WOOD_PICKAXE,
    name: "Wood Pickaxe",
    category: "tool",
    stackSize: STACK_SIZE_TOOL,
    tool: { toolType: "pickaxe", tier: "wood", durability: 60, damage: 3 },
    icon: icon("pickaxe", "#a9793f", "#c9c9c9"),
  },
  [ITEM.WOOD_SHOVEL]: {
    id: ITEM.WOOD_SHOVEL,
    name: "Wood Shovel",
    category: "tool",
    stackSize: STACK_SIZE_TOOL,
    tool: { toolType: "shovel", tier: "wood", durability: 60, damage: 2 },
    icon: icon("shovel", "#a9793f", "#c9c9c9"),
  },
  [ITEM.STONE_AXE]: {
    id: ITEM.STONE_AXE,
    name: "Stone Axe",
    category: "tool",
    stackSize: STACK_SIZE_TOOL,
    tool: { toolType: "axe", tier: "stone", durability: 140, damage: 6 },
    icon: icon("axe", "#8a6a3f", "#9a978d"),
  },
  [ITEM.STONE_PICKAXE]: {
    id: ITEM.STONE_PICKAXE,
    name: "Stone Pickaxe",
    category: "tool",
    stackSize: STACK_SIZE_TOOL,
    tool: { toolType: "pickaxe", tier: "stone", durability: 140, damage: 4 },
    icon: icon("pickaxe", "#8a6a3f", "#9a978d"),
  },
  [ITEM.STONE_SHOVEL]: {
    id: ITEM.STONE_SHOVEL,
    name: "Stone Shovel",
    category: "tool",
    stackSize: STACK_SIZE_TOOL,
    tool: { toolType: "shovel", tier: "stone", durability: 140, damage: 3 },
    icon: icon("shovel", "#8a6a3f", "#9a978d"),
  },
};

export function getItem(id) {
  return ITEMS[id] || null;
}

const TOOL_KIND_LABEL = {
  axe: "Chopping Tool",
  pickaxe: "Mining Tool",
  shovel: "Digging Tool",
};

/** A short one-line kind label for tooltips — "Mining Tool", "Building Block", etc. */
export function kindLabel(def) {
  if (!def) return "";
  if (def.category === "tool") return TOOL_KIND_LABEL[def.tool?.toolType] || "Tool";
  if (def.category === "block") return "Building Block";
  return "Crafting Material";
}

export function stackLimitFor(id) {
  const def = getItem(id);
  return def ? def.stackSize : STACK_SIZE_BLOCK;
}

export function isPlaceable(id) {
  const def = getItem(id);
  return Boolean(def && def.category === "block" && def.block != null);
}

export function isTool(id) {
  const def = getItem(id);
  return Boolean(def && def.category === "tool");
}

/** The block a broken block's item should map back to when placed — used by breaking.js. */
export function itemForBlockDrop(dropItemId) {
  return ITEMS[dropItemId] ? dropItemId : null;
}
