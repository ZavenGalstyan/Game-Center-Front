/**
 * Tank Warfare 3D — battlefield construction (pure JS, no Three.js, runs in
 * Node for the headless tests).
 *
 * buildMap(worldId) returns one immutable layout per world (cached):
 *   heightAt / groundAt / normalAt — terrain (+ bridge decks) sampling
 *   obstacles[]   — static solids: oriented boxes and vertical cylinders.
 *                   Destructible props are obstacles with a `destruct` type;
 *                   their alive/hp state lives in the Sim, not here.
 *   nav           — 2.5 m walkability grid with clearance costs + A*
 *   buckets       — broadphase grid for obstacle queries
 *   roads, decks, water, sites — for the renderer / minimap
 *
 * Every point a mission, the survival mode or the training course refers to
 * is registered as "keep clear", so random props never land on a spawn,
 * waypoint or objective.
 *
 * Box rotation `a` follows Three.js rotation.y: local (lx,lz) → world
 *   wx = lx·cos a + lz·sin a,  wz = −lx·sin a + lz·cos a
 */
import { MISSIONS, SURVIVAL, TRAINING } from "./data.js";

export const HALF = 200; // half size of the playable square
export const BOUND = 192; // tanks are kept inside |x|,|z| ≤ BOUND
const TER_HALF = 330; // rendered terrain half size
const TER_RES = 2; // height grid resolution (m)
export const NAV_CELL = 2.5;
export const NAV_N = Math.round((HALF * 2) / NAV_CELL); // 160
export const NAV_INFL = 2.3; // tank half-width used to inflate obstacles

