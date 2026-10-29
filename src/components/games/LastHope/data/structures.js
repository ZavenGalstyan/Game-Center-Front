/**
 * Last Hope — base-building pieces (Survivor's Camp only).
 *
 * The camp build zone is a grid of GRID-metre cells. Pieces live on either:
 *   place: "cell"  a cell (floors, furniture, barricades) — key c:i:j
 *   place: "edge"  a cell edge (walls, doors)               — key h:i:j / v:i:j
 *     h:i:j  edge along +x on the line z = j·GRID, from x = i·GRID
 *     v:i:j  edge along +z on the line x = i·GRID, from z = j·GRID
 *
 * Each piece has tiers (index 0 = wood). Upgrading pays the next tier's cost.
 * `solid` pieces block players and zombies; zombies attack whatever blocks
 * their path (see engine/zombies.js siege), so hp matters.
 */
export const GRID = 2;
export const BUILD_ZONE = { x0: -18, z0: -18, x1: 18, z1: 18 };

export const PIECES = {
  floor: {
    name: "Floor Tile",
    place: "cell",
    layer: "floor",
    solid: false,
    desc: "Flat platform. Keeps the mud out of your shelter.",
    tiers: [
      { name: "Wooden Floor", cost: { wood: 4 }, hp: 200 },
      { name: "Stone Floor", cost: { stone: 6, wood: 1 }, hp: 400 },
      { name: "Metal Floor", cost: { metal: 4 }, hp: 700 },
    ],
  },
  wall: {
    name: "Wall",
    place: "edge",
    solid: true,
    desc: "Blocks zombies until they tear it down.",
    tiers: [
      { name: "Wooden Wall", cost: { wood: 6 }, hp: 260 },
      { name: "Stone Wall", cost: { stone: 8, wood: 2 }, hp: 560, level: 3 },
      { name: "Metal Wall", cost: { metal: 6 }, hp: 1000, level: 6 },
    ],
  },
  door: {
    name: "Door",
    place: "edge",
    solid: true,
    door: true,
    desc: "Opens for you (E), stays shut for the dead.",
    tiers: [
      { name: "Wooden Door", cost: { wood: 6, rope: 1 }, hp: 220 },
      { name: "Reinforced Door", cost: { stone: 4, wood: 4, rope: 1 }, hp: 480, level: 3 },
      { name: "Metal Door", cost: { metal: 6, parts: 1 }, hp: 900, level: 6 },
    ],
  },
  barricade: {
    name: "Spike Barricade",
    place: "cell",
    layer: "obj",
    solid: true,
    spikes: 9,
    desc: "Sharpened stakes. Hurts any zombie that pushes against it.",
    tiers: [
      { name: "Spike Barricade", cost: { wood: 6, rope: 1 }, hp: 240, level: 2 },
      { name: "Steel Barricade", cost: { metal: 5, wood: 2 }, hp: 640, level: 6, spikes: 16 },
    ],
  },
  campfire: {
    name: "Campfire",
    place: "cell",
    layer: "obj",
    solid: true,
    station: "campfire",
    light: true,
    desc: "Cook meat, boil water. Light and warmth at night (faster healing nearby).",
    tiers: [{ name: "Campfire", cost: { wood: 5, stone: 3 }, hp: 300 }],
  },
  workbench: {
    name: "Workbench",
    place: "cell",
    layer: "obj",
    solid: true,
    station: "workbench",
    desc: "Unlocks advanced recipes. Upgrade it for metalworking.",
    tiers: [
      { name: "Workbench", cost: { wood: 8, stone: 4 }, hp: 350 },
      { name: "Workbench Mk II", cost: { metal: 6, parts: 2, wood: 2 }, hp: 650, level: 4, station: "workbench2" },
    ],
  },
  chest: {
    name: "Storage Chest",
    place: "cell",
    layer: "obj",
    solid: true,
    storage: true,
    desc: "Stores items safely at camp. Death never takes what's inside.",
    tiers: [
      { name: "Wooden Chest", cost: { wood: 8, fiber: 2 }, hp: 300, slots: 12 },
      { name: "Metal Locker", cost: { metal: 6 }, hp: 600, slots: 24, level: 4 },
    ],
  },
  collector: {
    name: "Rain Collector",
    place: "cell",
    layer: "obj",
    solid: true,
    desc: "Fills one bottle of clean water every 3 minutes (holds 3).",
    tiers: [{ name: "Rain Collector", cost: { wood: 6, cloth: 2, rope: 2 }, hp: 250, level: 2 }],
  },
  bed: {
    name: "Bedroll",
    place: "cell",
    layer: "obj",
    solid: false,
    bed: true,
    desc: "Sets your respawn point. Rest here to recover health.",
    tiers: [{ name: "Bedroll", cost: { cloth: 4, fiber: 4 }, hp: 150 }],
  },
};
for (const [id, p] of Object.entries(PIECES)) p.id = id;

export const BUILD_ORDER = ["wall", "door", "floor", "barricade", "campfire", "workbench", "chest", "collector", "bed"];
export const tierOf = (s) => PIECES[s.kind].tiers[s.tier || 0];
