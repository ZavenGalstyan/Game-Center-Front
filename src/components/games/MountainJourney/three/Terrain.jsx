/**
 * Mountain Journey — terrain meshes, built once per level from the same
 * analytic heights the physics uses (engine/terrain.js):
 *
 *   grid     2 m lattice over the whole level + margin (hills, valleys)
 *   ribbons  exact-height strips along every trail (0.5 m along, dense
 *            across), drawn over the grid so paths, edges, gap lips and
 *            ledges are crisp where the player looks
 *   caves    rock arches over cave nodes (double-sided, displaced outward)
 *
 * Colour is per vertex: trail surface → grass / alpine / snow by region,
 * rock on steep faces, damp near water, a cheap cavity darkening, snowline.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mats } from "./materials.js";
import { fbm, smoothstep, clamp } from "../engine/rng.js";

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function surfColor(surf, P) {
  switch (surf) {
    case "stone":
      return P.rock;
    case "snow":
      return P.snow;
    case "ice":
      return "#b9d9ee";
    case "rock":
      return P.cliff;
    default:
      return P.dirt;
  }
}

function makeColorer(L) {
  const T = L.terrain;
  const R = L.region;
  const P = R.palette;
  const seed = L.def.seed;
  const lowY = L.lowY;
  const snowline = R.id === 5 ? -999 : R.id === 4 ? lowY + 26 : R.id === 3 ? lowY + 40 : lowY + 60;
  const C = {
    grass: new THREE.Color(P.grass),
    grass2: new THREE.Color(P.grass2),
    dirt: new THREE.Color(P.dirt),
    rock: new THREE.Color(P.rock),
    cliff: new THREE.Color(P.cliff),
    snow: new THREE.Color(P.snow),
    valley: new THREE.Color(P.valley),
    damp: new THREE.Color("#4e5a46"),
    bed: new THREE.Color("#7b7663"),
    alpine: new THREE.Color("#8d9a6a"),
  };
  /** Full colour for one vertex: q (terrain query), s (slope), cav (cavity), damp (0..1). */
  function shade(x, z, q, s, cav, damp, out) {
    const h = q.h;
    const e = q.e;
    const n = fbm(x * 0.08, z * 0.08, seed + 11, 3);
    const n2 = fbm(x * 0.5, z * 0.5, seed + 12, 2);
    // base: off-trail ground
    if (R.id === 5) out.copy(C.snow).lerp(C.grass, n * 0.5);
    else if (R.offSurf === "alpine") out.copy(C.alpine).lerp(C.grass2, n);
    else if (R.offSurf === "rock") out.copy(C.grass).lerp(C.rock, smoothstep(0.35, 0.8, n) * 0.6);
    else out.copy(C.grass).lerp(C.grass2, smoothstep(0.3, 0.75, n));
    // steep faces → rock
    const steep = smoothstep(0.75, 1.6, s);
    if (steep > 0) out.lerp(R.id === 5 && s < 2.2 ? C.snow : C.cliff, steep * (0.75 + n2 * 0.25));
    // snowline on high ground
    if (R.id !== 5 && h > snowline) out.lerp(C.snow, smoothstep(snowline, snowline + 12, h) * (1 - steep * 0.6));
    // deep valley floor (below drop banks)
    if (h < lowY - 12) out.lerp(C.valley, smoothstep(lowY - 12, lowY - 24, h) * 0.85);
    // the trail itself, blending into its shoulders
    if (q.node && e < 0.7) {
      const sc = tmpA.set(surfColor(q.node.surf || R.surf, P));
      if (q.node.surf === "snow") sc.lerp(C.snow, 0.3);
      const k = 1 - smoothstep(-0.55, 0.65, e + (n2 - 0.5) * 0.7);
      // a worn centre line: slightly darker, lighter at the edges
      const wear = 1 - Math.abs(e + q.node.w) / Math.max(0.5, q.node.w);
      tmpB.copy(sc).multiplyScalar(0.92 + (1 - wear) * 0.12 + (n2 - 0.5) * 0.12);
      out.lerp(tmpB, k);
    }
    // damp around water, sandy beds below it
    const w = q.water;
    if (w) {
      if (h < w.level - 0.05) out.lerp(C.bed, 0.85);
      else out.lerp(C.damp, 0.5);
    } else if (damp > 0) out.lerp(C.damp, damp * 0.45);
    // cave floors
    if (q.node && q.node.cave && e < 1) out.multiplyScalar(0.62);
    // cavity darkening / ridge lightening
    out.multiplyScalar(1 - clamp(cav * 0.12, -0.18, 0.28));
    return h;
  }
  /** Standalone (ribbons): does its own neighbour queries. */
  function color(x, z, out) {
    const q = { ...T.query(x, z) };
    const s = T.slope(x, z, q.h).g;
    const ring = (T.height(x + 2, z) + T.height(x - 2, z) + T.height(x, z + 2) + T.height(x, z - 2)) * 0.25;
    const wn = q.water ? 0 : T.waterNear(x, z).water;
    return shade(x, z, q, s, ring - q.h, wn < 2.2 ? 1 - wn / 2.2 : 0, out);
  }
  return { shade, color };
}

