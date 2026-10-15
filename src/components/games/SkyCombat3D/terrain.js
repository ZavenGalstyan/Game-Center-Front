/**
 * Sky Combat 3D — procedural terrain shared by the simulation (collision,
 * ground-unit placement, bomb impacts) and the renderer (mesh + colours).
 * Pure functions, no Three.js, so the headless tests use the same ground.
 *
 * Units are metres. Y is up. Sea level is 0; every world has water there
 * (the desert's is a salt lake / coast in the far south-east).
 */

/* ------------------------------------------------------------------ noise */
function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
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
function fbm(x, y, s, oct = 5) {
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
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function distToPath(x, z, pts) {
  let best = Infinity;
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
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* ------------------------------------------------------------------ worlds */
/** Flat pads (airbases, radar hills, SAM sites…): {x, z, r, h}. */
export const PADS = {
  desert: {
    homeBase: { x: -3600, z: 3400, r: 620, h: 70 },
    enemyBase: { x: 2900, z: -3000, r: 700, h: 90 },
    radarA: { x: -900, z: -1700, r: 180, h: 260 },
    radarB: { x: 1500, z: 300, r: 180, h: 300 },
    radarC: { x: 300, z: -3900, r: 180, h: 220 },
    oasis: { x: -1200, z: 1200, r: 300, h: 40 },
  },
  mountain: {
    homeBase: { x: -4200, z: 3800, r: 650, h: 260 },
    fort: { x: 2600, z: -2600, r: 520, h: 520 },
    samValley: { x: 2400, z: 1700, r: 260, h: 240 },
    depot: { x: -600, z: -3600, r: 380, h: 420 },
  },
  ocean: {
    homeBase: { x: -4600, z: 2600, r: 600, h: 40 },
    island: { x: 2400, z: -2400, r: 520, h: 60 },
    cape: { x: -2800, z: -2600, r: 300, h: 70 },
  },
};

/** Mountain world valley the "Valley Run" mission flies through. */
export const VALLEY = [
  [-3600, 3000], [-2600, 2300], [-1700, 2600], [-700, 1700], [100, 2100], [1000, 1400], [1800, 1800], [2400, 1700],
];

const DESERT_COAST = { x: 5200, z: 5200 }; // salt-water bay in the far corner

function desertHeight(x, z) {
  const dunes = ridged(x / 520 + 3, z / 760, 11, 3) * 46 + fbm(x / 1400, z / 1400, 5, 3) * 40;
  const m = fbm(x / 2600, z / 2600, 21, 4);
  const mesa = sstep(0.56, 0.6, m) * 210 + sstep(0.66, 0.69, m) * 120;
  const r = Math.hypot(x, z);
  const rim = sstep(5200, 7600, r) * (500 + ridged(x / 1500, z / 1500, 41, 5) * 900);
  let h = 30 + dunes + mesa + rim;
  // bay
  const bay = Math.hypot(x - DESERT_COAST.x, z - DESERT_COAST.z);
  h = lerp(-90, h, sstep(1500, 2700, bay));
  return h;
}

function mountainHeight(x, z) {
  const n = ridged(x / 2600, z / 2600, 7, 6);
  const big = fbm(x / 5200, z / 5200, 3, 3);
  let h = 180 + Math.pow(n, 1.35) * 1500 * (0.55 + big * 0.8) + fbm(x / 600, z / 600, 9, 3) * 60;
  // the valley: carved channel with a gently sloped floor
  const d = distToPath(x, z, VALLEY);
  h += (1 - sstep(450, 1500, d)) * (380 + fbm(x / 700, z / 700, 29, 3) * 420);
  const floor = 200 + fbm(x / 900, z / 900, 13, 2) * 60;
  h = lerp(floor, h, sstep(150, 520, d));
  // a lake to the south-east
  const lake = Math.hypot(x - 3400, z - 3600);
  h = lerp(-40, h, sstep(700, 1500, lake));
  return h;
}

function oceanHeight(x, z) {
  // continent along the west, scattered islands elsewhere
  const coast = -2600 + fbm(z / 2200, 1.7, 3, 4) * 1600;
  const landW = sstep(coast + 900, coast - 600, x);
  const isl = fbm(x / 1500, z / 1500, 19, 5);
  // open water: the convoy lane (Iron Shield) and the task-force anchorage (Steel Tide)
  const lane = 1 - sstep(500, 950, distToPath(x, z, [[-2200, 2800], [5600, 2800]]));
  const fleet = 1 - sstep(1900, 2500, Math.hypot(x - 2100, z + 1800));
  const islands = Math.max(0, isl - 0.58) * 1800 * (1 - Math.max(lane, fleet));
  const hills = ridged(x / 1300, z / 1300, 23, 4) * 420;
  const land = 40 + hills + fbm(x / 500, z / 500, 2, 3) * 40;
  return lerp(-160, land, landW) + islands;
}

const BASE = { desert: desertHeight, mountain: mountainHeight, ocean: oceanHeight };

/** Terrain height at (x, z) in `world`, including the flattened pads. */
export function heightAt(world, x, z) {
  let h = BASE[world](x, z);
  const pads = PADS[world];
  for (const k in pads) {
    const p = pads[k];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.9) h = lerp(p.h, h, sstep(p.r, p.r * 1.9, d));
  }
  return h;
}

/** Height of whatever you would crash into: land or the sea surface. */
export function groundAt(world, x, z) {
  return Math.max(0, heightAt(world, x, z));
}

/** Surface normal (approx.) — used for colouring slopes. */
export function slopeAt(world, x, z, e = 20) {
  const hx = heightAt(world, x + e, z) - heightAt(world, x - e, z);
  const hz = heightAt(world, x, z + e) - heightAt(world, x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

export const WORLD_RADIUS = 6200; // soft boundary
export const TERRAIN_SIZE = 24000; // rendered + collision terrain square (60 m grid)
export const CEILING = 4200;
export { fbm, vnoise, sstep };

/* ------------------------------------------------------------------ height field */
const HF_CACHE = new Map();
/**
 * Pre-sampled terrain grid (bilinear lookups) shared by collision and the
 * rendered mesh, so what you see is exactly what you hit. Cached per world.
 */
export function heightField(world, n = 401) {
  const key = world + ":" + n;
  if (HF_CACHE.has(key)) return HF_CACHE.get(key);
  const size = TERRAIN_SIZE;
  const half = size / 2;
  const step = size / (n - 1);
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[j * n + i] = heightAt(world, -half + i * step, -half + j * step);
  const hf = {
    world, n, size, step, half, data,
    /** Terrain height (may be below sea level). */
    height(x, z) {
      let fx = (x + half) / step;
      let fz = (z + half) / step;
      fx = Math.max(0, Math.min(n - 1.001, fx));
      fz = Math.max(0, Math.min(n - 1.001, fz));
      const i = fx | 0;
      const j = fz | 0;
      const u = fx - i;
      const v = fz - j;
      const a = data[j * n + i];
      const b = data[j * n + i + 1];
      const c = data[(j + 1) * n + i];
      const d = data[(j + 1) * n + i + 1];
      // same triangle split as the terrain mesh in world.js (diagonal b–c)
      if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
      return d + (c - d) * (1 - u) + (b - d) * (1 - v);
    },
    /** Land or sea surface — what an aircraft would hit. */
    ground(x, z) {
      return Math.max(0, hf.height(x, z));
    },
  };
  HF_CACHE.set(key, hf);
  return hf;
}
