/**
 * Stonewild — chunk load/unload/mesh lifecycle, plus world modifications.
 *
 * Plain JS class, not a React component: chunk meshes are added straight to
 * a THREE.Group imperatively, so the world never becomes "one component per
 * block" (or even one per chunk) in React's tree. <StonewildScene> drives
 * this from useFrame; React only re-renders for menu/HUD state, never per
 * block.
 *
 * WORLD SAVE MODEL (spec requirement — don't serialize generated terrain):
 * every player edit (break -> AIR, place -> blockId) is recorded in
 * `modsByChunk`, keyed by chunk so it can be re-applied the moment that
 * chunk is (re)generated from the seed — whether that's the first time this
 * session or after a fresh page load. `exportModifications()` /
 * `loadModifications()` are what utils/worldSave.js persists to IndexedDB —
 * only edits, never the terrain itself.
 *
 * Work is deliberately spread out: `update()` regenerates the "wanted" set
 * only when the player crosses into a new chunk cell, generates chunk data
 * for a few newly-wanted chunks per call, and (re)builds at most
 * CHUNK_BUILDS_PER_FRAME meshes per call — so walking never produces a
 * multi-chunk stutter.
 */

import * as THREE from "three";
import { generateChunkData } from "./worldgen.js";
import { buildChunkGeometry } from "./chunkMesh.js";
import { isSolidBlock } from "./blocks.js";
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Z,
  CHUNK_HEIGHT,
  UNLOAD_MARGIN,
  CHUNK_BUILDS_PER_FRAME,
} from "./constants.js";

const key = (cx, cz) => `${cx},${cz}`;
const CELL_VOLUME = CHUNK_SIZE_X * CHUNK_SIZE_Z;

export class ChunkManager {
  constructor(sampler, group, material) {
    this.sampler = sampler;
    this.group = group;
    this.material = material;
    this.chunks = new Map(); // key -> { cx, cz, data, mesh, needsMesh, dist }
    this.modsByChunk = new Map(); // key -> Map(localIndex -> blockId) — player edits, survive unload
    this.generateQueue = [];
    this.meshQueue = [];
    this.loadRadius = 4;
    this._lastPlayerChunk = null;
    this.loadedChunkCount = 0;
  }

  setLoadRadius(radius) {
    if (radius !== this.loadRadius) {
      this.loadRadius = radius;
      this._lastPlayerChunk = null; // force a re-scan next update()
    }
  }

  worldToChunk(wx, wz) {
    return [Math.floor(wx / CHUNK_SIZE_X), Math.floor(wz / CHUNK_SIZE_Z)];
  }

  /** Block id at world coords — loaded chunk data, else recorded edits, else the pure generator. */
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const [cx, cz] = this.worldToChunk(wx, wz);
    const k = key(cx, cz);
    const chunk = this.chunks.get(k);
    const lx = wx - cx * CHUNK_SIZE_X;
    const lz = wz - cz * CHUNK_SIZE_Z;
    if (chunk && chunk.data) return chunk.data[(wy * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx];
    const idx = (wy * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
    const modMap = this.modsByChunk.get(k);
    if (modMap && modMap.has(idx)) return modMap.get(idx);
    return this.sampler.blockAt(wx, wy, wz);
  }

  isSolid(wx, wy, wz) {
    if (wy < 0) return true; // world floor
    return isSolidBlock(this.getBlock(wx, wy, wz));
  }

  /**
   * Applies a player edit. Only works on an already-loaded chunk (breaking/
   * placing only ever targets something within reach, which is always
   * loaded). Records the edit so it survives unload and save/load, and
   * marks this chunk — and any boundary-adjacent neighbor — dirty for a
   * mesh rebuild.
   */
  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const [cx, cz] = this.worldToChunk(wx, wz);
    const k = key(cx, cz);
    const chunk = this.chunks.get(k);
    if (!chunk || !chunk.data) return false;
    const lx = wx - cx * CHUNK_SIZE_X;
    const lz = wz - cz * CHUNK_SIZE_Z;
    const idx = (wy * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
    chunk.data[idx] = id;

    let modMap = this.modsByChunk.get(k);
    if (!modMap) {
      modMap = new Map();
      this.modsByChunk.set(k, modMap);
    }
    modMap.set(idx, id);

    this._markDirty(k, chunk);
    if (lx === 0) this._markNeighborDirty(cx - 1, cz);
    else if (lx === CHUNK_SIZE_X - 1) this._markNeighborDirty(cx + 1, cz);
    if (lz === 0) this._markNeighborDirty(cx, cz - 1);
    else if (lz === CHUNK_SIZE_Z - 1) this._markNeighborDirty(cx, cz + 1);
    return true;
  }

  _markDirty(k, chunk) {
    if (!chunk.needsMesh) {
      chunk.needsMesh = true;
      this.meshQueue.push(k);
    }
  }

  _markNeighborDirty(cx, cz) {
    const chunk = this.chunks.get(key(cx, cz));
    if (chunk && chunk.data) this._markDirty(key(cx, cz), chunk);
  }

  /** Flattens recorded edits to world coords, for saving. */
  exportModifications() {
    const out = [];
    for (const [k, modMap] of this.modsByChunk) {
      const [cx, cz] = k.split(",").map(Number);
      for (const [idx, id] of modMap) {
        const ly = Math.floor(idx / CELL_VOLUME);
        const rem = idx - ly * CELL_VOLUME;
        const lz = Math.floor(rem / CHUNK_SIZE_X);
        const lx = rem - lz * CHUNK_SIZE_X;
        out.push([cx * CHUNK_SIZE_X + lx, ly, cz * CHUNK_SIZE_Z + lz, id]);
      }
    }
    return out;
  }

  /** Hydrates recorded edits from a save. MUST be called before any chunk generates. */
  loadModifications(list) {
    for (const [wx, wy, wz, id] of list) {
      const [cx, cz] = this.worldToChunk(wx, wz);
      const k = key(cx, cz);
      const lx = wx - cx * CHUNK_SIZE_X;
      const lz = wz - cz * CHUNK_SIZE_Z;
      const idx = (wy * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
      let modMap = this.modsByChunk.get(k);
      if (!modMap) {
        modMap = new Map();
        this.modsByChunk.set(k, modMap);
      }
      modMap.set(idx, id);
    }
  }

  /** Ensures every chunk within `radius` of (px, pz) exists, generating a handful per call. */
  _ensureWanted(px, pz, radius) {
    const [pcx, pcz] = this.worldToChunk(px, pz);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = key(cx, cz);
        if (!this.chunks.has(k)) {
          this.chunks.set(k, { cx, cz, data: null, mesh: null, needsMesh: false, dist: dx * dx + dz * dz });
          this.generateQueue.push(k);
        }
      }
    }
    this.generateQueue.sort((a, b) => (this.chunks.get(a)?.dist ?? 0) - (this.chunks.get(b)?.dist ?? 0));
  }

