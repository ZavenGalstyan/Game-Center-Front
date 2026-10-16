/**
 * Wild Kingdom 3D — the one shared wilderness. Pure functions + typed arrays,
 * no Three.js, so the simulation, the renderer and the headless tests all
 * stand on exactly the same ground.
 *
 * Units are metres, Y is up, north is −Z, east is +X. Water level is 0: the
 * river, lakes and the savanna waterhole are carved below it.
 *
 *   north  ── Rocky mountains (Thunder Peak, Eagle Crags, Falcon Cliffs, caves)
 *   west   ── Dense forest (Old Oak, forest lake, Shadow Thicket)
 *   centre ── Grassland with wildflower meadows, the river runs N → S
 *   east   ── Savanna (Lion Rock, Old Baobab, waterhole)
 *   south  ── Mirror Lake, where the river ends
 */

export const HALF = 800; // world spans −HALF … +HALF on X and Z
export const GRID = 3.2; // height-grid spacing (the terrain mesh uses the same grid)
export const N = Math.round((HALF * 2) / GRID); // cells per side
export const WATER = 0;

/* ------------------------------------------------------------------ noise */
export function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, oct = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / (1 - Math.pow(0.5, oct));
}
function ridged(x, y, s, oct = 5) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f, y * f, s + i * 31) * 2 - 1);
    n *= n * w;
    w = Math.min(1, n * 1.6);
    sum += amp * n;
    f *= 2.1;
    amp *= 0.5;
  }
  return sum;
}
export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function distToPath(x, z, pts) {
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    const d = px * px + pz * pz;
    const len = Math.sqrt(L);
    if (d < best) {
      best = d;
      bestT = acc + t * len;
    }
    acc += len;
  }
  return { d: Math.sqrt(best), along: bestT, total: acc };
}

/* ------------------------------------------------------------------ geography */
/** The river, from Misty Falls at the mountain foot down to Mirror Lake. */
export const RIVER = [
  [40, -360], [22, -290], [-18, -215], [-44, -130], [-30, -50], [-6, 30], [36, 110], [44, 190], [26, 270], [58, 350], [96, 440], [110, 520],
];
export const FALLS = { x: 40, z: -366, name: "Misty Falls" };
export const LAKES = [
  { id: "mirror", name: "Mirror Lake", x: 110, z: 552, r: 100 },
  { id: "forest", name: "Forest Lake", x: -480, z: 160, r: 62 },
  { id: "waterhole", name: "Savanna Waterhole", x: 470, z: 330, r: 36 },
];
/** Rock-dome caves: entrance faces `face` (radians, 0 = +Z/south). */
export const CAVES = [
  { id: "bearcave", name: "Bear Cave", x: -300, z: -322, r: 9, face: 0.3 },
  { id: "eastcave", name: "Echo Cave", x: 300, z: -318, r: 9, face: -0.2 },
  { id: "foxden", name: "Mossy Grotto", x: -600, z: -60, r: 8, face: 1.2 },
];
export const LANDMARKS = [
  { id: "peak", name: "Thunder Peak", x: 0, z: -640, icon: "peak" },
  { id: "falls", name: "Misty Falls", x: FALLS.x, z: FALLS.z - 6, icon: "falls" },
  { id: "oak", name: "Old Oak", x: -350, z: -10, icon: "tree" },
  { id: "lionrock", name: "Lion Rock", x: 520, z: 160, icon: "rock" },
  { id: "baobab", name: "Old Baobab", x: 330, z: 470, icon: "tree" },
  { id: "arch", name: "Stone Arch", x: -150, z: -250, icon: "arch" },
  { id: "mirror", name: "Mirror Lake", x: 110, z: 552, icon: "water" },
];
const PEAKS = [
  { x: 0, z: -650, r: 150, h: 150 },
  { x: -430, z: -580, r: 115, h: 95 },
  { x: 430, z: -560, r: 125, h: 105 },
];
const PADS = [
  ...CAVES.map((c) => ({ x: c.x, z: c.z, r: c.r + 7 })),
  { x: -150, z: -250, r: 16 }, // stone arch
];