function buildGrid(L, colorer) {
  const T = L.terrain;
  const { minX, minZ, maxX, maxZ } = T.bounds;
  const M = 135;
  const step = 2;
  const x0 = Math.floor((minX - M) / step) * step;
  const z0 = Math.floor((minZ - M) / step) * step;
  const nx = Math.ceil((maxX + M - x0) / step) + 1;
  const nz = Math.ceil((maxZ + M - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const c = new THREE.Color();
  // one terrain query per vertex; slope / cavity / damp from the lattice
  const Q = new Array(nx * nz);
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const q = T.query(x0 + i * step, z0 + j * step);
      Q[j * nx + i] = { h: q.h, e: q.e, node: q.node, water: q.water };
      H[j * nx + i] = q.h;
    }
  }
  const at = (i, j) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      const k = j * nx + i;
      const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
      const gz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
      const cav = (at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1)) * 0.25 - H[k];
      let damp = 0;
      if (!Q[k].water) {
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && Q[jj * nx + ii].water) damp = 0.8;
        }
      }
      const h = colorer.shade(x, z, Q[k], Math.hypot(gx, gz), cav, damp, c);
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 7;
      uv[k * 2 + 1] = z / 7;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const d = a + nx;
      const e = d + 1;
      // split along the shorter diagonal-ish (alternate) to avoid ridging
      if ((i + j) % 2) idx.push(a, d, b, b, d, e);
      else idx.push(a, d, e, a, e, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const LAT = [-1, -0.82, -0.66, -0.5, -0.36, -0.22, -0.1, 0, 0.1, 0.22, 0.36, 0.5, 0.66, 0.82, 1];

function buildRibbon(L, path, colorer) {
  const N = path.nodes;
  if (N.length < 2) return null;
  // sample points along the polyline (cliff segments keep just their ends)
  const samples = [];
  for (let i = 0; i < N.length - 1; i++) {
    const a = N[i];
    const b = N[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = len < 0.4 ? 1 : Math.max(1, Math.ceil(len / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t, i, t });
    }
  }
  const last = N[N.length - 1];
  samples.push({ x: last.x, z: last.z, w: last.w, i: N.length - 1, t: 0 });
  // smooth tangents (avoid folds at bends)
  const tang = samples.map((s, k) => {
    const p = samples[Math.max(0, k - 3)];
    const q = samples[Math.min(samples.length - 1, k + 3)];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  });
  const cols = LAT.length;
  const pos = new Float32Array(samples.length * cols * 3);
  const col = new Float32Array(samples.length * cols * 3);
  const uv = new Float32Array(samples.length * cols * 2);
  const c = new THREE.Color();
  samples.forEach((s, k) => {
    const t = tang[k];
    const rx = -t.z;
    const rz = t.x;
    const half = s.w + 3.6;
    for (let j = 0; j < cols; j++) {
      const off = LAT[j] * half;
      const x = s.x + rx * off;
      const z = s.z + rz * off;
      const h = colorer.color(x, z, c);
      const v = (k * cols + j) * 3;
      pos[v] = x;
      pos[v + 1] = h + 0.005;
      pos[v + 2] = z;
      col[v] = c.r;
      col[v + 1] = c.g;
      col[v + 2] = c.b;
      uv[(k * cols + j) * 2] = x / 7;
      uv[(k * cols + j) * 2 + 1] = z / 7;
    }
  });
  const idx = [];
  for (let k = 0; k < samples.length - 1; k++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = k * cols + j;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Rock arches over cave nodes of every path. */
function buildCaves(L) {
  const out = [];
  const T = L.terrain;
  for (const path of L.paths) {
    const N = path.nodes;
    let run = [];
    const flush = () => {
      if (run.length >= 2) out.push(caveTube(T, run, L.def.seed, path.spur ? 2.7 : 0));
      run = [];
    };
    for (let i = 0; i < N.length; i++) {
      if (N[i].cave) run.push(N[i]);
      else flush();
    }
    flush();
  }
  return out;
}

function caveTube(T, nodes, seed, trim = 0) {
  // resample at 0.8 m (a side alcove starts outside the main tunnel)
  const own = new Set(nodes);
  let pts = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.8));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.cave.h });
    }
  }
  const lastN = nodes[nodes.length - 1];
  pts.push({ x: lastN.x, z: lastN.z, y: lastN.y, w: lastN.w, h: lastN.cave.h });
  if (trim > 0) pts = pts.filter((p) => Math.hypot(p.x - nodes[0].x, p.z - nodes[0].z) >= trim);
  if (pts.length < 2) return new THREE.BufferGeometry();
  const ARC = 15;
  const open = [];
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  pts.forEach((p, k) => {
    const q = pts[Math.min(pts.length - 1, k + 1)];
    const o = pts[Math.max(0, k - 1)];
    let dx = q.x - o.x;
    let dz = q.z - o.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const rx = -dz;
    const rz = dx;
    for (let j = 0; j <= ARC; j++) {
      const th = (j / ARC) * Math.PI;
      const n = fbm(p.x * 0.6 + j * 0.37, p.z * 0.6 + j * 0.21, seed + 77, 3);
      const bulge = 0.25 + n * 0.75;
      const halfW = p.w + 0.35 + bulge * 0.5;
      const lx = Math.cos(th) * halfW;
      const ly = Math.sin(th) * (p.h + 0.1 + bulge * 0.35);
      const x = p.x + rx * lx;
      const z = p.z + rz * lx;
      const floor = T.height(x, z);
      const y = Math.max(floor - 0.3, p.y - 0.25) + ly;
      pos.push(x, y, z);
      // where another trail runs through this wall (an alcove, a junction),
      // leave an opening
      const q = T.query(x, z);
      open.push(!!q.node && !own.has(q.node) && q.e < 0.5 && y < q.node.y + (q.node.cave ? q.node.cave.h : 3) + 0.3);
      const shade = 0.45 + n * 0.35;
      c.setRGB(0.42 * shade + 0.05, 0.4 * shade + 0.05, 0.38 * shade + 0.06);
      col.push(c.r, c.g, c.b);
    }
  });
  const cols = ARC + 1;
  for (let k = 0; k < pts.length - 1; k++) {
    for (let j = 0; j < ARC; j++) {
      const a = k * cols + j;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      if (open[a] || open[b] || open[d] || open[e]) continue;
      idx.push(a, d, b, b, d, e);
    }
  }
  if (trim > 0) {
    // a side alcove is a dead end: close it with rock
    const last = pts[pts.length - 1];
    const ci = pos.length / 3;
    pos.push(last.x, last.y + last.h * 0.45, last.z);
    col.push(0.2, 0.19, 0.18);
    const base = (pts.length - 1) * cols;
    for (let j = 0; j < ARC; j++) idx.push(base + j, base + j + 1, ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default function Terrain({ L, quality }) {
  const built = useMemo(() => {
    const colorer = makeColorer(L);
    const grid = buildGrid(L, colorer);
    const ribbons = L.paths.map((p) => buildRibbon(L, p, colorer)).filter(Boolean);
    const caves = buildCaves(L);
    return { grid, ribbons, caves };
  }, [L]);
  useEffect(
    () => () => {
      built.grid.dispose();
      built.ribbons.forEach((g) => g.dispose());
      built.caves.forEach((g) => g.dispose());
    },
    [built],
  );
  const mat = mats.terrain();
  const gridMat = useMemo(() => {
    const m = mat.clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = 2;
    m.polygonOffsetUnits = 2;
    return m;
  }, [mat]);
  const spurMat = useMemo(() => {
    const m = mat.clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    return m;
  }, [mat]);
  const caveMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, map: mats.rock().map, roughness: 0.92, flatShading: true, side: THREE.DoubleSide }), []);
  useEffect(
    () => () => {
      gridMat.dispose();
      spurMat.dispose();
      caveMat.dispose();
    },
    [gridMat, spurMat, caveMat],
  );
  const shadows = quality !== "low";
  return (
    <group>
      <mesh geometry={built.grid} material={gridMat} receiveShadow={shadows} />
      {built.ribbons.map((g, i) => (
        <mesh key={i} geometry={g} material={i === 0 ? mat : spurMat} receiveShadow={shadows} />
      ))}
      {built.caves.map((g, i) => (
        <mesh key={`c${i}`} geometry={g} material={caveMat} receiveShadow={shadows} castShadow={shadows} />
      ))}
    </group>
  );
}