/* ------------------------------------------------------------------ rng / noise */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function fbm(x, z, seed = 1, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
export const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
function polyDist(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

/* ------------------------------------------------------------------ keep-clear points */
function keepClearPoints(world) {
  const pts = [];
  const add = (p, r = 10) => p && pts.push([p[0], p[1], r]);
  for (const m of MISSIONS) {
    if (m.world !== world) continue;
    add(m.start, 16);
    for (const a of m.allies || []) add(a.at, 8);
    for (const st of m.stages) {
      if (st.point) add(st.point, (st.r || 12) + 4);
      if (st.zone) add(st.zone, (st.r || 15) + 3);
      if (st.hq) add(st.hq, 14);
      for (const t of st.targets || []) add(t.at, 9);
      const groups = [...(st.spawn || []), ...(st.waves || []).flatMap((w) => w.spawn), ...(st.ambush || []).flatMap((w) => w.spawn)];
      for (const g of groups) {
        add(g.at, 6 + (g.spread || 0));
        for (const p of g.patrol || []) add(p, 6);
      }
      if (st.convoy) for (const p of st.convoy.path) add(p, 7);
    }
  }
  if (SURVIVAL.starts[world]) add(SURVIVAL.starts[world], 16);
  for (const p of SURVIVAL.spawns[world] || []) add(p, 10);
  if (TRAINING.world === world) {
    add(TRAINING.start, 16);
    for (const t of TRAINING.tasks) {
      for (const p of t.gates || []) add(p, 9);
      for (const p of t.dummies || []) add(p, 7);
      for (const p of t.movers || []) add(p, 7);
      if (t.cluster) add(t.cluster, 10);
    }
  }
  return pts;
}

/* ------------------------------------------------------------------ world recipes */
const DESERT_ROAD = [[-195, -136], [-110, -90], [-40, -40], [10, 10], [60, 60], [100, 110], [150, 170], [175, 198]];
const DESERT_MOUNDS = [[-72, -10, 30, 7], [80, -20, 26, 6], [-30, 92, 22, 5], [-160, 30, 30, 8], [150, -120, 25, 6], [40, 150, 26, 6], [-120, -170, 22, 5]];

const RIVER_Z = (x) => 25 + 14 * Math.sin(x * 0.018);
const FOREST_ROADS = [
  [[0, -198], [0, -80], [0, 25], [0, 145], [0, 198]],
  [[-198, -80], [-115, -80], [0, -80]],
  [[0, -80], [70, -90], [130, -100], [136, -40], [135, 25], [132, 70], [120, 118], [160, 160]],
  [[-115, -80], [-128, -20], [-130, 15], [-128, 60], [-115, 110], [-60, 150], [0, 145]],
];
const CITY_AVE = [-150, -75, 0, 75, 150];
const CITY_ROAD_W = 22;

function recipe(world) {
  if (world === "desert") {
    return {
      seed: 11,
      roads: [{ pts: DESERT_ROAD, w: 9, kind: "dirt" }],
      raw(x, z) {
        let h = 2.6 * Math.sin(x * 0.024 + 1.3 * Math.sin(z * 0.011)) * (0.6 + 0.4 * Math.sin(z * 0.019 + 1));
        h += (fbm(x * 0.01, z * 0.01, 3) - 0.5) * 6.5 + (fbm(x * 0.05, z * 0.05, 5) - 0.5) * 1.3;
        for (const [mx, mz, r, mh] of DESERT_MOUNDS) {
          const t = Math.hypot(x - mx, z - mz) / r;
          if (t < 1) h += mh * (1 - t * t) * (1 - t * t) * (0.85 + 0.3 * vnoise(x * 0.2, z * 0.2, 9));
        }
        const rd = polyDist(x, z, DESERT_ROAD);
        h *= 0.3 + 0.7 * smooth(4, 16, rd);
        const e = Math.max(Math.abs(x), Math.abs(z));
        h += smooth(172, 240, e) * (24 + 10 * fbm(x * 0.02, z * 0.02, 7));
        return h;
      },
      flats: [[0, -160, 30], [100, 110, 40], [-110, 70, 28], [-92, 46, 10], [-130, 88, 10]],
    };
  }
  if (world === "forest") {
    return {
      seed: 23,
      roads: FOREST_ROADS.map((pts) => ({ pts, w: 8, kind: "dirt" })),
      water: -1.0,
      raw(x, z) {
        let h = (fbm(x * 0.0062 + 3, z * 0.0062, 13) - 0.5) * 15 + 2.2 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
        h += (fbm(x * 0.04, z * 0.04, 15) - 0.5) * 1.6;
        let rd = Infinity;
        for (const r of FOREST_ROADS) rd = Math.min(rd, polyDist(x, z, r));
        h *= 0.45 + 0.55 * smooth(4, 18, rd);
        h = Math.max(0.8, h + 4.5);
        // river valley
        const d = Math.abs(z - RIVER_Z(x));
        h = lerp(h, 1.6, smooth(34, 18, d));
        const ford = smooth(22, 10, Math.abs(x - 135));
        const bed = lerp(-3.6, -0.55, ford);
        h = lerp(h, bed, smooth(14, 6, d));
        const e = Math.max(Math.abs(x), Math.abs(z));
        h += smooth(172, 240, e) * (30 + 12 * fbm(x * 0.02, z * 0.02, 17));
        return h;
      },
      flats: [[0, -170, 20], [-115, -52, 24], [100, -125, 18], [0, 140, 40], [120, 118, 24]],
    };
  }
  // city
  const roads = [];
  for (const a of CITY_AVE) {
    roads.push({ pts: [[a, -205], [a, 205]], w: CITY_ROAD_W, kind: "asphalt" });
    roads.push({ pts: [[-205, a], [205, a]], w: CITY_ROAD_W, kind: "asphalt" });
  }
  return {
    seed: 37,
    roads,
    raw(x, z) {
      const e = Math.max(Math.abs(x), Math.abs(z));
      return (fbm(x * 0.03, z * 0.03, 31) - 0.5) * 0.35 + smooth(210, 300, e) * 5;
    },
    flats: [],
  };
}

/* ------------------------------------------------------------------ obstacle helpers */
function box(kind, x, z, hx, hz, a, h, extra = {}) {
  return { kind, shape: "box", x, z, hx, hz, a, c: Math.cos(a), s: Math.sin(a), h, r: Math.hypot(hx, hz), ...extra };
}
function cyl(kind, x, z, r, h, extra = {}) {
  return { kind, shape: "cyl", x, z, r, h, hx: r, hz: r, a: 0, c: 1, s: 0, ...extra };
}
/** World point → box local coords. */
export function toLocal(o, x, z) {
  const dx = x - o.x;
  const dz = z - o.z;
  return [dx * o.c - dz * o.s, dx * o.s + dz * o.c];
}
/** Box local → world. */
export function toWorld(o, lx, lz) {
  return [o.x + lx * o.c + lz * o.s, o.z - lx * o.s + lz * o.c];
}

/* ------------------------------------------------------------------ build */
const CACHE = new Map();

export function buildMap(world) {
  if (CACHE.has(world)) return CACHE.get(world);
  const R = recipe(world);
  const rand = rng(R.seed);
  const keep = keepClearPoints(world);
  const isClear = (x, z, r) => {
    for (const [kx, kz, kr] of keep) if (Math.hypot(x - kx, z - kz) < kr + r) return false;
    return true;
  };

  /* -------- height grid */
  const N = Math.round((TER_HALF * 2) / TER_RES) + 1;
  const H = new Float32Array(N * N);
  const flats = R.flats.map(([x, z, r]) => [x, z, r, R.raw(x, z)]);
  for (let j = 0; j < N; j++) {
    const z = -TER_HALF + j * TER_RES;
    for (let i = 0; i < N; i++) {
      const x = -TER_HALF + i * TER_RES;
      let h = R.raw(x, z);
      for (const [fx, fz, fr, fh] of flats) {
        const d = Math.hypot(x - fx, z - fz);
        if (d < fr * 1.6) h = lerp(fh, h, smooth(fr * 0.75, fr * 1.6, d));
      }
      H[j * N + i] = h;
    }
  }
  const heightAt = (x, z) => {
    const gx = (x + TER_HALF) / TER_RES;
    const gz = (z + TER_HALF) / TER_RES;
    const i = Math.max(0, Math.min(N - 2, Math.floor(gx)));
    const j = Math.max(0, Math.min(N - 2, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - i));
    const fz = Math.max(0, Math.min(1, gz - j));
    const a = H[j * N + i];
    const b = H[j * N + i + 1];
    const c = H[(j + 1) * N + i];
    const d = H[(j + 1) * N + i + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };

  /* -------- bridge decks (forest) */
  const decks = [];
  if (world === "forest") {
    for (const bx of [0, -130]) {
      const zc = RIVER_Z(bx);
      const slope = 14 * 0.018 * Math.cos(bx * 0.018);
      const a = Math.atan2(slope, 1) * 0; // the river is nearly straight at both crossings
      decks.push({ x: bx, z: zc, hx: 5, hz: 21, a, c: Math.cos(a), s: Math.sin(a), y: 1.75 });
    }
  }
  const groundAt = (x, z) => {
    let h = heightAt(x, z);
    for (const d of decks) {
      const [lx, lz] = toLocal(d, x, z);
      if (Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz) h = Math.max(h, d.y);
    }
    return h;
  };
  const normalAt = (x, z, out = { x: 0, y: 1, z: 0 }) => {
    const e = 1.2;
    const dx = groundAt(x + e, z) - groundAt(x - e, z);
    const dz = groundAt(x, z + e) - groundAt(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    out.x = -dx / l;
    out.y = (2 * e) / l;
    out.z = -dz / l;
    return out;
  };
  const roadDist = (x, z) => {
    let d = Infinity;
    for (const r of R.roads) d = Math.min(d, polyDist(x, z, r.pts) - r.w / 2);
    return d;
  };

  /* -------- obstacles */
  const obstacles = [];
  const add = (o) => {
    // vertical extent from the terrain under the footprint
    let lo = Infinity;
    let hi = -Infinity;
    const pts = [[0, 0], [o.hx, o.hz], [-o.hx, o.hz], [o.hx, -o.hz], [-o.hx, -o.hz]];
    for (const [lx, lz] of pts) {
      const [wx, wz] = o.shape === "box" ? toWorld(o, lx, lz) : [o.x + lx * 0.7, o.z + lz * 0.7];
      const g = groundAt(wx, wz);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    o.base = o.onDeck != null ? o.onDeck : hi;
    o.y0 = (o.onDeck != null ? o.onDeck : lo) - 0.4;
    o.y1 = o.base + o.h;
    if (o.cover === undefined) o.cover = o.h >= 2 && !o.destruct;
    if (o.nav === undefined) o.nav = !(o.destruct && o.destruct !== "tower" && o.destruct !== "barricade");
    o.i = obstacles.length;
    obstacles.push(o);
    return o;
  };
  const tryAdd = (o, r = o.r) => {
    if (!isClear(o.x, o.z, r)) return null;
    return add(o);
  };
  const sites = {};

  // shared prop clusters -------------------------------------------------
  const crates = (cx, cz, n, spread) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * spread;
      const z = cz + (rand() - 0.5) * spread;
      tryAdd(box("crate", x, z, 0.75, 0.75, rand() * 3, 1.4, { destruct: "crate" }), 1.2);
    }
  };
  const barrels = (cx, cz, n, spread) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * spread;
      const z = cz + (rand() - 0.5) * spread;
      tryAdd(cyl("barrel", x, z, 0.45, 1.25, { destruct: "barrel" }), 0.8);
    }
  };
  /** Fence along a polyline, in ~4 m panels. */
  const fence = (pts, kind = "fence") => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / 4));
      const a = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        tryAdd(box(kind, ax + (bx - ax) * t, az + (bz - az) * t, 0.12, L / n / 2, a, 1.5, { destruct: "fence" }), 1.5);
      }
    }
  };
  /** Solid wall (hesco / concrete) along a polyline. */
  const wall = (pts, kind, th, h) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const a = Math.atan2(bx - ax, bz - az);
      add(box(kind, (ax + bx) / 2, (az + bz) / 2, th, L / 2, a, h));
    }
  };
  const tower = (x, z, a = 0) => tryAdd(box("tower", x, z, 1.6, 1.6, a, 8.5, { destruct: "tower", cover: false }), 2);
  const barricade = (x, z, a, len = 1.6) => tryAdd(box("sandbag", x, z, 0.6, len, a, 1.25, { destruct: "barricade" }), len);

  if (world === "desert") {
    sites.start = [0, -160];
    sites.alpha = [100, 110];
    sites.bravo = [-110, 70];
    // Outpost Alpha: hesco perimeter (gaps on the south-west road side and the west)
    const A = (dx, dz) => [100 + dx, 110 + dz];
    wall([A(-25, -25), A(-6, -25)], "hesco", 0.8, 2.5);
    wall([A(8, -25), A(25, -25)], "hesco", 0.8, 2.5);
    wall([A(25, -25), A(25, 25)], "hesco", 0.8, 2.5);
    wall([A(25, 25), A(-25, 25)], "hesco", 0.8, 2.5);
    wall([A(-25, 25), A(-25, 6)], "hesco", 0.8, 2.5);
    wall([A(-25, -8), A(-25, -25)], "hesco", 0.8, 2.5);
    add(box("bunker", ...A(14, 16), 5.5, 4, 0.1, 3.6));
    add(box("tent", ...A(-14, 15), 3.2, 2.6, 0.2, 2.8));
    tower(...A(-21, -21));
    tower(...A(21, 21));
    crates(...A(16, -12), 5, 6);
    barrels(...A(-15, -13), 5, 4);
    barricade(...A(-12, -31), Math.PI / 2, 2.4);
    barricade(...A(-31, 13), 0, 2.4);
    // Outpost Bravo
    const B = (dx, dz) => [-110 + dx, 70 + dz];
    wall([B(-15, -15), B(-4, -15)], "hesco", 0.8, 2.5);
    wall([B(5, -15), B(15, -15)], "hesco", 0.8, 2.5);
    wall([B(15, -15), B(15, 15)], "hesco", 0.8, 2.5);
    wall([B(15, 15), B(-15, 15)], "hesco", 0.8, 2.5);
    wall([B(-15, 15), B(-15, -15)], "hesco", 0.8, 2.5);
    add(box("tent", ...B(-6, 7), 3, 2.5, 1.57, 2.7));
    tower(...B(-11, -11));
    crates(...B(7, 8), 4, 5);
    barrels(...B(8, -9), 3, 3);
    // staging area at the start
    fence([[-26, -176], [-26, -146]]);
    fence([[26, -176], [26, -146]]);
    crates(-18, -170, 4, 5);
    barrels(18, -172, 4, 4);
    add(box("tent", -16, -186, 3.4, 2.8, 0, 2.8));
    add(box("tent", 14, -186, 3.4, 2.8, 0, 2.8));
    // standalone watchtowers and checkpoints along the road
    tower(22, -62);
    tower(-58, 30);
    tower(142, 58);
    tower(-150, -110);
    barricade(-48, -32, 0.8, 2);
    barricade(18, 2, 0.8, 2);
    barricade(66, 70, 0.7, 2);
    // abandoned vehicles
    const wrecks = [[-40, -112, 0.4, "wreckTruck"], [42, -92, -1, "wreckTank"], [-140, -10, 0.9, "wreckTank"], [32, 40, 2.1, "wreckTruck"], [160, 20, 0.3, "wreckTank"], [-60, 140, 1.2, "wreckTruck"], [62, -150, 0.2, "wreckTank"], [-90, -60, 2.6, "wreckTank"], [120, -60, 1.9, "wreckTruck"], [-20, 40, 0.6, "wreckTank"]];
    for (const [x, z, a, k] of wrecks) tryAdd(k === "wreckTruck" ? box(k, x, z, 1.3, 4, a, 2.9) : box(k, x, z, 1.8, 3.4, a, 2.4), 4.5);
    // scattered supply dumps
    for (const [x, z] of [[-60, -95], [70, -20], [-140, 120], [150, -150], [10, 120], [-170, 160]]) {
      crates(x, z, 3, 5);
      barrels(x + 3, z - 3, 2, 3);
    }
    // rocks: clusters on the mounds plus loose boulders
    for (const [mx, mz, r] of DESERT_MOUNDS) {
      const n = Math.round(r / 3.2);
      for (let i = 0; i < n; i++) {
        const ang = rand() * Math.PI * 2;
        const d = r * (0.15 + rand() * 0.6);
        const rr = 1.4 + rand() * 2.8;
        tryAdd(cyl("rock", mx + Math.cos(ang) * d, mz + Math.sin(ang) * d, rr, 1.4 + rr * 0.9, { rot: rand() * 6.28, cover: true }), rr + 1);
      }
    }
    for (let i = 0; i < 46; i++) {
      const x = (rand() - 0.5) * 370;
      const z = (rand() - 0.5) * 370;
      if (roadDist(x, z) < 4) continue;
      const rr = 0.9 + rand() * 2.2;
      tryAdd(cyl("rock", x, z, rr, 1 + rr * 0.8, { rot: rand() * 6.28 }), rr + 1);
    }
  } else if (world === "forest") {
    sites.start = [0, -170];
    sites.stronghold = [0, 140];
    sites.lumber = [120, 118];
    // bridges: rails on both sides of each deck
    for (const d of decks) {
      for (const side of [-1, 1]) {
        const [wx, wz] = toWorld(d, side * (d.hx - 0.3), 0);
        add(box("rail", wx, wz, 0.25, d.hz - 0.5, d.a, 1.0, { onDeck: d.y, cover: false, nav: true }));
      }
    }
    // western camp
    const W = (dx, dz) => [-115 + dx, -52 + dz];
    add(box("tent", ...W(-10, 8), 3.2, 2.6, 0.3, 2.8));
    add(box("tent", ...W(8, 12), 3.2, 2.6, -0.4, 2.8));
    add(box("hut", ...W(12, -10), 4, 3, 0.1, 3.4));
    tower(...W(-14, -12));
    crates(...W(0, -2), 4, 6);
    barrels(...W(-4, 14), 3, 3);
    fence([W(-20, -20), W(20, -20)]);
    fence([W(-20, 20), W(-20, -20)]);
    // eastern camp
    const E = (dx, dz) => [100 + dx, -125 + dz];
    add(box("tent", ...E(-6, 6), 3.2, 2.6, 0.9, 2.8));
    add(box("hut", ...E(8, -4), 4, 3, 0.6, 3.4));
    crates(...E(-2, -8), 4, 5);
    tower(...E(12, 10));
    // stronghold: log walls with a south gate, bunkers and towers
    const S = (dx, dz) => [0 + dx, 140 + dz];
    wall([S(-38, -20), S(-12, -20)], "logwall", 0.9, 2.6);
    wall([S(12, -20), S(38, -20)], "logwall", 0.9, 2.6);
    wall([S(38, -20), S(38, 32)], "logwall", 0.9, 2.6);
    wall([S(-38, 32), S(-38, -20)], "logwall", 0.9, 2.6);
    wall([S(-38, 32), S(-12, 32)], "logwall", 0.9, 2.6);
    wall([S(12, 32), S(38, 32)], "logwall", 0.9, 2.6);
    add(box("bunker", ...S(-20, 12), 5, 4, 0, 3.4));
    add(box("bunker", ...S(22, 14), 5, 4, 0, 3.4));
    tower(...S(-34, -16));
    tower(...S(34, -16));
    tower(...S(34, 28));
    crates(...S(-8, 4), 4, 6);
    barrels(...S(10, 2), 4, 4);
    barricade(...S(-6, -27), Math.PI / 2, 2.2);
    barricade(...S(6, -27), Math.PI / 2, 2.2);
    // lumber yard
    const L = (dx, dz) => [120 + dx, 118 + dz];
    add(box("logs", ...L(-12, 6), 1.6, 6, 0.2, 1.8));
    add(box("logs", ...L(-8, 14), 1.6, 6, 0.4, 1.8));
    add(box("hut", ...L(14, 10), 4, 3, -0.3, 3.4));
    fence([L(-22, -18), L(22, -18)]);
    crates(...L(8, -6), 4, 5);
    // roadside props
    for (const [x, z] of [[-40, -82], [55, -95], [-128, -20], [-20, 60], [140, -60], [-60, 150]]) {
      crates(x + 7, z + 6, 2, 3);
      barrels(x - 6, z + 6, 2, 2);
    }
    barricade(-8, -60, 0.2, 2);
    barricade(8, 60, -0.2, 2);
    barricade(126, -20, 1.2, 2);
    // abandoned vehicles
    for (const [x, z, a, k] of [[30, -140, 0.6, "wreckTank"], [-60, -96, 1.8, "wreckTruck"], [60, 48, 0.3, "wreckTank"], [-160, 120, 2.2, "wreckTruck"], [170, -150, 1, "wreckTank"]])
      tryAdd(k === "wreckTruck" ? box(k, x, z, 1.3, 4, a, 2.9) : box(k, x, z, 1.8, 3.4, a, 2.4), 4.5);
    // rocks
    for (let i = 0; i < 40; i++) {
      const x = (rand() - 0.5) * 370;
      const z = (rand() - 0.5) * 370;
      if (roadDist(x, z) < 4 || Math.abs(z - RIVER_Z(x)) < 18) continue;
      const rr = 1 + rand() * 2.2;
      tryAdd(cyl("rock", x, z, rr, 1 + rr * 0.8, { rot: rand() * 6.28 }), rr + 1);
    }
    // trees — dense patches with open meadows and clear corridors
    const flatsR = R.flats;
    for (let gz = -196; gz <= 196; gz += 10.5) {
      for (let gx = -196; gx <= 196; gx += 10.5) {
        const x = gx + (rand() - 0.5) * 7;
        const z = gz + (rand() - 0.5) * 7;
        const dens = fbm(x * 0.012 + 40, z * 0.012, 41);
        if (dens < 0.5 || rand() > 0.82) continue;
        if (roadDist(x, z) < 6 || Math.abs(z - RIVER_Z(x)) < 22) continue;
        if (flatsR.some(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) < fr + 4)) continue;
        if (!isClear(x, z, 3)) continue;
        if (obstacles.some((o) => Math.abs(o.x - x) < o.r + 3 && Math.abs(o.z - z) < o.r + 3)) continue;
        const s = 0.8 + rand() * 0.55;
        add(cyl("tree", x, z, 0.55 * s, 11 * s, { scale: s, rot: rand() * 6.28, tankR: 1.0, cover: true, variant: rand() < 0.22 ? 1 : 0 }));
      }
    }
    // a few trees outside the play area for the horizon
  } else {
    sites.start = [0, -185];
    sites.base = [-37, -112];
    sites.industry = [112, 112];
    // street furniture: concrete barriers, wrecks, rubble
    const jersey = (x, z, a) => tryAdd(box("barrier", x, z, 0.45, 1.6, a, 1.1), 1.7);
    // city entrance checkpoint area
    for (const x of [-18, -14, 14, 18]) jersey(x, -132, 0);
    tower(-16, -150);
    tower(16, -150);
    barricade(-6, -118, Math.PI / 2, 2);
    barricade(6, -112, Math.PI / 2, 2);
    // lots
    const lotHalf = 11.5;
    const blockCenters = [-112.5, -37.5, 37.5, 112.5];
    const lotOffsets = [-13.25, 13.25];
    const special = { "1,0": "base", "1,2": "park", "3,3": "yard", "2,1": "ruins" };
    for (let bi = 0; bi < 4; bi++) {
      for (let bj = 0; bj < 4; bj++) {
        const cx = blockCenters[bi];
        const cz = blockCenters[bj];
        const sp = special[`${bi},${bj}`];
        if (sp === "base") {
          wall([[cx - 24, cz - 24], [cx - 6, cz - 24]], "concrete", 0.6, 2.2);
          wall([[cx + 6, cz - 24], [cx + 24, cz - 24]], "concrete", 0.6, 2.2);
          wall([[cx - 24, cz - 24], [cx - 24, cz + 4]], "concrete", 0.6, 2.2);
          wall([[cx + 24, cz - 24], [cx + 24, cz + 4]], "concrete", 0.6, 2.2);
          crates(cx + 14, cz - 14, 4, 5);
          barrels(cx - 15, cz - 15, 4, 3);
          tower(cx - 20, cz - 20);
          tower(cx + 20, cz - 20);
          for (const dx of [-14, 14]) barricade(cx + dx, cz + 12, 0, 2.2);
          continue;
        }
        if (sp === "park") {
          add(cyl("fountain", cx, cz, 3.2, 1.2, { cover: false }));
          for (let k = 0; k < 7; k++) {
            const ang = (k / 7) * Math.PI * 2 + 0.3;
            tryAdd(cyl("tree", cx + Math.cos(ang) * 17, cz + Math.sin(ang) * 17, 0.5, 9, { scale: 0.85, rot: ang, tankR: 1.0, cover: true, variant: 1 }), 3);
          }
          continue;
        }
        if (sp === "yard") {
          // factory hall on the north edge, silos east, containers inside
          add(box("factory", cx - 2, cz + 17, 22, 8, 0, 14));
          add(cyl("silo", cx + 20, cz - 10, 4.2, 17));
          add(cyl("silo", cx + 20, cz + 1, 4.2, 17));
          add(cyl("chimney", cx - 20, cz + 22, 1.8, 34, { cover: false }));
          add(box("container", cx - 18, cz - 14, 1.3, 3.1, 0.1, 2.7));
          add(box("container", cx - 14, cz - 20, 1.3, 3.1, 1.5, 2.7));
          barrels(cx + 6, cz - 20, 5, 4);
          crates(cx - 6, cz - 8, 3, 4);
          continue;
        }
        if (sp === "ruins") {
          for (let k = 0; k < 6; k++) {
            const x = cx + (rand() - 0.5) * 40;
            const z = cz + (rand() - 0.5) * 40;
            tryAdd(cyl("rubble", x, z, 2.2 + rand() * 2, 1.8, { rot: rand() * 6.28, cover: true }), 4);
          }
          add(box("ruinwall", cx - 16, cz + 8, 0.6, 9, 0.2, 6, { damaged: true }));
          add(box("ruinwall", cx + 10, cz - 14, 8, 0.6, 0.1, 5, { damaged: true }));
          continue;
        }
        for (const ox of lotOffsets) {
          for (const oz of lotOffsets) {
            const lx = cx + ox;
            const lz = cz + oz;
            // a mission point near the lot → leave it open
            const near = keep.some(([kx, kz, kr]) => Math.abs(kx - lx) < lotHalf + kr * 0.6 && Math.abs(kz - lz) < lotHalf + kr * 0.6);
            const roll = rand();
            if (near || roll < 0.14) {
              if (!near && rand() < 0.6) tryAdd(cyl("rubble", lx, lz, 3 + rand() * 2.5, 2, { rot: rand() * 6.28 }), 5);
              continue;
            }
            const damaged = rand() < 0.38;
            const hgt = damaged ? 7 + rand() * 10 : 12 + rand() * 24;
            const hx = lotHalf - rand() * 2.5;
            const hz = lotHalf - rand() * 2.5;
            add(box("building", lx, lz, hx, hz, 0, hgt, { damaged, style: Math.floor(rand() * 4), seed: Math.floor(rand() * 1e6) }));
            if (damaged && rand() < 0.7) {
              const sx = lx + (rand() < 0.5 ? -1 : 1) * (hx + 2.5);
              tryAdd(cyl("rubble", sx, lz + (rand() - 0.5) * 10, 2 + rand() * 1.6, 1.4, { rot: rand() * 6.28 }), 3);
            }
          }
        }
      }
    }
    // outer ring: south/north/east/west edge buildings beyond the last avenue
    for (const e of [-1, 1]) {
      for (let t = -190; t <= 190; t += 26) {
        if (Math.abs(t) < 16 || CITY_AVE.some((a) => Math.abs(t - a) < 18)) continue;
        const d = 178 * e;
        const hgt = 10 + rand() * 22;
        if (isClear(t, d, 12)) add(box("building", t, d, 10, 9, 0, hgt, { damaged: rand() < 0.3, style: Math.floor(rand() * 4), seed: Math.floor(rand() * 1e6) }));
        if (isClear(d, t, 12)) add(box("building", d, t, 9, 10, 0, hgt * 0.9, { damaged: rand() < 0.3, style: Math.floor(rand() * 4), seed: Math.floor(rand() * 1e6) }));
      }
    }
    // street clutter
    for (let k = 0; k < 34; k++) {
      const onX = rand() < 0.5;
      const a = CITY_AVE[Math.floor(rand() * CITY_AVE.length)];
      const t = (rand() - 0.5) * 360;
      const off = (rand() - 0.5) * 12;
      const x = onX ? a + off : t;
      const z = onX ? t : a + off;
      const roll = rand();
      const ang = onX ? (rand() - 0.5) * 0.6 : Math.PI / 2 + (rand() - 0.5) * 0.6;
      if (roll < 0.35) tryAdd(box("car", x, z, 1.0, 2.2, ang, 1.5), 3.2);
      else if (roll < 0.45) tryAdd(box("bus", x, z, 1.4, 5.6, ang, 3.2), 6.5);
      else if (roll < 0.7) jersey(x, z, ang + Math.PI / 2);
      else if (roll < 0.85) tryAdd(cyl("rubble", x, z, 1.8 + rand(), 1.3, { rot: rand() * 6 }), 3);
      else {
        crates(x, z, 2, 3);
        barrels(x + 2, z, 2, 2);
      }
    }
    // chain fences around a few lots
    fence([[-64, 86], [-11, 86]]);
    fence([[11, -64], [64, -64]]);
    fence([[86, -139], [86, -86]]);
  }

  /* -------- broadphase buckets (16 m cells) */
  const BC = 16;
  const BN = Math.ceil((HALF * 2 + 40) / BC);
  const BO = HALF + 20;
  const buckets = Array.from({ length: BN * BN }, () => []);
  for (const o of obstacles) {
    const r = o.r + 0.5;
    const i0 = Math.max(0, Math.floor((o.x - r + BO) / BC));
    const i1 = Math.min(BN - 1, Math.floor((o.x + r + BO) / BC));
    const j0 = Math.max(0, Math.floor((o.z - r + BO) / BC));
    const j1 = Math.min(BN - 1, Math.floor((o.z + r + BO) / BC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * BN + i].push(o.i);
  }
  let stamp = 1;
  const marks = new Uint32Array(obstacles.length);
  /** Obstacles whose bucket overlaps the AABB [x0,x1]×[z0,z1]. */
  const query = (x0, z0, x1, z1, out) => {
    out.length = 0;
    stamp++;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) + BO) / BC));
    const i1 = Math.min(BN - 1, Math.floor((Math.max(x0, x1) + BO) / BC));
    const j0 = Math.max(0, Math.floor((Math.min(z0, z1) + BO) / BC));
    const j1 = Math.min(BN - 1, Math.floor((Math.max(z0, z1) + BO) / BC));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        for (const k of buckets[j * BN + i]) {
          if (marks[k] === stamp) continue;
          marks[k] = stamp;
          out.push(obstacles[k]);
        }
    return out;
  };

  const map = { id: world, seed: R.seed, heightAt, groundAt, normalAt, roadDist, roads: R.roads, decks, water: R.water ?? null, obstacles, query, sites, terHalf: TER_HALF, terRes: TER_RES, terN: N, H, riverZ: world === "forest" ? RIVER_Z : null };
  map.nav = buildNav(map);
  CACHE.set(world, map);
  return map;
}

