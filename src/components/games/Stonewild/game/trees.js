/**
 * Stonewild — procedural trees.
 *
 * Trees are NOT stamped into chunk data as a separate pass; they're sampled
 * by pure world coordinates, exactly like terrain height (see worldgen.js).
 * That's what makes a canopy overhanging a chunk boundary render correctly
 * on both sides without any "wait for neighbor, then rebuild" bookkeeping —
 * the same reason chunk-edge face culling already works.
 *
 * Placement: the world is divided into CELL x CELL columns; each cell rolls
 * at most one candidate tree, jittered off-grid so it doesn't read as a
 * planted orchard. A regional "forest" noise field modulates the odds per
 * cell, producing believable clusters and clearings instead of one tree
 * every exact N blocks (spec requirement).
 */

import { hashSeed, mulberry32, createValueNoise2D, makeFbm2D } from "./noise.js";

const CELL = 5;
const KIND = { WILDWOOD: "wildwood", PINE: "pine" };

function cellRand(seed, cx, cz, salt) {
  return mulberry32(hashSeed(`${seed}:tree:${cx}:${cz}:${salt}`))();
}

export function makeTreeSampler(seed, heightAt) {
  const forestBase = createValueNoise2D(`${seed}:forest`);
  const forestNoise = makeFbm2D(forestBase, { octaves: 2, lacunarity: 2, gain: 0.5, scale: 0.02 });

  const cache = new Map();

  function slotFor(cx, cz) {
    const key = cx + "," + cz;
    let slot = cache.get(key);
    if (slot !== undefined) return slot;

    const bx = cx * CELL + Math.floor(cellRand(seed, cx, cz, 1) * CELL);
    const bz = cz * CELL + Math.floor(cellRand(seed, cx, cz, 2) * CELL);
    const density = (forestNoise(bx, bz) + 1) / 2; // 0..1, regional forest coverage
    const roll = cellRand(seed, cx, cz, 3);
    // Every world guarantees a resource cluster near spawn (world origin),
    // regardless of what the noise rolls there — rather than leaving "is
    // there a tree within reach" to per-seed luck (spec: spawn area must
    // never be featureless).
    const distFromOrigin = Math.hypot(bx, bz);
    const spawnBoost = Math.max(0, 1 - distFromOrigin / 45) * 0.5;
    const chance = 0.05 + density * 0.4 + spawnBoost;

    slot = null;
    if (roll < chance) {
      const h = heightAt(bx, bz);
      const flat =
        Math.abs(heightAt(bx + 1, bz) - h) <= 1 &&
        Math.abs(heightAt(bx - 1, bz) - h) <= 1 &&
        Math.abs(heightAt(bx, bz + 1) - h) <= 1 &&
        Math.abs(heightAt(bx, bz - 1) - h) <= 1;
      if (flat && h > 2) {
        const kind = cellRand(seed, cx, cz, 4) < 0.25 ? KIND.PINE : KIND.WILDWOOD;
        const trunkHeight =
          kind === KIND.PINE
            ? 6 + Math.floor(cellRand(seed, cx, cz, 5) * 2)
            : 4 + Math.floor(cellRand(seed, cx, cz, 5) * 3);
        slot = { bx, bz, baseY: h, kind, trunkHeight };
      }
    }
    cache.set(key, slot);
    return slot;
  }

  /** Returns "log" | "leaves" | null, plus which trunk species for block selection. */
  return function treeBlockAt(wx, wy, wz) {
    const cx = Math.floor(wx / CELL);
    const cz = Math.floor(wz / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const slot = slotFor(cx + dx, cz + dz);
        if (!slot) continue;
        const part = shapeAt(slot, wx, wy, wz);
        if (part) return { part, kind: slot.kind };
      }
    }
    return null;
  };
}

function shapeAt(slot, wx, wy, wz) {
  const { bx, bz, baseY, kind, trunkHeight } = slot;
  const dx = wx - bx;
  const dz = wz - bz;
  const dy = wy - baseY;

  if (dx === 0 && dz === 0 && dy >= 1 && dy <= trunkHeight) return "log";

  if (kind === KIND.PINE) {
    const top = trunkHeight + 2;
    if (dy > trunkHeight - 4 && dy <= top) {
      const layerFromTop = top - dy;
      const radius = Math.max(0, Math.min(2, Math.floor(layerFromTop / 2)));
      if (radius === 0 ? dx === 0 && dz === 0 : Math.abs(dx) <= radius && Math.abs(dz) <= radius) {
        if (!(dx === 0 && dz === 0 && dy <= trunkHeight)) return "leaves";
      }
    }
    return null;
  }

  // wildwood: a squat asymmetric canopy — not a perfect sphere
  if (dy >= trunkHeight - 2 && dy <= trunkHeight + 2) {
    const layerFromTop = trunkHeight + 2 - dy;
    const radius = layerFromTop <= 0 ? 1 : layerFromTop === 3 ? 1 : 2;
    const dist2 = dx * dx + dz * dz;
    if (dist2 <= radius * radius + 1) {
      if (dx === 0 && dz === 0 && dy <= trunkHeight) return null; // trunk column below canopy stays clear
      const isCorner = Math.abs(dx) === radius && Math.abs(dz) === radius;
      if (isCorner && (dx + dz + dy) % 3 === 0) return null; // shave a few corners off — organic, not a cube
      return "leaves";
    }
  }
  return null;
}
