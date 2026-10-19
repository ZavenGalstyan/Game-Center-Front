/**
 * Vice Streets 3D — static city geometry.
 *
 * Everything static is merged into a handful of meshes (one per material),
 * built in 160 m chunks so off-screen chunks are frustum-culled:
 *   ground      asphalt, kerbs + sidewalks, lots, sand, hills terrain, quay
 *   markings    lane lines, dashes, zebra crossings, stop lines, parking bays
 *   walls       building walls per facade texture (windows light up at night)
 *   roofs       roofs, parapets, rooftop plant, pitched roofs
 *   details     awnings, signs (neon atlas), doors, hedges, walls
 * Repeated props are InstancedMeshes (palms, lamps, trees, benches,
 * containers, umbrellas, signal heads). Traffic-signal lamps are recoloured
 * every frame from the live light state; gates show while a district is
 * locked.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COLS, ROWS, ROAD_HALF, HILL_HALF, CURB, WATER, BOUNDS, ICOLS, ISLAND, BRIDGES, groundAt, districtAt, lightState, LIGHT_CYCLE } from "../engine/city.js";
import { facade, signAtlas, awning, noise, chainLink } from "./textures.js";
import { rng } from "../engine/util.js";

const CHUNK = 160;
const _c = new THREE.Color();

/** accumulating geometry builder (non-indexed triangles) */
class GB {
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
    this.c = [];
  }
  tri(a, b, c, uvA, uvB, uvC, col) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L;
    ny /= L;
    nz /= L;
    for (const [v, uv] of [[a, uvA], [b, uvB], [c, uvC]]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx, ny, nz);
      this.u.push(uv[0], uv[1]);
      this.c.push(col.r, col.g, col.b);
    }
  }
  /** quad a b c d (counter-clockwise seen from the front) */
  quad(a, b, c, d, col, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    this.tri(a, b, c, uv[0], uv[1], uv[2], col);
    this.tri(a, c, d, uv[0], uv[2], uv[3], col);
  }
  /** axis-aligned box; uvScale = [metres per u, metres per v] for walls; no bottom face */
  box(x0, y0, z0, x1, y1, z1, col, uvS = null, top = true, walls = true) {
    const su = uvS ? uvS[0] : 1e9;
    const sv = uvS ? uvS[1] : 1e9;
    const h = (y1 - y0) / sv;
    const ox = uvS ? (x0 * 0.37) % 1 : 0;
    if (walls) {
      // south (+z), north (-z), east (+x), west (-x)
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, [[ox, 0], [ox + (x1 - x0) / su, 0], [ox + (x1 - x0) / su, h], [ox, h]]);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, [[ox, 0], [ox + (x1 - x0) / su, 0], [ox + (x1 - x0) / su, h], [ox, h]]);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, [[ox, 0], [ox + (z1 - z0) / su, 0], [ox + (z1 - z0) / su, h], [ox, h]]);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, [[ox, 0], [ox + (z1 - z0) / su, 0], [ox + (z1 - z0) / su, h], [ox, h]]);
    }
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col, [[x0 / 8, z1 / 8], [x1 / 8, z1 / 8], [x1 / 8, z0 / 8], [x0 / 8, z0 / 8]]);
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}
const col = (hex, k = 1) => _c.set(hex).multiplyScalar(k).clone();