/* ------------------------------------------------------------------ nav grid */
function buildNav(map) {
  const N = NAV_N;
  const blocked = new Uint8Array(N * N);
  const cost = new Float32Array(N * N).fill(1);
  const cx = (i) => -HALF + (i + 0.5) * NAV_CELL;
  // terrain: steep slopes, deep water, outside the boundary
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cx(i);
      const z = cx(j);
      if (Math.abs(x) > BOUND - 1 || Math.abs(z) > BOUND - 1) {
        blocked[j * N + i] = 1;
        continue;
      }
      const g = map.groundAt(x, z);
      if (map.water != null && g < map.water + 0.3) {
        blocked[j * N + i] = 1;
        continue;
      }
      const e = 2;
      const sx = (map.groundAt(x + e, z) - map.groundAt(x - e, z)) / (2 * e);
      const sz = (map.groundAt(x, z + e) - map.groundAt(x, z - e)) / (2 * e);
      if (Math.hypot(sx, sz) > 0.5) blocked[j * N + i] = 1;
    }
  }
  // obstacles inflated by the tank half-width
  for (const o of map.obstacles) {
    if (!o.nav) continue;
    const infl = o.kind === "tree" ? 2.0 - o.r : NAV_INFL;
    const r = o.r + infl;
    const i0 = Math.max(0, Math.floor((o.x - r + HALF) / NAV_CELL));
    const i1 = Math.min(N - 1, Math.floor((o.x + r + HALF) / NAV_CELL));
    const j0 = Math.max(0, Math.floor((o.z - r + HALF) / NAV_CELL));
    const j1 = Math.min(N - 1, Math.floor((o.z + r + HALF) / NAV_CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = cx(i);
        const z = cx(j);
        let inside;
        if (o.shape === "cyl") inside = Math.hypot(x - o.x, z - o.z) < o.r + infl;
        else {
          const [lx, lz] = toLocal(o, x, z);
          inside = Math.abs(lx) < o.hx + infl && Math.abs(lz) < o.hz + infl;
        }
        if (inside) blocked[j * N + i] = 1;
      }
    }
  }
  // clearance cost: cells within 3 of a blocked cell cost more, so paths keep off walls
  const dist = new Uint8Array(N * N).fill(255);
  let frontier = [];
  for (let k = 0; k < N * N; k++) if (blocked[k]) {
    dist[k] = 0;
    frontier.push(k);
  }
  for (let d = 1; d <= 3; d++) {
    const next = [];
    for (const k of frontier) {
      const i = k % N;
      const j = (k / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (dist[nk] > d) {
          dist[nk] = d;
          next.push(nk);
        }
      }
    }
    frontier = next;
  }
  for (let k = 0; k < N * N; k++) if (!blocked[k] && dist[k] <= 3) cost[k] = 1 + (4 - dist[k]) * 0.55;
  // connected components
  const comp = new Int32Array(N * N).fill(-1);
  let nc = 0;
  const sizes = [];
  for (let k = 0; k < N * N; k++) {
    if (blocked[k] || comp[k] >= 0) continue;
    const stack = [k];
    comp[k] = nc;
    let size = 0;
    while (stack.length) {
      const c = stack.pop();
      size++;
      const i = c % N;
      const j = (c / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (!blocked[nk] && comp[nk] < 0) {
          comp[nk] = nc;
          stack.push(nk);
        }
      }
    }
    sizes.push(size);
    nc++;
  }
  let main = 0;
  for (let c = 1; c < nc; c++) if (sizes[c] > sizes[main]) main = c;
  return createNavApi({ N, blocked, cost, comp, main });
}

