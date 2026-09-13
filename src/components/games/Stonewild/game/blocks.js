/**
 * Stonewild — block registry.
 *
 * Every block carries its own break rule: a hand time, which tool type helps,
 * and a time per tool tier. `getBreakSeconds()` is the single place breaking
 * speed is computed — StonewildScene never hardcodes a number.
 *
 * Colors are base RGB; chunkMesh.js jitters them per-block with a cheap hash
 * so faces read as "procedural texture variation" instead of flat plastic
 * cubes. Top/side colors differ where that matters (grass, logs, workbench).
 */

import { TOOL_TIERS } from "./constants.js";

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WILDWOOD_LOG: 4,
  WILDWOOD_LEAVES: 5,
  PINE_LOG: 6,
  PINE_LEAVES: 7,
  PLANKS: 8,
  WORKBENCH: 9,
};

// Seconds-per-block by tool tier, reused across the axe/pickaxe/shovel tables.
const AXE_TIMES = { wood: 0.5, stone: 0.35, iron: 0.22, crystal: 0.12 };
const PICKAXE_TIMES = { wood: 0.7, stone: 0.45, iron: 0.28, crystal: 0.15 };
const SHOVEL_TIMES = { wood: 0.3, stone: 0.22, iron: 0.15, crystal: 0.08 };

export const BLOCKS = {
  [BLOCK.AIR]: { id: BLOCK.AIR, name: "Air", solid: false },
  [BLOCK.GRASS]: {
    id: BLOCK.GRASS,
    name: "Grass",
    solid: true,
    replaceable: false,
    color: [0.34, 0.56, 0.27],
    topColor: [0.44, 0.68, 0.31],
    colorJitter: 0.05,
    drop: null, // breaking grass yields dirt (see worldgen edit rule) — handled by dropItem below
    dropItem: "dirt",
    break: { hand: 0.7, tool: "shovel", byTier: SHOVEL_TIMES },
  },
  [BLOCK.DIRT]: {
    id: BLOCK.DIRT,
    name: "Dirt",
    solid: true,
    replaceable: false,
    color: [0.4, 0.29, 0.2],
    colorJitter: 0.045,
    dropItem: "dirt",
    break: { hand: 0.6, tool: "shovel", byTier: SHOVEL_TIMES },
  },
  [BLOCK.STONE]: {
    id: BLOCK.STONE,
    name: "Stone",
    solid: true,
    replaceable: false,
    color: [0.5, 0.51, 0.53],
    colorJitter: 0.03,
    dropItem: "stone",
    break: { hand: 5, tool: "pickaxe", byTier: PICKAXE_TIMES },
  },
  [BLOCK.WILDWOOD_LOG]: {
    id: BLOCK.WILDWOOD_LOG,
    name: "Wildwood Log",
    solid: true,
    replaceable: false,
    color: [0.36, 0.24, 0.15],
    topColor: [0.46, 0.33, 0.21],
    colorJitter: 0.04,
    dropItem: "wildwoodLog",
    break: { hand: 1.4, tool: "axe", byTier: AXE_TIMES },
  },
  [BLOCK.WILDWOOD_LEAVES]: {
    id: BLOCK.WILDWOOD_LEAVES,
    name: "Wildwood Leaves",
    solid: true,
    replaceable: true,
    color: [0.27, 0.46, 0.2],
    colorJitter: 0.07,
    dropItem: "wildwoodSapling",
    dropChance: 0.12,
    break: { hand: 0.18, tool: null, byTier: null },
  },
  [BLOCK.PINE_LOG]: {
    id: BLOCK.PINE_LOG,
    name: "Pine Log",
    solid: true,
    replaceable: false,
    color: [0.3, 0.21, 0.15],
    topColor: [0.4, 0.29, 0.19],
    colorJitter: 0.035,
    dropItem: "pineLog",
    break: { hand: 1.4, tool: "axe", byTier: AXE_TIMES },
  },
  [BLOCK.PINE_LEAVES]: {
    id: BLOCK.PINE_LEAVES,
    name: "Pine Leaves",
    solid: true,
    replaceable: true,
    color: [0.16, 0.35, 0.22],
    colorJitter: 0.05,
    dropItem: "pineSapling",
    dropChance: 0.1,
    break: { hand: 0.18, tool: null, byTier: null },
  },
  [BLOCK.PLANKS]: {
    id: BLOCK.PLANKS,
    name: "Planks",
    solid: true,
    replaceable: false,
    color: [0.62, 0.46, 0.28],
    colorJitter: 0.03,
    dropItem: "planks",
    break: { hand: 1.1, tool: "axe", byTier: AXE_TIMES },
  },
  [BLOCK.WORKBENCH]: {
    id: BLOCK.WORKBENCH,
    name: "Workbench",
    solid: true,
    replaceable: false,
    interactive: true,
    color: [0.55, 0.38, 0.22],
    topColor: [0.68, 0.5, 0.3],
    colorJitter: 0.02,
    dropItem: "workbench",
    break: { hand: 1.2, tool: "axe", byTier: AXE_TIMES },
  },
};

export function isSolidBlock(id) {
  const def = BLOCKS[id];
  return Boolean(def && def.solid);
}

export function isReplaceableBlock(id) {
  const def = BLOCKS[id];
  return Boolean(def && def.replaceable);
}

/**
 * Seconds required to break `blockId` with `heldTool` ({toolType, tier} or
 * null for bare hands). Missing/unsuitable tool falls back to the hand time —
 * never a slower-than-hand "wrong tool penalty" edge case to worry about.
 */
export function getBreakSeconds(blockId, heldTool) {
  const def = BLOCKS[blockId];
  if (!def || !def.break) return 0.3;
  const { hand, tool, byTier } = def.break;
  if (!tool || !byTier) return hand; // e.g. leaves — any tool, always fast
  if (heldTool && heldTool.toolType === tool && TOOL_TIERS.includes(heldTool.tier)) {
    return byTier[heldTool.tier] ?? hand;
  }
  return hand;
}
