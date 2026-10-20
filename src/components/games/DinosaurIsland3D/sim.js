/**
 * Dinosaur Island 3D — the game simulation. Pure JS (no Three.js / DOM) so
 * the headless tests in tools/ drive exactly the code the browser runs.
 *
 * `sim.update(dt, input)` advances one frame. `input` is a plain object:
 *   { mx, mz, camYaw, sprint, jump, crouch, interact, attack, equip, eat, drink, heal }
 * where mx/mz are -1..1 camera-relative move axes and the edge-triggered
 * fields (jump, crouch, interact, eat, drink, heal, equip) are only set on the
 * frame the key went down. Everything the UI / renderer / audio need to react
 * to is pushed to `sim.events` (drained by the caller each frame).
 *
 * Conventions: yaw 0 faces +z; forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw).
 */
import { height, freshWaterAt, SITES, LAKE, RIVER, RIVER_W, inland, slope, riverInfo, rng } from "./terrain.js";
import { ITEMS, TOOLS, RECIPES, STATS, DINOS, SPAWNS, MISSIONS, RESCUE_TIME, CAMPFIRE_SAFE, DAY_LENGTH, MAX_WATER, canAfford } from "./data.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/* ------------------------------------------------------------------ layout */
const S = SITES.station;
const C = SITES.cave;
const K = SITES.crash;
const W = SITES.wreck;
export const LAYOUT = {
  station: S,
  lab: { x: S.x + 10, z: S.z - 10, hx: 6, hz: 4.5, wall: 0.35, door: 1.4, h: 3.6 },
  shelter: { x: S.x - 8, z: S.z - 12 },
  tower: { x: S.x - 15, z: S.z - 19 },
  helipad: { x: S.x + 4, z: S.z + 13, r: 6.5 },
  barrel: { x: S.x - 13, z: S.z + 7 },
  generator: { x: S.x + 1, z: S.z - 21 },
  fence: 28,
  gate: 4.5,
  cave: { x: C.x, z: C.z - 3, r: 9.5, open: 0.55 }, // open = half-angle of the entrance (rad), facing +z
  crash: { x: K.x, z: K.z, rot: 0.62 },
  wreck: { x: W.x, z: W.z, rot: -0.42 },
  crates: [
    { x: 12, z: 178 },
    { x: 41, z: 177 },
    { x: -14, z: 184 },
  ],
};
const CRATE_LOOT = [
  { berries: 2, bandage: 1 },
  { stone: 2, bandage: 1 },
  { wood: 2, water: 1 },
];
const fenceSegments = () => {
  const f = LAYOUT.fence;
  const g = LAYOUT.gate;
  const segs = [];
  const run = (axis, fixed, from, to) => segs.push(axis === "x" ? { x: S.x + (from + to) / 2, z: S.z + fixed, hx: (to - from) / 2, hz: 0.18 } : { x: S.x + fixed, z: S.z + (from + to) / 2, hx: 0.18, hz: (to - from) / 2 });
  run("x", -f, -f, 9); // north (broken gap 9..15)
  run("x", -f, 15, f);
  run("x", f, -f, f); // south
  run("z", -f, -f, -g); // west, gate in the middle
  run("z", -f, g, f);
  run("z", f, -f, -20); // east (broken gap -20..-13)
  run("z", f, -13, f);
  return segs;
};
const labWalls = () => {
  const L = LAYOUT.lab;
  const t = L.wall;
  return [
    { x: L.x, z: L.z - L.hz, hx: L.hx, hz: t },
    { x: L.x, z: L.z + L.hz, hx: L.hx, hz: t },
    { x: L.x + L.hx, z: L.z, hx: t, hz: L.hz },
    { x: L.x - L.hx, z: L.z - (L.hz + L.door) / 2, hx: t, hz: (L.hz - L.door) / 2 },
    { x: L.x - L.hx, z: L.z + (L.hz + L.door) / 2, hx: t, hz: (L.hz - L.door) / 2 },
  ];
};
LAYOUT.fenceSegs = fenceSegments();
LAYOUT.labWalls = labWalls();
LAYOUT.table = { x: LAYOUT.lab.x + 3.6, z: LAYOUT.lab.z, hx: 0.55, hz: 1.5 };
LAYOUT.desk = { x: LAYOUT.shelter.x, z: LAYOUT.shelter.z, hx: 1.3, hz: 0.5 };
LAYOUT.parts = {
  battery: { x: LAYOUT.cave.x + 0.6, z: LAYOUT.cave.z - 6.2, lift: 0.9 },
  antenna: { x: K.x + 4.2, z: K.z + 3.4, lift: 0.1 },
  circuit: { x: LAYOUT.table.x, z: LAYOUT.table.z + 0.6, lift: 0.98 },
};
LAYOUT.radio = { x: LAYOUT.desk.x, z: LAYOUT.desk.z + 1.3 };

export function inLab(x, z) {
  const L = LAYOUT.lab;
  return Math.abs(x - L.x) < L.hx && Math.abs(z - L.z) < L.hz;
}
export function inCave(x, z) {
  return Math.hypot(x - LAYOUT.cave.x, z - LAYOUT.cave.z) < LAYOUT.cave.r - 0.6;
}
export function inStation(x, z) {
  return Math.abs(x - S.x) < LAYOUT.fence && Math.abs(z - S.z) < LAYOUT.fence;
}
export function isNight(clock) {
  return clock < 0.23 || clock > 0.77;
}
/** 0 (midnight) .. 1 (noon) daylight factor. */
export function daylight(clock) {
  return clamp(Math.sin((clock - 0.25) * TAU) * 1.6 + 0.35, 0, 1);
}

/* ------------------------------------------------------------------ collision grid */
const CELL = 8;
const GN = 80;
class Grid {
  constructor() {
    this.cells = new Array(GN * GN);
  }
  key(ix, iz) {
    return clamp(ix + GN / 2, 0, GN - 1) * GN + clamp(iz + GN / 2, 0, GN - 1);
  }
  add(col) {
    const r = col.type === "c" ? col.r : Math.hypot(col.hx, col.hz);
    const x0 = Math.floor((col.x - r) / CELL);
    const x1 = Math.floor((col.x + r) / CELL);
    const z0 = Math.floor((col.z - r) / CELL);
    const z1 = Math.floor((col.z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        (this.cells[k] ||= []).push(col);
      }
  }
  near(x, z, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const c = this.cells[this.key(ix, iz)];
        if (c) for (const col of c) if (!out.includes(col)) out.push(col);
      }
    return out;
  }
}
const boxCol = (b, rot = 0, extra = {}) => ({ type: "b", x: b.x, z: b.z, hx: b.hx, hz: b.hz, c: Math.cos(rot), s: Math.sin(rot), ...extra });
const circleCol = (x, z, r, extra = {}) => ({ type: "c", x, z, r, ...extra });

/** Push the circle (o.x, o.z, R) out of a collider. Returns true on contact. */
function pushOut(o, R, col) {
  if (col.type === "c") {
    const dx = o.x - col.x;
    const dz = o.z - col.z;
    const min = R + col.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2) || 1e-4;
    const k = (min - d) / d;
    o.x += dx * k;
    o.z += dz * k;
    return true;
  }
  const dx = o.x - col.x;
  const dz = o.z - col.z;
  const lx = col.c * dx - col.s * dz;
  const lz = col.s * dx + col.c * dz;
  const qx = clamp(lx, -col.hx, col.hx);
  const qz = clamp(lz, -col.hz, col.hz);
  let nx = lx - qx;
  let nz = lz - qz;
  let d = Math.hypot(nx, nz);
  if (d >= R) return false;
  let px;
  let pz;
  if (d < 1e-5) {
    // centre inside the box: leave along the shallowest axis
    const ex = col.hx - Math.abs(lx);
    const ez = col.hz - Math.abs(lz);
    if (ex < ez) {
      px = (lx >= 0 ? 1 : -1) * (ex + R);
      pz = 0;
    } else {
      px = 0;
      pz = (lz >= 0 ? 1 : -1) * (ez + R);
    }
  } else {
    px = (nx / d) * (R - d);
    pz = (nz / d) * (R - d);
  }
  // local → world (inverse rotation)
  o.x += col.c * px + col.s * pz;
  o.z += -col.s * px + col.c * pz;
  return true;
}