function createNavApi(nav) {
  const { N, blocked, cost, comp } = nav;
  const cell = (x) => Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / NAV_CELL)));
  const center = (i) => -HALF + (i + 0.5) * NAV_CELL;
  const free = (i, j) => i >= 0 && j >= 0 && i < N && j < N && !blocked[j * N + i];
  /** Nearest free cell of the main component to (x,z), searched in rings. */
  const nearestFree = (x, z, maxR = 24) => {
    const ci = cell(x);
    const cj = cell(z);
    if (free(ci, cj) && comp[cj * N + ci] === nav.main) return [center(ci), center(cj)];
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (!free(i, j) || comp[j * N + i] !== nav.main) continue;
          const d = di * di + dj * dj;
          if (d < bd) {
            bd = d;
            best = [center(i), center(j)];
          }
        }
      }
      if (best) return best;
    }
    return [x, z];
  };
  const walkable = (x, z) => free(cell(x), cell(z));
  /** Grid line-of-walk between two world points (no blocked cell on the line). */
  const lineFree = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(L / (NAV_CELL * 0.5));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      if (!free(cell(x0 + (x1 - x0) * t), cell(z0 + (z1 - z0) * t))) return false;
    }
    return true;
  };
  // A* scratch
  const g = new Float32Array(N * N);
  const parent = new Int32Array(N * N);
  const seen = new Uint32Array(N * N);
  const closed = new Uint32Array(N * N);
  let run = 0;
  const heap = [];
  const fval = new Float32Array(N * N);
  const push = (k) => {
    heap.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (fval[heap[p]] <= fval[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && fval[heap[l]] < fval[heap[m]]) m = l;
        if (r < heap.length && fval[heap[r]] < fval[heap[m]]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  /** A* from (x0,z0) to (x1,z1). Returns smoothed world waypoints (excluding the start) or null. */
  const findPath = (x0, z0, x1, z1, maxIter = 30000) => {
    let [sx, sz] = [x0, z0];
    if (!walkable(sx, sz)) [sx, sz] = nearestFree(sx, sz, 6);
    let [tx, tz] = [x1, z1];
    if (!walkable(tx, tz) || comp[cell(tz) * N + cell(tx)] !== comp[cell(sz) * N + cell(sx)]) [tx, tz] = nearestFree(tx, tz, 14);
    const si = cell(sx);
    const sj = cell(sz);
    const ti = cell(tx);
    const tj = cell(tz);
    const start = sj * N + si;
    const goal = tj * N + ti;
    if (blocked[start] || blocked[goal]) return null;
    if (comp[start] !== comp[goal]) return null;
    if (lineFree(sx, sz, tx, tz)) return [[tx, tz]];
    run++;
    heap.length = 0;
    g[start] = 0;
    seen[start] = run;
    parent[start] = -1;
    fval[start] = Math.hypot(ti - si, tj - sj);
    push(start);
    let iter = 0;
    let found = false;
    while (heap.length && iter++ < maxIter) {
      const k = pop();
      if (closed[k] === run) continue;
      closed[k] = run;
      if (k === goal) {
        found = true;
        break;
      }
      const i = k % N;
      const j = (k / N) | 0;
      for (const [di, dj, dc] of DIRS) {
        const ni = i + di;
        const nj = j + dj;
        if (!free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const nk = nj * N + ni;
        if (closed[nk] === run) continue;
        const ng = g[k] + dc * cost[nk];
        if (seen[nk] !== run || ng < g[nk]) {
          seen[nk] = run;
          g[nk] = ng;
          parent[nk] = k;
          fval[nk] = ng + Math.hypot(ti - ni, tj - nj) * 1.05;
          push(nk);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = parent[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => [center(k % N), center((k / N) | 0)]);
    pts[pts.length - 1] = [tx, tz];
    // string pulling
    const out = [];
    let ax = sx;
    let az = sz;
    let idx = 0;
    while (idx < pts.length - 1) {
      let far = idx + 1;
      for (let m = pts.length - 1; m > idx + 1; m--) {
        if (lineFree(ax, az, pts[m][0], pts[m][1])) {
          far = m;
          break;
        }
      }
      out.push(pts[far]);
      [ax, az] = pts[far];
      idx = far;
    }
    if (!out.length) out.push([tx, tz]);
    return out;
  };
  const sameComp = (x0, z0, x1, z1) => comp[cell(z0) * N + cell(x0)] === comp[cell(z1) * N + cell(x1)] && !blocked[cell(z0) * N + cell(x0)];
  return { ...nav, cell, center, free, walkable, nearestFree, lineFree, findPath, sameComp, inMain: (x, z) => !blocked[cell(z) * N + cell(x)] && comp[cell(z) * N + cell(x)] === nav.main };
}
