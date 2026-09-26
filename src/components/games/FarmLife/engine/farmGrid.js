/**
 * Farm Life — the soil grid (spec: "hidden logical farm grid for planting;
 * each tile tracks tilled, crop, growth stage, watered, quality, last
 * updated").
 *
 * A flat array of plain tile objects, one per field tile (see
 * engine/terrain.js for the field's world-space bounds). Pure functions
 * only — Scene.jsx/gameStore.js own the actual array and re-render on
 * change; nothing here touches React or Three.
 *
 * Growth only advances while a tile is `watered`, using real elapsed
 * seconds (dt), never a `setInterval` per tile (spec: "do not run 100
 * independent intervals" / "crop simulation should be timestamp/game-time
 * based, not animate every plant every frame") — Scene's single useFrame
 * calls `tickGrowth` once for the whole grid.
 */
import { FIELD_WIDTH, FIELD_DEPTH } from "./terrain.js";
import { getCrop } from "../data/crops.js";

export const TILE_COUNT = FIELD_WIDTH * FIELD_DEPTH;

export function tileIndex(col, row) {
  if (col < 0 || row < 0 || col >= FIELD_WIDTH || row >= FIELD_DEPTH) return -1;
  return row * FIELD_WIDTH + col;
}

export function createFarmGrid() {
  return Array.from({ length: TILE_COUNT }, () => ({
    tilled: false,
    cropId: null,
    stage: 0,
    watered: false,
    growthAccumSec: 0,
  }));
}

export function tillTile(tiles, index) {
  const t = tiles[index];
  if (!t || t.tilled || t.cropId) return tiles;
  const next = tiles.slice();
  next[index] = { ...t, tilled: true };
  return next;
}

export function canPlant(tiles, index, seedIsValid = true) {
  const t = tiles[index];
  return Boolean(t && t.tilled && !t.cropId && seedIsValid);
}

export function plantSeed(tiles, index, cropId) {
  if (!canPlant(tiles, index)) return tiles;
  const next = tiles.slice();
  next[index] = { ...tiles[index], cropId, stage: 0, watered: false, growthAccumSec: 0 };
  return next;
}

export function canWater(tiles, index) {
  const t = tiles[index];
  return Boolean(t && t.tilled && !t.watered);
}

export function waterTile(tiles, index) {
  if (!tiles[index] || !tiles[index].tilled) return tiles;
  const next = tiles.slice();
  next[index] = { ...tiles[index], watered: true };
  return next;
}

/** Applied by rain (Phase 44+) — same effect as manual watering. Exposed now
 *  so the weather system, once it exists, needs no new tile-mutation path. */
export function waterAllTilled(tiles) {
  return tiles.map((t) => (t.tilled ? { ...t, watered: true } : t));
}

/** Advances growth for every watered, planted, not-yet-mature tile by `dt`
 *  real seconds. Handles multi-stage catch-up in one call (e.g. after a long
 *  frame) via the while loop rather than assuming one stage per tick. */
export function tickGrowth(tiles, dt) {
  let changed = false;
  const next = tiles.slice();
  for (let i = 0; i < next.length; i++) {
    const t = next[i];
    if (!t.cropId || !t.watered || t.stage >= 4) continue;
    const crop = getCrop(t.cropId);
    if (!crop) continue;
    let stage = t.stage;
    let accum = t.growthAccumSec + dt;
    let mutated = false;
    while (stage < 4 && accum >= crop.stageSeconds[stage]) {
      accum -= crop.stageSeconds[stage];
      stage += 1;
      mutated = true;
    }
    if (mutated || accum !== t.growthAccumSec) {
      next[i] = { ...t, stage, growthAccumSec: accum };
      changed = true;
    }
  }
  return changed ? next : tiles;
}

export function canHarvest(tiles, index) {
  const t = tiles[index];
  return Boolean(t && t.cropId && t.stage >= 4);
}

/** Harvests a mature tile. Returns { tiles, cropId, yieldAmount } — `tiles`
 *  is unchanged (cropId null) if nothing was harvestable, so callers can
 *  check `cropId` to know whether anything happened (prevents the
 *  "harvested twice" class of bug: a stale index just no-ops). */
export function harvestTile(tiles, index) {
  if (!canHarvest(tiles, index)) return { tiles, cropId: null, yieldAmount: 0 };
  const t = tiles[index];
  const crop = getCrop(t.cropId);
  const next = tiles.slice();
  if (crop?.regrow) {
    next[index] = { ...t, stage: 3, growthAccumSec: 0 }; // drops back one stage, regrows
  } else {
    next[index] = { tilled: true, cropId: null, stage: 0, watered: t.watered, growthAccumSec: 0 };
  }
  return { tiles: next, cropId: t.cropId, yieldAmount: crop?.yield || 1 };
}

/** Called once when the game clock's day counter increments — soil dries
 *  out and needs rewatering, but growth already banked never regresses. */
export function resetDailyWater(tiles) {
  let changed = false;
  const next = tiles.map((t) => {
    if (t.watered) {
      changed = true;
      return { ...t, watered: false };
    }
    return t;
  });
  return changed ? next : tiles;
}