/** Biome weights at (x, z): { forest, grass, meadow, savanna, mountain } (sum ≈ 1). */
export function biomeWeights(x, z, out = {}) {
  const wx = x + (fbm(x / 300, z / 300, 7, 3) - 0.5) * 120;
  const wz = z + (fbm(x / 300 + 9, z / 300, 8, 3) - 0.5) * 100;
  const m = sstep(-290, -450, wz);
  const f = sstep(-130, -300, wx) * (1 - m);
  const s = sstep(150, 300, wx) * (1 - m);
  const g = Math.max(0, 1 - m - f - s);
  const md = sstep(0.56, 0.68, fbm(x / 95, z / 95, 11, 3)) * (g + f * 0.35);
  out.mountain = m;
  out.forest = f - md * (f / Math.max(1e-6, g + f)) * 0.35;
  out.savanna = s;
  out.meadow = md;
  out.grass = Math.max(0, g - md * (g / Math.max(1e-6, g + f * 0.35)));
  return out;
}
const BW = {};
export function biomeAt(x, z) {
  const w = biomeWeights(x, z, BW);
  let best = "grass";
  let bv = -1;
  for (const k of ["forest", "grass", "meadow", "savanna", "mountain"]) {
    if (w[k] > bv) {
      bv = w[k];
      best = k;
    }
  }
  return best;
}

/** The analytic height (the grid samples this once; use Terrain.height at runtime). */
export function rawHeight(x, z) {
  const w = biomeWeights(x, z, BW);
  let h = 9 + (fbm(x / 220, z / 220, 1, 4) - 0.5) * 22 + (fbm(x / 70, z / 70, 2, 3) - 0.5) * 7;
  // savanna: wide flat plains
  h = lerp(h, 6 + (fbm(x / 320, z / 320, 4, 3) - 0.5) * 7, w.savanna * 0.75);
  // meadow: soft
  h = lerp(h, h * 0.8 + 1.5, w.meadow * 0.5);
  // mountains: ridged ranges + named peaks
  const m = w.mountain;
  if (m > 0.001) h += m * (22 + ridged(x / 260, z / 260, 3, 5) * 150);
  for (const p of PEAKS) {
    const d2 = ((x - p.x) ** 2 + (z - p.z) ** 2) / (p.r * p.r);
    if (d2 < 9) h += p.h * Math.exp(-d2 * 1.4);
  }
  // rim hills keep the world closed to the south / east / west
  const e = Math.max(sstep(640, 790, Math.abs(x)), sstep(650, 790, z));
  if (e > 0) h += e * (40 + fbm(x / 90, z / 90, 5, 3) * 50);
  // Lion Rock: a flat-topped kopje in the savanna
  {
    const d = Math.hypot(x - 520, z - 160);
    if (d < 60) h += 17 * sstep(30, 16, d + (fbm(x / 9, z / 9, 6, 2) - 0.5) * 6);
  }
  // flatten pads (caves, the arch)
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 14) {
      const ph = padHeight(p);
      h = lerp(h, ph, sstep(p.r + 14, p.r, d));
    }
  }
  // river
  const rv = distToPath(x, z, RIVER);
  if (rv.d < 40) {
    const k = rv.along / rv.total;
    const wid = 4.5 + k * 6;
    const bank = 12 + k * 6;
    const bed = -2.6 + Math.min(1, (rv.d / wid) ** 2) * 2.2;
    const c = 1 - sstep(wid, wid + bank, rv.d);
    // the river begins at the falls: fade the cut in over the first 14 m
    const start = sstep(-8, 10, rv.along);
    const target = Math.min(h, bed);
    h = lerp(h, target, c * start);
    if (rv.along < 2 && rv.d < wid + 4 && z < FALLS.z + 2) h = Math.max(h, 0.5);
  }
  // lakes
  for (const L of LAKES) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.r + 40) {
      const rr = L.r * (0.9 + (fbm(x / 40, z / 40, 12, 2) - 0.5) * 0.25);
      const bed = lerp(-4.8, -0.7, clamp(d / rr, 0, 1) ** 2);
      const c = 1 - sstep(rr * 0.92, rr + 26, d);
      h = lerp(h, Math.min(h, bed), c);
    }
  }
  return h;
}
const padCache = new Map();
function padHeight(p) {
  const key = `${p.x},${p.z}`;
  let v = padCache.get(key);
  if (v == null) {
    // sample the surroundings without pads (avoid recursion: inline base terms)
    let s = 0;
    let n = 0;
    for (let a = 0; a < 6; a++) {
      const x = p.x + Math.cos(a) * p.r * 0.5;
      const z = p.z + Math.sin(a) * p.r * 0.5;
      const w = biomeWeights(x, z, {});
      let h = 9 + (fbm(x / 220, z / 220, 1, 4) - 0.5) * 22 + (fbm(x / 70, z / 70, 2, 3) - 0.5) * 7;
      h = lerp(h, 6 + (fbm(x / 320, z / 320, 4, 3) - 0.5) * 7, w.savanna * 0.75);
      if (w.mountain > 0.001) h += w.mountain * (22 + ridged(x / 260, z / 260, 3, 5) * 150);
      s += h;
      n++;
    }
    v = Math.max(3, s / n);
    padCache.set(key, v);
  }
  return v;
}

