/**
 * Pirate Cove — island terrain meshes. A polar grid per island (dense rings
 * at the shoreline where it matters), heights from the same analytic terrain
 * the engine uses, painted with vertex colours:
 *   wet sand → dry sand → grass (two tones, noise-varied) → rock on steep
 *   slopes and cliffs, with sandy footpaths from engine/world.js paths.
 * A world-space detail texture multiplies the colours so close-ups aren't flat.
 */
import * as THREE from "three";
import { localHeight, radiusAt } from "../engine/terrain.js";
import { pathWeight } from "../engine/world.js";
import { fbm, smoothstep } from "../engine/rng.js";

export const BIOME_COLORS = {
  tropic: { wet: "#c9b083", sand: "#efdcaa", grass: "#5fa83a", grass2: "#3f8a2e", rock: "#8f8a80", path: "#d9c08c", dirt: "#9a7a52" },
  reef: { wet: "#bba57c", sand: "#e4d09c", grass: "#6a9e3e", grass2: "#4b8030", rock: "#857e72", path: "#cdb381", dirt: "#8a6c48" },
  misty: { wet: "#8e8770", sand: "#b9ad8a", grass: "#4f7a45", grass2: "#36593a", rock: "#6f716c", path: "#a39776", dirt: "#6b5a42" },
  storm: { wet: "#7e7563", sand: "#a69a7c", grass: "#4c6a3c", grass2: "#344c2e", rock: "#5f5d58", path: "#958667", dirt: "#5e4c38" },
  cursed: { wet: "#6f6658", sand: "#9a8d74", grass: "#4a5240", grass2: "#363a30", rock: "#55524e", path: "#8a7c62", dirt: "#4e4034" },
};

export function buildIslandGeometry(isl) {
  const I = isl.I;
  const P = BIOME_COLORS[isl.biome] || BIOME_COLORS.tropic;
  const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, new THREE.Color(v)]));
  const segs = Math.max(96, Math.round(I.radius * 2.6));
  // ring radii as fractions of the local shoreline radius: dense near the coast
  const rings = [];
  for (let i = 0; i <= 26; i++) rings.push(0.02 + (i / 26) * 0.78);
  for (let i = 1; i <= 26; i++) rings.push(0.8 + (i / 26) * 0.32);
  const pos = [];
  const col = [];
  const uv = [];
  const tmp = new THREE.Color();
  // centre vertex
  const h0 = localHeight(I, 0, 0);
  pos.push(I.x, h0, I.z);
  uv.push(I.x * 0.18, I.z * 0.18);
  tmp.copy(C.grass2);
  col.push(tmp.r, tmp.g, tmp.b);
  for (let r = 0; r < rings.length; r++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const R = radiusAt(I, a) * rings[r];
      const lx = Math.cos(a) * R;
      const lz = Math.sin(a) * R;
      const h = localHeight(I, lx, lz);
      const x = I.x + lx;
      const z = I.z + lz;
      pos.push(x, h, z);
      uv.push(x * 0.18, z * 0.18);
      // slope from neighbours
      const e = 0.9;
      const sx = (localHeight(I, lx + e, lz) - localHeight(I, lx - e, lz)) / (2 * e);
      const sz = (localHeight(I, lx, lz + e) - localHeight(I, lx, lz - e)) / (2 * e);
      const slope = Math.hypot(sx, sz);
      const n = fbm(x * 0.06, z * 0.06, I.seed * 3, 3);
      const n2 = fbm(x * 0.21, z * 0.21, I.seed * 5, 2);
      // sand → grass blend by height, broken up by noise
      const sandTop = 1.25 + (n - 0.5) * 1.1;
      const grassW = smoothstep(sandTop - 0.35, sandTop + 0.45, h);
      tmp.copy(C.wet).lerp(C.sand, smoothstep(-0.3, 0.55, h));
      const grass = C.grass.clone().lerp(C.grass2, smoothstep(0.35, 0.7, n2));
      grass.lerp(C.dirt, smoothstep(0.75, 0.95, n) * 0.35);
      tmp.lerp(grass, grassW);
      // rock on steep ground
      const rockW = smoothstep(0.75, 1.25, slope + (n2 - 0.5) * 0.4);
      tmp.lerp(C.rock, rockW);
      // footpaths
      const pw = pathWeight(isl, x, z) * (1 - rockW);
      if (pw > 0) tmp.lerp(h < sandTop ? C.sand : C.path, pw * 0.85);
      // tiny brightness jitter
      tmp.multiplyScalar(0.94 + n2 * 0.12);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  const idx = [];
  // centre fan
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + r * segs + s;
      const b = 1 + r * segs + ((s + 1) % segs);
      const c = a + segs;
      const d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Sea rock: a jagged lump sized to the terrain rock's radius/height. */
export function buildRockGeometry(r, h, seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = fbm(x * 1.7 + seed, z * 1.7 - seed, seed, 3);
    const k = 0.75 + n * 0.55;
    const yy = y < 0 ? y * 0.6 : y;
    p.setXYZ(i, x * r * k * (y > 0.5 ? 0.75 : 1), (yy * 0.5 + 0.5) * (h + 6) * (0.85 + n * 0.3) - 6, z * r * k * (y > 0.5 ? 0.75 : 1));
  }
  g.computeVertexNormals();
  return g;
}