export function buildCityMesh(city, { shadows = true, quality = "high" } = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const chunks = new Map();
  const chunk = (x, z, key) => {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}:${key}`;
    if (!chunks.has(k)) chunks.set(k, new GB());
    return chunks.get(k);
  };
  const R = rng(4242);

  /* ---------------- materials ---------------- */
  const FAC = ["tower", "hotel", "shop", "house", "warehouse", "glass"];
  const facMat = {};
  for (const f of FAC) {
    const T = facade(f);
    facMat[f] = new THREE.MeshStandardMaterial({ map: T.map, vertexColors: true, roughness: f === "glass" || f === "tower" ? 0.35 : 0.8, metalness: f === "tower" || f === "glass" ? 0.25 : 0, emissive: "#ffffff", emissiveMap: T.emissive, emissiveIntensity: 0 });
  }
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: noise("#d0d0d0", 26, 128, 3) });
  const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const awnMat = new THREE.MeshStandardMaterial({ map: awning(), vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const atlas = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: atlas.map, emissive: "#ffffff", emissiveMap: atlas.map, emissiveIntensity: 0.35, roughness: 0.5 });
  const fenceMat = new THREE.MeshStandardMaterial({ map: chainLink(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 });
  const waterMat = new THREE.MeshStandardMaterial({ color: "#2a8fb5", roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92, emissive: "#05303f", emissiveIntensity: 0.4 });
  disposables.push(groundMat, plainMat, markMat, awnMat, signMat, fenceMat, waterMat, ...Object.values(facMat));

  /* ---------------- ground ---------------- */
  const ASPH = col("#3b3e44");
  const SIDE = col("#cfc8bb");
  const KERB = col("#e2ddd2");
  const LOT = {
    downtown: col("#d8ccb4"),
    haven: col("#6fa65a"),
    beach: col("#e9d8b0"),
    docks: col("#8d8f8c"),
    hills: col("#79ad5f"),
    key: col("#8cc96f"),
  };
  // asphalt base over the street grid
  {
    const g = chunk(0, 0, "ground");
    void g;
    for (let x = BOUNDS.x0; x < 286; x += CHUNK / 2) {
      for (let z = -191; z < WATER.south; z += CHUNK / 2) {
        const x1 = Math.min(286, x + CHUNK / 2);
        const z1 = Math.min(WATER.south, z + CHUNK / 2);
        chunk(x, z, "ground").quad([x, 0, z1], [x1, 0, z1], [x1, 0, z], [x, 0, z], ASPH, [[x / 6, z1 / 6], [x1 / 6, z1 / 6], [x1 / 6, z / 6], [x / 6, z / 6]]);
      }
    }
  }
  // blocks: sidewalk ring (kerb height) and the lot inside
  for (let i = 0; i < COLS.length - 1; i++) {
    for (let j = 0; j < ROWS.length - 1; j++) {
      const x0 = COLS[i] + ROAD_HALF;
      const x1 = COLS[i + 1] - ROAD_HALF;
      const z0 = ROWS[j] + ROAD_HALF;
      const z1 = ROWS[j + 1] - ROAD_HALF;
      const d = districtAt((x0 + x1) / 2, (z0 + z1) / 2);
      const g = chunk((x0 + x1) / 2, (z0 + z1) / 2, "ground");
      g.box(x0, -0.2, z0, x1, CURB, z1, SIDE, [1e9, 1e9]);
      // kerb edge highlight
      g.box(x0, CURB - 0.01, z0, x1, CURB + 0.004, z0 + 0.25, KERB, null, true, false);
      g.box(x0, CURB - 0.01, z1 - 0.25, x1, CURB + 0.004, z1, KERB, null, true, false);
      g.box(x0, CURB - 0.01, z0, x0 + 0.25, CURB + 0.004, z1, KERB, null, true, false);
      g.box(x1 - 0.25, CURB - 0.01, z0, x1, CURB + 0.004, z1, KERB, null, true, false);
      const zone = city.zones.find((zn) => zn.kind === "park" && zn.x0 === x0 + 4 && zn.z0 === z0 + 4);
      const lot = zone ? LOT.haven : LOT[d];
      g.box(x0 + 4, CURB, z0 + 4, x1 - 4, CURB + 0.006, z1 - 4, lot, null, true, false);
    }
  }
  // western edge strip (outside the first column) and map border greenery
  {
    const g = chunk(-360, 0, "ground");
    g.box(BOUNDS.x0 - 40, -0.2, -191, COLS[0] - ROAD_HALF, CURB, WATER.south, col("#5e9a4c"), null);
  }
  // beach promenade + sand
  {
    // split the beach strip into spans that skip the causeway roads
    const cuts = BRIDGES.map((bz) => [bz - ROAD_HALF, bz + ROAD_HALF]).sort((a, b) => a[0] - b[0]);
    const spans = [];
    let z = -191;
    for (const [a, b] of cuts) {
      spans.push([z, a]);
      z = b;
    }
    spans.push([z, WATER.south + 18]);
    for (const [za, zb] of spans) {
      for (let q = za; q < zb; q += 80) {
        const z1 = Math.min(zb, q + 80);
        const g = chunk(300, q, "ground");
        g.box(276, -0.2, q, 286, CURB, z1, SIDE, null);
        g.box(286, -0.4, q, WATER.east + 12, 0.06, z1, col("#ecd9a6"), null);
      }
    }
    // the causeway roads across the beach (asphalt at road level) …
    for (const bz of BRIDGES) {
      const g = chunk(310, bz, "ground");
      g.box(276, -0.6, bz - ROAD_HALF, WATER.east + 0.5, 0, bz + ROAD_HALF, ASPH, null);
    }
  }
  /* ---------------- Coral Key: shore, asphalt, blocks; the causeway decks ---------------- */
  {
    const SAND = col("#ecd9a6");
    const g = chunk(ISLAND.x0 + 150, 0, "ground");
    // sandy shore all round, grass inland
    g.box(ISLAND.x0 - 6, -0.6, ISLAND.z0 - 6, ISLAND.x1 + 6, 0.06, ISLAND.z1 + 6, SAND, null);
    const gx0 = ICOLS[0] - ROAD_HALF;
    const gx1 = ICOLS[ICOLS.length - 1] + ROAD_HALF;
    const gz0 = ROWS[0] - ROAD_HALF;
    const gz1 = ROWS[4] + ROAD_HALF;
    for (let x = gx0; x < gx1; x += CHUNK / 2) {
      for (let z = gz0; z < gz1; z += CHUNK / 2) {
        const x1 = Math.min(gx1, x + CHUNK / 2);
        const z1 = Math.min(gz1, z + CHUNK / 2);
        chunk(x, z, "ground").quad([x, 0.065, z1], [x1, 0.065, z1], [x1, 0.065, z], [x, 0.065, z], ASPH, [[x / 6, z1 / 6], [x1 / 6, z1 / 6], [x1 / 6, z / 6], [x / 6, z / 6]]);
      }
    }
    for (let i = 0; i < ICOLS.length - 1; i++) {
      for (let j = 0; j < 4; j++) {
        const x0 = ICOLS[i] + ROAD_HALF;
        const x1 = ICOLS[i + 1] - ROAD_HALF;
        const z0 = ROWS[j] + ROAD_HALF;
        const z1 = ROWS[j + 1] - ROAD_HALF;
        const b = chunk((x0 + x1) / 2, (z0 + z1) / 2, "ground");
        b.box(x0, -0.2, z0, x1, CURB, z1, SIDE, [1e9, 1e9]);
        b.box(x0, CURB - 0.01, z0, x1, CURB + 0.004, z0 + 0.25, KERB, null, true, false);
        b.box(x0, CURB - 0.01, z1 - 0.25, x1, CURB + 0.004, z1, KERB, null, true, false);
        b.box(x0, CURB - 0.01, z0, x0 + 0.25, CURB + 0.004, z1, KERB, null, true, false);
        b.box(x1 - 0.25, CURB - 0.01, z0, x1, CURB + 0.004, z1, KERB, null, true, false);
        const park = city.zones.find((zn) => zn.kind === "park" && zn.x0 === x0 + 4 && zn.z0 === z0 + 4);
        b.box(x0 + 4, CURB, z0 + 4, x1 - 4, CURB + 0.006, z1 - 4, park ? LOT.haven : LOT.key, null, true, false);
      }
    }
    // causeway decks over the water: concrete slab, kerbs, railings, piers
    const CONC = col("#c9c6bf");
    const RAIL = col("#eef0f2");
    for (const bz of BRIDGES) {
      const d = chunk(377, bz, "ground");
      d.box(WATER.east, -1.2, bz - ROAD_HALF - 1, ISLAND.x0, -0.02, bz + ROAD_HALF + 1, CONC, null);
      d.box(WATER.east, -0.05, bz - ROAD_HALF, ISLAND.x0 + 0.5, 0, bz + ROAD_HALF, ASPH, null);
      for (const sd of [-1, 1]) {
        const zr = bz + sd * (ROAD_HALF + 0.6);
        d.box(WATER.east, 0, zr - 0.35, ISLAND.x0, 0.3, zr + 0.35, CONC, null);
        d.box(WATER.east, 0.95, zr - 0.06, ISLAND.x0, 1.05, zr + 0.06, RAIL, null);
        for (let x = WATER.east + 2; x < ISLAND.x0; x += 4) d.box(x - 0.05, 0.3, zr - 0.05, x + 0.05, 1, zr + 0.05, RAIL, null);
      }
      for (let x = WATER.east + 12; x < ISLAND.x0 - 4; x += 18) d.box(x - 1.2, -6, bz - 4, x + 1.2, -1.2, bz + 4, CONC, null);
    }
  }
  // quay: concrete apron south of the docks road
  for (let x = BOUNDS.x0; x < 286; x += 80) {
    const g = chunk(x, 280, "ground");
    g.box(x, -1.6, 276, Math.min(286, x + 80), CURB, WATER.south, col("#a3a39d"), null);
  }
  // hills terrain (4 m grid, heights from groundAt) incl. a skirt under the hedge
  {
    const step = 4;
    const xs = [];
    for (let x = BOUNDS.x0 - 40; x <= 300; x += step) xs.push(x);
    const zs = [];
    for (let z = BOUNDS.z0 - 40; z <= -186; z += step) zs.push(z);
    for (let a = 0; a < xs.length - 1; a++) {
      for (let b = 0; b < zs.length - 1; b++) {
        const x0 = xs[a];
        const x1 = xs[a + 1];
        const z0 = zs[b];
        const z1 = zs[b + 1];
        const y = (x, z) => groundAt(x, z) + (z > -192 ? CURB : 0.02);
        const shade = 0.92 + ((a * 7 + b * 13) % 5) * 0.025;
        const c = _c.set("#78ad5e").multiplyScalar(shade).clone();
        chunk(x0, z0, "ground").quad([x0, y(x0, z1), z1], [x1, y(x1, z1), z1], [x1, y(x1, z0), z0], [x0, y(x0, z0), z0], c, [[x0 / 6, z1 / 6], [x1 / 6, z1 / 6], [x1 / 6, z0 / 6], [x0 / 6, z0 / 6]]);
      }
    }
  }
  // hill roads: ribbons on the terrain with a yellow centre dash
  for (const e of city.edges) {
    if (e.kind !== "hill") continue;
    const A = city.nodes[e.a];
    const B = city.nodes[e.b];
    const n = Math.max(2, Math.ceil(e.len / 3));
    const rx = -e.dz;
    const rz = e.dx;
    const w = HILL_HALF;
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const p0 = [A.x + (B.x - A.x) * t0, A.z + (B.z - A.z) * t0];
      const p1 = [A.x + (B.x - A.x) * t1, A.z + (B.z - A.z) * t1];
      const y = (x, z) => groundAt(x, z) + 0.06;
      const ext = 0.6; // overlap the next segment so joints don't gap
      const q0 = [p0[0] - e.dx * (k === 0 ? ext : 0), p0[1] - e.dz * (k === 0 ? ext : 0)];
      const q1 = [p1[0] + e.dx * ext, p1[1] + e.dz * ext];
      const g = chunk(p0[0], p0[1], "ground");
      const L = [q0[0] - rx * w, q0[1] - rz * w];
      const Rr = [q0[0] + rx * w, q0[1] + rz * w];
      const L1 = [q1[0] - rx * w, q1[1] - rz * w];
      const R1 = [q1[0] + rx * w, q1[1] + rz * w];
      g.quad([L[0], y(L[0], L[1]), L[1]], [Rr[0], y(Rr[0], Rr[1]), Rr[1]], [R1[0], y(R1[0], R1[1]), R1[1]], [L1[0], y(L1[0], L1[1]), L1[1]], ASPH);
      // centre dash
      if (k % 2 === 0) {
        const m = chunk(p0[0], p0[1], "mark");
        const a0 = [p0[0] - rx * 0.08, p0[1] - rz * 0.08];
        const b0 = [p0[0] + rx * 0.08, p0[1] + rz * 0.08];
        const a1 = [p1[0] - rx * 0.08, p1[1] - rz * 0.08];
        const b1 = [p1[0] + rx * 0.08, p1[1] + rz * 0.08];
        const yy = (x, z) => groundAt(x, z) + 0.08;
        m.quad([a0[0], yy(...a0), a0[1]], [b0[0], yy(...b0), b0[1]], [b1[0], yy(...b1), b1[1]], [a1[0], yy(...a1), a1[1]], col("#f2c94c"));
      }
    }
  }
  // junction discs on the hills (cover ribbon joints)
  for (const n of city.nodes) {
    if (!n.hill && !(n.grid && n.gj === 0)) continue;
    if (n.grid) continue;
    const g = chunk(n.x, n.z, "ground");
    const r = HILL_HALF + 0.4;
    const y = n.y + 0.065;
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2;
      const a1 = ((k + 1) / 12) * Math.PI * 2;
      g.tri([n.x, y, n.z], [n.x + Math.cos(a1) * r, groundAt(n.x + Math.cos(a1) * r, n.z + Math.sin(a1) * r) + 0.065, n.z + Math.sin(a1) * r], [n.x + Math.cos(a0) * r, groundAt(n.x + Math.cos(a0) * r, n.z + Math.sin(a0) * r) + 0.065, n.z + Math.sin(a0) * r], [0, 0], [0, 0], [0, 0], ASPH);
    }
  }

  /* ---------------- markings (grid streets) ---------------- */
  const WHITE = col("#f1f1ec");
  const YEL = col("#f2c94c");
  const mk = (x0, z0, x1, z1, c) => chunk((x0 + x1) / 2, (z0 + z1) / 2, "mark").quad([x0, 0.012, z1], [x1, 0.012, z1], [x1, 0.012, z0], [x0, 0.012, z0], c);
  for (const e of city.edges) {
    if (e.kind !== "grid") continue;
    const A = city.nodes[e.a];
    const B = city.nodes[e.b];
    const ns = e.axis === "ns";
    const a = (ns ? A.z : A.x) + 11;
    const b = (ns ? B.z : B.x) - 11;
    const c0 = ns ? A.x : A.z;
    for (let s = a; s < b; s += 6) {
      const s1 = Math.min(b, s + 3);
      if (ns) mk(c0 - 0.09, s, c0 + 0.09, s1, YEL);
      else mk(s, c0 - 0.09, s1, c0 + 0.09, YEL);
    }
    for (const o of [-ROAD_HALF + 0.5, ROAD_HALF - 0.5]) {
      if (ns) mk(c0 + o - 0.07, a, c0 + o + 0.07, b, WHITE);
      else mk(a, c0 + o - 0.07, b, c0 + o + 0.07, WHITE);
    }
  }
  // zebra crossings + stop lines
  for (const cr of city.crossings) {
    const ax = Math.abs(cr.ax) > 0.5; // crossing runs along x
    for (let o = -ROAD_HALF + 0.6; o < ROAD_HALF - 0.4; o += 1.1) {
      if (ax) mk(cr.x + o, cr.z - 1.3, cr.x + o + 0.55, cr.z + 1.3, WHITE);
      else mk(cr.x - 1.3, cr.z + o, cr.x + 1.3, cr.z + o + 0.55, WHITE);
    }
    const node = city.nodes[cr.node];
    if (!node.light) continue;
    // stop line across the approaching lane (right-hand traffic arriving at the node)
    const dx = Math.sign(cr.x - node.x);
    const dz = Math.sign(cr.z - node.z);
    const sx = node.x + dx * 10.3;
    const sz = node.z + dz * 10.3;
    if (dx !== 0) {
      // arriving westward if dx > 0 (lane on the north side? right of (−1,0) is (0,−1))
      const lane = dx > 0 ? -1 : 1;
      mk(sx - 0.2, Math.min(sz, sz + lane * ROAD_HALF * 0.95), sx + 0.2, Math.max(sz, sz + lane * ROAD_HALF * 0.95), WHITE);
    } else if (dz !== 0) {
      const lane = dz > 0 ? 1 : -1;
      mk(Math.min(sx, sx + lane * ROAD_HALF * 0.95), sz - 0.2, Math.max(sx, sx + lane * ROAD_HALF * 0.95), sz + 0.2, WHITE);
    }
  }
  // parking bays
  for (const p of city.parking) {
    if (!p.bay && p.lot !== "garage" && p.lot !== "dealer" && p.lot !== "police" && p.lot !== "hospital") continue;
    const along = Math.abs(Math.sin(p.h)) > 0.5;
    const y = CURB + 0.01;
    const g = chunk(p.x, p.z, "mark");
    const line = (x0, z0, x1, z1) => g.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], WHITE);
    if (along) {
      line(p.x - 3, p.z - 1.55, p.x + 3, p.z - 1.45);
      line(p.x - 3, p.z + 1.45, p.x + 3, p.z + 1.55);
    } else {
      line(p.x - 1.55, p.z - 3, p.x - 1.45, p.z + 3);
      line(p.x + 1.45, p.z - 3, p.x + 1.55, p.z + 3);
    }
  }
  for (const pr of city.props) {
    if (pr.type !== "bayMark") continue;
    const y = pr.y + 0.012;
    const g = chunk(pr.x, pr.z, "mark");
    const Y = col("#ffd23f");
    const line = (x0, z0, x1, z1) => g.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], Y);
    const along = Math.abs(Math.sin(pr.rot)) > 0.5;
    const hl = 4.4;
    const hw = 1.7;
    if (along) {
      line(pr.x - hl, pr.z - hw - 0.08, pr.x + hl, pr.z - hw + 0.08);
      line(pr.x - hl, pr.z + hw - 0.08, pr.x + hl, pr.z + hw + 0.08);
      line(pr.x - hl - 0.08, pr.z - hw, pr.x - hl + 0.08, pr.z + hw);
    } else {
      line(pr.x - hw - 0.08, pr.z - hl, pr.x - hw + 0.08, pr.z + hl);
      line(pr.x + hw - 0.08, pr.z - hl, pr.x + hw + 0.08, pr.z + hl);
      line(pr.x - hw, pr.z - hl - 0.08, pr.x + hw, pr.z - hl + 0.08);
    }
  }

  /* ---------------- buildings ---------------- */
  const SIGN_FOR = {
    "Flamingo Grand": "FLAMINGO GRAND", "Rosa's Café": "ROSA'S CAFÉ", "Tide & Thread": "TIDE & THREAD", "Coral Palms Hotel": "CORAL PALMS",
    "Sunny Post": "SUNNY POST", "Marina Grill": "MARINA GRILL", "Sunrise Motors": "SUNRISE MOTORS", "Metro Cab Co.": "METRO CAB",
    "Downtown Police HQ": "POLICE", "St. Marisol Hospital": "ST. MARISOL", "Tío Ramón's Garage": "GARAGE", "Bodega Luz": "BODEGA LUZ",
    "Haven Hardware": "HARDWARE", "Mango Bakery": "MANGO BAKERY", "Paz Pharmacy": "PHARMACY", "Vane Tower": "VANE TOWER",
    "Pier 9 Warehouse": "PIER 9", "Customs Store": "CUSTOMS", "Harbor Freight": "HARBOR FREIGHT", "Hillside Garage": "GARAGE",
  };
  const GENERIC = ["HOTEL", "SURF SHOP", "PIZZA", "TACOS", "GELATO", "BAR", "MOTEL", "CLUB NEON", "JUICE"];
  const signs = new GB();
  const sign = (b, side, label, y, w = 8, h = 1.4) => {
    const idx = atlas.index(label);
    const v0 = 1 - (idx + 1) / atlas.rows;
    const v1 = 1 - idx / atlas.rows;
    const uv = [[0, v0], [1, v0], [1, v1], [0, v1]];
    const W = Math.min(w, (side === "N" || side === "S" ? b.x1 - b.x0 : b.z1 - b.z0) - 1);
    const o = 0.12;
    const c = col("#ffffff");
    if (side === "S") signs.quad([b.cx - W / 2, y, b.z1 + o], [b.cx + W / 2, y, b.z1 + o], [b.cx + W / 2, y + h, b.z1 + o], [b.cx - W / 2, y + h, b.z1 + o], c, uv);
    if (side === "N") signs.quad([b.cx + W / 2, y, b.z0 - o], [b.cx - W / 2, y, b.z0 - o], [b.cx - W / 2, y + h, b.z0 - o], [b.cx + W / 2, y + h, b.z0 - o], c, uv);
    if (side === "E") signs.quad([b.x1 + o, y, b.cz + W / 2], [b.x1 + o, y, b.cz - W / 2], [b.x1 + o, y + h, b.cz - W / 2], [b.x1 + o, y + h, b.cz + W / 2], c, uv);
    if (side === "W") signs.quad([b.x0 - o, y, b.cz - W / 2], [b.x0 - o, y, b.cz + W / 2], [b.x0 - o, y + h, b.cz + W / 2], [b.x0 - o, y + h, b.cz - W / 2], c, uv);
  };
  /** the side of a building that faces the nearest street */
  const streetSide = (b) => {
    if (b.door) return b.door;
    const opts = [
      ["N", Math.abs(b.z0 - nearestRow(b.z0, -1))],
      ["S", Math.abs(nearestRow(b.z1, 1) - b.z1)],
      ["W", Math.abs(b.x0 - nearestCol(b.x0, -1))],
      ["E", Math.abs(nearestCol(b.x1, 1) - b.x1)],
    ];
    return opts.sort((a, c) => a[1] - c[1])[0][0];
  };
  const awnings = new GB();
  for (const b of city.buildings) {
    if (b.hollow) continue; // walk-in buildings (Club Neon) are drawn by their own module
    const kind = b.style === "tower" || b.style === "police" || b.style === "hospital" ? "tower" : b.style === "hotel" ? "hotel" : b.style === "shop" || b.style === "depot" ? "shop" : b.style === "house" || b.style === "mansion" ? "house" : b.style === "warehouse" || b.style === "garage" ? "warehouse" : "glass";
    const wc = col(b.color);
    const walls = chunk(b.cx, b.cz, `wall:${kind}`);
    const roofs = chunk(b.cx, b.cz, "roof");
    const y0 = b.y;
    const top = b.y + 0.4 + b.h;
    // the facade textures hold 4 × 4 window bays: metres per texture repeat
    const uvS = kind === "house" ? [16, 12.8] : kind === "warehouse" ? [12, 16] : [16, 14.4];
    if (b.crown) {
      const t1 = y0 + (top - y0) * 0.82;
      walls.box(b.x0, y0, b.z0, b.x1, t1, b.z1, wc, uvS, false);
      const ix = (b.x1 - b.x0) * 0.16;
      const iz = (b.z1 - b.z0) * 0.16;
      roofs.box(b.x0, t1, b.z0, b.x1, t1 + 0.4, b.z1, col(b.color, 0.82));
      walls.box(b.x0 + ix, t1 + 0.4, b.z0 + iz, b.x1 - ix, top, b.z1 - iz, wc, uvS, false);
      roofs.box(b.x0 + ix, top, b.z0 + iz, b.x1 - ix, top + 0.5, b.z1 - iz, col(b.color, 0.75));
      // antenna
      roofs.box(b.cx - 0.25, top + 0.5, b.cz - 0.25, b.cx + 0.25, top + 14, b.cz + 0.25, col("#9aa0a8"));
    } else {
      walls.box(b.x0, y0, b.z0, b.x1, top, b.z1, wc, uvS, false);
    }
    const rTop = b.crown ? top + 0.5 : top;
    if (!b.crown) {
      if (b.roof === "pitched") {
        // gable roof along the longer side
        const along = b.x1 - b.x0 > b.z1 - b.z0;
        const rc = col(R() < 0.6 ? "#c8643d" : "#7d8a96");
        const ov = 0.5;
        const X0 = b.x0 - ov;
        const X1 = b.x1 + ov;
        const Z0 = b.z0 - ov;
        const Z1 = b.z1 + ov;
        const ridge = top + Math.min(4, (along ? b.z1 - b.z0 : b.x1 - b.x0) * 0.35);
        if (along) {
          roofs.quad([X0, top, Z1], [X1, top, Z1], [X1, ridge, b.cz], [X0, ridge, b.cz], rc);
          roofs.quad([X1, top, Z0], [X0, top, Z0], [X0, ridge, b.cz], [X1, ridge, b.cz], rc);
          walls.tri([b.x0, top, b.z1], [b.x0, ridge, b.cz], [b.x0, top, b.z0], [0, 0], [0.5, 0.3], [1, 0], wc);
          walls.tri([b.x1, top, b.z0], [b.x1, ridge, b.cz], [b.x1, top, b.z1], [0, 0], [0.5, 0.3], [1, 0], wc);
        } else {
          roofs.quad([X1, top, Z1], [X1, top, Z0], [b.cx, ridge, Z0], [b.cx, ridge, Z1], rc);
          roofs.quad([X0, top, Z0], [X0, top, Z1], [b.cx, ridge, Z1], [b.cx, ridge, Z0], rc);
          walls.tri([b.x1, top, b.z1], [b.cx, ridge, b.z1], [b.x0, top, b.z1], [0, 0], [0.5, 0.3], [1, 0], wc);
          walls.tri([b.x0, top, b.z0], [b.cx, ridge, b.z0], [b.x1, top, b.z0], [0, 0], [0.5, 0.3], [1, 0], wc);
        }
      } else {
        roofs.box(b.x0, top - 0.02, b.z0, b.x1, top, b.z1, col("#9b9a96"));
        // parapet
        const p = 0.35;
        const ph = kind === "house" ? 0.4 : 1;
        const pc = col(b.color, 0.9);
        roofs.box(b.x0, top, b.z0, b.x1, top + ph, b.z0 + p, pc);
        roofs.box(b.x0, top, b.z1 - p, b.x1, top + ph, b.z1, pc);
        roofs.box(b.x0, top, b.z0, b.x0 + p, top + ph, b.z1, pc);
        roofs.box(b.x1 - p, top, b.z0, b.x1, top + ph, b.z1, pc);
        // rooftop plant on big roofs
        if (b.x1 - b.x0 > 14 && kind !== "house") {
          const ax = b.x0 + (b.x1 - b.x0) * 0.25;
          const az = b.z0 + (b.z1 - b.z0) * 0.3;
          roofs.box(ax, top, az, ax + 4, top + 2.2, az + 3, col("#b7bcc2"));
          if (kind === "tower" && b.h > 50) roofs.box(b.cx + 2, top, b.cz + 2, b.cx + 7, top + 4, b.cz + 6, col("#8f969e"));
        }
      }
    }
    // hotel stripes: coloured corner fins
    if (b.stripes) {
      const fc = col(b.neon || "#ffffff", 1);
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) roofs.box(x - 0.6, y0, z - 0.6, x + 0.6, rTop + 1.5, z + 0.6, fc);
    }
    // door
    const side = streetSide(b);
    const dc = col(b.style === "garage" || b.style === "warehouse" ? "#4a4f57" : "#3b2f29");
    const dw = b.style === "garage" || b.style === "warehouse" ? 5 : b.style === "showroom" ? 6 : 1.8;
    const dh = b.style === "garage" || b.style === "warehouse" ? 4.2 : 2.6;
    const det = chunk(b.cx, b.cz, "plain");
    const by = b.y + 0.4 + CURB;
    if (side === "S") det.box(b.cx - dw / 2, by - 0.1, b.z1, b.cx + dw / 2, by + dh, b.z1 + 0.08, dc);
    if (side === "N") det.box(b.cx - dw / 2, by - 0.1, b.z0 - 0.08, b.cx + dw / 2, by + dh, b.z0, dc);
    if (side === "E") det.box(b.x1, by - 0.1, b.cz - dw / 2, b.x1 + 0.08, by + dh, b.cz + dw / 2, dc);
    if (side === "W") det.box(b.x0 - 0.08, by - 0.1, b.cz - dw / 2, b.x0, by + dh, b.cz + dw / 2, dc);
    // awning over shop doors
    if (b.awning) {
      const ac = col(b.neon || ["#e84c6b", "#2fb5a8", "#ffb347", "#5b8def"][Math.floor(b.cx + b.cz) & 3]);
      const ay = by + 3.1;
      const L = Math.min(10, (side === "N" || side === "S" ? b.x1 - b.x0 : b.z1 - b.z0) - 2);
      const out = 2.2;
      if (side === "S") awnings.quad([b.cx - L / 2, ay, b.z1], [b.cx + L / 2, ay, b.z1], [b.cx + L / 2, ay - 0.9, b.z1 + out], [b.cx - L / 2, ay - 0.9, b.z1 + out], ac, [[0, 0], [L / 2, 0], [L / 2, 1], [0, 1]]);
      if (side === "N") awnings.quad([b.cx + L / 2, ay, b.z0], [b.cx - L / 2, ay, b.z0], [b.cx - L / 2, ay - 0.9, b.z0 - out], [b.cx + L / 2, ay - 0.9, b.z0 - out], ac, [[0, 0], [L / 2, 0], [L / 2, 1], [0, 1]]);
      if (side === "E") awnings.quad([b.x1, ay, b.cz + L / 2], [b.x1, ay, b.cz - L / 2], [b.x1 + out, ay - 0.9, b.cz - L / 2], [b.x1 + out, ay - 0.9, b.cz + L / 2], ac, [[0, 0], [L / 2, 0], [L / 2, 1], [0, 1]]);
      if (side === "W") awnings.quad([b.x0, ay, b.cz - L / 2], [b.x0, ay, b.cz + L / 2], [b.x0 - out, ay - 0.9, b.cz + L / 2], [b.x0 - out, ay - 0.9, b.cz - L / 2], ac, [[0, 0], [L / 2, 0], [L / 2, 1], [0, 1]]);
    }
    // signs
    const label = SIGN_FOR[b.name] || (b.sign != null && (b.style === "shop" || b.style === "hotel") ? GENERIC[b.sign % GENERIC.length] : null);
    if (label) {
      const sy = b.style === "hotel" || b.style === "tower" ? Math.min(top - 3, by + 9) : by + 3.6;
      sign(b, side, label, sy, b.style === "hotel" ? 14 : 8, b.style === "hotel" ? 2.2 : 1.3);
    }
  }

  /* ---------------- walls, hedges, fences ---------------- */
  const fences = new GB();
  for (const w of city.walls) {
    if (w.kind === "water") continue;
    const y = groundAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
    if (w.kind === "fence") {
      const along = w.x1 - w.x0 > w.z1 - w.z0;
      const cx = (w.z0 + w.z1) / 2;
      const cz = (w.x0 + w.x1) / 2;
      const H = 3;
      const len = along ? w.x1 - w.x0 : w.z1 - w.z0;
      const uv = [[0, 0], [len / 3, 0], [len / 3, 1], [0, 1]];
      if (along) fences.quad([w.x0, y + CURB, cx], [w.x1, y + CURB, cx], [w.x1, y + H, cx], [w.x0, y + H, cx], col("#ffffff"), uv);
      else fences.quad([cz, y + CURB, w.z1], [cz, y + CURB, w.z0], [cz, y + H, w.z0], [cz, y + H, w.z1], col("#ffffff"), uv);
      // posts + top rail
      const det = chunk((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, "plain");
      for (let s = 0; s <= len; s += 4) {
        const px = along ? w.x0 + s : cz;
        const pz = along ? cx : w.z0 + s;
        det.box(px - 0.06, y, pz - 0.06, px + 0.06, y + H, pz + 0.06, col("#8f969e"));
      }
      if (along) det.box(w.x0, y + H - 0.05, cx - 0.04, w.x1, y + H + 0.03, cx + 0.04, col("#8f969e"));
      else det.box(cz - 0.04, y + H - 0.05, w.z0, cz + 0.04, y + H + 0.03, w.z1, col("#8f969e"));
    } else if (w.kind === "hedge") {
      const g = chunk((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, "plain");
      // a stone base with a hedge on top
      g.box(w.x0, y - 0.5, w.z0 - 0.2, w.x1, y + 0.7, w.z1 + 0.2, col("#d9c7a4"));
      g.box(w.x0, y + 0.7, w.z0 - 0.1, w.x1, y + 2.3, w.z1 + 0.1, col("#3f7f3a"));
    } else if (w.kind === "edge") {
      const g = chunk((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, "plain");
      g.box(w.x0, -1, w.z0, w.x1, 2.4, w.z1, col("#d9c7a4"));
    }
  }
  // the secure yard's fence
  for (const p of city.props) {
    if (p.type !== "fenceRun") continue;
    const y = CURB;
    const H = 3;
    const runs = [
      [p.x0, p.z0, p.x1, p.z0],
      [p.x0, p.z1, p.x1, p.z1],
      [p.x0, p.z0, p.x0, p.z1],
      [p.x1, p.z0, p.x1, p.gap.a],
      [p.x1, p.gap.b, p.x1, p.z1],
    ];
    for (const [ax, az, bx, bz] of runs) {
      const len = Math.hypot(bx - ax, bz - az);
      fences.quad([ax, y, az], [bx, y, bz], [bx, y + H, bz], [ax, y + H, az], col("#ffffff"), [[0, 0], [len / 3, 0], [len / 3, 1], [0, 1]]);
    }
  }

  /* ---------------- assemble chunk meshes ---------------- */
  const matFor = (key) => {
    if (key === "ground") return groundMat;
    if (key === "mark") return markMat;
    if (key === "roof" || key === "plain") return plainMat;
    if (key.startsWith("wall:")) return facMat[key.slice(5)];
    return plainMat;
  };
  for (const [k, gb] of chunks) {
    const key = k.split(":").slice(1).join(":");
    const geo = gb.geometry();
    if (!geo) continue;
    const m = new THREE.Mesh(geo, matFor(key));
    m.receiveShadow = shadows && (key === "ground" || key === "mark" || key === "roof");
    m.castShadow = shadows && (key.startsWith("wall") || key === "roof");
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    disposables.push(geo);
  }
  for (const [gb, mat] of [[signs, signMat], [awnings, awnMat], [fences, fenceMat]]) {
    const geo = gb.geometry();
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    group.add(m);
    disposables.push(geo);
  }

  /* ---------------- water ---------------- */
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  group.add(water);
  disposables.push(water.geometry);
  // land under the city so the water only shows at the coast
  {
    const land = new GB();
    land.box(BOUNDS.x0 - 400, -3, BOUNDS.z0 - 400, WATER.east - 0.5, -0.05, WATER.south - 0.5, col("#5e9a4c"), null);
    land.box(ISLAND.x0 - 5, -3, ISLAND.z0 - 5, ISLAND.x1 + 5, -0.05, ISLAND.z1 + 5, col("#5e9a4c"), null);
    const geo = land.geometry();
    const m = new THREE.Mesh(geo, plainMat);
    group.add(m);
    disposables.push(geo);
  }

  /* ---------------- instanced props ---------------- */
  const inst = buildProps(city, group, disposables, { shadows, quality });
  const extras = buildRooftops(city, group, disposables);
  buildSkyline(group, disposables);

  return {
    group,
    facMat,
    signMat,
    waterMat,
    inst,
    /** per frame: night factor (0 day … 1 night), live traffic lights, locked gates */
    update(t, night, sim) {
      for (const m of Object.values(facMat)) m.emissiveIntensity = night * 1.15;
      signMat.emissiveIntensity = 0.35 + night * 2.2;
      waterMat.emissiveIntensity = 0.35 - night * 0.25;
      inst.update(t, night, sim);
      extras.update(t, night);
      if (group.userData.skylineMat) group.userData.skylineMat.emissiveIntensity = night * 0.9;
    },
    breakables: inst.breakables,
    dispose() {
      for (const d of disposables) d.dispose();
      inst.dispose();
    },
  };
}

function nearestRow(z, dir) {
  let best = dir < 0 ? -1e9 : 1e9;
  for (const r of ROWS) if ((dir < 0 && r <= z && r > best) || (dir > 0 && r >= z && r < best)) best = r;
  return Math.abs(best) > 1e8 ? z + dir * 99 : best;
}
function nearestCol(x, dir) {
  let best = dir < 0 ? -1e9 : 1e9;
  for (const c of COLS) if ((dir < 0 && c <= x && c > best) || (dir > 0 && c >= x && c < best)) best = c;
  return Math.abs(best) > 1e8 ? x + dir * 99 : best;
}

/* ====================================================================== props */
function palmGeometry() {
  const parts = [];
  // trunk: stacked tapered segments with a gentle curve
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const r0 = 0.24 - t0 * 0.09;
    const r1 = 0.24 - ((i + 1) / segs) * 0.09;
    const g = new THREE.CylinderGeometry(r1, r0, 8 / segs + 0.02, 8, 1);
    const bend = (k) => Math.pow(k, 2) * 0.9;
    g.translate(bend(t0), (t0 + 0.5 / segs) * 8, 0);
    paint(g, i % 2 ? "#8a6a4a" : "#7b5d40");
    parts.push(g);
  }
  // fronds: drooping blades
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const blade = new THREE.PlaneGeometry(0.7, 3.6, 1, 4);
    const P = blade.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i) + 1.8; // 0 … 3.6 along the blade
      P.setY(i, 0);
      P.setZ(i, y);
      P.setX(i, P.getX(i) * (1 - y / 4.2));
      P.setY(i, -Math.pow(y / 3.6, 2) * 1.6 + y * 0.25);
    }
    blade.computeVertexNormals();
    blade.rotateY(a);
    blade.translate(0.9, 8, 0);
    paint(blade, k % 2 ? "#3f8f3a" : "#2f7d34");
    parts.push(blade);
  }
  const co = new THREE.SphereGeometry(0.32, 8, 6);
  co.translate(0.9, 7.85, 0);
  paint(co, "#6b4a2a");
  parts.push(co);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 7);
  trunk.translate(0, 1.3, 0);
  paint(trunk, "#6b4a2a");
  const f1 = new THREE.IcosahedronGeometry(2.1, 1);
  f1.translate(0, 3.6, 0);
  paint(f1, "#4f9a45");
  const f2 = new THREE.IcosahedronGeometry(1.5, 1);
  f2.translate(0.7, 4.6, 0.3);
  paint(f2, "#5fae50");
  return mergeGeometries([trunk, f1, f2].map((g) => g.toNonIndexed()));
}
function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.07, 0.1, 6.2, 6);
  pole.translate(0, 3.1, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.6);
  arm.translate(0, 6.1, 0.75);
  const head = new THREE.BoxGeometry(0.34, 0.12, 0.6);
  head.translate(0, 6.02, 1.45);
  for (const g of [pole, arm, head]) paint(g, "#5b6168");
  return mergeGeometries([pole, arm, head].map((g) => g.toNonIndexed()));
}
function benchGeometry() {
  const seat = new THREE.BoxGeometry(1.8, 0.08, 0.5);
  seat.translate(0, 0.46, 0);
  const back = new THREE.BoxGeometry(1.8, 0.45, 0.07);
  back.translate(0, 0.75, -0.22);
  const l1 = new THREE.BoxGeometry(0.08, 0.46, 0.45);
  l1.translate(-0.8, 0.23, 0);
  const l2 = l1.clone();
  l2.translate(1.6, 0, 0);
  paint(seat, "#a0703f");
  paint(back, "#a0703f");
  paint(l1, "#3b3f45");
  paint(l2, "#3b3f45");
  return mergeGeometries([seat, back, l1, l2].map((g) => g.toNonIndexed()));
}
function umbrellaGeometry() {
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5);
  pole.translate(0, 1.15, 0);
  paint(pole, "#eeeeee");
  const top = new THREE.ConeGeometry(1.4, 0.55, 10);
  top.translate(0, 2.3, 0);
  paint(top, "#ffffff");
  const towel = new THREE.BoxGeometry(0.9, 0.02, 1.8);
  towel.translate(1.2, 0.03, 0.4);
  paint(towel, "#ffffff");
  return mergeGeometries([pole, top, towel].map((g) => g.toNonIndexed()));
}
/** road signs: 0 = blue info square, 1 = red stop octagon, 2 = yellow warning diamond */
function signGeometry(kind) {
  const post = new THREE.CylinderGeometry(0.045, 0.05, 2.5, 6);
  post.translate(0, 1.25, 0);
  paint(post, "#9aa1a8");
  let plate;
  if (kind === 1) {
    plate = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 8);
    plate.rotateX(Math.PI / 2);
    plate.rotateZ(Math.PI / 8);
    paint(plate, "#c8202a");
  } else if (kind === 2) {
    plate = new THREE.BoxGeometry(0.5, 0.5, 0.04);
    plate.rotateZ(Math.PI / 4);
    paint(plate, "#f2c418");
  } else {
    plate = new THREE.BoxGeometry(0.6, 0.6, 0.04);
    paint(plate, "#1f5fbf");
  }
  plate.translate(0, 2.42, 0.07);
  const band = new THREE.BoxGeometry(kind === 1 ? 0.42 : 0.3, 0.08, 0.05);
  band.translate(0, 2.42, 0.08);
  paint(band, "#ffffff");
  return mergeGeometries([post, plate, band].map((g) => g.toNonIndexed()));
}
function binGeometry() {
  const body = new THREE.CylinderGeometry(0.3, 0.26, 0.9, 10);
  body.translate(0, 0.45, 0);
  paint(body, "#2e5a3c");
  const lid = new THREE.CylinderGeometry(0.33, 0.33, 0.08, 10);
  lid.translate(0, 0.94, 0);
  paint(lid, "#22442d");
  const band = new THREE.CylinderGeometry(0.305, 0.305, 0.06, 10);
  band.translate(0, 0.7, 0);
  paint(band, "#c9b46a");
  return mergeGeometries([body, lid, band].map((g) => g.toNonIndexed()));
}
/** a 3.5 m white picket fence panel along local x */
function picketGeometry() {
  const parts = [];
  for (const y of [0.35, 0.8]) {
    const r = new THREE.BoxGeometry(3.5, 0.08, 0.05);
    r.translate(0, y, -0.03);
    parts.push(r);
  }
  for (let k = 0; k < 12; k++) {
    const p = new THREE.BoxGeometry(0.12, 1.0, 0.03);
    p.translate(-1.65 + k * 0.3, 0.5, 0.02);
    parts.push(p);
    const tip = new THREE.ConeGeometry(0.085, 0.12, 4);
    tip.rotateY(Math.PI / 4);
    tip.translate(-1.65 + k * 0.3, 1.06, 0.02);
    parts.push(tip);
  }
  for (const g of parts) paint(g, "#f4f1ea");
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
/** a striped wooden sawhorse barrier along local x */
function barrierGeometry() {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const b = new THREE.BoxGeometry(0.4, 0.2, 0.05);
    b.translate(-0.6 + k * 0.4, 0.95, 0);
    paint(b, k % 2 ? "#ffffff" : "#e0533d");
    parts.push(b);
  }
  for (const sx of [-0.7, 0.7]) {
    for (const sz of [-1, 1]) {
      const l = new THREE.BoxGeometry(0.06, 1.0, 0.06);
      l.rotateX(sz * 0.22);
      l.translate(sx, 0.48, sz * 0.11);
      paint(l, "#a0703f");
      parts.push(l);
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
/** a bus shelter: open to the road (+z), frosted back panel, roof, bench, ad box */
function busStopGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z, hex) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    paint(g, hex);
    parts.push(g);
  };
  for (const x of [-1.6, 1.6]) add(0.08, 2.4, 0.08, x, 1.2, -0.5, "#9aa1a8");
  for (const x of [-1.6, 1.6]) add(0.08, 2.4, 0.08, x, 1.2, 0.5, "#9aa1a8");
  add(3.6, 0.1, 1.4, 0, 2.45, 0, "#2f3a46");
  add(3.2, 1.7, 0.05, 0, 1.3, -0.55, "#bcd3dd");
  add(0.05, 1.7, 1.0, -1.6, 1.3, 0, "#bcd3dd");
  add(2.4, 0.08, 0.4, 0, 0.48, -0.3, "#a0703f");
  for (const x of [-1, 1]) add(0.06, 0.48, 0.3, x, 0.24, -0.3, "#3b3f45");
  add(1.2, 1.6, 0.12, 1.6, 1.3, 0, "#ff8fb1");
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

function buildProps(city, group, disposables, { shadows }) {
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const ic = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const glowMat = new THREE.MeshStandardMaterial({ color: "#fff3cf", emissive: "#ffe0a0", emissiveIntensity: 0.1 });
  const poolMat = new THREE.MeshStandardMaterial({ color: "#3ec8e6", roughness: 0.1, emissive: "#0b5468", emissiveIntensity: 0.4 });
  const containerMat = new THREE.MeshStandardMaterial({ map: facade("warehouse").map, roughness: 0.7, metalness: 0.3 });
  const signalMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const housingMat = new THREE.MeshStandardMaterial({ color: "#262a30", roughness: 0.6 });
  disposables.push(vc, ic, glowMat, poolMat, containerMat, signalMat, housingMat);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _e = new THREE.Euler();
  // breakable street furniture: every instance that draws a prop is recorded
  // (mesh, index, original matrix) so it can be hidden when knocked down,
  // shown again when restored, and wobbled when bumped
  const parts = new Map(); // prop -> [{ m, i, mat }]
  const debrisGeo = {}; // type -> geometry for the falling copy
  const own = (prop, m, i) => {
    if (!prop || !prop.solid) return;
    let L = parts.get(prop);
    if (!L) parts.set(prop, (L = []));
    L.push({ m, i, mat: _m.clone() });
  };
  const instanced = (geo, mat, list, place, cast = false, owner = null) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      place(it, i);
      m.setMatrixAt(i, _m);
      if (owner) own(owner(it), m, i);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = cast && shadows;
    m.computeBoundingSphere();
    group.add(m);
    disposables.push(geo);
    return m;
  };
  const P = city.props;
  const of = (t) => P.filter((p) => p.type === t);
  // palms
  instanced(palmGeometry(), vc, of("palm"), (p) => {
    _e.set(p.lean || 0, (p.x * 13.1 + p.z * 7.7) % 6.28, (p.lean || 0) * 0.5);
    _q.setFromEuler(_e);
    const s = p.s || 1;
    _m.compose(_p.set(p.x, p.y - 0.1, p.z), _q, _s.set(s, s, s));
  }, true);
  instanced(treeGeometry(), ic, of("tree"), (p) => {
    _q.setFromEuler(_e.set(0, (p.x * 3.3) % 6.28, 0));
    const s = 0.85 + ((p.x * 7 + p.z * 3) % 10) / 30;
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
  }, true);
  const lamps = of("lamp");
  const own1 = (p) => p;
  debrisGeo.lamp = lampGeometry();
  instanced(debrisGeo.lamp.clone(), ic, lamps, (p) => {
    _q.setFromEuler(_e.set(0, p.rot || 0, 0));
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
  }, false, own1);
  disposables.push(debrisGeo.lamp);
  // lamp glass (glows at night) + light pools on the ground
  const bulbGeo = new THREE.BoxGeometry(0.3, 0.05, 0.52);
  const bulbs = instanced(bulbGeo, glowMat, lamps, (p) => {
    _q.setFromEuler(_e.set(0, p.rot || 0, 0));
    _p.set(0, 5.94, 1.45).applyQuaternion(_q).add(_s.set(p.x, p.y, p.z));
    _m.compose(_p, _q, _s.set(1, 1, 1));
  }, false, own1);
  const poolTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,220,150,0.9)");
    grd.addColorStop(1, "rgba(255,220,150,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const pool = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  disposables.push(pool, poolTex);
  const poolGeo = new THREE.PlaneGeometry(9, 9);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = instanced(poolGeo, pool, lamps, (p) => {
    _q.setFromEuler(_e.set(0, p.rot || 0, 0));
    _p.set(0, 0.06, 1.8).applyQuaternion(_q).add(_s.set(p.x, p.y, p.z));
    _m.compose(_p, new THREE.Quaternion(), _s.set(1, 1, 1));
  }, false, own1);
  /* small street furniture: road signs, bins, picket fences, barriers */
  const atRot = (p) => {
    _q.setFromEuler(_e.set(0, p.rot || 0, 0));
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
  };
  for (let k = 0; k < 3; k++) {
    debrisGeo["sign" + k] = signGeometry(k);
    disposables.push(debrisGeo["sign" + k]);
    instanced(debrisGeo["sign" + k].clone(), ic, of("sign").filter((p) => (p.kind | 0) === k), atRot, false, own1);
  }
  // bus shelters
  instanced(busStopGeometry(), ic, of("busstop"), atRot, true);
  for (const t of ["bin", "picket", "barrier"]) {
    debrisGeo[t] = { bin: binGeometry, picket: picketGeometry, barrier: barrierGeometry }[t]();
    disposables.push(debrisGeo[t]);
    instanced(debrisGeo[t].clone(), ic, of(t), atRot, false, own1);
  }
  if (pools) pools.renderOrder = 2;
  instanced(benchGeometry(), ic, of("bench"), (p) => {
    _q.setFromEuler(_e.set(0, p.rot || 0, 0));
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
  });
  // containers: one instance per level, coloured per instance
  const cont = [];
  for (const p of of("container")) p.colors.forEach((c, l) => cont.push({ x: p.x, z: p.z, l, c }));
  const contGeo = new THREE.BoxGeometry(12.2, 2.6, 2.5);
  contGeo.translate(0, 1.3, 0);
  const contMesh = instanced(contGeo, containerMat, cont, (p) => {
    _m.compose(_p.set(p.x, CURB + p.l * 2.6, p.z), _q.identity(), _s.set(1, 1, 1));
  }, true);
  if (contMesh) {
    cont.forEach((p, i) => contMesh.setColorAt(i, new THREE.Color(p.c)));
    contMesh.instanceColor.needsUpdate = true;
  }
  const umb = of("umbrella");
  const umbMesh = instanced(umbrellaGeometry(), ic, umb, (p) => {
    _q.setFromEuler(_e.set(0.08, (p.x * 5.1) % 6.28, 0));
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1));
  });
  if (umbMesh) {
    umb.forEach((p, i) => umbMesh.setColorAt(i, new THREE.Color(p.color)));
    umbMesh.instanceColor.needsUpdate = true;
  }
  // one-off props: merged into one vertex-coloured mesh
  const one = new GB();
  for (const p of P) {
    if (p.type === "crane") {
      const s = p.quay ? 1.4 : 1;
      const y = p.y;
      const yc = col("#f0b429");
      for (const [dx, dz] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) one.box(p.x + dx * s - 0.5, y, p.z + dz * s - 0.5, p.x + dx * s + 0.5, y + 26 * s, p.z + dz * s + 0.5, yc);
      one.box(p.x - 7 * s, y + 26 * s, p.z - 4 * s, p.x + 7 * s, y + 28 * s, p.z + 4 * s, yc);
      one.box(p.x - 1, y + 28 * s, p.z - 30 * s, p.x + 1, y + 29.6 * s, p.z + 14 * s, col("#e0533d"));
      one.box(p.x - 2, y + 22 * s, p.z - 2, p.x + 2, y + 26 * s, p.z + 2, col("#ffffff"));
    } else if (p.type === "fountain") {
      one.box(p.x - 5, p.y - 0.1, p.z - 5, p.x + 5, p.y + 0.8, p.z + 5, col("#e8e2d4"));
      one.box(p.x - 4.4, p.y + 0.8, p.z - 4.4, p.x + 4.4, p.y + 0.82, p.z + 4.4, col("#4fc3e8"));
      one.box(p.x - 0.6, p.y + 0.8, p.z - 0.6, p.x + 0.6, p.y + 3.4, p.z + 0.6, col("#e8e2d4"));
      one.box(p.x - 1.8, p.y + 2.4, p.z - 1.8, p.x + 1.8, p.y + 2.7, p.z + 1.8, col("#e8e2d4"));
    } else if (p.type === "lighthouse") {
      for (let k = 0; k < 8; k++) one.box(p.x - 3 + k * 0.15, p.y + k * 3, p.z - 3 + k * 0.15, p.x + 3 - k * 0.15, p.y + (k + 1) * 3, p.z + 3 - k * 0.15, col(k % 2 ? "#e0533d" : "#ffffff"));
      one.box(p.x - 2, p.y + 24, p.z - 2, p.x + 2, p.y + 26.5, p.z + 2, col("#fff4b0"));
      one.box(p.x - 2.3, p.y + 26.5, p.z - 2.3, p.x + 2.3, p.y + 27.3, p.z + 2.3, col("#2b2f36"));
    } else if (p.type === "court") {
      one.box(p.x - 14, p.y, p.z - 8, p.x + 14, p.y + 0.02, p.z + 8, col("#d9774a"));
      one.box(p.x - 0.1, p.y + 0.02, p.z - 8, p.x + 0.1, p.y + 0.03, p.z + 8, col("#ffffff"));
      for (const s of [-1, 1]) {
        one.box(p.x + s * 13 - 0.1, p.y, p.z - 0.1, p.x + s * 13 + 0.1, p.y + 3.2, p.z + 0.1, col("#555"));
        one.box(p.x + s * 12.6 - 0.05, p.y + 3, p.z - 0.6, p.x + s * 12.6 + 0.05, p.y + 3.9, p.z + 0.6, col("#ffffff"));
      }
    } else if (p.type === "pool") {
      one.box(p.x - 6.4, p.y + 0.05, p.z - 3.4, p.x + 6.4, p.y + 0.18, p.z + 3.4, col("#f2efe8"));
    } else if (p.type === "railing") {
      one.box(p.x - 0.1, p.y, p.z - 10, p.x + 0.1, p.y + 1.1, p.z + 10, col("#8f969e"));
    } else if (p.type === "boat") {
      one.box(p.x - 2.4, p.y, p.z - 6, p.x + 2.4, p.y + 1.6, p.z + 6, col("#f4f4f0"));
      one.box(p.x - 1.6, p.y + 1.6, p.z - 1, p.x + 1.6, p.y + 3, p.z + 3, col("#2fb5a8"));
      one.box(p.x - 0.08, p.y + 3, p.z, p.x + 0.08, p.y + 9, p.z + 0.16, col("#cccccc"));
    }
  }
  const oneGeo = one.geometry();
  if (oneGeo) {
    const m = new THREE.Mesh(oneGeo, ic);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    group.add(m);
    disposables.push(oneGeo);
  }
  // pool water
  const poolsList = of("pool");
  const pw = new THREE.PlaneGeometry(12, 6);
  pw.rotateX(-Math.PI / 2);
  instanced(pw, poolMat, poolsList, (p) => _m.compose(_p.set(p.x, p.y + 0.2, p.z), _q.identity(), _s.set(1, 1, 1)));

  /* traffic signals: a pole on the right-hand kerb of every approach */
  // (the city places them as breakable props: city.props type "signal")
  const heads = of("signal").map((p) => ({ prop: p, node: city.nodes[p.node], axis: p.axis, x: p.x, z: p.z, face: p.face }));
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6);
  poleGeo.translate(0, 2.3, 0);
  instanced(poleGeo, housingMat, heads, (h) => _m.compose(_p.set(h.x, CURB, h.z), _q.identity(), _s.set(1, 1, 1)), false, (h) => h.prop);
  const boxGeo = new THREE.BoxGeometry(0.42, 1.25, 0.3);
  boxGeo.translate(0, 4.3, 0);
  instanced(boxGeo, housingMat, heads, (h) => _m.compose(_p.set(h.x, CURB, h.z), _q.setFromEuler(_e.set(0, h.face, 0)), _s.set(1, 1, 1)), false, (h) => h.prop);
  {
    const a = poleGeo.clone().toNonIndexed();
    const b = boxGeo.clone().toNonIndexed();
    paint(a, "#262a30");
    paint(b, "#262a30");
    debrisGeo.signal = mergeGeometries([a, b]);
    disposables.push(debrisGeo.signal, a, b);
  }
  const lampGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const lampsSig = [];
  heads.forEach((h, i) => {
    for (let k = 0; k < 3; k++) lampsSig.push({ h, k, i });
  });
  const sigMesh = instanced(lampGeo, signalMat, lampsSig, (L) => {
    _q.setFromEuler(_e.set(0, L.h.face, 0));
    _p.set(0, 4.72 - L.k * 0.4, 0.17).applyQuaternion(_q).add(_s.set(L.h.x, CURB, L.h.z));
    _m.compose(_p, _q, _s.set(1, 1, 1));
  }, false, (L) => L.h.prop);
  const OFF = [new THREE.Color("#3a0b0b"), new THREE.Color("#3a2c0b"), new THREE.Color("#0b2e14")];
  const ON = [new THREE.Color("#ff3b30"), new THREE.Color("#ffc21a"), new THREE.Color("#2bff6a")];
  let lastPhase = -1;

  const hidden = new Set();
  const wob = new Map(); // prop -> { t0, k, ax, az }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const dirty = new Set();
  const setAll = (prop, M) => {
    for (const r of parts.get(prop) || []) {
      r.m.setMatrixAt(r.i, M || r.mat);
      dirty.add(r.m);
    }
  };
  const _t = new THREE.Matrix4();
  const _r = new THREE.Matrix4();
  const _ax = new THREE.Vector3();
  const _u = new THREE.Matrix4();
  const _w = new THREE.Matrix4();
  function syncBroken(sim, t) {
    const B = sim.broken || new Map();
    for (const p of hidden) {
      if (!B.has(p)) {
        hidden.delete(p);
        setAll(p, null);
      }
    }
    for (const p of B.keys()) {
      if (!hidden.has(p)) {
        hidden.add(p);
        wob.delete(p);
        setAll(p, zero);
      }
    }
    // bumped but standing: a short damped sway about the base
    for (const [p, w] of wob) {
      const age = t - w.t0;
      if (age > 1.4 || age < 0 || hidden.has(p)) {
        wob.delete(p);
        if (!hidden.has(p)) setAll(p, null);
        continue;
      }
      const ang = w.k * 0.16 * Math.exp(-age * 3.2) * Math.sin(age * 15);
      _ax.set(w.az, 0, -w.ax).normalize();
      _r.makeRotationAxis(_ax, ang);
      _t.makeTranslation(p.x, p.y, p.z).multiply(_r).multiply(_u.makeTranslation(-p.x, -p.y, -p.z));
      for (const r of parts.get(p) || []) {
        r.m.setMatrixAt(r.i, _w.multiplyMatrices(_t, r.mat));
        dirty.add(r.m);
      }
    }
    for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    dirty.clear();
  }
  const breakables = {
    /** geometry + material for a falling copy of a knocked-down prop */
    debris(p) {
      const g = p.type === "sign" ? debrisGeo["sign" + (p.kind | 0)] : debrisGeo[p.type];
      return g ? { geo: g, mat: p.type === "signal" ? housingMat : ic } : null;
    },
    wobble(p, k, ax, az, t) {
      if (hidden.has(p) || !parts.has(p)) return;
      const L = Math.hypot(ax, az) || 1;
      wob.set(p, { t0: t, k: Math.min(1, k), ax: ax / L, az: az / L });
    },
  };

  /* gates (barrier arm + booth) */
  const gateGroup = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: "#e0332f", roughness: 0.5 });
  const boothMat = new THREE.MeshStandardMaterial({ color: "#d9d9d2", roughness: 0.7 });
  disposables.push(gateMat, stripeMat, boothMat);
  const gateMeshes = city.gates.map((g) => {
    const grp = new THREE.Group();
    const along = g.axis === "x";
    const len = along ? g.x1 - g.x0 : g.z1 - g.z0;
    const cx = (g.x0 + g.x1) / 2;
    const cz = (g.z0 + g.z1) / 2;
    for (let k = 0; k < Math.floor(len / 1.2); k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(along ? 1.2 : 0.18, 0.22, along ? 0.18 : 1.2), k % 2 ? gateMat : stripeMat);
      const o = -len / 2 + 0.6 + k * 1.2;
      m.position.set(cx + (along ? o : 0), g.y + 1.1, cz + (along ? 0 : o));
      grp.add(m);
      disposables.push(m.geometry);
    }
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, 0.4), boothMat);
      post.position.set(cx + (along ? (s * len) / 2 : 0), g.y + 0.65, cz + (along ? 0 : (s * len) / 2));
      grp.add(post);
      disposables.push(post.geometry);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(along ? 3 : 0.1, 1, along ? 0.1 : 3), stripeMat);
    sign.position.set(cx, g.y + 2.1, cz);
    grp.add(sign);
    disposables.push(sign.geometry);
    gateGroup.add(grp);
    return { g, grp };
  });
  group.add(gateGroup);

  return {
    update(t, night, sim) {
      glowMat.emissiveIntensity = 0.1 + night * 3;
      pool.opacity = night * 0.55;
      if (pools) pools.visible = night > 0.05;
      if (bulbs) bulbs.visible = true;
      // traffic lights: recolour on phase change only
      const phase = Math.floor(((t % LIGHT_CYCLE) + LIGHT_CYCLE) * 4);
      if (sigMesh && phase !== lastPhase) {
        lastPhase = phase;
        lampsSig.forEach((L, i) => {
          const st = lightState(L.h.node, L.h.axis, t);
          const on = (st === "red" && L.k === 0) || (st === "yellow" && L.k === 1) || (st === "green" && L.k === 2);
          sigMesh.setColorAt(i, on ? ON[L.k] : OFF[L.k]);
        });
        sigMesh.instanceColor.needsUpdate = true;
      }
      if (sim) for (const G of gateMeshes) G.grp.visible = !sim.districtOpen(G.g.district);
      if (sim) syncBroken(sim, t);
    },
    breakables,
    dispose() {
      /* geometries/materials are in the shared disposables list */
    },
  };
}

/* ====================================================================== rooftops */
/**
 * Every flat roof gets equipment (AC units, water tanks on the taller ones,
 * antennas with aircraft-warning lights on towers) and a few shops / hotels
 * carry lit billboards with fictional ads. All instanced.
 */
function buildRooftops(city, group, disposables) {
  const R = rng(9119);
  const ac = [];
  const tanks = [];
  const masts = [];
  const boards = [];
  for (const b of city.buildings) {
    if (b.hollow || b.crown || b.roof === "pitched") continue;
    const top = b.y + 0.4 + b.h + 0.02;
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    if (w < 8 || d < 8) continue;
    const n = Math.min(6, Math.floor((w * d) / 220));
    for (let k = 0; k < n; k++) ac.push({ x: b.x0 + 2 + R() * (w - 4), z: b.z0 + 2 + R() * (d - 4), y: top, r: R() < 0.5 ? 0 : Math.PI / 2 });
    if (b.h > 18 && R() < 0.7) tanks.push({ x: b.x0 + 3 + R() * (w - 6), z: b.z0 + 3 + R() * (d - 6), y: top });
    if (b.h > 34) masts.push({ x: b.cx + (R() - 0.5) * w * 0.3, z: b.cz + (R() - 0.5) * d * 0.3, y: top, h: 6 + R() * 8 });
    if ((b.style === "shop" || b.style === "hotel") && b.h < 34 && R() < 0.35 && boards.length < 22) {
      // face the nearest street side
      const sides = [[b.x0, b.cz, -Math.PI / 2, d], [b.x1, b.cz, Math.PI / 2, d], [b.cx, b.z0, Math.PI, w], [b.cx, b.z1, 0, w]];
      const s = sides[Math.floor(R() * 4)];
      boards.push({ x: s[0], z: s[1], rot: s[2], y: top, ad: boards.length % 4 });
    }
  }
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _e = new THREE.Euler();
  const inst = (geo, mat, list, place) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      place(it);
      mesh.setMatrixAt(i, _m);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(geo);
    return mesh;
  };
  const metal = new THREE.MeshStandardMaterial({ color: "#a7adb4", roughness: 0.5, metalness: 0.6 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: "#5d636b", roughness: 0.6, metalness: 0.5 });
  disposables.push(metal, darkMetal);
  // AC unit: box with a fan disc on top
  const acGeo = (() => {
    const a = new THREE.BoxGeometry(1.6, 1.0, 1.2);
    a.translate(0, 0.5, 0);
    const f = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 14);
    f.translate(0.3, 1.03, 0);
    return mergeGeometries([a.toNonIndexed(), f.toNonIndexed()]);
  })();
  inst(acGeo, metal, ac, (o) => _m.compose(_p.set(o.x, o.y, o.z), _q.setFromEuler(_e.set(0, o.r, 0)), _s.set(1, 1, 1)));
  // water tank on four legs
  const tankGeo = (() => {
    const parts = [];
    const c = new THREE.CylinderGeometry(1.3, 1.3, 2.2, 16);
    c.translate(0, 2.6, 0);
    parts.push(c);
    const cap = new THREE.ConeGeometry(1.4, 0.6, 16);
    cap.translate(0, 4.0, 0);
    parts.push(cap);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const l = new THREE.BoxGeometry(0.12, 1.5, 0.12);
      l.translate(x, 0.75, z);
      parts.push(l);
    }
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  })();
  inst(tankGeo, darkMetal, tanks, (o) => _m.compose(_p.set(o.x, o.y, o.z), _q.identity(), _s.set(1, 1, 1)));
  // antenna mast (unit height, scaled) + a red warning light that blinks at night
  const mastGeo = new THREE.CylinderGeometry(0.06, 0.12, 1, 6);
  mastGeo.translate(0, 0.5, 0);
  inst(mastGeo, metal, masts, (o) => _m.compose(_p.set(o.x, o.y, o.z), _q.identity(), _s.set(1, o.h, 1)));
  const beacon = new THREE.MeshBasicMaterial({ color: "#ff2020" });
  disposables.push(beacon);
  const beaconGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const beacons = inst(beaconGeo, beacon, masts, (o) => _m.compose(_p.set(o.x, o.y + o.h + 0.1, o.z), _q.identity(), _s.set(1, 1, 1)));
  // billboards: frame + an ad panel (4 fictional ads), lit at night
  const ads = ["SUNBURST COLA|Taste the coast", "VICE 98.7 FM|Neon nights, all night", "CORAL KEY|Casino · Resort · Club", "VENTO GT|Born on the boulevard"];
  const adCols = [["#ff7a00", "#ffd23f"], ["#7b2cff", "#ff4fa0"], ["#00a6c8", "#3fffd8"], ["#111318", "#ff3b30"]];
  const adMats = ads.map((txt, k) => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 512, 256);
    grd.addColorStop(0, adCols[k][0]);
    grd.addColorStop(1, adCols[k][1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    const [a, b] = txt.split("|");
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.font = "italic 900 64px Arial Black, Arial";
    g.fillText(a, 256, 120);
    g.font = "bold 32px Arial";
    g.fillText(b, 256, 180);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.15, roughness: 0.6 });
    disposables.push(t, mat);
    return mat;
  });
  const boardGeo = new THREE.PlaneGeometry(9, 4.5);
  const frameGeo = (() => {
    const parts = [];
    const back = new THREE.BoxGeometry(9.4, 4.9, 0.25);
    back.translate(0, 0, -0.15);
    parts.push(back);
    for (const x of [-3, 3]) {
      const l = new THREE.BoxGeometry(0.25, 3, 0.25);
      l.translate(x, -3.9, -0.15);
      parts.push(l);
    }
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  })();
  disposables.push(boardGeo, frameGeo);
  for (const o of boards) {
    const fx = Math.sin(o.rot);
    const fz = Math.cos(o.rot);
    // set back from the roof edge, panel facing out over the street
    const x = o.x - fx * 2.2;
    const z = o.z - fz * 2.2;
    const frame = new THREE.Mesh(frameGeo, darkMetal);
    frame.position.set(x, o.y + 5.5, z);
    frame.rotation.y = o.rot;
    const panel = new THREE.Mesh(boardGeo, adMats[o.ad]);
    panel.position.set(x + fx * 0.02, o.y + 5.5, z + fz * 0.02);
    panel.rotation.y = o.rot;
    group.add(frame, panel);
  }
  return {
    update(t, night) {
      for (const mat of adMats) mat.emissiveIntensity = 0.15 + night * 1.1;
      if (beacons) beacons.visible = night < 0.2 || Math.floor(t * 1.2) % 2 === 0;
    },
  };
}

/* ====================================================================== skyline */
/**
 * Distant districts all round the playable city (west inland, across the
 * harbour to the south, beyond the island to the east, behind the hills):
 * render-only towers and blocks that fade into the haze, so the city reads as
 * part of a much bigger metropolis. Windows light up at night.
 */
function buildSkyline(group, disposables) {
  const R = rng(3030);
  const list = [];
  const band = (x0, x1, z0, z1, n, hMin, hMax) => {
    for (let k = 0; k < n; k++) {
      const w = 18 + R() * 30;
      const d = 18 + R() * 30;
      list.push({ x: x0 + R() * (x1 - x0), z: z0 + R() * (z1 - z0), w, d, h: hMin + Math.pow(R(), 1.6) * (hMax - hMin) });
    }
  };
  band(-900, -430, -450, 330, 70, 12, 95); // inland, west
  band(-520, 380, 360, 760, 70, 10, 120); // across the harbour, south
  band(780, 1150, -420, 360, 45, 14, 130); // beyond Coral Key, east
  band(-500, 300, -900, -480, 50, 20, 70); // behind the hills, north
  // window texture: rows of lit / unlit windows
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    g.fillStyle = Math.random() < 0.35 ? "#ffd58a" : "#1a1d24";
    g.fillRect(x, y, 5, 5);
  }
  const winTex = new THREE.CanvasTexture(c);
  winTex.colorSpace = THREE.SRGBColorSpace;
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  winTex.repeat.set(2, 5);
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, emissive: "#ffffff", emissiveMap: winTex, emissiveIntensity: 0 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  disposables.push(winTex, mat, geo);
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const _m = new THREE.Matrix4();
  const cols = ["#b9c3cf", "#c9c2b6", "#a9b6c4", "#d4c8b8", "#9fa9b3", "#c8b8c9"].map((h) => new THREE.Color(h));
  list.forEach((o, i) => {
    _m.makeScale(o.w, o.h, o.d).setPosition(o.x, -0.5, o.z);
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, cols[i % cols.length]);
  });
  mesh.computeBoundingSphere();
  group.add(mesh);
  // windows glow at night (cityMesh.update drives the intensity)
  group.userData.skylineMat = mat;
}