/* ------------------------------------------------------------------ terrain grid */
let shared = null;
/**
 * The sampled terrain (built once per page; ~251k samples). `height` is the
 * triangle-interpolated surface that matches the rendered mesh exactly.
 */
export function getTerrain() {
  if (shared) return shared;
  const V = N + 1;
  const heights = new Float32Array(V * V);
  for (let j = 0; j < V; j++) {
    const z = -HALF + j * GRID;
    for (let i = 0; i < V; i++) heights[j * V + i] = rawHeight(-HALF + i * GRID, z);
  }
  shared = new Terrain(heights);
  return shared;
}

export class Terrain {
  constructor(heights) {
    this.V = N + 1;
    this.h = heights;
    this.scatter = null;
    this.colliders = null;
  }
  at(i, j) {
    i = i < 0 ? 0 : i > N ? N : i;
    j = j < 0 ? 0 : j > N ? N : j;
    return this.h[j * this.V + i];
  }
  /** Ground height, matching the mesh triangles (diagonal from (i,j) to (i+1,j+1)). */
  height(x, z) {
    const fx = (clamp(x, -HALF, HALF) + HALF) / GRID;
    const fz = (clamp(z, -HALF, HALF) + HALF) / GRID;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i >= N) i = N - 1;
    if (j >= N) j = N - 1;
    const u = fx - i;
    const v = fz - j;
    const h00 = this.at(i, j);
    const h11 = this.at(i + 1, j + 1);
    if (u >= v) {
      const h10 = this.at(i + 1, j);
      return h00 + (h10 - h00) * u + (h11 - h10) * v;
    }
    const h01 = this.at(i, j + 1);
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }
  /** Surface normal (finite difference over ±GRID). */
  normal(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = GRID;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -dx;
    const ny = 2 * e;
    const nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l;
    out.y = ny / l;
    out.z = nz / l;
    return out;
  }
  /** Height of whatever is underfoot or the water surface, whichever is higher. */
  surface(x, z) {
    return Math.max(this.height(x, z), WATER);
  }
  isWater(x, z) {
    return this.height(x, z) < WATER - 0.25;
  }
  /** Is there drinkable water within `r` metres of (x, z)? */
  waterNear(x, z, r = 2.5) {
    if (this.height(x, z) < WATER - 0.05) return true;
    for (let a = 0; a < 8; a++) {
      const an = (a / 8) * Math.PI * 2;
      if (this.height(x + Math.cos(an) * r, z + Math.sin(an) * r) < WATER - 0.1) return true;
    }
    return false;
  }
}

/* ------------------------------------------------------------------ scatter (props) */
/**
 * Deterministic props: trees, bushes, rocks. Pure data so the sim gets the same
 * tree trunks to bump into and berry bushes to forage that the renderer draws.
 * Each item: { t: type, x, z, s: scale, r: rotation, c: collider radius }.
 * Types: pine, oak, birch, acacia, baobab, bush, berry, rock, boulder, dead.
 */
