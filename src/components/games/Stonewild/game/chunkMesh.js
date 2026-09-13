/**
 * Stonewild — chunk mesh building (face culling, one draw call per chunk).
 *
 * Never one component/cube — this walks the chunk's flat voxel array once
 * and emits only exposed faces into a single non-indexed BufferGeometry with
 * per-vertex color. Block "texture" is entirely procedural: a cheap 3D hash
 * jitters each block's base color a little, and each face direction gets a
 * fixed shading multiplier (top brightest, bottom darkest) as a stand-in for
 * real ambient occlusion — enough to read as more than flat plastic cubes
 * without an actual texture atlas or per-face light baking.
 *
 * Faces at a chunk's edge are resolved by calling the *pure* sampler.blockAt
 * for the neighboring column instead of touching the neighbor chunk's data
 * — see worldgen.js. That means correct face culling at chunk borders (tree
 * canopies included) even before the neighbor chunk has been generated, and
 * no need to mark a chunk dirty when its neighbor shows up later.
 */

import * as THREE from "three";
import { BLOCK, BLOCKS } from "./blocks.js";
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from "./constants.js";

// Six faces: outward normal, 4 corner offsets (CCW as seen from outside), shading.
const FACES = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.7 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.9 },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.62 },
];

function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function blockIdAt(data, cx, cz, chunkHeight, sampler, lx, ly, lz) {
  if (lx >= 0 && lx < CHUNK_SIZE_X && lz >= 0 && lz < CHUNK_SIZE_Z && ly >= 0 && ly < chunkHeight) {
    return data[(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx];
  }
  if (ly < 0) return BLOCK.STONE; // world floor boundary — never render underneath it
  if (ly >= chunkHeight) return BLOCK.AIR; // open sky above the build limit
  const wx = cx * CHUNK_SIZE_X + lx;
  const wz = cz * CHUNK_SIZE_Z + lz;
  return sampler.blockAt(wx, ly, wz);
}

/**
 * Builds one THREE.BufferGeometry for a chunk. Returns null if the chunk is
 * entirely air (nothing to draw — keeps the scene graph free of empty meshes).
 */
export function buildChunkGeometry(data, cx, cz, chunkHeight, sampler) {
  const positions = [];
  const normals = [];
  const colors = [];

  for (let ly = 0; ly < chunkHeight; ly++) {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const id = data[(ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx];
        if (id === BLOCK.AIR) continue;
        const def = BLOCKS[id];
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;
        const jitter = (hash3(wx, ly, wz) * 2 - 1) * (def.colorJitter || 0);

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const neighbor = blockIdAt(data, cx, cz, chunkHeight, sampler, lx + dx, ly + dy, lz + dz);
          if (neighbor !== BLOCK.AIR) continue; // hidden face — opaque neighbor covers it

          const base = dy > 0 && def.topColor ? def.topColor : def.color;
          const r = Math.min(1, Math.max(0, base[0] + jitter)) * face.shade;
          const g = Math.min(1, Math.max(0, base[1] + jitter)) * face.shade;
          const b = Math.min(1, Math.max(0, base[2] + jitter)) * face.shade;

          const [c0, c1, c2, c3] = face.corners;
          const quad = [c0, c1, c2, c0, c2, c3];
          for (const c of quad) {
            positions.push(lx + c[0], ly + c[1], lz + c[2]);
            normals.push(dx, dy, dz);
            colors.push(r, g, b);
          }
        }
      }
    }
  }

  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