  /** Synchronously builds every chunk within `radius` — used once by the loading screen so spawn ground exists immediately. */
  preload(px, pz, radius) {
    this._ensureWanted(px, pz, radius);
    while (this.generateQueue.length) this._generateOne();
    for (const chunk of this.chunks.values()) this._rebuildMesh(chunk);
    this._lastPlayerChunk = this.worldToChunk(px, pz).join(",");
  }

  _generateOne() {
    const k = this.generateQueue.shift();
    const chunk = this.chunks.get(k);
    if (!chunk || chunk.data) return;
    chunk.data = generateChunkData(this.sampler, chunk.cx, chunk.cz, CHUNK_HEIGHT);
    const modMap = this.modsByChunk.get(k);
    if (modMap) for (const [idx, id] of modMap) chunk.data[idx] = id;
    chunk.needsMesh = true;
    this.meshQueue.push(k);
    // Neighbors already meshed need a rebuild so their border faces see this chunk's data too.
    for (const [ncx, ncz] of [[chunk.cx + 1, chunk.cz], [chunk.cx - 1, chunk.cz], [chunk.cx, chunk.cz + 1], [chunk.cx, chunk.cz - 1]]) {
      const nk = key(ncx, ncz);
      const neighbor = this.chunks.get(nk);
      if (neighbor && neighbor.mesh && !neighbor.needsMesh) {
        neighbor.needsMesh = true;
        this.meshQueue.push(nk);
      }
    }
  }

  _rebuildMesh(chunk) {
    if (!chunk.data) return;
    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }
    const geometry = buildChunkGeometry(chunk.data, chunk.cx, chunk.cz, CHUNK_HEIGHT, this.sampler);
    chunk.needsMesh = false;
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(chunk.cx * CHUNK_SIZE_X, 0, chunk.cz * CHUNK_SIZE_Z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    chunk.mesh = mesh;
    this.group.add(mesh);
  }

  _unloadFar(px, pz) {
    const [pcx, pcz] = this.worldToChunk(px, pz);
    const limit = this.loadRadius + UNLOAD_MARGIN;
    for (const [k, chunk] of this.chunks) {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > limit * limit) {
        if (chunk.mesh) {
          this.group.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
        }
        this.chunks.delete(k); // modsByChunk is intentionally kept — edits must survive unload
        const gi = this.generateQueue.indexOf(k);
        if (gi !== -1) this.generateQueue.splice(gi, 1);
        const mi = this.meshQueue.indexOf(k);
        if (mi !== -1) this.meshQueue.splice(mi, 1);
      }
    }
  }

  /** Call once per frame from the render loop. Cheap when nothing changed. */
  update(px, pz) {
    const cellKey = this.worldToChunk(px, pz).join(",");
    if (cellKey !== this._lastPlayerChunk) {
      this._lastPlayerChunk = cellKey;
      this._ensureWanted(px, pz, this.loadRadius);
      this._unloadFar(px, pz);
    }
    if (this.generateQueue.length) {
      this._generateOne();
    } else {
      for (let i = 0; i < CHUNK_BUILDS_PER_FRAME && this.meshQueue.length; i++) {
        const k = this.meshQueue.shift();
        const chunk = this.chunks.get(k);
        if (chunk && chunk.needsMesh) this._rebuildMesh(chunk);
      }
    }
    this.loadedChunkCount = this.chunks.size;
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) {
        this.group.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
      }
    }
    this.chunks.clear();
    this.generateQueue.length = 0;
    this.meshQueue.length = 0;
  }
}