export function getScatter(terrain = getTerrain()) {
  if (terrain.scatter) return terrain.scatter;
  const items = [];
  const CELL = 7;
  const n = Math.floor((HALF * 2) / CELL);
  const w = {};
  for (let cj = 0; cj < n; cj++) {
    for (let ci = 0; ci < n; ci++) {
      const r1 = hash(ci, cj, 101);
      const r2 = hash(ci, cj, 102);
      const r3 = hash(ci, cj, 103);
      const r4 = hash(ci, cj, 104);
      const x = -HALF + (ci + 0.15 + r1 * 0.7) * CELL;
      const z = -HALF + (cj + 0.15 + r2 * 0.7) * CELL;
      if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) continue;
      const h = terrain.height(x, z);
      if (h < 0.6) continue; // water & shore
      biomeWeights(x, z, w);
      const nrm = terrain.normal(x, z);
      const steep = nrm.y < 0.8;
      // keep clear: river banks, caves, arch, landmarks and spawn spots
      if (nearReserved(x, z)) continue;
      const clump = fbm(x / 60, z / 60, 21, 3);
      let t = null;
      let s = 1;
      if (w.mountain > 0.5) {
        if (h > 150) {
          if (r3 < 0.05) t = "rock";
        } else if (r3 < 0.1 * (steep ? 1.6 : 1)) t = r4 < 0.3 ? "boulder" : "rock";
        else if (!steep && h < 120 && r3 < 0.1 + 0.3 * sstep(0.45, 0.7, clump)) t = "pine";
      } else if (w.forest > 0.45) {
        const dens = 0.42 + 0.42 * sstep(0.35, 0.65, clump);
        if (r3 < dens) t = r4 < 0.48 ? "pine" : r4 < 0.82 ? "oak" : r4 < 0.94 ? "birch" : "dead";
        else if (r3 < dens + 0.12) t = r4 < 0.4 ? "berry" : "bush";
        else if (r3 < dens + 0.16) t = "rock";
      } else if (w.savanna > 0.45) {
        if (r3 < 0.035 + 0.05 * sstep(0.55, 0.75, clump)) t = "acacia";
        else if (r3 < 0.08) t = "bush";
        else if (r3 < 0.095) t = "rock";
      } else if (w.meadow > 0.4) {
        if (r3 < 0.03) t = "birch";
        else if (r3 < 0.06) t = r4 < 0.5 ? "berry" : "bush";
        else if (r3 < 0.07) t = "rock";
      } else {
        // grassland: scattered copses
        const copse = sstep(0.62, 0.75, clump);
        if (r3 < 0.025 + copse * 0.4) t = r4 < 0.5 ? "oak" : r4 < 0.8 ? "birch" : "pine";
        else if (r3 < 0.07 + copse * 0.45) t = r4 < 0.35 ? "berry" : "bush";
        else if (r3 < 0.085 + copse * 0.45) t = "rock";
      }
      if (!t) continue;
      if (steep && t !== "rock" && t !== "boulder") continue;
      s = 0.75 + hash(ci, cj, 105) * 0.6;
      const c = COLLIDE[t] * s;
      items.push({ t, x, z, s, r: hash(ci, cj, 106) * Math.PI * 2, c });
    }
  }
  // landmark trees
  items.push({ t: "giantoak", x: -350, z: -10, s: 1, r: 0.4, c: 2.6 });
  items.push({ t: "baobab", x: 330, z: 470, s: 1.5, r: 1.1, c: 2.6 });
  terrain.scatter = items;
  return items;
}
const COLLIDE = { pine: 0.35, oak: 0.45, birch: 0.25, acacia: 0.35, baobab: 1.4, bush: 0, berry: 0, rock: 0.8, boulder: 1.7, dead: 0.3, giantoak: 2.6 };
const RESERVED = [
  ...CAVES.map((c) => ({ x: c.x + Math.sin(c.face) * 6, z: c.z + Math.cos(c.face) * 6, r: c.r + 10 })),
  { x: -150, z: -250, r: 18 },
  { x: -350, z: -10, r: 12 },
  { x: 330, z: 470, r: 10 },
  { x: FALLS.x, z: FALLS.z, r: 22 },
];
function nearReserved(x, z) {
  for (const r of RESERVED) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r) return true;
  return false;
}

/**
 * Static colliders (tree trunks, rocks, cave walls, arch legs) in a spatial hash.
 * `query(x, z, r, fn)` calls fn(collider) for each candidate.
 */
export function getColliders(terrain = getTerrain()) {
  if (terrain.colliders) return terrain.colliders;
  const CELL = 8;
  const n = Math.ceil((HALF * 2) / CELL);
  const cells = new Map();
  const list = [];
  const add = (x, z, r, kind = "prop", t = null, sc = 1) => {
    const c = { x, z, r, kind, t, s: sc };
    list.push(c);
    const i0 = Math.floor((x - r + HALF) / CELL);
    const i1 = Math.floor((x + r + HALF) / CELL);
    const j0 = Math.floor((z - r + HALF) / CELL);
    const j1 = Math.floor((z + r + HALF) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      let a = cells.get(k);
      if (!a) cells.set(k, (a = []));
      a.push(c);
    }
  };
  for (const it of getScatter(terrain)) if (it.c > 0) add(it.x, it.z, it.c, "prop", it.t, it.s);
  // cave walls: a ring of boulders around each dome except the entrance arc
  for (const c of CAVES) {
    for (let a = 0; a < 16; a++) {
      const an = (a / 16) * Math.PI * 2;
      let diff = Math.abs(((an - c.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < 0.75) continue; // entrance
      add(c.x + Math.sin(an) * c.r, c.z + Math.cos(an) * c.r, 1.9, "cave");
    }
  }
  // stone arch legs
  add(-150 - 6, -250, 2.2, "arch");
  add(-150 + 6, -250, 2.2, "arch");
  const query = (x, z, r, fn) => {
    const i0 = Math.floor((x - r + HALF) / CELL);
    const i1 = Math.floor((x + r + HALF) / CELL);
    const j0 = Math.floor((z - r + HALF) / CELL);
    const j1 = Math.floor((z + r + HALF) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = cells.get(j * n + i);
      if (a) for (const c of a) fn(c);
    }
  };
  terrain.colliders = { list, query };
  return terrain.colliders;
}

/** Which cave (if any) contains (x, z). */
export function caveAt(x, z) {
  for (const c of CAVES) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r - 0.8) ** 2) return c;
  return null;
}
