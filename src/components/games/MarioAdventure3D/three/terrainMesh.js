/**
 * Mario Adventure 3D — island meshes.
 *
 * Each island is meshed on a POLAR grid (rings from the centre out to the
 * exact wobbly coastline) so the edge is crisp and there are no gaps between
 * the top and the cliff. Heights come from engine/terrain.js — the very same
 * function the player collides with. Below the coast hangs a rocky skirt:
 * straight down into the sea / lava, or tapering to a point for floating
 * islands. Colour is per-vertex (world palette + noise + slope), multiplied
 * by a neutral detail texture in world space.
 */
import * as THREE from "three";
import { coastRadius, islandPoint } from "../engine/terrain.js";

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

function hash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function buildIslandMesh(terrain, isl, world, opts) {
  const { seaY } = opts;
  // coast circumference → segment count
  let maxR = 0;
  for (let k = 0; k < 32; k++) maxR = Math.max(maxR, coastRadius(isl, (k / 32) * Math.PI * 2));
  const nT = Math.max(40, Math.min(240, Math.round((Math.PI * 2 * maxR) / 0.8)));
  const nR = Math.max(4, Math.min(70, Math.round(maxR / 0.75)));
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  const topCols = (isl.top || world.top).map((c) => new THREE.Color(c));
  const sideCols = world.side.map((c) => new THREE.Color(c));
  const rockC = new THREE.Color(world.rock);
  const h = (x, z) => terrain.islandHeight(isl, x, z);

  const pushV = (x, y, z, c) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    uv.push(x / 4, z / 4);
    return pos.length / 3 - 1;
  };
  const topColor = (x, z, s) => {
    const n = vnoise(x * 0.18, z * 0.18);
    const n2 = vnoise(x * 0.9 + 40, z * 0.9);
    tmp.copy(topCols[0]).lerp(topCols[1], n);
    tmp.lerp(topCols[2] || topCols[0], Math.max(0, n2 - 0.6) * 1.5);
    // slope → dirt
    const e = 0.35;
    const sl = Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e);
    if (sl > 0.55) tmp.lerp(sideCols[0], Math.min(1, (sl - 0.55) * 1.6));
    // brighter lip at the coast
    if (s > 0.965) tmp.lerp(tmp2.set("#ffffff"), 0.12);
    return tmp;
  };

  // centre
  const c0 = pushV(isl.x, h(isl.x, isl.z), isl.z, topColor(isl.x, isl.z, 0));
  const ring = []; // ring[r][t] vertex index
  for (let r = 1; r <= nR; r++) {
    const s = r === nR ? 0.9995 : r / nR;
    const row = [];
    for (let t = 0; t < nT; t++) {
      const th = (t / nT) * Math.PI * 2;
      const [x, z] = islandPoint(isl, th, s);
      const y = h(x, z);
      row.push(pushV(x, y, z, topColor(x, z, s)));
    }
    ring.push(row);
  }
  for (let t = 0; t < nT; t++) {
    const t1 = (t + 1) % nT;
    idx.push(c0, ring[0][t1], ring[0][t]);
  }
  for (let r = 0; r < nR - 1; r++) {
    for (let t = 0; t < nT; t++) {
      const t1 = (t + 1) % nT;
      const a = ring[r][t];
      const b = ring[r][t1];
      const c = ring[r + 1][t];
      const d = ring[r + 1][t1];
      idx.push(a, b, c, b, d, c);
    }
  }

  // skirt: lip, then rock strata down to the sea (or a floating island's tip)
  const coast = ring[nR - 1];
  const floating = isl.float ?? 0;
  const bottomY = floating ? isl.h - floating : Math.min(isl.h - 2.5, seaY - 3);
  const rows = floating ? 7 : 5;
  let prev = coast;
  for (let k = 1; k <= rows; k++) {
    const f = k / rows;
    const row = [];
    for (let t = 0; t < nT; t++) {
      const th = (t / nT) * Math.PI * 2;
      const topY = pos[coast[t] * 3 + 1];
      let s;
      let y;
      if (floating) {
        s = 1 - Math.pow(f, 1.6) * 0.92 + (hash(t, k) - 0.5) * 0.06 * (1 - f);
        y = topY - 0.35 - (topY - bottomY - 0.35) * Math.pow(f, 0.9);
      } else {
        const jag = (hash(t * 3.1, k) - 0.5) * 0.08 + Math.sin(th * 7 + k) * 0.015;
        s = 1 + jag - f * 0.02;
        y = k === 1 ? topY - 0.35 : topY - 0.35 - (topY - 0.35 - bottomY) * ((k - 1) / (rows - 1));
      }
      const [x, z] = islandPoint(isl, th, s);
      // strata colours
      const band = Math.floor((topY - y) / 1.3 + hash(t, 7) * 0.4);
      tmp.copy(k === 1 ? topCols[0] : sideCols[band % sideCols.length]);
      if (k === 1) tmp.multiplyScalar(0.82);
      if (f > 0.75 && !floating) tmp.lerp(rockC, 0.5);
      tmp.multiplyScalar(0.92 + hash(t, k * 3) * 0.12);
      const vi = pushV(x, y, z, tmp);
      uv[vi * 2] = (th * maxR) / 4;
      uv[vi * 2 + 1] = y / 4;
      row.push(vi);
    }
    for (let t = 0; t < nT; t++) {
      const t1 = (t + 1) % nT;
      const a = prev[t];
      const b = prev[t1];
      const c = row[t];
      const d = row[t1];
      idx.push(a, b, c, b, d, c);
    }
    prev = row;
  }
  if (floating) {
    const tip = pushV(isl.x, bottomY - 0.6, isl.z, tmp.copy(rockC).multiplyScalar(0.8));
    for (let t = 0; t < nT; t++) idx.push(prev[t], prev[(t + 1) % nT], tip);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, opts.material);
  m.receiveShadow = true;
  m.castShadow = opts.castShadow;
  return m;
}

export function buildTerrain(terrain, world, opts) {
  const group = new THREE.Group();
  group.name = "terrain";
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, map: opts.detailMap });
  const geos = [];
  for (const isl of terrain.islands) {
    const m = buildIslandMesh(terrain, isl, world, { ...opts, material });
    geos.push(m.geometry);
    group.add(m);
  }
  return {
    group,
    dispose() {
      for (const g of geos) g.dispose();
      material.dispose();
    },
  };
}
