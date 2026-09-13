/**
 * Stonewild — procedural terrain: rolling Greenlands hills, grass/dirt/stone
 * strata, and trees. No caves/ores/biomes yet (later phases).
 *
 * `createTerrainSampler(seed)` is the single source of truth for "what
 * block is at this world coordinate" — chunk generation, chunk-edge face
 * culling, collision fallback (ChunkManager) and spawn-safety all call the
 * same `blockAt`/`heightAt` so there is exactly one terrain definition, not
 * three copies that can drift out of sync.
 */

import { createValueNoise2D, makeFbm2D } from "./noise.js";
import { BLOCK } from "./blocks.js";
import { makeTreeSampler } from "./trees.js";
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, MIN_HEIGHT, MAX_HEIGHT, PLAYER_HEIGHT } from "./constants.js";

const BASE_HEIGHT = 18;
const HILL_AMPLITUDE = 10;
const DETAIL_AMPLITUDE = 3;
const TREE_MARGIN = 10; // max vertical span a tree can occupy above the surface

export function makeHeightSampler(seed) {
  const base2D = createValueNoise2D(`${seed}:height`);
  const detail2D = createValueNoise2D(`${seed}:detail`);
  const hills = makeFbm2D(base2D, { octaves: 4, lacunarity: 2.1, gain: 0.5, scale: 0.015 });
  const detail = makeFbm2D(detail2D, { octaves: 2, lacunarity: 2, gain: 0.5, scale: 0.09 });

  return function heightAt(wx, wz) {
    const h = BASE_HEIGHT + hills(wx, wz) * HILL_AMPLITUDE + detail(wx, wz) * DETAIL_AMPLITUDE;
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(h)));
  };
}

/** Column block id at world (wx, wy, wz), given that column's surface height — terrain only, no trees. */
export function blockAtHeight(wy, surfaceHeight) {
  if (wy > surfaceHeight) return BLOCK.AIR;
  if (wy === surfaceHeight) return BLOCK.GRASS;
  if (wy >= surfaceHeight - 3) return BLOCK.DIRT;
  return BLOCK.STONE;
}

function logBlockFor(kind) {
  return kind === "pine" ? BLOCK.PINE_LOG : BLOCK.WILDWOOD_LOG;
}
function leavesBlockFor(kind) {
  return kind === "pine" ? BLOCK.PINE_LEAVES : BLOCK.WILDWOOD_LEAVES;
}

/**
 * The complete pure world sampler: terrain strata + tree canopies. Every
 * consumer (chunk generation, chunk-edge culling, collision fallback) shares
 * this so there is one terrain definition.
 */
export function createTerrainSampler(seed) {
  const heightAt = makeHeightSampler(seed);
  const treeAt = makeTreeSampler(seed, heightAt);

  function blockAt(wx, wy, wz) {
    const h = heightAt(wx, wz);
    if (wy > h) {
      if (wy <= h + TREE_MARGIN) {
        const tree = treeAt(wx, wy, wz);
        if (tree) return tree.part === "log" ? logBlockFor(tree.kind) : leavesBlockFor(tree.kind);
      }
      return BLOCK.AIR;
    }
    return blockAtHeight(wy, h);
  }

  return { heightAt, treeAt, blockAt };
}

/**
 * Generates one chunk's flat voxel array. Index order is
 * `(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx` — matches chunkMesh.js.
 */
export function generateChunkData(sampler, cx, cz, chunkHeight) {
  const data = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z * chunkHeight);
  const originX = cx * CHUNK_SIZE_X;
  const originZ = cz * CHUNK_SIZE_Z;

  for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
    const wz = originZ + lz;
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      const wx = originX + lx;
      const h = sampler.heightAt(wx, wz);
      const topTerrain = Math.min(h, chunkHeight - 1);
      for (let ly = 0; ly <= topTerrain; ly++) {
        const id = blockAtHeight(ly, h);
        if (id !== BLOCK.AIR) data[(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx] = id;
      }
      const topTree = Math.min(h + TREE_MARGIN, chunkHeight - 1);
      for (let ly = topTerrain + 1; ly <= topTree; ly++) {
        const tree = sampler.treeAt(wx, ly, wz);
        if (tree) {
          const id = tree.part === "log" ? logBlockFor(tree.kind) : leavesBlockFor(tree.kind);
          data[(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx] = id;
        }
      }
    }
  }
  return data;
}

export function chunkIndex(lx, ly, lz, chunkHeight) {
  return (ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
}

// How many blocks of clearance above the surface a spawn candidate needs —
// the full player height plus a little headroom, rounded up.
const SPAWN_CLEARANCE = Math.ceil(PLAYER_HEIGHT) + 1;

/**
 * True if any tree part (trunk OR canopy — a nearby tree's leaves can
 * overhang a column that has no trunk of its own) occupies the vertical
 * span a standing player's body would need at this column. Checking only
 * the trunk's base block (the original version of this check) missed
 * low-hanging canopy from an adjacent tree, which could seat the player
 * partway inside solid leaves at the moment of spawn — the collision
 * resolver then has to shove them back out, which is the exact
 * "ejected to a nonsensical position" failure mode the fall-through bug
 * report described.
 */
function hasObstruction(treeAt, x, h, z) {
  for (let dy = 1; dy <= SPAWN_CLEARANCE; dy++) {
    if (treeAt(x, h + dy, z)) return true;
  }
  return false;
}

/**
 * A safe spawn point near world origin. Scans a small spiral for the
 * flattest nearby column (origin itself can land on a local slope) and
 * makes sure the player's full standing height is clear of any tree part —
 * trunk or overhanging canopy. Forest density is boosted near the origin
 * (see trees.js) so a resource cluster near spawn is guaranteed rather than
 * left to chance per-seed; that makes checking the full body height here
 * important, not optional — trees really will be close by.
 */
export function findSpawn(sampler) {
  const { heightAt, treeAt } = sampler;
  let best = null;
  let bestScore = Infinity;
  for (let r = 0; r <= 6; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring only
        const x = dx;
        const z = dz;
        const h = heightAt(x, z);
        if (hasObstruction(treeAt, x, h, z)) continue; // don't spawn inside a trunk or under canopy
        const flatness =
          Math.abs(heightAt(x + 1, z) - h) +
          Math.abs(heightAt(x - 1, z) - h) +
          Math.abs(heightAt(x, z + 1) - h) +
          Math.abs(heightAt(x, z - 1) - h);
        const score = flatness + r * 0.05; // prefer flat, mildly prefer close-to-origin
        if (score < bestScore) {
          bestScore = score;
          best = { x: x + 0.5, y: h + 1.02, z: z + 0.5 };
        }
      }
    }
    if (best && bestScore <= 1) break; // good enough, stop early
  }
  return best || { x: 0.5, y: heightAt(0, 0) + 1.02, z: 0.5 };
}
