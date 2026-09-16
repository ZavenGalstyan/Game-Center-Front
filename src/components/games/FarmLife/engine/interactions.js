/**
 * Farm Life — "what does E/F do right now" targeting + execution.
 *
 * Two halves on purpose: `findInteraction` is a pure read of the world
 * (player transform, farm tiles, nearby props) that Scene.jsx calls every
 * frame to drive the bottom-center prompt; `performInteraction` is the
 * actual mutation, called once on the E/F keypress/click. Splitting them
 * means the prompt never lies about what pressing the key will do, and a
 * stray extra keypress with no target simply no-ops (prevents the
 * double-harvest / double-till class of bug — every farmGrid mutator is
 * already itself idempotent-safe, this is the second layer).
 */
import { FIELD_ORIGIN, FIELD_WIDTH, FIELD_DEPTH, COOP_PEN, SEED_STAND, SHIPPING_BOX, WELL, POND } from "./terrain.js";
import { tileIndex } from "./farmGrid.js";
import { canPlant, canWater, canHarvest } from "./farmGrid.js";
import { INTERACT_RANGE } from "./constants.js";

const PROP_REACH = 1.5;

function dist(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

function targetTile(playerX, playerZ, facing) {
  const reach = 0.85;
  const tx = playerX + Math.sin(facing) * reach;
  const tz = playerZ + Math.cos(facing) * reach;
  const col = Math.floor(tx - FIELD_ORIGIN.x);
  const row = Math.floor(tz - FIELD_ORIGIN.z);
  if (col < 0 || row < 0 || col >= FIELD_WIDTH || row >= FIELD_DEPTH) return -1;
  return tileIndex(col, row);
}

const coopCenter = { x: (COOP_PEN.minX + COOP_PEN.maxX) / 2, z: (COOP_PEN.minZ + COOP_PEN.maxZ) / 2 };

/**
 * Returns { kind, label, ...extra } or null. `kind` is one of:
 * "till" | "plant" | "water" | "harvest" | "coop" | "seedStand" |
 * "shippingBox" | "refillCan"
 */
export function findInteraction(player, farmTiles, selectedItem, wateringCan) {
  const { x, z, facing } = player;

  if (dist(x, z, coopCenter.x, coopCenter.z) < PROP_REACH + 1.6) {
    return { kind: "coop", label: "Open Coop" };
  }
  if (dist(x, z, SEED_STAND.x, SEED_STAND.z) < PROP_REACH) {
    return { kind: "seedStand", label: "Open Seed Stand" };
  }
  if (dist(x, z, SHIPPING_BOX.x, SHIPPING_BOX.z) < PROP_REACH) {
    return { kind: "shippingBox", label: "Open Shipping Box" };
  }
  if ((dist(x, z, WELL.x, WELL.z) < WELL.r + PROP_REACH || dist(x, z, POND.x, POND.z) < POND.r + 1.2) && wateringCan.water < wateringCan.capacity) {
    return { kind: "refillCan", label: "Refill Watering Can" };
  }

  const index = targetTile(x, z, facing);
  if (index < 0) return null;
  const tile = farmTiles[index];
  if (!tile) return null;

  if (canHarvest(farmTiles, index)) return { kind: "harvest", index, label: "Harvest" };
  if (selectedItem?.category === "seed" && canPlant(farmTiles, index)) return { kind: "plant", index, label: `Plant ${selectedItem.name}` };
  if (selectedItem?.id === "wateringCan" && canWater(farmTiles, index) && wateringCan.water > 0) return { kind: "water", index, label: "Water" };
  if (selectedItem?.id === "hoe" && tile && !tile.tilled && !tile.cropId) return { kind: "till", index, label: "Till Soil" };
  return null;
}

export const INTERACT_RANGE_HINT = INTERACT_RANGE; // re-exported for HUD distance debugging if ever needed