/** 2D segment vs collider: returns the hit fraction (0..1) or 1. Used by the camera. */
export function segmentHit(ax, az, bx, bz, col, pad = 0.25) {
  if (col.type === "c") {
    const r = col.r + pad;
    const dx = bx - ax;
    const dz = bz - az;
    const fx = ax - col.x;
    const fz = az - col.z;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    if (c < 0) return 1; // starts inside (e.g. the cave ring) — ignore
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-9) return 1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : 1;
  }
  const tl = (x, z) => {
    const dx = x - col.x;
    const dz = z - col.z;
    return [col.c * dx - col.s * dz, col.s * dx + col.c * dz];
  };
  const [lax, laz] = tl(ax, az);
  const [lbx, lbz] = tl(bx, bz);
  const hx = col.hx + pad;
  const hz = col.hz + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = lbx - lax;
  const dz = lbz - laz;
  for (const [p, d, h] of [
    [lax, dx, hx],
    [laz, dz, hz],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return 1;
    } else {
      let a = (-h - p) / d;
      let b = (h - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return 1;
    }
  }
  return t0 > 0 ? t0 : 1;
}

/* ------------------------------------------------------------------ the sim */
export class Sim {
  constructor({ seed = 7, clock = 0.3 } = {}) {
    this.seed = seed;
    this.rand = rng(seed);
    this.time = 0;
    this.clock = clock;
    this.day = 1;
    this.events = [];
    this.inv = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 0]));
    this.tools = { hands: true, axe: false, spear: false };
    this.equipped = "hands";
    this.tally = { crates: 0, berries: 0, wood: 0, stone: 0, water: 0, meat: 0, bandage: 0, battery: 0, antenna: 0, circuit: 0, kills: 0, raptors: 0, trex: 0, herbs: 0, crafted: 0, deaths: 0, distance: 0 };
    this.flags = {};
    this.mission = 0;
    this.done = MISSIONS.map((m) => m.objectives.map(() => false));
    this.won = false;
    this.campfires = [];
    this.rescueT = 0;
    this.heli = { state: "away", t: 0 };
    this.danger = null;
    this.focus = null;
    this.grid = new Grid();
    this.tmp = [];
    this.respawnAt = { x: SITES.spawn.x, z: SITES.spawn.z };
    this.radioPos = LAYOUT.radio;
    this.helipad = LAYOUT.helipad;
    this.version = 0; // bumps when world state the renderer mirrors changes (trees, pickups, fires…)
    this.changed = [];
    this.buildWorld();
    this.player = this.makePlayer(SITES.spawn.x, SITES.spawn.z, Math.PI); // facing north, inland
    this.dinos = [];
    this.nextDinoId = 1;
    for (let si = 0; si < SPAWNS.length; si++) {
      const sp = SPAWNS[si];
      for (let i = 0; i < sp.n; i++) this.spawnDino(sp.kind, sp, si);
    }
  }

  makePlayer(x, z, yaw) {
    return {
      x,
      z,
      y: height(x, z),
      vx: 0,
      vz: 0,
      vy: 0,
      yaw,
      onGround: true,
      crouch: false,
      sprinting: false,
      moving: 0,
      hp: 100,
      stamina: 100,
      hunger: 100,
      thirst: 100,
      exhausted: false,
      regenDelay: 0,
      swing: 0,
      swingDur: 0,
      swingHit: false,
      cd: 0,
      noise: 0,
      hurtT: 0,
      invuln: 2,
      dead: false,
      inWater: false,
      speed: 0,
      landT: 0,
    };
  }

  /* ---------------------------------------------------------- world gen */
  buildWorld() {
    const R = this.rand;
    const grid = this.grid;
    this.trees = [];
    this.boulders = [];
    this.bushes = [];
    this.pickups = [];
    this.crates = LAYOUT.crates.map((c, i) => ({ id: i, x: c.x, z: c.z, y: height(c.x, c.z), opened: false, loot: CRATE_LOOT[i], rot: i * 1.3 + 0.4 }));
    this.parts = Object.entries(LAYOUT.parts).map(([id, p]) => ({ id, x: p.x, z: p.z, y: height(p.x, p.z) + p.lift, taken: false }));

    // static structures
    const L = LAYOUT;
    for (const s of L.fenceSegs) grid.add(boxCol(s, 0, { wall: true, h: 2.7 }));
    for (const s of L.labWalls) grid.add(boxCol(s, 0, { wall: true, h: 3.9 }));
    grid.add(boxCol(L.table));
    grid.add(boxCol(L.desk));
    grid.add(circleCol(L.tower.x, L.tower.z, 1.5));
    grid.add(circleCol(L.barrel.x, L.barrel.z, 0.65));
    grid.add(boxCol({ x: L.generator.x, z: L.generator.z, hx: 1.2, hz: 0.8 }));
    for (const [dx, dz, r] of [
      [-18, -4, 0.6],
      [-17, -2.6, 0.6],
      [16, 20, 0.7],
      [-20, 18, 0.7],
      [19, -2, 0.6],
    ])
      grid.add(circleCol(S.x + dx, S.z + dz, r));
    // cave ring (entrance faces +z)
    const cv = L.cave;
    for (let a = cv.open; a <= TAU - cv.open + 1e-6; a += 0.16) grid.add(circleCol(cv.x + Math.sin(a) * (cv.r + 0.4), cv.z + Math.cos(a) * (cv.r + 0.4), 1.35, { cave: true, wall: true, h: 7 }));
    // battery pedestal rock
    grid.add(circleCol(L.parts.battery.x, L.parts.battery.z - 0.9, 0.7));
    // crashed plane: fuselage + wing
    grid.add(boxCol({ x: L.crash.x, z: L.crash.z, hx: 1.5, hz: 6.5 }, L.crash.rot, { wall: true, h: 3 }));
    const wingOff = { x: L.crash.x + Math.cos(L.crash.rot) * -4.8, z: L.crash.z - Math.sin(L.crash.rot) * -4.8 };
    grid.add(boxCol({ x: wingOff.x, z: wingOff.z, hx: 3.8, hz: 1.0 }, L.crash.rot));
    // shipwreck hull
    grid.add(boxCol({ x: L.wreck.x, z: L.wreck.z, hx: 3.0, hz: 8.5 }, L.wreck.rot, { wall: true, h: 3.5 }));
    for (const c of this.crates) grid.add(boxCol({ x: c.x, z: c.z, hx: 0.55, hz: 0.55 }, c.rot));

    const keepOut = [
      { x: SITES.spawn.x, z: SITES.spawn.z, r: 9 },
      { x: L.wreck.x, z: L.wreck.z, r: 11 },
      { x: S.x, z: S.z, r: 42 },
      { x: L.cave.x, z: L.cave.z, r: 15 },
      { x: L.crash.x, z: L.crash.z, r: 12 },
      ...L.crates.map((c) => ({ x: c.x, z: c.z, r: 3 })),
    ];
    const blocked = (x, z, pad = 0) => {
      for (const k of keepOut) if (Math.hypot(x - k.x, z - k.z) < k.r + pad) return true;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4 + pad) return true;
      if (riverInfo(x, z).d < RIVER_W + 3 + pad) return true;
      return false;
    };
    // spacing hash
    const occ = new Map();
    const okSpace = (x, z, r) => {
      const ix = Math.floor(x / 6);
      const iz = Math.floor(z / 6);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const l = occ.get((ix + a) * 1000 + iz + b);
          if (l) for (const o of l) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
        }
      return true;
    };
    const mark = (x, z, r) => {
      const k = Math.floor(x / 6) * 1000 + Math.floor(z / 6);
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push({ x, z, r });
    };
    const randPt = (rmax = 225) => {
      const a = R() * TAU;
      const r = Math.sqrt(R()) * rmax;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    const addTree = (kind, x, z) => {
      const s = kind === "palm" ? 0.85 + R() * 0.45 : kind === "big" ? 1.1 + R() * 0.4 : 0.8 + R() * 0.5;
      const t = { id: this.trees.length, kind, x, z, y: height(x, z), s, rot: R() * TAU, lean: (R() - 0.5) * 0.25, hp: 3, wood: kind === "big" ? 5 : 3, alive: true, regrow: 0, shake: 0 };
      this.trees.push(t);
      grid.add(circleCol(x, z, (kind === "big" ? 0.85 : kind === "palm" ? 0.38 : 0.55) * Math.min(1.25, s), { tree: t }));
      mark(x, z, kind === "big" ? 3.2 : 2.2);
    };
    // jungle trees
    for (let i = 0; i < 2600 && this.trees.length < 470; i++) {
      const [x, z] = randPt();
      const inl = inland(x, z);
      const h = height(x, z);
      if (inl < 0.13 || h < 2 || h > 44 || blocked(x, z) || slope(x, z) > 0.85) continue;
      const kind = R() < 0.2 ? "big" : "jungle";
      if (!okSpace(x, z, kind === "big" ? 3.4 : 2.2)) continue;
      addTree(kind, x, z);
    }
    // palms along the beach band
    for (let i = 0; i < 1600; i++) {
      const [x, z] = randPt(232);
      const inl = inland(x, z);
      const h = height(x, z);
      if (inl < 0.035 || inl > 0.17 || h < 0.9 || blocked(x, z) || !okSpace(x, z, 2.6)) continue;
      addTree("palm", x, z);
      if (this.trees.filter((t) => t.kind === "palm").length >= 150) break;
    }
    // boulders
    for (let i = 0; i < 1400 && this.boulders.length < 120; i++) {
      const [x, z] = randPt();
      const inl = inland(x, z);
      const h = height(x, z);
      if (inl < 0.04 || h < 0.8 || blocked(x, z, 1)) continue;
      const mountain = h > 18 ? 1 : 0;
      if (!mountain && R() < 0.45) continue;
      const s = 0.8 + R() * (mountain ? 1.9 : 1.2);
      if (!okSpace(x, z, s * 1.1 + 0.6)) continue;
      const b = { id: this.boulders.length, x, z, y: height(x, z), s, rot: R() * TAU, stone: 3, regrow: 0 };
      this.boulders.push(b);
      grid.add(circleCol(x, z, s * 0.95, { boulder: b }));
      mark(x, z, s * 1.1);
    }
    // berry bushes, sticks and stones — guaranteed handful near the beach start
    const addBush = (x, z) => {
      this.bushes.push({ id: this.bushes.length, x, z, y: height(x, z), s: 0.8 + R() * 0.4, rot: R() * TAU, ripe: true, regrow: 0 });
      mark(x, z, 1.2);
    };
    const addPickup = (kind, x, z) => {
      this.pickups.push({ id: this.pickups.length, kind, x, z, y: height(x, z), rot: R() * TAU, taken: false, regrow: 0 });
      mark(x, z, 0.5);
    };
    const near = (cx, cz, rad, minInl, fn, count) => {
      let made = 0;
      for (let i = 0; i < 400 && made < count; i++) {
        const a = R() * TAU;
        const r = 4 + R() * rad;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (inland(x, z) < minInl || height(x, z) < 0.9 || blocked(x, z) || !okSpace(x, z, 1.1)) continue;
        fn(x, z);
        made++;
      }
    };
    near(SITES.spawn.x, SITES.spawn.z - 30, 34, 0.08, addBush, 7);
    near(SITES.spawn.x, SITES.spawn.z - 14, 30, 0.03, (x, z) => addPickup("stick", x, z), 12);
    near(SITES.spawn.x, SITES.spawn.z - 14, 30, 0.03, (x, z) => addPickup("stone", x, z), 10);
    near(LAKE.x, LAKE.z, 40, 0.1, addBush, 6);
    near(LAKE.x, LAKE.z, 40, 0.1, (x, z) => addPickup("stick", x, z), 8);
    near(LAKE.x, LAKE.z, 40, 0.1, (x, z) => addPickup("stone", x, z), 8);
    for (let i = 0; i < 1500; i++) {
      const [x, z] = randPt();
      const inl = inland(x, z);
      if (inl < 0.06 || height(x, z) < 1 || height(x, z) > 40 || blocked(x, z) || !okSpace(x, z, 1.1)) continue;
      const roll = R();
      if (roll < 0.34 && this.bushes.length < 95) addBush(x, z);
      else if (roll < 0.67 && this.pickups.filter((p) => p.kind === "stick").length < 120) addPickup("stick", x, z);
      else if (this.pickups.filter((p) => p.kind === "stone").length < 110) addPickup("stone", x, z);
    }
  }

  /* ---------------------------------------------------------- helpers */
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  toast(text, kind = "info") {
    this.emit("toast", { text, kind });
  }
  markChanged(kind, id) {
    this.version++;
    this.changed.push({ kind, id });
  }
  addItem(k, n = 1, silent = false) {
    if (k === "water") n = Math.min(n, MAX_WATER - this.inv.water);
    if (n <= 0) return 0;
    this.inv[k] += n;
    this.tally[k] = (this.tally[k] || 0) + n;
    if (!silent) this.emit("pickup", { item: k, n });
    return n;
  }
  get night() {
    return isNight(this.clock);
  }
  groundAt(x, z) {
    return height(x, z);
  }
  collide(o, R, filter) {
    let hit = false;
    const list = this.grid.near(o.x, o.z, R + 3, this.tmp);
    for (let pass = 0; pass < 2; pass++)
      for (const col of list) {
        if (col.tree && !col.tree.alive) continue;
        if (filter && !filter(col)) continue;
        if (pushOut(o, R, col)) hit = true;
      }
    for (const f of this.campfires) if (pushOut(o, R, { type: "c", x: f.x, z: f.z, r: 0.55 })) hit = true;
    return hit;
  }
  /** Colliders near a point (for the camera / renderer). */
  collidersNear(x, z, r) {
    return this.grid.near(x, z, r, []).filter((c) => !(c.tree && !c.tree.alive));
  }
  nearestCampfire(x, z) {
    let best = null;
    let bd = Infinity;
    for (const f of this.campfires) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best ? { fire: best, d: bd } : null;
  }
  isSafe(x, z) {
    const f = this.nearestCampfire(x, z);
    return !!f && f.d < CAMPFIRE_SAFE;
  }
  nearestOf(list, pred) {
    const p = this.player;
    let best = null;
    let bd = Infinity;
    for (const o of list) {
      if (!pred(o)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }
  nearestCrate() {
    const c = this.nearestOf(this.crates, (c) => !c.opened);
    return c && { x: c.x, z: c.z, name: "Supply crate" };
  }
  nearestBush() {
    const b = this.nearestOf(this.bushes, (b) => b.ripe);
    return b && { x: b.x, z: b.z, name: "Berry bush" };
  }
  nearestWood() {
    const s = this.nearestOf(this.pickups, (o) => !o.taken && o.kind === "stick");
    return s && { x: s.x, z: s.z, name: "Fallen branches" };
  }
  nearestStone() {
    const s = this.nearestOf(this.pickups, (o) => !o.taken && o.kind === "stone");
    return s && { x: s.x, z: s.z, name: "Loose stones" };
  }
  partTarget(id) {
    const part = this.parts.find((p) => p.id === id);
    if (!part || part.taken) return null;
    const names = { battery: "Echo Cave — battery", antenna: "Crashed plane — antenna", circuit: "Station lab — circuit board" };
    return { x: part.x, z: part.z, name: names[id] };
  }

  /* ---------------------------------------------------------- missions */
  missionDef() {
    return MISSIONS[this.mission] || null;
  }
  objectiveState() {
    const m = this.missionDef();
    if (!m) return [];
    return m.objectives.map((o, i) => {
      const n = o.n || 1;
      const done = this.done[this.mission][i];
      const locked = !done && o.gate && this.done[this.mission].slice(0, i).some((d) => !d);
      const count = done ? n : locked ? 0 : clamp(o.check(this), 0, n);
      return { id: o.id, text: o.text, n, count, done, locked };
    });
  }
  /** The thing the compass / beacon should point at. */
  currentTarget() {
    const m = this.missionDef();
    if (!m) return null;
    const st = this.objectiveState();
    for (let i = 0; i < m.objectives.length; i++) {
      if (st[i].done || st[i].locked || !m.objectives[i].target) continue;
      const t = m.objectives[i].target(this);
      if (t) return { x: t.x, z: t.z, name: t.name || m.objectives[i].text };
    }
    return null;
  }
  updateMissions() {
    const m = this.missionDef();
    if (!m) return;
    const done = this.done[this.mission];
    for (let i = 0; i < m.objectives.length; i++) {
      if (done[i]) continue;
      const o = m.objectives[i];
      if (o.gate && done.slice(0, i).some((d) => !d)) continue;
      if (o.check(this) >= (o.n || 1)) {
        done[i] = true;
        this.emit("objective", { mission: this.mission, index: i, text: o.text });
      }
    }
    if (done.every(Boolean)) {
      this.emit("mission", { mission: this.mission, title: m.title });
      this.mission++;
      if (this.mission >= MISSIONS.length) {
        this.won = true;
        this.emit("victory", {});
      } else this.emit("missionStart", { mission: this.mission, title: MISSIONS[this.mission].title });
    }
  }

  /* ---------------------------------------------------------- dinos */
  spawnDino(kind, home, spawnIndex = -1, opts = {}) {
    const R = this.rand;
    let x = home.x;
    let z = home.z;
    for (let i = 0; i < 30; i++) {
      const a = R() * TAU;
      const r = R() * (home.r || 10) * 0.7;
      const tx = home.x + Math.cos(a) * r;
      const tz = home.z + Math.sin(a) * r;
      if (height(tx, tz) > 0.6 && !freshWaterAt(tx, tz)) {
        x = tx;
        z = tz;
        break;
      }
    }
    if (opts.at) ({ x, z } = opts.at);
    const spec = DINOS[kind];
    const d = {
      id: this.nextDinoId++,
      kind,
      spawn: spawnIndex,
      home: { x: home.x, z: home.z, r: home.r || 20 },
      x,
      z,
      y: height(x, z),
      yaw: R() * TAU,
      vx: 0,
      vz: 0,
      speed: 0,
      hp: spec.hp,
      alive: true,
      state: "idle",
      t: 1 + R() * 3,
      goal: null,
      cd: 0,
      hurtT: 0,
      deadT: 0,
      calm: 0,
      phase: R() * 10,
      flank: R() < 0.5 ? -1 : 1,
      stuckT: 0,
      lastX: x,
      lastZ: z,
      assault: !!opts.assault,
      gone: false,
      respawnT: 0,
    };
    if (opts.assault) {
      d.state = "chase";
      d.home = { x: S.x, z: S.z, r: 30 };
    }
    this.dinos.push(d);
    this.markChanged("dino", d.id);
    return d;
  }
  detectRange(d) {
    const p = this.player;
    const spec = DINOS[d.kind];
    let r = spec.detect;
    if (p.crouch) r *= 0.5;
    else if (p.sprinting) r *= 1.35;
    if (p.noise > 0) r *= 1.35;
    if (this.night && d.kind === "raptor") r *= 1.15;
    // they see best in front of them
    const toP = Math.atan2(p.x - d.x, p.z - d.z);
    if (Math.abs(angDiff(d.yaw, toP)) > 1.9) r *= 0.6;
    return r;
  }
  canHunt(d) {
    const p = this.player;
    if (p.dead || this.won) return false;
    if (this.isSafe(p.x, p.z)) return false;
    if (d.kind === "trex" && (inCave(p.x, p.z) || inStation(p.x, p.z) || inLab(p.x, p.z))) return false;
    if (d.kind === "raptor" && inLab(p.x, p.z) && !d.assault) return false;
    return true;
  }
  setState(d, s, t = 0) {
    d.state = s;
    d.t = t;
  }
  dinoDamage(d, dmg, from) {
    if (!d.alive) return;
    d.hp -= dmg;
    d.hurtT = 0.35;
    this.emit("dinoHit", { id: d.id, kind: d.kind, x: d.x, z: d.z, y: d.y });
    if (d.hp <= 0) {
      d.alive = false;
      d.hp = 0;
      d.deadT = 0;
      d.state = "dead";
      this.tally.kills++;
      if (d.kind === "raptor") this.tally.raptors++;
      if (d.kind === "trex") this.tally.trex++;
      if (d.kind === "herb") this.tally.herbs++;
      this.emit("dinoDeath", { id: d.id, kind: d.kind, x: d.x, z: d.z });
      const spec = DINOS[d.kind];
      if (spec.meat) {
        this.addItem("meat", spec.meat);
        this.toast(`+${spec.meat} Meat`, "good");
      }
      if (d.kind === "trex") this.toast("The T-Rex has fallen!", "good");
      return;
    }
    const spec = DINOS[d.kind];
    if (!spec.predator) {
      this.setState(d, "flee", 7);
      this.emit("dinoCall", { kind: d.kind, id: d.id, x: d.x, z: d.z, call: "honk" });
    } else if (d.kind === "raptor" && d.hp < spec.hp * 0.34) {
      this.setState(d, "flee", 6);
      this.emit("dinoCall", { kind: d.kind, id: d.id, x: d.x, z: d.z, call: "yelp" });
    } else if (d.state !== "attack") {
      if (d.state !== "chase") this.emit("dinoCall", { kind: d.kind, id: d.id, x: d.x, z: d.z, call: d.kind === "trex" ? "roar" : "screech" });
      this.setState(d, "chase", 0);
      d.calm = 0;
    }
    // knockback (raptors only — the T-Rex shrugs it off)
    if (d.kind !== "trex" && from) {
      const a = Math.atan2(d.x - from.x, d.z - from.z);
      d.vx += Math.sin(a) * 5;
      d.vz += Math.cos(a) * 5;
    }
  }
  moveDino(d, dt, dirYaw, speed) {
    const spec = DINOS[d.kind];
    const turn = d.kind === "trex" ? 2.2 : d.kind === "herb" ? 2.6 : 6;
    const da = angDiff(d.yaw, dirYaw);
    d.yaw += clamp(da, -turn * dt, turn * dt);
    // slow down while turning hard
    const sp = speed * (Math.abs(da) > 1.2 ? 0.35 : 1);
    const k = Math.min(1, dt * 4);
    d.vx += (Math.sin(d.yaw) * sp - d.vx) * k;
    d.vz += (Math.cos(d.yaw) * sp - d.vz) * k;
    const ox = d.x;
    const oz = d.z;
    d.x += d.vx * dt;
    d.z += d.vz * dt;
    this.collide(d, spec.radius, d.kind === "trex" ? (c) => !c.tree || c.tree.kind === "big" || c.cave : null);
    // stay out of the sea and away from campfires
    if (height(d.x, d.z) < -0.6) {
      d.x = ox;
      d.z = oz;
      d.vx = d.vz = 0;
      d.blocked = true;
    }
    if (DINOS[d.kind].predator) {
      for (const f of this.campfires) {
        const dd = Math.hypot(d.x - f.x, d.z - f.z);
        if (dd < CAMPFIRE_SAFE) {
          const k2 = (CAMPFIRE_SAFE - dd) / (dd || 1);
          d.x += (d.x - f.x) * k2;
          d.z += (d.z - f.z) * k2;
          d.blocked = true;
        }
      }
      if (d.kind === "trex") {
        // the T-Rex can't squeeze into the station or the cave
        const fx = LAYOUT.fence + spec.radius;
        if (Math.abs(d.x - S.x) < fx && Math.abs(d.z - S.z) < fx) {
          const ex = fx - Math.abs(d.x - S.x);
          const ez = fx - Math.abs(d.z - S.z);
          if (ex < ez) d.x += Math.sign(d.x - S.x || 1) * ex;
          else d.z += Math.sign(d.z - S.z || 1) * ez;
          d.blocked = true;
        }
        const cv = LAYOUT.cave;
        const dc = Math.hypot(d.x - cv.x, d.z - cv.z);
        if (dc < cv.r + 3) {
          const k3 = (cv.r + 3 - dc) / (dc || 1);
          d.x += (d.x - cv.x) * k3;
          d.z += (d.z - cv.z) * k3;
        }
      }
    }
    d.y = height(d.x, d.z);
    d.speed = Math.hypot(d.x - ox, d.z - oz) / Math.max(dt, 1e-4);
  }
  roamGoal(d) {
    const R = this.rand;
    for (let i = 0; i < 12; i++) {
      const a = R() * TAU;
      const r = Math.sqrt(R()) * d.home.r;
      const x = d.home.x + Math.cos(a) * r;
      const z = d.home.z + Math.sin(a) * r;
      if (height(x, z) > 0.7 && !(DINOS[d.kind].predator && this.isSafe(x, z))) return { x, z };
    }
    return { x: d.home.x, z: d.home.z };
  }
  updateDino(d, dt) {
    const p = this.player;
    const spec = DINOS[d.kind];
    d.phase += dt;
    d.hurtT = Math.max(0, d.hurtT - dt);
    d.cd = Math.max(0, d.cd - dt);
    d.blocked = false;
    if (!d.alive) {
      d.deadT += dt;
      d.vx *= 0.9;
      d.vz *= 0.9;
      d.speed = 0;
      if (d.deadT > 25 && !d.gone) {
        d.gone = true;
        this.markChanged("dino", d.id);
      }
      if (d.gone && d.spawn >= 0) {
        d.respawnT += dt;
        if (d.respawnT > 150 && Math.hypot(p.x - d.home.x, p.z - d.home.z) > 70) {
          this.dinos.splice(this.dinos.indexOf(d), 1);
          this.spawnDino(d.kind, SPAWNS[d.spawn], d.spawn);
        }
      }
      return;
    }
    const dx = p.x - d.x;
    const dz = p.z - d.z;
    const dP = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const homeD = Math.hypot(d.x - d.home.x, d.z - d.home.z);
    d.t -= dt;
    // far away and calm: cheap idle
    if (dP > 160 && d.state !== "chase") {
      d.speed = 0;
      return;
    }
    if (!spec.predator) {
      // herbivore: graze / wander / flee
      const scared = !p.dead && dP < spec.detect * (p.sprinting ? 1.7 : p.crouch ? 0.45 : 1);
      if (scared && d.state !== "flee") {
        this.setState(d, "flee", 5);
        this.emit("dinoCall", { kind: d.kind, id: d.id, x: d.x, z: d.z, call: "honk" });
      }
      if (d.state === "flee") {
        let a = toP + Math.PI;
        if (homeD > d.home.r * 1.6) a = Math.atan2(d.home.x - d.x, d.home.z - d.z) * 0.5 + a * 0.5;
        if (d.blocked) a += 1.2;
        this.moveDino(d, dt, a, spec.run);
        if (d.t <= 0) this.setState(d, "idle", 2);
        return;
      }
      this.wander(d, dt, spec);
      return;
    }

    // predators
    const hunt = this.canHunt(d);
    switch (d.state) {
      case "idle":
      case "roam": {
        if (hunt && d.calm <= 0 && dP < this.detectRange(d)) {
          this.setState(d, "alert", d.kind === "trex" ? 1.3 : 0.7);
          this.emit("dinoCall", { kind: d.kind, id: d.id, x: d.x, z: d.z, call: d.kind === "trex" ? "roar" : "screech" });
          break;
        }
        d.calm = Math.max(0, d.calm - dt);
        this.wander(d, dt, spec);
        break;
      }
      case "alert": {
        this.moveDino(d, dt, toP, 0);
        if (d.t <= 0) this.setState(d, "chase");
        break;
      }
      case "chase": {
        if (!hunt || dP > spec.lose || homeD > spec.leash) {
          this.setState(d, "return");
          d.calm = 6;
          break;
        }
        if (dP < spec.range + 0.2 && d.cd <= 0) {
          this.setState(d, "attack", spec.windup);
          d.hit = false;
          this.emit("dinoAttack", { kind: d.kind, id: d.id, x: d.x, z: d.z });
          break;
        }
        // raptors flank a little while closing in
        let a = toP;
        if (d.kind === "raptor" && dP > 6) a += d.flank * 0.45;
        const sp = dP < spec.range + 1 ? spec.walk : spec.run;
        this.moveDino(d, dt, a, sp);
        break;
      }
      case "attack": {
        this.moveDino(d, dt, toP, d.kind === "raptor" ? 2.5 : 0.6);
        if (d.t <= 0 && !d.hit) {
          d.hit = true;
          d.cd = spec.cd;
          const facing = Math.abs(angDiff(d.yaw, toP)) < 1.1;
          if (dP < spec.range + 0.8 && facing && !p.dead) this.hurtPlayer(spec.dmg, d);
          this.setState(d, "recover", d.kind === "raptor" ? 0.45 : 0.7);
        }
        break;
      }
      case "recover": {
        // raptors hop back, the T-Rex shakes its head
        this.moveDino(d, dt, d.kind === "raptor" ? toP + Math.PI : toP, d.kind === "raptor" ? 3.2 : 0.4);
        if (d.t <= 0) this.setState(d, "chase");
        break;
      }
      case "flee": {
        this.moveDino(d, dt, toP + Math.PI + (d.blocked ? 1 : 0), spec.run * 0.9);
        if (d.t <= 0) {
          this.setState(d, "return");
          d.calm = 10;
        }
        break;
      }
      case "return": {
        const a = Math.atan2(d.home.x - d.x, d.home.z - d.z);
        this.moveDino(d, dt, a, spec.walk * 1.4);
        d.calm = Math.max(0, d.calm - dt);
        if (homeD < d.home.r * 0.6) this.setState(d, "idle", 2);
        // a hungry predator can still re-notice you once it has calmed down
        if (hunt && d.calm <= 0 && dP < this.detectRange(d) * 0.8) {
          this.setState(d, "alert", 0.6);
          this.emit("dinoCall", { kind: d.kind, id: d.id, x: d.x, z: d.z, call: d.kind === "trex" ? "roar" : "screech" });
        }
        if (d.assault) this.setState(d, "chase");
        break;
      }
      default:
        this.setState(d, "idle", 1);
    }
  }
  wander(d, dt, spec) {
    if (d.state === "idle") {
      this.moveDino(d, dt, d.yaw, 0);
      if (d.t <= 0) {
        d.goal = this.roamGoal(d);
        this.setState(d, "roam", 25);
        d.stuckT = 0;
      }
      return;
    }
    if (!d.goal) d.goal = this.roamGoal(d);
    const gx = d.goal.x - d.x;
    const gz = d.goal.z - d.z;
    const gd = Math.hypot(gx, gz);
    this.moveDino(d, dt, Math.atan2(gx, gz), spec.walk);
    d.stuckT += dt;
    if (d.stuckT > 2) {
      const moved = Math.hypot(d.x - d.lastX, d.z - d.lastZ);
      d.lastX = d.x;
      d.lastZ = d.z;
      d.stuckT = 0;
      if (moved < spec.walk * 0.6) d.goal = this.roamGoal(d);
    }
    if (gd < 1.5 || d.t <= 0) this.setState(d, "idle", 3 + this.rand() * 5);
  }

  /* ---------------------------------------------------------- player */
  hurtPlayer(dmg, d) {
    const p = this.player;
    if (p.dead || p.invuln > 0 || this.won) return;
    p.hp -= dmg;
    p.hurtT = 0.5;
    if (d) {
      const a = Math.atan2(p.x - d.x, p.z - d.z);
      const kb = d.kind === "trex" ? 9 : 5;
      p.vx += Math.sin(a) * kb;
      p.vz += Math.cos(a) * kb;
      p.vy = Math.max(p.vy, d.kind === "trex" ? 4 : 2);
      p.onGround = false;
    }
    this.emit("hurt", { dmg, kind: d ? d.kind : "starve" });
    if (p.hp <= 0) this.killPlayer(d ? d.kind : "starve");
  }
  killPlayer(cause) {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.deadT = 0;
    this.tally.deaths++;
    this.deathCause = cause;
    this.emit("death", { cause });
    for (const d of this.dinos) if (d.alive && DINOS[d.kind].predator && d.state !== "idle") this.setState(d, "return"), (d.calm = 12);
  }
  respawn() {
    const p = this.player;
    const at = this.respawnAt;
    let x = at.x;
    let z = at.z;
    if (at.fire) {
      x += 1.8;
      z += 1.2;
    }
    const np = this.makePlayer(x, z, p.yaw);
    np.hp = 75;
    np.hunger = Math.max(p.hunger, 55);
    np.thirst = Math.max(p.thirst, 55);
    np.invuln = 4;
    this.player = np;
    for (const d of this.dinos) {
      if (!d.alive || !DINOS[d.kind].predator) continue;
      if (d.assault) {
        // the assault pack regroups at the edge of the jungle
        const a = this.rand() * TAU;
        d.x = S.x + Math.cos(a) * 46;
        d.z = S.z + Math.sin(a) * 46;
        d.y = height(d.x, d.z);
      }
      this.setState(d, d.assault ? "return" : "idle", 3);
      d.calm = 8;
    }
    this.emit("respawn", {});
  }
  /** Which interactable is in front of the player right now. */
  findFocus(camYaw) {
    const p = this.player;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    let best = null;
    let bestScore = Infinity;
    const consider = (kind, o, label, reach = 2.4, extra = {}) => {
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return;
      const facing = d < 0.8 ? 1 : (dx * fx + dz * fz) / d;
      const score = d - facing * 1.2;
      if (score < bestScore) {
        bestScore = score;
        best = { kind, ref: o, label, x: o.x, z: o.z, ...extra };
      }
    };
    for (const c of this.crates) if (!c.opened) consider("crate", c, "Search supply crate", 2.5);
    for (const b of this.bushes) if (b.ripe && Math.abs(b.x - p.x) < 3 && Math.abs(b.z - p.z) < 3) consider("bush", b, "Pick berries", 2.4);
    for (const o of this.pickups) if (!o.taken && Math.abs(o.x - p.x) < 3 && Math.abs(o.z - p.z) < 3) consider("pickup", o, o.kind === "stick" ? "Pick up branches" : "Pick up stones", 2.1);
    for (const part of this.parts) if (!part.taken) consider("part", part, `Take the ${ITEMS[part.id].name.toLowerCase()}`, 2.4);
    for (const f of this.campfires) consider("fire", f, this.night ? "Rest by the fire until morning" : "Rest by the fire", 3.0);
    if (this.mission === 4 && !this.flags.radio) {
      const have = ["battery", "antenna", "circuit"].filter((k) => this.inv[k] > 0).length;
      consider("radio", LAYOUT.radio, have === 3 ? "Repair the radio & call for rescue" : `Radio — needs parts (${have}/3)`, 2.6);
    }
    if (this.flags.heliLanded && !this.flags.escaped) consider("heli", LAYOUT.helipad, "Board the rescue helicopter", 6.5);
    consider("barrel", LAYOUT.barrel, "Drink & fill flask (rain barrel)", 1.9);
    if (best) return best;
    // water: sample just ahead of the player and at their feet
    for (const [ox, oz] of [
      [fx * 1.4, fz * 1.4],
      [0, 0],
      [fx * 2.4, fz * 2.4],
    ]) {
      if (freshWaterAt(p.x + ox, p.z + oz) !== null) return { kind: "water", label: this.inv.water < MAX_WATER ? "Drink & fill flask" : "Drink", x: p.x + ox, z: p.z + oz };
    }
    return null;
  }
  interact(f) {
    const p = this.player;
    switch (f.kind) {
      case "crate": {
        const c = f.ref;
        c.opened = true;
        this.tally.crates++;
        const parts = [];
        for (const [k, n] of Object.entries(c.loot)) {
          const got = this.addItem(k, n, true);
          if (got) parts.push(`${got} ${ITEMS[k].name}`);
        }
        this.emit("pickup", { item: "crate", n: 1 });
        this.toast(`Crate: ${parts.join(", ")}`, "good");
        this.markChanged("crate", c.id);
        break;
      }
      case "bush": {
        const b = f.ref;
        b.ripe = false;
        b.regrow = 120;
        this.addItem("berries", 2);
        this.markChanged("bush", b.id);
        break;
      }
      case "pickup": {
        const o = f.ref;
        o.taken = true;
        o.regrow = 140;
        this.addItem(o.kind === "stick" ? "wood" : "stone", 1);
        this.markChanged("pickup", o.id);
        break;
      }
      case "part": {
        const part = f.ref;
        part.taken = true;
        this.addItem(part.id, 1);
        this.toast(`Found the ${ITEMS[part.id].name.toLowerCase()}!`, "good");
        this.markChanged("part", part.id);
        break;
      }
      case "fire":
        this.rest(f.ref);
        break;
      case "radio": {
        const missing = ["battery", "antenna", "circuit"].filter((k) => !this.inv[k]);
        if (missing.length) {
          this.toast(`Missing: ${missing.map((k) => ITEMS[k].name).join(", ")}`, "warn");
          this.emit("deny", {});
          break;
        }
        for (const k of ["battery", "antenna", "circuit"]) this.inv[k]--;
        this.flags.radio = true;
        this.rescueT = RESCUE_TIME;
        this.heli = { state: "inbound", t: 0 };
        this.emit("radio", {});
        this.toast("Mayday sent! Rescue is on the way — hold out!", "good");
        // the noise draws a raptor pack out of the jungle
        for (let i = 0; i < 3; i++) {
          const a = Math.PI * 0.75 + i * 0.6;
          this.spawnDino("raptor", { x: S.x, z: S.z, r: 30 }, -1, { assault: true, at: { x: S.x + Math.cos(a) * 52, z: S.z + Math.sin(a) * 52 } });
        }
        break;
      }
      case "heli":
        this.flags.escaped = true;
        this.heli.state = "leaving";
        this.heli.t = 0;
        this.emit("board", {});
        break;
      case "barrel":
      case "water": {
        p.thirst = 100;
        this.flags.foundWater = true;
        const got = this.addItem("water", 1, true);
        this.emit("drink", { fill: got });
        this.toast(got ? "+1 Water flask" : "You drink your fill", "good");
        break;
      }
      default:
    }
    this.markChanged("any", 0);
  }
  rest(fire) {
    const p = this.player;
    const threat = this.dinos.some((d) => d.alive && DINOS[d.kind].predator && (d.state === "chase" || d.state === "attack") && dist(d, p) < 45);
    if (threat) {
      this.toast("Too dangerous to rest — predators are hunting you!", "warn");
      this.emit("deny", {});
      return;
    }
    const night = this.night;
    if (night) {
      if (this.clock > 0.5) this.day++;
      this.clock = 0.26;
    } else this.clock += 0.09;
    p.stamina = 100;
    p.exhausted = false;
    p.hp = Math.min(100, p.hp + 35);
    p.hunger = Math.max(5, p.hunger - 10);
    p.thirst = Math.max(5, p.thirst - 12);
    this.respawnAt = { x: fire.x, z: fire.z, fire: true };
    this.emit("rest", { night });
    this.toast(night ? "You rest until dawn. Camp saved as your respawn point." : "You rest by the fire. Camp saved as your respawn point.", "good");
  }
  craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return false;
    if ((id === "axe" || id === "spear") && this.tools[id]) {
      this.toast(`You already have a ${r.name.toLowerCase()}`, "warn");
      return false;
    }
    if (!canAfford(this.inv, r.cost)) {
      this.toast(`Not enough materials for the ${r.name.toLowerCase()}`, "warn");
      this.emit("deny", {});
      return false;
    }
    if (id === "campfire") {
      const spot = this.campfireSpot();
      if (!spot) {
        this.toast("Find flat, open, dry ground to build a campfire", "warn");
        this.emit("deny", {});
        return false;
      }
      for (const [k, n] of Object.entries(r.cost)) this.inv[k] -= n;
      if (this.campfires.length >= 3) this.campfires.shift();
      const fire = { id: (this.fireId = (this.fireId || 0) + 1), x: spot.x, z: spot.z, y: height(spot.x, spot.z) };
      this.campfires.push(fire);
      this.respawnAt = { x: fire.x, z: fire.z, fire: true };
      this.markChanged("fire", fire.id);
      this.emit("craft", { id });
      this.toast("Campfire built — predators keep their distance. Respawn point set.", "good");
    } else {
      for (const [k, n] of Object.entries(r.cost)) this.inv[k] -= n;
      this.tools[id] = true;
      this.equipped = id;
      this.emit("craft", { id });
      this.emit("equip", { tool: id });
      this.toast(`Crafted: ${r.name}`, "good");
    }
    this.tally.crafted++;
    return true;
  }
  campfireSpot() {
    const p = this.player;
    for (const [dd, da] of [
      [1.8, 0],
      [1.8, 0.6],
      [1.8, -0.6],
      [2.4, 1.2],
      [2.4, -1.2],
      [2.0, Math.PI],
    ]) {
      const a = p.yaw + da;
      const x = p.x + Math.sin(a) * dd;
      const z = p.z + Math.cos(a) * dd;
      if (freshWaterAt(x, z) !== null || height(x, z) < 0.6 || slope(x, z) > 0.6) continue;
      const o = { x, z };
      if (this.collide(o, 0.9)) continue;
      if (Math.hypot(o.x - x, o.z - z) > 0.01) continue;
      if (inLab(x, z)) continue;
      return { x, z };
    }
    return null;
  }
  useItem(kind) {
    const p = this.player;
    if (p.dead) return false;
    if (kind === "eat") {
      const pick = this.inv.meat && (p.hunger < 62 || !this.inv.berries) ? "meat" : this.inv.berries ? "berries" : null;
      if (!pick) return this.toast("No food — pick berries from bushes", "warn"), false;
      if (p.hunger > 97) return this.toast("You're not hungry", "info"), false;
      this.inv[pick]--;
      p.hunger = Math.min(100, p.hunger + ITEMS[pick].hunger);
      if (ITEMS[pick].health) p.hp = Math.min(100, p.hp + ITEMS[pick].health);
      this.emit("eat", { item: pick });
      return true;
    }
    if (kind === "drink") {
      if (!this.inv.water) return this.toast("No water — fill flasks at the lake or river", "warn"), false;
      if (p.thirst > 97) return this.toast("You're not thirsty", "info"), false;
      this.inv.water--;
      p.thirst = Math.min(100, p.thirst + ITEMS.water.thirst);
      this.emit("drink", { fill: 0 });
      return true;
    }
    if (kind === "heal") {
      if (!this.inv.bandage) return this.toast("No bandages", "warn"), false;
      if (p.hp > 98) return this.toast("You're not hurt", "info"), false;
      this.inv.bandage--;
      p.hp = Math.min(100, p.hp + ITEMS.bandage.health);
      this.emit("heal", {});
      return true;
    }
    return false;
  }
  equip(tool) {
    if (!this.tools[tool]) {
      this.toast(`Craft a ${TOOLS[tool].name.toLowerCase()} first (Tab)`, "warn");
      return;
    }
    if (this.equipped === tool) return;
    this.equipped = tool;
    this.emit("equip", { tool });
  }
  /** Resolve the swing at the hit moment: dinos first, then trees / boulders. */
  resolveSwing(camYaw) {
    const p = this.player;
    const tool = TOOLS[this.equipped];
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    let bestD = null;
    let bd = Infinity;
    for (const d of this.dinos) {
      if (!d.alive) continue;
      const r = DINOS[d.kind].radius;
      const dx = d.x - p.x;
      const dz = d.z - p.z;
      const dd = Math.hypot(dx, dz) - r;
      if (dd > tool.reach) continue;
      const cos = (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz));
      if (cos < 0.45 && dd > 0.4) continue;
      if (dd < bd) {
        bd = dd;
        bestD = d;
      }
    }
    if (bestD) {
      this.dinoDamage(bestD, tool.dmg, p);
      return;
    }
    // trees & boulders in front
    const list = this.grid.near(p.x + fx, p.z + fz, 3, this.tmp);
    let best = null;
    bd = Infinity;
    for (const col of list) {
      if (!col.tree && !col.boulder) continue;
      if (col.tree && !col.tree.alive) continue;
      const dx = col.x - p.x;
      const dz = col.z - p.z;
      const dd = Math.hypot(dx, dz) - col.r;
      if (dd > tool.reach * 0.85) continue;
      const cos = (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz));
      if (cos < 0.5) continue;
      if (dd < bd) {
        bd = dd;
        best = col;
      }
    }
    if (!best) {
      this.emit("whiff", {});
      return;
    }
    if (best.tree) {
      const t = best.tree;
      t.shake = 0.4;
      t.hp -= tool.chop;
      this.emit("chop", { x: t.x, z: t.z, y: t.y, tool: this.equipped });
      this.markChanged("treeShake", t.id);
      while (t.hp <= 0 && t.alive) {
        this.addItem("wood", 1);
        t.wood--;
        t.hp += 3;
        if (t.wood <= 0) {
          t.alive = false;
          t.regrow = 240;
          this.emit("treeFall", { x: t.x, z: t.z, id: t.id });
          this.markChanged("tree", t.id);
        }
      }
      if (this.equipped === "hands" && !this.flags.handHint) {
        this.flags.handHint = true;
        this.toast("Chopping by hand is slow — craft an axe (Tab)", "info");
      }
    } else {
      const b = best.boulder;
      this.emit("mine", { x: b.x, z: b.z, y: b.y, ok: !!tool.mine && b.stone > 0 });
      if (!tool.mine) {
        if (!this.flags.mineHint) this.toast("Too hard to break by hand — you need an axe", "warn");
        this.flags.mineHint = true;
        return;
      }
      if (b.stone <= 0) {
        this.toast("This boulder is picked clean for now", "info");
        return;
      }
      b.stone--;
      if (b.stone <= 0) b.regrow = 150;
      this.addItem("stone", 1);
    }
  }
  updatePlayer(dt, inp) {
    const p = this.player;
    const camYaw = inp.camYaw ?? p.yaw;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.noise = Math.max(0, p.noise - dt);
    p.cd = Math.max(0, p.cd - dt);
    if (p.dead) {
      p.deadT += dt;
      p.vx *= 0.9;
      p.vz *= 0.9;
      return;
    }

    // tool / item hotkeys
    if (inp.equip) this.equip(inp.equip);
    if (inp.eat) this.useItem("eat");
    if (inp.drink) this.useItem("drink");
    if (inp.heal) this.useItem("heal");
    if (inp.crouch) {
      p.crouch = !p.crouch;
      this.emit("crouch", { on: p.crouch });
    }

    // movement
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    // right = (-cos yaw, sin yaw): mx > 0 strafes right
    let wx = fx * (inp.mz || 0) - fz * (inp.mx || 0);
    let wz = fz * (inp.mz || 0) + fx * (inp.mx || 0);
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const moving = wl > 0.05;
    if (p.exhausted && p.stamina > 25) p.exhausted = false;
    const wantSprint = inp.sprint && moving && !p.crouch && !p.exhausted && (inp.mz || 0) > -0.2;
    p.sprinting = wantSprint && p.stamina > 0;
    p.inWater = freshWaterAt(p.x, p.z) !== null && p.y < (freshWaterAt(p.x, p.z) || 0) + 0.2;
    let speed = p.crouch ? STATS.crouch : p.sprinting ? STATS.sprint : STATS.walk;
    if (p.inWater) speed *= 0.6;
    if (p.swing > 0 && this.equipped !== "hands") speed *= 0.6;
    if (moving) {
      // steep uphill slows you down
      const ax = p.x + wx * 0.6;
      const az = p.z + wz * 0.6;
      const grade = (height(ax, az) - height(p.x, p.z)) / 0.6;
      if (grade > 0.55) speed *= Math.max(0.3, 1 - (grade - 0.55) * 0.9);
    }
    const accel = p.onGround ? 11 : 2.2;
    const k = Math.min(1, dt * accel);
    p.vx += (wx * speed - p.vx) * k;
    p.vz += (wz * speed - p.vz) * k;

    if (inp.jump && p.onGround && !p.crouch && p.stamina >= STATS.jumpCost * 0.5) {
      p.vy = STATS.jump * (p.inWater ? 0.7 : 1);
      p.onGround = false;
      p.stamina = Math.max(0, p.stamina - STATS.jumpCost);
      p.regenDelay = 0.8;
      this.emit("jump", {});
    } else if (inp.jump && p.crouch) {
      p.crouch = false;
      this.emit("crouch", { on: false });
    }

    const ox = p.x;
    const oz = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    this.collide(p, STATS.radius);
    // dinos are solid too
    for (const d of this.dinos) {
      if (!d.alive && d.gone) continue;
      const r = DINOS[d.kind].radius * (d.alive ? 1 : 0.7);
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      const dd = Math.hypot(dx, dz);
      const min = r + STATS.radius;
      if (dd < min && dd > 1e-4) {
        p.x = d.x + (dx / dd) * min;
        p.z = d.z + (dz / dd) * min;
      }
    }
    // can't wade into the open sea
    if (height(p.x, p.z) < -1.0) {
      p.x = ox;
      p.z = oz;
      p.vx *= -0.2;
      p.vz *= -0.2;
      if (!this.flags.seaHint) this.toast("The sea is too rough to swim — explore inland", "info");
      this.flags.seaHint = true;
    }
    p.x = clamp(p.x, -270, 270);
    p.z = clamp(p.z, -270, 270);

    // gravity & ground
    const g = height(p.x, p.z);
    p.vy -= STATS.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= g) {
      if (!p.onGround && p.vy < -9) this.emit("land", { hard: p.vy < -15 });
      if (p.vy < -19) this.hurtPlayer(Math.round((-p.vy - 19) * 3));
      p.y = g;
      p.vy = 0;
      p.onGround = true;
    } else if (p.onGround && p.y - g < 0.45 && p.vy <= 0) {
      p.y = g; // stick to the ground when walking downhill
      p.vy = 0;
    } else p.onGround = false;

    const moved = Math.hypot(p.x - ox, p.z - oz);
    this.tally.distance += moved;
    p.speed = moved / Math.max(dt, 1e-4);
    p.moving = p.speed > 0.3 ? 1 : 0;

    // facing: toward the crosshair while using a tool, else toward the motion
    if (p.swing > 0 || inp.attack) p.yaw += angDiff(p.yaw, camYaw) * Math.min(1, dt * 14);
    else if (moving) p.yaw += angDiff(p.yaw, Math.atan2(wx, wz)) * Math.min(1, dt * 10);

    // tool use
    if (inp.attack && p.cd <= 0 && p.swing <= 0) {
      const tool = TOOLS[this.equipped];
      if (p.stamina >= tool.cost * 0.5) {
        p.swing = p.swingDur = tool.cd * 0.85;
        p.swingHit = false;
        p.cd = tool.cd;
        p.stamina = Math.max(0, p.stamina - tool.cost);
        p.regenDelay = 0.6;
        p.noise = 1.5;
        this.emit("swing", { tool: this.equipped });
      } else if (!this.flags.tiredHint) {
        this.flags.tiredHint = true;
        this.toast("Too tired — let your stamina recover", "warn");
      }
    }
    if (p.swing > 0) {
      p.swing -= dt;
      if (!p.swingHit && p.swingDur - p.swing >= p.swingDur * 0.42) {
        p.swingHit = true;
        this.resolveSwing(camYaw);
      }
    }

    // stamina
    if (p.sprinting) {
      p.stamina -= STATS.sprintCost * dt;
      p.regenDelay = 0.9;
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.exhausted = true;
        this.emit("exhausted", {});
      }
    } else {
      p.regenDelay -= dt;
      if (p.regenDelay <= 0) {
        const tiredK = p.hunger < 15 || p.thirst < 15 ? 0.45 : 1;
        p.stamina = Math.min(100, p.stamina + STATS.staminaRegen * (moving ? 0.7 : 1.15) * tiredK * dt);
      }
    }
    // hunger & thirst
    const work = p.sprinting ? 1.7 : 1;
    p.hunger = Math.max(0, p.hunger - STATS.hungerRate * work * dt);
    p.thirst = Math.max(0, p.thirst - STATS.thirstRate * work * dt * (this.clock > 0.35 && this.clock < 0.65 ? 1.15 : 1));
    if (p.hunger <= 0 || p.thirst <= 0) {
      p.starveT = (p.starveT || 0) + dt;
      p.hp -= STATS.starveDmg * dt * ((p.hunger <= 0 ? 1 : 0) + (p.thirst <= 0 ? 1 : 0));
      if (p.starveT > 4) {
        p.starveT = 0;
        this.emit("hurt", { dmg: 0, kind: "starve" });
        this.toast(p.thirst <= 0 ? "You're dying of thirst — drink water!" : "You're starving — eat something!", "bad");
      }
      if (p.hp <= 0) this.killPlayer(p.thirst <= 0 ? "thirst" : "hunger");
    } else {
      let regen = p.hunger > 45 && p.thirst > 45 ? 0.45 : 0;
      if (this.isSafe(p.x, p.z) && p.hunger > 15 && p.thirst > 15) regen += 2.2;
      p.hp = Math.min(100, p.hp + regen * dt);
    }

    // interaction
    this.focus = this.findFocus(camYaw);
    if (inp.interact) {
      if (this.focus) this.interact(this.focus);
      else this.emit("deny", { quiet: true });
    }
  }

  /* ---------------------------------------------------------- world timers */
  updateWorld(dt) {
    for (const t of this.trees) {
      if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
      if (!t.alive) {
        t.regrow -= dt;
        if (t.regrow <= 0 && dist(t, this.player) > 30) {
          t.alive = true;
          t.wood = t.kind === "big" ? 5 : 3;
          t.hp = 3;
          this.markChanged("tree", t.id);
        }
      }
    }
    for (const b of this.bushes)
      if (!b.ripe && (b.regrow -= dt) <= 0) {
        b.ripe = true;
        this.markChanged("bush", b.id);
      }
    for (const o of this.pickups)
      if (o.taken && (o.regrow -= dt) <= 0 && dist(o, this.player) > 25) {
        o.taken = false;
        this.markChanged("pickup", o.id);
      }
    for (const b of this.boulders) if (b.stone <= 0 && (b.regrow -= dt) <= 0) b.stone = 3;
  }

  update(dt, inp = {}) {
    if (this.won) {
      this.heli.t += dt;
      return;
    }
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const was = this.clock;
    this.clock += (dt / DAY_LENGTH) * (this.night ? 1.6 : 1);
    if (this.clock >= 1) {
      this.clock -= 1;
      this.day++;
      this.emit("newDay", { day: this.day });
    }
    if (was < 0.77 && this.clock >= 0.77) this.emit("dusk", {});
    if (was < 0.23 && this.clock >= 0.23) this.emit("dawn", {});

    this.updatePlayer(dt, inp);
    for (let i = this.dinos.length - 1; i >= 0; i--) {
      const d = this.dinos[i];
      if (d) this.updateDino(d, dt);
    }
    this.updateWorld(dt);

    // landmarks reached
    const p = this.player;
    if (!p.dead) {
      if (!this.flags.wreck && Math.hypot(p.x - LAYOUT.wreck.x, p.z - LAYOUT.wreck.z) < 13) this.flags.wreck = true;
      if (!this.flags.station && inStation(p.x, p.z)) this.flags.station = true;
      if (!this.flags.foundWater && (this.waterCheckT = (this.waterCheckT || 0) - dt) <= 0) {
        this.waterCheckT = 0.3;
        for (let a = 0; a < TAU; a += TAU / 8) if (freshWaterAt(p.x + Math.sin(a) * 6, p.z + Math.cos(a) * 6) !== null) this.flags.foundWater = true;
        if (this.flags.foundWater) this.toast("Fresh water! Press E at the shore to drink and fill flasks.", "good");
      }
    }
    // rescue countdown
    if (this.flags.radio && !this.flags.heliLanded) {
      this.rescueT = Math.max(0, this.rescueT - dt);
      this.heli.t += dt;
      if (this.rescueT <= 0) {
        this.flags.heliLanded = true;
        this.heli = { state: "landed", t: 0 };
        this.emit("heliLanded", {});
        this.toast("The helicopter has landed — get to the helipad!", "good");
      }
    } else if (this.heli.state !== "away") this.heli.t += dt;

    // danger readout for the HUD / music
    let danger = null;
    for (const d of this.dinos) {
      if (!d.alive || !DINOS[d.kind].predator) continue;
      if (d.state !== "chase" && d.state !== "attack" && d.state !== "alert" && d.state !== "recover") continue;
      const dd = dist(d, p);
      if (!danger || (d.kind === "trex" && danger.kind !== "trex") || dd < danger.d) danger = { kind: d.kind, d: dd };
    }
    this.danger = danger;

    this.updateMissions();
  }
}
