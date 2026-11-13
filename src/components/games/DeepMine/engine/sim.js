/**
 * Deep Mine: The Forgotten Ones — framework-free simulation.
 *
 * The world is a grid of 2 m cells parsed from the ASCII maps in levels.js.
 * Everything that moves is a circle on the XZ plane colliding with per-cell
 * boxes (rock, railings, pits, props, carts, closed doors); the player also
 * has a height (jumping). Shots are 3D rays tested against the grid (DDA)
 * and against enemy cylinders + head spheres. Enemies follow a BFS flow field
 * from the player's cell, so they always respect walls. Escape-room props
 * (keys, generators, levers, keypads, notes, carts, cracked rock) live here
 * too, so the Node test tools can solve every level without a browser.
 *
 * step(S, dt, input) advances the game and returns the events of that step.
 */
import { LEVEL_BY_ID, THEMES } from "./levels.js";

export const CELL = 2;
export const EYE = 1.62;
export const PR = 0.32;
const INF = 30000;
const GRAV = 20;
const JUMP_V = 6.2;
export const BATTERY_DRAIN = 100 / 300; // % per second: five minutes of light per full battery

export const WEAPONS = {
  pistol: { id: "pistol", name: "Mining Pistol", key: 1, dmg: 26, pellets: 1, interval: 0.22, mag: 10, reload: 1.15, range: 50, near: 22, minMul: 0.6, spread: 0.013, aimSpread: 0.003, moveSpread: 0.016, kick: 0.018, knock: 0.6, stagger: 0.12, maxRes: 120 },
  shotgun: { id: "shotgun", name: "Pump Shotgun", key: 2, dmg: 13, pellets: 9, interval: 0.85, mag: 6, reload: 2.0, range: 18, near: 5, minMul: 0.2, spread: 0.07, aimSpread: 0.05, moveSpread: 0.02, kick: 0.06, knock: 3.6, stagger: 0.35, maxRes: 48 },
  flare: { id: "flare", name: "Experimental Flare Gun", key: 3, dmg: 70, pellets: 1, interval: 0.9, mag: 3, reload: 2.2, range: 40, near: 30, minMul: 0.8, spread: 0.01, aimSpread: 0.004, moveSpread: 0.012, kick: 0.05, knock: 1.5, stagger: 0.4, maxRes: 18 },
};
export const WEAPON_ORDER = ["pistol", "shotgun", "flare"];
export const FLARE = { life: 7, radius: 2.4, dps: 22 };

export const ENEMIES = {
  miner: { name: "Forgotten Miner", hp: 60, r: 0.38, body: 1.62, headY: 1.68, headR: 0.24, walk: 0.9, run: 2.3, dmg: 12, reach: 1.45, windup: 0.6, cool: 1.2, detect: 13, knock: 1, stag: 1, doors: true },
  crawler: { name: "Tunnel Crawler", hp: 42, r: 0.4, body: 0.95, headY: 0.72, headR: 0.24, walk: 1.6, run: 5.0, dmg: 8, reach: 1.35, windup: 0.3, cool: 0.75, detect: 17, knock: 1.2, stag: 1, doors: true },
  brute: { name: "Cave Brute", hp: 1600, r: 0.85, body: 2.8, headY: 2.95, headR: 0.42, walk: 1.5, run: 2.5, dmg: 26, reach: 2.6, windup: 0.9, cool: 1.6, detect: 14, knock: 0.08, stag: 0.15, doors: false },
};

export const DIFFICULTY = {
  easy: { dmg: 0.6, hp: 0.8 },
  normal: { dmg: 1, hp: 1 },
  hard: { dmg: 1.4, hp: 1.15 },
};

const ENEMY_CHAR = { m: "miner", c: "crawler", B: "brute" };
const ITEM_CHARS = "asfhbkuxGSY";
const DECO = { r: 0.3, t: 0.35, o: 0.3, M: 0.1, n: 0.3, l: 0.3, "+": 0.35, g: 0.25, V: 0.3 };
const FLOORISH = new Set([".", "_", "P", "R", "T", "z", "*", "!", "w", "Q", "N", ...ITEM_CHARS, ...Object.keys(ENEMY_CHAR)]);
const NEED_E = new Set(["G", "S", "Y"]);
const MAX_ALIVE = 9;
const isDoorChar = (k) => k === "D" || k === "X" || k === "L" || /[1-4]/.test(k);

/* --------------------------------------------------------------- utils */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** yaw that looks from (x,z) toward (tx,tz); yaw 0 looks down −Z */
export const faceYaw = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const cx = (c) => c * CELL + CELL / 2;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* --------------------------------------------------------------- parsing */
export function parseLevel(L) {
  const rows = L.map;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ch = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) ch.push(rows[r][c] ?? "#");
  const at = (c, r) => (c < 0 || r < 0 || c >= w || r >= h ? "#" : ch[r * w + c]);
  const isWallish = (k) => k === "#" || k === "H" || k === "=" || isDoorChar(k);
  const out = { w, h, ch, at, doors: [], items: [], enemies: [], switches: [], keypads: [], notes: [], machines: [], carts: [], cracks: [], reach: [], triggers: [], spawns: [], lights: [], deco: [], rails: [], pits: [], start: null };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const k = at(c, r);
      const x = cx(c), z = cx(r);
      const axis = isWallish(at(c - 1, r)) && isWallish(at(c + 1, r)) ? "x" : isWallish(at(c, r - 1)) && isWallish(at(c, r + 1)) ? "z" : isWallish(at(c - 1, r)) || isWallish(at(c + 1, r)) ? "x" : "z";
      if (isDoorChar(k)) out.doors.push({ c, r, x, z, axis, kind: k === "D" ? "door" : k === "X" ? "exit" : k === "L" ? "lock" : "gate", gid: /[1-4]/.test(k) ? k : null });
      else if (k === "=") out.rails.push({ c, r, x, z, axis });
      else if (k === "O") out.pits.push({ c, r, x, z });
      else if (k === "H") out.cracks.push({ c, r, x, z });
      else if (DECO[k] !== undefined) out.deco.push({ c, r, x, z, kind: k, axis });
      if (k === "P") out.start = { c, r, x, z };
      if (ENEMY_CHAR[k]) out.enemies.push({ type: ENEMY_CHAR[k], x, z, c, r });
      if (ITEM_CHARS.includes(k)) out.items.push({ kind: k, x, z, c, r });
      if (k === "R") out.reach.push({ x, z });
      if (k === "T") out.triggers.push({ x, z });
      if (k === "z") out.spawns.push({ x, z, c, r });
      if (k === "N") out.notes.push({ c, r, x, z });
      if (k === "g" || k === "V") out.machines.push({ c, r, x, z, kind: k });
      if (k === "C") {
        out.carts.push({ c, r, x, z });
        ch[r * w + c] = "_"; // the cart stands on rails
      }
      if (k === "*" || k === "!" || k === "+") out.lights.push({ x, z, c, r, kind: k === "*" ? "lamp" : k === "!" ? "alarm" : "crystal" });
      if (k === "w" || k === "Q") {
        const d = DIRS.find(([dc, dr]) => at(c + dc, r + dr) === "#") || [0, -1];
        out[k === "w" ? "switches" : "keypads"].push({ c, r, x: x + d[0] * (CELL / 2 - 0.08), z: z + d[1] * (CELL / 2 - 0.08), nx: -d[0], nz: -d[1] });
      }
    }
  out.floorish = (k) => FLOORISH.has(k);
  return out;
}

/* --------------------------------------------------------------- creation */
export function createSim(levelId, opts = {}) {
  const L = LEVEL_BY_ID[levelId];
  const G = parseLevel(L);
  const theme = THEMES[L.theme] || {};
  const diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
  const owned = { pistol: !L.unarmed, shotgun: levelId > 5, flare: levelId > 10 };
  const am = L.ammo || {};
  const ammo = {};
  for (const w of WEAPON_ORDER) {
    const a = am[w] || [0, 0];
    ammo[w] = { mag: owned[w] ? a[0] : 0, res: owned[w] ? a[1] : 0 };
  }
  const P = {
    x: G.start.x,
    z: G.start.z,
    y: 0,
    vy: 0,
    grounded: true,
    yaw: { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 }[L.face || "n"],
    pitch: 0,
    vx: 0,
    vz: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    alive: true,
    w: owned.pistol ? "pistol" : null,
    owned,
    ammo,
    flash: levelId > 1,
    battery: 100,
    fireT: 9,
    cool: 0,
    reloadT: 0,
    reloadDur: 0,
    switchT: 0,
    aim: 0,
    hurtT: 0,
    hurtDir: 0,
    moving: 0,
    sprinting: false,
    bob: 0,
    recoil: 0,
    stepT: 0,
    dryT: 0,
    land: 0,
  };
  const S = {
    id: levelId,
    L,
    G,
    H: theme.H || 3.4,
    diff,
    rand: rng((opts.seed ?? levelId * 7919) + 13),
    P,
    E: [],
    doors: G.doors.map((d, i) => ({ ...d, id: i, open: 0, target: 0, bang: 0, bangEv: 0 })),
    items: G.items.map((it, i) => ({ ...it, id: i, taken: false })),
    switches: G.switches.map((s, i) => ({ ...s, id: i, on: false, color: (L.levers || [])[i] || null })),
    keypads: G.keypads.map((k, i) => ({ ...k, id: i, solved: false, code: (L.keypads || [])[i]?.code || "0000", open: (L.keypads || [])[i]?.open || [] })),
    notes: G.notes.map((n, i) => ({ ...n, id: i, read: false, title: (L.notes || [])[i]?.title || "", text: (L.notes || [])[i]?.text || "" })),
    machines: G.machines.map((m, i) => ({ ...m, id: i, on: false, need: (L.machines || {})[m.kind] || { item: null, count: 0 } })),
    carts: G.carts.map((c, i) => ({ ...c, id: i, moving: false, moved: false, tx: c.x, tz: c.z })),
    cracks: G.cracks.map((k, i) => ({ ...k, id: i, hp: 110, broken: false })),
    triggers: G.triggers.map((t, i) => ({ ...t, id: i, fired: false, scare: (L.scares || [])[i] || { kind: "growl" } })),
    flares: [],
    rings: [],
    bombs: [],
    t: 0,
    status: "play",
    step: 0,
    stepT: 0,
    got: {},
    count: {},
    keys: 0,
    seqI: 0,
    seqDone: false,
    power: !L.dark,
    targets: null,
    wave: null,
    exitOpen: false,
    completed: false,
    blackout: 0,
    shake: 0,
    stats: { kills: 0, shots: 0, hits: 0, heads: 0, dmgTaken: 0 },
    flow: new Int16Array(G.w * G.h).fill(INF),
    flowT: 0,
    flowCell: -1,
    prompt: null,
    ev: [],
    nextEnemyId: 1,
    addsDone: 0,
    bossIntro: false,
    hasBossStep: L.steps.some((s) => s.t === "boss"),
  };
  S.doorAt = new Map(S.doors.map((d) => [d.r * G.w + d.c, d]));
  S.railAt = new Map(G.rails.map((b) => [b.r * G.w + b.c, b.axis]));
  S.crackAt = new Map(S.cracks.map((k) => [k.r * G.w + k.c, k]));
  S.cartAt = new Map();
  for (const c of S.carts) S.cartAt.set(c.r * G.w + c.c, c);
  for (const e of G.enemies) {
    const extra = e.type === "brute" && L.bossHp ? { hp: L.bossHp * diff.hp, maxHp: L.bossHp * diff.hp } : {};
    spawnEnemy(S, e.type, e.x, e.z, false, extra);
  }
  computeFlow(S);
  enterStep(S);
  return S;
}

function spawnEnemy(S, type, x, z, alerted, extra = {}) {
  const D = ENEMIES[type];
  const hp = D.hp * S.diff.hp;
  const e = {
    id: S.nextEnemyId++,
    type,
    D,
    x,
    z,
    hx: x,
    hz: z,
    yaw: S.rand() * Math.PI * 2,
    hp,
    maxHp: hp,
    alive: true,
    state: alerted ? "chase" : "idle",
    alerted,
    stateT: 0,
    cool: 0.4 + S.rand() * 0.5,
    kx: 0,
    kz: 0,
    stagger: 0,
    hitT: 9,
    deadT: 0,
    walkPh: S.rand() * 10,
    speed: 0,
    thinkT: S.rand() * 0.2,
    wanderT: 1 + S.rand() * 3,
    wx: x,
    wz: z,
    growlT: 2 + S.rand() * 6,
    enraged: false,
    spawnT: 0,
    burnT: 0,
    atkCd: 2.2,
    dazed: 0,
    cdx: 0,
    cdz: 0,
    lastAtk: "",
    ...extra,
  };
  S.E.push(e);
  return e;
}

/* --------------------------------------------------------------- grid queries */
const cellIdx = (S, c, r) => r * S.G.w + c;
export const cellOf = (v) => Math.floor(v / CELL);

/** box for a cell in a given mode: "move" | "shot" | "sight". Returns [x0,z0,x1,z1] or null */
function cellBox(S, c, r, mode) {
  const G = S.G;
  const k = G.at(c, r);
  if (k === "#" || k === " " || k === "H") return [c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL];
  if (k === "O") return mode === "move" ? [c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL] : null;
  if (k === "=") {
    if (mode !== "move") return null;
    return thinBox(c, r, S.railAt.get(cellIdx(S, c, r)) || "x", 0.12);
  }
  const cart = S.cartAt.get(cellIdx(S, c, r));
  if (cart && mode !== "sight") {
    const m = 0.25;
    return [cart.x - CELL / 2 + m, cart.z - CELL / 2 + m, cart.x + CELL / 2 - m, cart.z + CELL / 2 - m];
  }
  if (DECO[k] !== undefined) {
    if (mode === "sight") return null;
    if (mode === "shot" && "rtonl".includes(k)) return null; // low clutter doesn't stop bullets aimed above it
    const m = DECO[k];
    return [c * CELL + m, r * CELL + m, (c + 1) * CELL - m, (r + 1) * CELL - m];
  }
  const d = S.doorAt.get(cellIdx(S, c, r));
  if (d) {
    if (d.open >= 0.85) return null;
    return thinBox(c, r, d.axis, 0.16);
  }
  return null;
}
function thinBox(c, r, axis, half) {
  const x = cx(c), z = cx(r);
  return axis === "x" ? [c * CELL, z - half, (c + 1) * CELL, z + half] : [x - half, r * CELL, x + half, (r + 1) * CELL];
}

/** cell walkable for path-finding (closed wooden doors count: miners force them). */
function passable(S, c, r, opening = false) {
  const G = S.G;
  if (c < 0 || r < 0 || c >= G.w || r >= G.h) return false;
  if (S.cartAt.has(cellIdx(S, c, r))) return false;
  const k = G.at(c, r);
  if (G.floorish(k)) return true;
  const d = S.doorAt.get(cellIdx(S, c, r));
  if (d) return d.open >= 0.85 || d.kind === "door" || (opening && d.target >= 1);
  return false;
}

function resolveCircle(S, o, r) {
  for (let pass = 0; pass < 2; pass++) {
    const c0 = cellOf(o.x - r), c1 = cellOf(o.x + r), r0 = cellOf(o.z - r), r1 = cellOf(o.z + r);
    for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++) {
        const b = cellBox(S, cc, rr, "move");
        if (!b) continue;
        const px = clamp(o.x, b[0], b[2]), pz = clamp(o.z, b[1], b[3]);
        const dx = o.x - px, dz = o.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          o.x += (dx / d) * (r - d);
          o.z += (dz / d) * (r - d);
        } else {
          const opts = [o.x - b[0] + r, b[2] - o.x + r, o.z - b[1] + r, b[3] - o.z + r];
          const m = Math.min(...opts);
          if (m === opts[0]) o.x = b[0] - r;
          else if (m === opts[1]) o.x = b[2] + r;
          else if (m === opts[2]) o.z = b[1] - r;
          else o.z = b[3] + r;
        }
      }
  }
}

function moveCircle(S, o, dx, dz, r) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  const sx = o.x, sz = o.z;
  for (let i = 0; i < n; i++) {
    o.x += dx / n;
    o.z += dz / n;
    resolveCircle(S, o, r);
  }
  const want = Math.hypot(dx, dz);
  return want > 1e-4 && Math.hypot(o.x - sx, o.z - sz) < want * 0.5;
}

function circleBlocked(S, x, z, r) {
  const c0 = cellOf(x - r), c1 = cellOf(x + r), r0 = cellOf(z - r), r1 = cellOf(z + r);
  for (let rr = r0; rr <= r1; rr++)
    for (let cc = c0; cc <= c1; cc++) {
      const b = cellBox(S, cc, rr, "move");
      if (!b) continue;
      const px = clamp(x, b[0], b[2]), pz = clamp(z, b[1], b[3]);
      if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
    }
  return false;
}

export function walkClear(S, ax, az, bx, bz, r) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / 0.35);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (circleBlocked(S, ax + (bx - ax) * t, az + (bz - az) * t, r * 0.9)) return false;
  }
  return true;
}

/**
 * 2D DDA over the grid. Returns the ray parameter t of the first blocking
 * box, or maxT; the hit cell is left in S.hitCell.
 */
export function rayGrid(S, ox, oz, dx, dz, maxT, mode) {
  let c = cellOf(ox), r = cellOf(oz);
  const stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1;
  const tdC = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tdR = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tmC = dx !== 0 ? ((dx > 0 ? (c + 1) * CELL : c * CELL) - ox) / dx : Infinity;
  let tmR = dz !== 0 ? ((dz > 0 ? (r + 1) * CELL : r * CELL) - oz) / dz : Infinity;
  S.hitCell = -1;
  for (let i = 0; i < 90; i++) {
    const b = cellBox(S, c, r, mode);
    if (b) {
      const t = raySlab(ox, oz, dx, dz, b);
      if (t !== null && t <= maxT) {
        S.hitCell = r * S.G.w + c;
        return t;
      }
    }
    if (tmC < tmR) {
      if (tmC > maxT) break;
      c += stepC;
      tmC += tdC;
    } else {
      if (tmR > maxT) break;
      r += stepR;
      tmR += tdR;
    }
  }
  return maxT;
}
function raySlab(ox, oz, dx, dz, b) {
  let t0 = -Infinity, t1 = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b[0] || ox > b[2]) return null;
  } else {
    let a = (b[0] - ox) / dx, c = (b[2] - ox) / dx;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b[1] || oz > b[3]) return null;
  } else {
    let a = (b[1] - oz) / dz, c = (b[3] - oz) / dz;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
  }
  if (t1 < Math.max(t0, 0)) return null;
  return Math.max(t0, 0);
}

export function lineOfSight(S, ax, az, bx, bz) {
  return rayGrid(S, ax, az, bx - ax, bz - az, 1, "sight") >= 0.999;
}
function meleeClear(S, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 0.01) return true;
  const s = Math.min(0.25, L * 0.3) / L;
  return rayGrid(S, ax + dx * s, az + dz * s, dx * (1 - 2 * s), dz * (1 - 2 * s), 1, "move") >= 0.999;
}

/* --------------------------------------------------------------- flow field */
function computeFlow(S) {
  const G = S.G;
  const f = S.flow;
  f.fill(INF);
  const pc = cellOf(S.P.x), pr = cellOf(S.P.z);
  if (!passable(S, pc, pr)) return;
  const q = new Int32Array(G.w * G.h);
  let qh = 0, qt = 0;
  f[pr * G.w + pc] = 0;
  q[qt++] = pr * G.w + pc;
  while (qh < qt) {
    const i = q[qh++];
    const c = i % G.w, r = (i - c) / G.w;
    const d = f[i] + 1;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (!passable(S, nc, nr)) continue;
        if (dc && dr && (!passable(S, c + dc, r) || !passable(S, c, r + dr))) continue;
        if (dc && dr && (S.doorAt.has(nr * G.w + nc) || S.doorAt.has(i))) continue;
        const j = nr * G.w + nc;
        if (f[j] <= d) continue;
        f[j] = d;
        q[qt++] = j;
      }
  }
  S.flowCell = pr * G.w + pc;
}

function reachableSet(S) {
  const G = S.G;
  const seen = new Uint8Array(G.w * G.h);
  const pc = cellOf(S.P.x), pr = cellOf(S.P.z);
  const q = [pr * G.w + pc];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    const c = i % G.w, r = (i - c) / G.w;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      const j = nr * G.w + nc;
      if (nc < 0 || nr < 0 || nc >= G.w || nr >= G.h || seen[j]) continue;
      if (!passable(S, nc, nr, true)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

/* --------------------------------------------------------------- objectives */
function curStep(S) {
  return S.L.steps[S.step];
}
function reachIndex(S) {
  let n = 0;
  for (let i = 0; i < S.step; i++) if (S.L.steps[i].t === "reach") n++;
  return n;
}

function enterStep(S) {
  const st = curStep(S);
  S.stepT = 0;
  S.targets = null;
  S.wave = null;
  if (!st) return;
  if (st.t === "kill") {
    const seen = reachableSet(S);
    S.targets = S.E.filter((e) => e.alive && !(e.type === "brute" && S.hasBossStep) && seen[cellOf(e.z) * S.G.w + cellOf(e.x)]).map((e) => e.id);
  }
  if (st.t === "wave") S.wave = { i: -1, queue: [], delay: 1.2, ids: [], of: st.waves.length, done: false, spawnT: 0 };
  if (st.t === "boss") for (const e of S.E) if (e.type === "brute") alert(S, e);
  if (st.t === "exit") {
    S.exitOpen = true;
    emit(S, { type: "exitOpen" });
  }
}

function stepDone(S, st) {
  const P = S.P;
  switch (st.t) {
    case "reach": {
      const m = S.G.reach[reachIndex(S)];
      return !m || Math.hypot(P.x - m.x, P.z - m.z) < 2.3;
    }
    case "flash":
      return P.flash;
    case "item":
      return !!S.got[st.item];
    case "collect":
      return (S.count[st.item] || 0) >= st.count;
    case "switch":
      return S.switches.filter((s) => s.on).length >= st.count;
    case "sequence":
      return S.seqDone;
    case "machine":
      return S.machines.filter((m) => m.kind === st.m).every((m) => m.on);
    case "unlock":
      return S.doors.filter((d) => d.kind === "lock").every((d) => d.target >= 1);
    case "code":
      return S.keypads.every((k) => k.solved);
    case "cart":
      return S.carts.every((c) => c.moved && !c.moving);
    case "hidden":
      return S.cracks.every((k) => k.broken);
    case "kill":
      return S.targets.every((id) => !S.E.find((e) => e.id === id)?.alive);
    case "wave":
      return S.wave.done;
    case "boss":
      return !S.E.some((e) => e.alive && e.type === "brute");
    default:
      return false;
  }
}

function updateObjectives(S) {
  for (let guard = 0; guard < 4; guard++) {
    const st = curStep(S);
    if (!st || st.t === "exit") return;
    if (!stepDone(S, st)) return;
    for (const g of st.open || []) openGate(S, g);
    if (st.done) emit(S, { type: "msg", text: st.done, kind: "good" });
    S.step++;
    emit(S, { type: "step", i: S.step });
    enterStep(S);
  }
}

export function objectiveInfo(S) {
  const st = curStep(S);
  if (!st) return null;
  let progress = null;
  if (st.t === "kill" && S.targets) progress = { kind: "enemies", n: S.targets.filter((id) => S.E.find((e) => e.id === id)?.alive).length };
  else if (st.t === "collect") progress = { kind: "count", n: Math.min(st.count, S.count[st.item] || 0), of: st.count };
  else if (st.t === "wave" && S.wave) progress = { kind: "wave", n: Math.max(1, S.wave.i + 1), of: S.wave.of, left: S.wave.ids.filter((id) => S.E.find((e) => e.id === id)?.alive).length + S.wave.queue.length };
  else if (st.t === "sequence") progress = { kind: "count", n: S.seqI, of: (S.L.order || []).length };
  else if (st.t === "machine") {
    const m = S.machines.find((x) => x.kind === st.m && !x.on);
    if (m && m.need.item) progress = { kind: "count", n: Math.min(m.need.count, S.count[m.need.item] || 0), of: m.need.count };
  }
  return { text: st.text, hint: st.hint || null, i: S.step, of: S.L.steps.length, progress };
}

const nearest = (P, list) => {
  let best = null, bd = 1e9;
  for (const o of list) {
    const d = Math.hypot(o.x - P.x, o.z - P.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best ? { x: best.x, z: best.z } : null;
};

/** world position of the current objective target, for the HUD marker */
export function objectiveTarget(S) {
  const st = curStep(S);
  if (!st) return null;
  const P = S.P;
  switch (st.t) {
    case "reach":
      return S.G.reach[reachIndex(S)] || null;
    case "item":
    case "collect":
      return nearest(P, S.items.filter((i) => !i.taken && i.kind === st.item));
    case "switch":
    case "sequence":
      return st.t === "sequence" ? null : nearest(P, S.switches.filter((s) => !s.on));
    case "machine": {
      const m = S.machines.find((x) => x.kind === st.m && !x.on);
      if (!m) return null;
      if (m.need.item && (S.count[m.need.item] || 0) < m.need.count) return nearest(P, S.items.filter((i) => !i.taken && i.kind === m.need.item)) || m;
      return m;
    }
    case "unlock":
      if (S.keys <= 0) return nearest(P, S.items.filter((i) => !i.taken && i.kind === "k"));
      return nearest(P, S.doors.filter((d) => d.kind === "lock" && d.target < 1));
    case "code":
      return nearest(P, S.keypads.filter((k) => !k.solved));
    case "cart":
      return nearest(P, S.carts.filter((c) => !c.moved));
    case "exit":
      return S.doors.find((d) => d.kind === "exit") || null;
    default:
      return null;
  }
}

function openGate(S, gid) {
  let any = false;
  for (const d of S.doors)
    if (d.kind === "gate" && d.gid === gid && d.target < 1) {
      d.target = 1;
      any = true;
    }
  if (any) {
    const d = S.doors.find((d) => d.gid === gid);
    emit(S, { type: "gate", x: d.x, z: d.z });
  }
}

/* --------------------------------------------------------------- waves / spawning */
function findSpawn(S, preferPoints, minD = 6) {
  const P = S.P;
  const pts = preferPoints && S.G.spawns.length ? S.G.spawns : null;
  const cands = [];
  if (pts) {
    for (const p of pts) {
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < minD) continue;
      if (S.flow[cellOf(p.z) * S.G.w + cellOf(p.x)] >= INF) continue;
      if (S.E.some((e) => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 0.9)) continue;
      const vis = lineOfSight(S, P.x, P.z, p.x, p.z);
      cands.push({ x: p.x, z: p.z, s: d + (vis ? 6 : 0) + S.rand() * 4 });
    }
  }
  if (!cands.length) {
    const G = S.G;
    for (let r = 0; r < G.h; r++)
      for (let c = 0; c < G.w; c++) {
        const f = S.flow[r * G.w + c];
        if (f < 4 || f > 9 || !G.floorish(G.at(c, r))) continue;
        const x = cx(c), z = cx(r);
        if (lineOfSight(S, P.x, P.z, x, z)) continue;
        cands.push({ x, z, s: f + S.rand() * 3 });
      }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.s - b.s);
  return cands[Math.floor(S.rand() * Math.min(3, cands.length))];
}

function updateWave(S, dt) {
  const W = S.wave;
  if (!W || W.done) return;
  const st = curStep(S);
  const aliveIds = W.ids.filter((id) => S.E.find((e) => e.id === id)?.alive);
  if (W.queue.length) {
    W.spawnT -= dt;
    if (W.spawnT <= 0 && S.E.filter((e) => e.alive).length < MAX_ALIVE) {
      const type = W.queue.shift();
      const p = findSpawn(S, true);
      if (p) {
        const e = spawnEnemy(S, type, p.x, p.z, true, { spawnT: 0.8 });
        W.ids.push(e.id);
        emit(S, { type: "spawn", e });
      } else W.queue.unshift(type);
      W.spawnT = 0.8;
    }
    return;
  }
  if (aliveIds.length) return;
  if (W.i + 1 >= st.waves.length) {
    W.done = true;
    return;
  }
  W.delay -= dt;
  if (W.delay > 0) return;
  W.i++;
  W.queue = st.waves[W.i].slice();
  W.delay = 3;
  W.spawnT = 0;
  emit(S, { type: "wave", n: W.i + 1, of: st.waves.length });
}

/* --------------------------------------------------------------- events */
function emit(S, e) {
  S.ev.push(e);
}

/* --------------------------------------------------------------- player */
function playerFwd(P) {
  return [-Math.sin(P.yaw), -Math.cos(P.yaw)];
}

function updatePlayer(S, dt, inp) {
  const P = S.P;
  P.yaw += inp.dYaw || 0;
  P.pitch = clamp(P.pitch + (inp.dPitch || 0), -1.35, 1.35);
  // flashlight
  if (inp.flash) {
    P.flash = !P.flash;
    emit(S, { type: "flash", on: P.flash });
  }
  if (P.flash) {
    const was = P.battery;
    P.battery = Math.max(0, P.battery - BATTERY_DRAIN * dt);
    if (was > 20 && P.battery <= 20) emit(S, { type: "msg", text: "Flashlight battery low", kind: "warn" });
    if (was > 0 && P.battery <= 0) emit(S, { type: "msg", text: "Battery empty — the flashlight is dim. Find a battery", kind: "warn" });
  }
  const aiming = !!inp.aim && !!P.w && P.switchT <= 0 && P.reloadT <= 0;
  P.aim += ((aiming ? 1 : 0) - P.aim) * Math.min(1, dt * 12);
  const [fx, fz] = playerFwd(P);
  const rx = -fz, rz = fx;
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  const wantSprint = !!inp.sprint && mz > 0.1 && P.aim < 0.5;
  P.sprinting = wantSprint && P.stamina > 1 && ml > 0;
  if (P.sprinting) P.stamina = Math.max(0, P.stamina - 22 * dt);
  else P.stamina = Math.min(100, P.stamina + (ml > 0 ? 14 : 22) * dt);
  const speed = P.aim > 0.5 ? 2.5 : P.sprinting ? 6.0 : 3.8;
  if (mz < 0) mz *= 0.8;
  const tvx = (fx * mz + rx * mx) * speed, tvz = (fz * mz + rz * mx) * speed;
  const acc = Math.min(1, dt * (P.grounded ? (ml > 0 ? 11 : 14) : 2.5));
  P.vx += (tvx - P.vx) * acc;
  P.vz += (tvz - P.vz) * acc;
  moveCircle(S, P, P.vx * dt, P.vz * dt, PR);
  if (inp.jump && P.grounded && P.stamina > 6) {
    P.vy = JUMP_V;
    P.grounded = false;
    P.stamina = Math.max(0, P.stamina - 6);
    emit(S, { type: "jump" });
  }
  if (!P.grounded) {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= 0) {
      P.y = 0;
      P.land = Math.min(1, -P.vy / 8);
      P.vy = 0;
      P.grounded = true;
      emit(S, { type: "land" });
    }
  }
  P.land = Math.max(0, P.land - dt * 4);
  const sp = Math.hypot(P.vx, P.vz);
  P.moving = P.grounded ? sp : 0;
  P.bob += P.moving * dt * 1.9;
  P.stepT -= P.moving * dt;
  if (P.stepT <= 0 && P.moving > 1) {
    P.stepT = P.sprinting ? 1.7 : 1.45;
    emit(S, { type: "foot", sprint: P.sprinting });
  }
  P.fireT += dt;
  P.cool = Math.max(0, P.cool - dt);
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.recoil *= Math.exp(-dt * 10);
  P.dryT = Math.max(0, P.dryT - dt);
  if (P.switchT > 0) P.switchT = Math.max(0, P.switchT - dt);
  // weapon switching
  let want = null;
  if (inp.weapon) want = WEAPON_ORDER[inp.weapon - 1] || null;
  if (inp.wheel && P.w) {
    const owned = WEAPON_ORDER.filter((w) => P.owned[w]);
    const i = owned.indexOf(P.w);
    want = owned[(i + (inp.wheel > 0 ? 1 : -1) + owned.length) % owned.length];
  }
  if (want && want !== P.w) {
    if (P.owned[want]) {
      P.w = want;
      P.switchT = 0.35;
      cancelReload(P);
      emit(S, { type: "switch", w: want });
    } else if (inp.weapon) emit(S, { type: "msg", text: want === "shotgun" ? "You haven't found the shotgun yet" : want === "flare" ? "You haven't found the flare gun yet" : "You haven't found a pistol yet", kind: "warn" });
  }
  if (!P.w) {
    if (inp.fireP && P.dryT <= 0) {
      P.dryT = 3;
      emit(S, { type: "msg", text: "You are unarmed! Find the pistol first", kind: "warn" });
    }
    return;
  }
  const W = WEAPONS[P.w];
  const A = P.ammo[P.w];
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) {
      const n = Math.min(W.mag - A.mag, A.res);
      A.mag += n;
      A.res -= n;
      P.reloadT = 0;
      emit(S, { type: "reloaded", w: P.w });
    }
  }
  if (inp.reload) tryReload(S);
  const busy = P.switchT > 0 || P.reloadT > 0;
  if (inp.fireP && !busy && P.cool <= 0) {
    if (A.mag > 0) fire(S);
    else if (A.res > 0) tryReload(S);
    else {
      P.cool = 0.3;
      emit(S, { type: "dry" });
      if (P.dryT <= 0) {
        P.dryT = 4;
        const other = WEAPON_ORDER.find((w) => w !== P.w && P.owned[w] && P.ammo[w].mag + P.ammo[w].res > 0);
        emit(S, { type: "msg", text: other ? "Out of ammo! Switch weapons" : "Out of ammo! Look for ammo boxes", kind: "warn" });
      }
    }
  }
}

function cancelReload(P) {
  P.reloadT = 0;
  P.reloadDur = 0;
}
function tryReload(S) {
  const P = S.P;
  if (!P.w) return;
  const W = WEAPONS[P.w];
  const A = P.ammo[P.w];
  if (P.reloadT > 0 || A.mag >= W.mag || A.res <= 0 || P.switchT > 0) return;
  P.reloadT = W.reload;
  P.reloadDur = W.reload;
  emit(S, { type: "reload", w: P.w });
}

export function eyeHeight(P) {
  return EYE + P.y;
}

function eyeRay(P, spread, rand) {
  const cp = Math.cos(P.pitch);
  let dx = -Math.sin(P.yaw) * cp, dy = Math.sin(P.pitch), dz = -Math.cos(P.yaw) * cp;
  if (spread > 0) {
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const ux = Math.sin(P.yaw) * Math.sin(P.pitch), uy = cp, uz = Math.cos(P.yaw) * Math.sin(P.pitch);
    const a = rand() * Math.PI * 2, m = Math.sqrt(rand()) * spread;
    const ox = Math.cos(a) * m, oy = Math.sin(a) * m;
    dx += rx * ox + ux * oy;
    dy += uy * oy;
    dz += rz * ox + uz * oy;
    const l = Math.hypot(dx, dy, dz);
    dx /= l;
    dy /= l;
    dz /= l;
  }
  return [dx, dy, dz];
}

export function headPos(e) {
  const lean = e.type === "crawler" ? 0.45 : e.type === "brute" ? 0.15 : 0.06;
  return [e.x - Math.sin(e.yaw) * lean, e.D.headY, e.z - Math.cos(e.yaw) * lean];
}

/** 3D ray vs the world + enemies. Returns { t, enemy, head, y, surface, cell } */
export function castShot(S, ox, oy, oz, dx, dy, dz, range) {
  let t = rayGrid(S, ox, oz, dx, dz, range, "shot");
  let cell = S.hitCell;
  let surface = t < range ? "wall" : null;
  if (dy < -1e-4) {
    const tf = -oy / dy;
    if (tf < t) {
      // shots into a pit fall away into the dark
      const fx = ox + dx * tf, fz = oz + dz * tf;
      if (S.G.at(cellOf(fx), cellOf(fz)) !== "O") {
        t = tf;
        surface = "floor";
        cell = -1;
      }
    }
  } else if (dy > 1e-4) {
    const tc = (S.H - oy) / dy;
    if (tc < t) {
      t = tc;
      surface = "ceil";
      cell = -1;
    }
  }
  let best = null;
  for (const e of S.E) {
    if (!e.alive || e.spawnT > 0.4) continue;
    const D = e.D;
    const [hx, hy, hz] = headPos(e);
    const th = raySphere(ox, oy, oz, dx, dy, dz, hx, hy, hz, D.headR);
    if (th !== null && th < t && (!best || th < best.t)) best = { t: th, enemy: e, head: true };
    const tb = rayCyl(ox, oz, dx, dz, e.x, e.z, D.r);
    if (tb !== null && tb < t && (!best || tb < best.t)) {
      const y = oy + dy * tb;
      if (y >= 0 && y <= D.body) best = { t: tb, enemy: e, head: false };
    }
  }
  if (best) return { ...best, y: oy + dy * best.t, surface: "flesh", cell: -1 };
  return { t, enemy: null, head: false, y: oy + dy * t, surface, cell };
}
function raySphere(ox, oy, oz, dx, dy, dz, sx, sy, sz, r) {
  const lx = ox - sx, ly = oy - sy, lz = oz - sz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
function rayCyl(ox, oz, dx, dz, cx0, cz0, r) {
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const lx = ox - cx0, lz = oz - cz0;
  const b = lx * dx + lz * dz;
  const c = lx * lx + lz * lz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t > 0 ? t : null;
}

function fire(S) {
  const P = S.P;
  const W = WEAPONS[P.w];
  const A = P.ammo[P.w];
  A.mag--;
  P.cool = W.interval;
  P.fireT = 0;
  P.recoil += W.kick * 10;
  P.pitch = clamp(P.pitch + W.kick * 0.35, -1.35, 1.35);
  S.stats.shots++;
  const spread = W.spread + (W.aimSpread - W.spread) * P.aim + Math.min(1, P.moving / 4) * W.moveSpread + (P.grounded ? 0 : 0.02);
  const dmgBy = new Map();
  const impacts = [];
  const crackHits = new Map();
  let anyHit = false, anyHead = false;
  const ey = eyeHeight(P);
  for (let i = 0; i < W.pellets; i++) {
    const [dx, dy, dz] = eyeRay(P, spread, S.rand);
    const h = castShot(S, P.x, ey, P.z, dx, dy, dz, W.range);
    const x = P.x + dx * h.t, y = ey + dy * h.t, z = P.z + dz * h.t;
    if (h.enemy) {
      const fall = h.t <= W.near ? 1 : Math.max(W.minMul, 1 - ((h.t - W.near) / (W.range - W.near)) * (1 - W.minMul));
      let mul = h.head ? (h.enemy.type === "brute" ? 1.35 : P.w === "shotgun" ? 1.5 : 2.2) : 1;
      if (h.enemy.dazed > 0) mul *= 1.5;
      const cur = dmgBy.get(h.enemy) || { dmg: 0, head: false, n: 0 };
      cur.dmg += W.dmg * fall * mul;
      cur.head = cur.head || h.head;
      cur.n++;
      dmgBy.set(h.enemy, cur);
      anyHit = true;
      anyHead = anyHead || h.head;
      impacts.push({ x, y, z, surface: "flesh" });
    } else {
      impacts.push({ x, y, z, surface: h.surface || "air" });
      const ck = h.cell >= 0 ? S.crackAt.get(h.cell) : null;
      if (ck && !ck.broken) crackHits.set(ck, (crackHits.get(ck) || 0) + W.dmg);
    }
    if (P.w === "flare") {
      // the flare lands where the shot stopped and keeps burning
      const back = h.enemy ? 0 : 0.25;
      S.flares.push({ x: x - dx * back, y: Math.max(0.15, y), z: z - dz * back, t: 0, life: FLARE.life, onEnemy: h.enemy ? h.enemy.id : 0 });
      if (S.flares.length > 6) S.flares.shift();
    }
  }
  if (anyHit) S.stats.hits++;
  if (anyHead) S.stats.heads++;
  emit(S, { type: "shot", w: P.w, hit: anyHit, head: anyHead, impacts });
  for (const [e, h] of dmgBy) {
    const [fx, fz] = playerFwd(P);
    const knock = W.knock * (h.n / W.pellets);
    damageEnemy(S, e, h.dmg, { kx: fx * knock, kz: fz * knock, stagger: W.stagger * (P.w === "shotgun" ? h.n / W.pellets : 1), head: h.head, src: P.w });
    if (P.w === "flare") e.burnT = 3;
  }
  for (const [ck, d] of crackHits) damageCrack(S, ck, d);
  noise(S, 22);
}

function damageCrack(S, ck, dmg) {
  ck.hp -= dmg;
  emit(S, { type: "crackHit", ck });
  if (ck.hp > 0) return;
  ck.broken = true;
  S.G.ch[ck.r * S.G.w + ck.c] = ".";
  S.shake = Math.max(S.shake, 0.5);
  emit(S, { type: "crack", ck });
  computeFlow(S);
}

function noise(S, radius) {
  const P = S.P;
  for (const e of S.E) {
    if (!e.alive || e.alerted || e.type === "brute") continue;
    const f = S.flow[cellOf(e.z) * S.G.w + cellOf(e.x)];
    if (Math.hypot(e.x - P.x, e.z - P.z) < radius * 0.6 || f * CELL < radius) alert(S, e);
  }
}

function alert(S, e) {
  if (e.alerted || !e.alive) return;
  e.alerted = true;
  if (e.state === "idle") e.state = "chase";
  emit(S, { type: "alert", e });
  if (e.type === "brute" && !S.bossIntro) {
    S.bossIntro = true;
    e.atkCd = 2.5;
    emit(S, { type: "bossIntro", e });
    S.shake = Math.max(S.shake, 0.5);
  }
}

function damageEnemy(S, e, dmg, o = {}) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.hitT = 0;
  e.kx += (o.kx || 0) * e.D.knock;
  e.kz += (o.kz || 0) * e.D.knock;
  const stag = (o.stagger || 0) * e.D.stag;
  if (stag > 0.08 && e.type !== "brute") {
    e.stagger = Math.max(e.stagger, stag);
    if (e.state === "windup" && stag > 0.2) {
      e.state = "recover";
      e.stateT = 0;
      e.cool = 0.5;
    }
  }
  alert(S, e);
  emit(S, { type: "ehit", e, dmg, head: !!o.head, src: o.src });
  if (e.hp <= 0) {
    e.alive = false;
    e.hp = 0;
    e.state = "dead";
    e.deadT = 0;
    S.stats.kills++;
    emit(S, { type: "edie", e, head: !!o.head });
    maybeDrop(S, e);
    if (e.type === "brute") {
      S.rings = [];
      for (const b of S.bombs) b.dud = true;
      S.shake = Math.max(S.shake, 1);
    }
    return;
  }
  if (e.type === "brute") {
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      emit(S, { type: "roar", e });
      S.shake = Math.max(S.shake, 0.6);
    }
    const adds = S.L.bossAdds || [];
    const th = [0.66, 0.33];
    if (S.addsDone < adds.length && e.hp < e.maxHp * th[S.addsDone] && !["summon", "slamWind", "throwWind", "chargeWind", "charge"].includes(e.state)) {
      e.state = "summon";
      e.stateT = 0;
    }
  }
}

const DROP_CHANCE = { miner: 0.35, crawler: 0.25, brute: 0 };
const DROP_KIND = { pistol: "a", shotgun: "s", flare: "f" };
function maybeDrop(S, e) {
  const P = S.P;
  if (!P.w || S.rand() >= (DROP_CHANCE[e.type] || 0)) return;
  const k = S.G.at(cellOf(e.x), cellOf(e.z));
  if (!S.G.floorish(k)) return;
  let kind;
  if (P.hp < 50 && S.rand() < 0.4) kind = "h";
  else if (P.flash && P.battery < 30 && S.rand() < 0.5) kind = "b";
  else {
    let best = null, br = 9;
    for (const w of WEAPON_ORDER) {
      if (!P.owned[w]) continue;
      const r = (P.ammo[w].mag + P.ammo[w].res) / (WEAPONS[w].mag * 4);
      if (r < br) {
        br = r;
        best = w;
      }
    }
    kind = DROP_KIND[best] || "a";
  }
  const it = { kind, x: e.x, z: e.z, c: cellOf(e.x), r: cellOf(e.z), id: S.items.length, taken: false, dropped: true };
  S.items.push(it);
  emit(S, { type: "drop", it });
}

function hurtPlayer(S, src, dmg, o = {}) {
  const P = S.P;
  if (!P.alive || S.status !== "play") return;
  dmg *= S.diff.dmg;
  P.hp = Math.max(0, P.hp - dmg);
  S.stats.dmgTaken += dmg;
  if (dmg > 0) {
    P.hurtT = 0.5;
    if (src) {
      P.hurtDir = angDiff(P.yaw, faceYaw(P.x, P.z, src.x, src.z));
      const dx = src.x - P.x, dz = src.z - P.z;
      const dl = Math.max(0.01, Math.hypot(dx, dz));
      const push = o.push ?? 1.6;
      P.vx -= (dx / dl) * push;
      P.vz -= (dz / dl) * push;
    } else P.hurtDir = 0;
  }
  emit(S, { type: "hurt", dmg, kind: o.kind || "melee" });
  if (P.hp <= 0) {
    P.alive = false;
    S.status = "dead";
    emit(S, { type: "dead" });
  }
}

/* --------------------------------------------------------------- enemies */
function updateEnemies(S, dt) {
  const P = S.P;
  for (const e of S.E) {
    if (!e.alive) {
      e.deadT += dt;
      e.kx *= Math.exp(-dt * 6);
      e.kz *= Math.exp(-dt * 6);
      if (e.deadT < 0.8) moveCircle(S, e, e.kx * dt, e.kz * dt, e.D.r * 0.6);
      continue;
    }
    const D = e.D;
    e.hitT += dt;
    e.stateT += dt;
    e.cool = Math.max(0, e.cool - dt);
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      continue;
    }
    if (e.burnT > 0) e.burnT -= dt;
    if (e.type === "brute") {
      updateBrute(S, e, dt);
      continue;
    }
    if (Math.abs(e.kx) + Math.abs(e.kz) > 0.01) {
      moveCircle(S, e, e.kx * dt, e.kz * dt, D.r);
      const k = Math.exp(-dt * 7);
      e.kx *= k;
      e.kz *= k;
    }
    if (e.stagger > 0) {
      e.stagger -= dt;
      e.speed = 0;
      continue;
    }
    const dx = P.x - e.x, dz = P.z - e.z;
    const dist = Math.hypot(dx, dz);
    e.thinkT -= dt;
    if (e.thinkT <= 0) {
      e.thinkT = 0.2;
      e.sees = P.alive && dist < 40 && lineOfSight(S, e.x, e.z, P.x, P.z);
      if (!e.alerted && P.alive) {
        // a lit flashlight makes you easier to spot
        const r = D.detect * (P.sprinting ? 1.2 : 1) * (P.flash ? 1.1 : 0.8);
        if ((e.sees && dist < r) || dist < 3.2) {
          alert(S, e);
          for (const o of S.E) if (o !== e && o.alive && !o.alerted && o.type !== "brute" && Math.hypot(o.x - e.x, o.z - e.z) < 7) alert(S, o);
        }
      }
    }
    e.growlT -= dt;
    if (e.growlT <= 0) {
      e.growlT = (e.alerted ? 3.5 : 8) + S.rand() * 6;
      if (dist < 22) emit(S, { type: "growl", e, idle: !e.alerted });
    }
    let mvx = 0, mvz = 0, spd = 0;
    if (!P.alive) {
      e.speed = 0;
      continue;
    }
    if (e.state === "idle") {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 2 + S.rand() * 4;
        const a = S.rand() * Math.PI * 2, r = S.rand() * 1.6;
        e.wx = e.hx + Math.cos(a) * r;
        e.wz = e.hz + Math.sin(a) * r;
        if (!walkClear(S, e.x, e.z, e.wx, e.wz, D.r)) {
          e.wx = e.x;
          e.wz = e.z;
        }
      }
      const wx = e.wx - e.x, wz = e.wz - e.z;
      const wl = Math.hypot(wx, wz);
      if (wl > 0.2) {
        mvx = wx / wl;
        mvz = wz / wl;
        spd = D.walk * 0.6;
      }
    } else if (e.state === "chase") {
      const reach = D.reach + PR;
      if (dist <= reach && e.cool <= 0 && meleeClear(S, e.x, e.z, P.x, P.z)) {
        e.state = "windup";
        e.stateT = 0;
        emit(S, { type: "windup", e });
      } else if (dist > reach * 0.8) {
        const dir = chaseDir(S, e, dist);
        if (dir) {
          mvx = dir[0];
          mvz = dir[1];
          spd = D.run * (e.burnT > 0 ? 0.6 : 1);
          if (dist < reach + 0.6) spd *= 0.6;
          // crawlers scuttle in a zig-zag
          if (e.type === "crawler" && dist > 4) {
            const wv = Math.sin(S.t * 3.4 + e.id * 1.7) * 0.55;
            const ox = mvx;
            mvx += -mvz * wv;
            mvz += ox * wv;
          }
        }
      }
    } else if (e.state === "windup") {
      const wind = D.windup;
      if (e.stateT >= wind) {
        e.state = "recover";
        e.stateT = 0;
        e.cool = D.cool;
        const reach = D.reach * 1.2 + PR;
        const fdot = (Math.sin(-e.yaw) * dx + -Math.cos(e.yaw) * dz) / Math.max(0.01, dist);
        const hit = dist <= reach && fdot > 0.1 && meleeClear(S, e.x, e.z, P.x, P.z);
        emit(S, { type: "strike", e, hit });
        if (hit) hurtPlayer(S, e, D.dmg);
      } else if (e.stateT < wind * 0.6) {
        e.yaw += angDiff(e.yaw, faceYaw(e.x, e.z, P.x, P.z)) * Math.min(1, dt * 8);
      }
    } else if (e.state === "recover") {
      if (e.stateT > 0.35) {
        e.state = "chase";
        e.stateT = 0;
      }
    }
    steer(S, e, dt, mvx, mvz, spd, dist);
    if (e.alerted && D.doors) forceDoor(S, e, dt);
  }
}

function steer(S, e, dt, mvx, mvz, spd, dist) {
  const P = S.P;
  const D = e.D;
  if (spd > 0) {
    let sx = 0, sz = 0;
    for (const o of S.E) {
      if (o === e || !o.alive) continue;
      const ox = e.x - o.x, oz = e.z - o.z;
      const od = Math.hypot(ox, oz);
      const rr = D.r + o.D.r + 0.1;
      if (od < rr && od > 1e-3) {
        sx += (ox / od) * (rr - od);
        sz += (oz / od) * (rr - od);
      }
    }
    mvx += sx * 1.5;
    mvz += sz * 1.5;
    const ml = Math.hypot(mvx, mvz) || 1;
    mvx /= ml;
    mvz /= ml;
    const blocked = moveCircle(S, e, mvx * spd * dt, mvz * spd * dt, D.r);
    e.stuck = blocked ? (e.stuck || 0) + dt : 0;
    const want = faceYaw(0, 0, mvx, mvz);
    if (e.state !== "windup") e.yaw += angDiff(e.yaw, e.state === "chase" && dist < 4 ? faceYaw(e.x, e.z, P.x, P.z) : want) * Math.min(1, dt * 7);
  } else if (e.alerted && e.state !== "windup") {
    e.yaw += angDiff(e.yaw, faceYaw(e.x, e.z, P.x, P.z)) * Math.min(1, dt * 6);
  }
  e.speed += (spd - e.speed) * Math.min(1, dt * 8);
  e.walkPh += e.speed * dt * (e.type === "crawler" ? 2.8 : e.type === "brute" ? 1.5 : 2.3);
  const pd = Math.hypot(e.x - P.x, e.z - P.z);
  const pr = D.r + PR;
  if (pd < pr && pd > 1e-3) {
    e.x += ((e.x - P.x) / pd) * (pr - pd);
    e.z += ((e.z - P.z) / pd) * (pr - pd);
    resolveCircle(S, e, D.r);
  }
}

function chaseDir(S, e, dist) {
  const P = S.P;
  const D = e.D;
  if (dist < 7 && walkClear(S, e.x, e.z, P.x, P.z, D.r)) return [(P.x - e.x) / dist, (P.z - e.z) / dist];
  const G = S.G;
  const c = cellOf(e.x), r = cellOf(e.z);
  const here = S.flow[r * G.w + c];
  let best = null, bv = here;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= G.w || nr >= G.h) continue;
      const v = S.flow[nr * G.w + nc];
      if (v >= bv) continue;
      if (dc && dr && (!passable(S, c + dc, r) || !passable(S, c, r + dr))) continue;
      bv = v;
      best = [nc, nr];
    }
  if (!best) {
    if (here >= INF) return null;
    return [(P.x - e.x) / dist, (P.z - e.z) / dist];
  }
  const tx = cx(best[0]), tz = cx(best[1]);
  const vx = tx - e.x, vz = tz - e.z;
  const l = Math.hypot(vx, vz) || 1;
  return [vx / l, vz / l];
}

function forceDoor(S, e, dt) {
  const c = cellOf(e.x), r = cellOf(e.z);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
    const d = S.doorAt.get((r + dr) * S.G.w + c + dc);
    if (!d || d.kind !== "door" || d.target >= 1) continue;
    if (Math.hypot(d.x - e.x, d.z - e.z) > 1.45) continue;
    if (S.flow[d.r * S.G.w + d.c] >= S.flow[r * S.G.w + c] && Math.hypot(S.P.x - d.x, S.P.z - d.z) > Math.hypot(S.P.x - e.x, S.P.z - e.z)) continue;
    d.bang += dt;
    d.bangEv -= dt;
    if (d.bangEv <= 0) {
      d.bangEv = 0.45;
      emit(S, { type: "doorBang", d });
    }
    if (d.bang > 1.3) {
      d.target = 1;
      emit(S, { type: "door", d, forced: true });
    }
  }
}

/* --------------------------------------------------------------- the cave brute */
export const BRUTE = { slamWind: 0.95, throwWind: 0.8, chargeWind: 0.85, chargeSpeed: 11, chargeMax: 1.5, dazed: 1.8, summon: 1.4, ringSpeed: 8.5, ringMax: 12, ringDmg: 22, bombT: 1.15, bombR: 2.1, bombDmg: 20, chargeDmg: 26 };

function updateBrute(S, e, dt) {
  const P = S.P;
  const K = BRUTE;
  const enr = e.enraged ? 1.3 : 1;
  const dx = P.x - e.x, dz = P.z - e.z;
  const dist = Math.hypot(dx, dz);
  if (Math.abs(e.kx) + Math.abs(e.kz) > 0.01) {
    moveCircle(S, e, e.kx * dt, e.kz * dt, e.D.r);
    e.kx *= Math.exp(-dt * 7);
    e.kz *= Math.exp(-dt * 7);
  }
  e.thinkT -= dt;
  if (e.thinkT <= 0) {
    e.thinkT = 0.2;
    e.sees = P.alive && lineOfSight(S, e.x, e.z, P.x, P.z);
    // a boss brute sleeps until its fight; a roaming one wakes when it sees you
    const dormant = S.hasBossStep && S.L.steps[S.step]?.t !== "boss";
    if (!e.alerted && !dormant && e.sees && dist < e.D.detect) alert(S, e);
  }
  e.growlT -= dt;
  if (e.growlT <= 0) {
    e.growlT = 5 + S.rand() * 5;
    if (e.alerted) emit(S, { type: "roarSmall", e });
  }
  e.dazed = Math.max(0, e.dazed - dt);
  let mvx = 0, mvz = 0, spd = 0;
  const face = (k = 6) => {
    e.yaw += angDiff(e.yaw, faceYaw(e.x, e.z, P.x, P.z)) * Math.min(1, dt * k);
  };
  if (!P.alive || !e.alerted) {
    e.speed += (0 - e.speed) * Math.min(1, dt * 8);
    if (e.alerted) face(2);
    return;
  }
  switch (e.state) {
    case "idle":
    case "chase": {
      e.state = "chase";
      e.atkCd -= dt * enr;
      if (e.atkCd <= 0 && e.sees) {
        const r = S.rand();
        let pick;
        if (dist < 5) pick = r < 0.7 ? "slam" : "throw";
        else if (dist < 15 && walkClear(S, e.x, e.z, P.x, P.z, e.D.r * 0.9) && e.lastAtk !== "charge") pick = r < 0.45 ? "charge" : r < 0.8 ? "throw" : "slam";
        else pick = r < 0.75 ? "throw" : "slam";
        if (pick === e.lastAtk && pick !== "throw") pick = "throw";
        e.lastAtk = pick;
        e.state = pick + "Wind";
        e.stateT = 0;
        emit(S, { type: "bruteWind", e, atk: pick });
        break;
      }
      if (dist > 3.2) {
        const dir = chaseDir(S, e, dist);
        if (dir) {
          mvx = dir[0];
          mvz = dir[1];
          spd = (dist > 9 ? e.D.run : e.D.walk) * enr * (e.burnT > 0 ? 0.8 : 1);
        }
      }
      break;
    }
    case "slamWind":
      face(5);
      if (e.stateT >= K.slamWind / enr) {
        S.rings.push({ x: e.x, z: e.z, r: e.D.r, speed: K.ringSpeed * (e.enraged ? 1.15 : 1), max: K.ringMax, dmg: K.ringDmg, hit: false });
        if (e.enraged) S.rings.push({ x: e.x, z: e.z, r: e.D.r - 3.2, speed: K.ringSpeed * 1.15, max: K.ringMax, dmg: K.ringDmg, hit: false });
        S.shake = Math.max(S.shake, dist < 8 ? 0.7 : 0.35);
        emit(S, { type: "slam", e });
        e.state = "recover";
        e.stateT = 0;
        e.atkCd = 1.7;
      }
      break;
    case "throwWind":
      face(8);
      if (e.stateT >= K.throwWind / enr) {
        const n = e.enraged ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const lead = i === 0 ? 0.55 : 0;
          let tx = P.x + P.vx * lead, tz = P.z + P.vz * lead;
          if (i > 0) {
            const a = S.rand() * Math.PI * 2, rr = 1.6 + S.rand() * 2.4;
            tx += Math.cos(a) * rr;
            tz += Math.sin(a) * rr;
          }
          const land = clampToFloor(S, e.x, e.z, tx, tz);
          S.bombs.push({ sx: e.x, sz: e.z, sy: 3.0, tx: land[0], tz: land[1], t: 0, T: K.bombT + i * 0.12, r: K.bombR, dmg: K.bombDmg, dud: false });
        }
        emit(S, { type: "throw", e });
        e.state = "recover";
        e.stateT = 0;
        e.atkCd = 1.8;
      }
      break;
    case "chargeWind":
      if (e.stateT < K.chargeWind * 0.75) face(7);
      if (e.stateT >= K.chargeWind / enr) {
        const l = Math.max(0.01, dist);
        e.cdx = dx / l;
        e.cdz = dz / l;
        e.yaw = faceYaw(0, 0, e.cdx, e.cdz);
        e.state = "charge";
        e.stateT = 0;
        e.chargeHit = false;
        emit(S, { type: "charge", e });
      }
      break;
    case "charge": {
      const sp = K.chargeSpeed * (e.enraged ? 1.1 : 1);
      const blocked = moveCircle(S, e, e.cdx * sp * dt, e.cdz * sp * dt, e.D.r);
      e.speed = sp;
      e.walkPh += sp * dt * 1.2;
      if (!e.chargeHit && Math.hypot(P.x - e.x, P.z - e.z) < e.D.r + PR + 0.35) {
        e.chargeHit = true;
        hurtPlayer(S, e, K.chargeDmg, { push: 7, kind: "charge" });
      }
      if (blocked || e.stateT > K.chargeMax) {
        if (blocked) {
          e.state = "dazed";
          e.dazed = K.dazed;
          S.shake = Math.max(S.shake, 0.6);
          emit(S, { type: "crash", e });
        } else e.state = "recover";
        e.stateT = 0;
        e.atkCd = 1.4;
      }
      return;
    }
    case "dazed":
      e.speed = 0;
      if (e.stateT >= K.dazed) {
        e.state = "chase";
        e.stateT = 0;
      }
      break;
    case "summon":
      face(3);
      if (e.stateT >= K.summon) {
        const adds = (S.L.bossAdds || [])[S.addsDone] || [];
        S.addsDone++;
        for (const type of adds) {
          const p = findSpawn(S, true, 7);
          if (p) {
            const a = spawnEnemy(S, type, p.x, p.z, true, { spawnT: 0.9 });
            emit(S, { type: "spawn", e: a });
          }
        }
        emit(S, { type: "msg", text: "The Forgotten King calls his workers!", kind: "warn" });
        e.state = "recover";
        e.stateT = 0;
        e.atkCd = 1.5;
      } else if (e.stateT < dt * 1.5) emit(S, { type: "roar", e, summon: true });
      break;
    case "recover":
      if (e.stateT > 0.75 / enr) {
        e.state = "chase";
        e.stateT = 0;
      }
      face(3);
      break;
    default:
      e.state = "chase";
  }
  steer(S, e, dt, mvx, mvz, spd, dist);
}

function clampToFloor(S, fx, fz, tx, tz) {
  for (let k = 0; k < 8; k++) {
    const x = tx + (fx - tx) * (k / 8), z = tz + (fz - tz) * (k / 8);
    if (!circleBlocked(S, x, z, 0.4)) return [x, z];
  }
  return [fx, fz];
}

function updateBossFx(S, dt) {
  const P = S.P;
  for (const R of S.rings) {
    const prev = R.r;
    R.r += R.speed * dt;
    if (!R.hit && R.r > 0) {
      const d = Math.hypot(P.x - R.x, P.z - R.z);
      if (d >= prev - PR && d <= R.r + PR && P.y < 0.45 && lineOfSight(S, R.x, R.z, P.x, P.z)) {
        R.hit = true;
        hurtPlayer(S, { x: R.x, z: R.z }, R.dmg, { push: 4, kind: "wave" });
      }
    }
  }
  S.rings = S.rings.filter((R) => R.r < R.max);
  for (const b of S.bombs) {
    b.t += dt;
    if (b.t >= b.T && !b.done) {
      b.done = true;
      if (b.dud) continue;
      const d = Math.hypot(P.x - b.tx, P.z - b.tz);
      emit(S, { type: "boom", x: b.tx, z: b.tz });
      if (d < b.r + PR && P.y < 1.4) hurtPlayer(S, { x: b.tx, z: b.tz }, b.dmg * (d < b.r * 0.5 ? 1 : 0.65), { push: 3, kind: "boom" });
      S.shake = Math.max(S.shake, d < 6 ? 0.35 : 0.12);
    }
  }
  S.bombs = S.bombs.filter((b) => !b.done);
}

/** burning flares: fall to the floor and scorch anything nearby */
function updateFlares(S, dt) {
  for (const f of S.flares) {
    f.t += dt;
    const host = f.onEnemy ? S.E.find((e) => e.id === f.onEnemy) : null;
    if (host && host.alive) {
      f.x = host.x;
      f.z = host.z;
      f.y = Math.min(f.y, host.D.body * 0.6);
    } else {
      f.onEnemy = 0;
      f.y = Math.max(0.08, f.y - dt * 4);
    }
    for (const e of S.E) {
      if (!e.alive || e.spawnT > 0) continue;
      if (Math.hypot(e.x - f.x, e.z - f.z) > FLARE.radius + e.D.r) continue;
      e.burnT = Math.max(e.burnT, 0.5);
      e.burnAcc = (e.burnAcc || 0) + FLARE.dps * dt * (e.type === "brute" ? 0.6 : 1);
      if (e.burnAcc >= 4) {
        damageEnemy(S, e, e.burnAcc, { src: "burn" });
        e.burnAcc = 0;
      }
    }
  }
  S.flares = S.flares.filter((f) => f.t < f.life);
}

/* --------------------------------------------------------------- world */
function updateDoors(S, dt) {
  let changed = false;
  for (const d of S.doors) {
    if (d.open < d.target) {
      const was = d.open >= 0.85;
      d.open = Math.min(d.target, d.open + dt * (d.kind === "gate" ? 0.7 : d.kind === "exit" ? 1 : 2.2));
      if (!was && d.open >= 0.85) changed = true;
    }
  }
  if (changed) {
    computeFlow(S);
    S.flowT = 0.2;
  }
}

/** carts roll along their rails to the end of the line */
function updateCarts(S, dt) {
  for (const c of S.carts) {
    if (!c.moving) continue;
    const dx = c.tx - c.x, dz = c.tz - c.z;
    const d = Math.hypot(dx, dz);
    const sp = 3.2 * dt;
    if (d <= sp) {
      c.x = c.tx;
      c.z = c.tz;
      c.moving = false;
      c.moved = true;
      emit(S, { type: "cartStop", c });
    } else {
      c.x += (dx / d) * sp;
      c.z += (dz / d) * sp;
    }
    const nc = cellOf(c.x), nr = cellOf(c.z);
    if (nc !== c.c || nr !== c.r) {
      S.cartAt.delete(c.r * S.G.w + c.c);
      c.c = nc;
      c.r = nr;
      S.cartAt.set(nr * S.G.w + nc, c);
      computeFlow(S);
    }
    // push the player / enemies out of the cart's way
    resolveCircle(S, S.P, PR);
    for (const e of S.E) if (e.alive) resolveCircle(S, e, e.D.r);
  }
}

/** where a pushed cart would roll: the end of the rail line in the push direction */
export function cartTarget(S, c) {
  const P = S.P;
  const G = S.G;
  const vx = c.x - P.x, vz = c.z - P.z;
  const l = Math.hypot(vx, vz) || 1;
  let best = null, bd = -2;
  for (const [dc, dr] of DIRS) {
    if (G.at(c.c + dc, c.r + dr) !== "_" || S.cartAt.has((c.r + dr) * G.w + c.c + dc)) continue;
    const dot = (dc * vx + dr * vz) / l;
    if (dot > bd) {
      bd = dot;
      best = [dc, dr];
    }
  }
  if (!best) return null;
  let cc = c.c, rr = c.r;
  while (G.at(cc + best[0], rr + best[1]) === "_" && !S.cartAt.has((rr + best[1]) * G.w + cc + best[0])) {
    cc += best[0];
    rr += best[1];
  }
  return { c: cc, r: rr, x: cx(cc), z: cx(rr) };
}

function updatePickups(S) {
  const P = S.P;
  for (const it of S.items) {
    if (it.taken || NEED_E.has(it.kind)) continue;
    if (Math.hypot(it.x - P.x, it.z - P.z) > 0.95 || P.y > 1) continue;
    if (it.kind === "h" && P.hp >= P.maxHp) {
      it.full = true;
      continue;
    }
    takeItem(S, it);
  }
}

const AMMO_GAIN = { a: ["pistol", 15, "+15 pistol rounds"], s: ["shotgun", 8, "+8 shotgun shells"], f: ["flare", 3, "+3 flares"] };

function giveWeapon(S, w, mag, res) {
  const P = S.P;
  P.owned[w] = true;
  P.ammo[w].mag = Math.max(P.ammo[w].mag, mag);
  P.ammo[w].res = Math.max(P.ammo[w].res, res);
  P.w = w;
  P.switchT = 0.5;
  cancelReload(P);
}

function takeItem(S, it) {
  const P = S.P;
  it.taken = true;
  S.got[it.kind] = true;
  S.count[it.kind] = (S.count[it.kind] || 0) + 1;
  let text = "";
  if (AMMO_GAIN[it.kind]) {
    const [w, n, t] = AMMO_GAIN[it.kind];
    P.ammo[w].res = Math.min(WEAPONS[w].maxRes, P.ammo[w].res + n);
    text = t;
  } else if (it.kind === "h") {
    P.hp = Math.min(P.maxHp, P.hp + 40);
    text = "+40 health";
  } else if (it.kind === "b") {
    P.battery = Math.min(100, P.battery + 50);
    text = "Battery recharged +50%";
  } else if (it.kind === "k") {
    S.keys++;
    text = "Gate key collected";
  } else if (it.kind === "u") text = `Fuel can collected (${S.count.u})`;
  else if (it.kind === "x") text = `Elevator gear collected (${S.count.x})`;
  else if (it.kind === "G") {
    giveWeapon(S, "pistol", WEAPONS.pistol.mag, (S.L.ammo?.pistol || [10, 20])[1]);
    text = "Mining pistol acquired! Left click to shoot";
  } else if (it.kind === "S") {
    giveWeapon(S, "shotgun", 6, 12);
    text = "Pump shotgun acquired! Press 2 to equip it";
  } else if (it.kind === "Y") {
    giveWeapon(S, "flare", 3, 6);
    text = "Experimental flare gun acquired! Press 3 to equip it";
  }
  emit(S, { type: "pickup", kind: it.kind, it, text });
}

function updateTriggers(S) {
  const P = S.P;
  for (const t of S.triggers) {
    if (t.fired || Math.hypot(t.x - P.x, t.z - P.z) > 1.8) continue;
    t.fired = true;
    const sc = t.scare;
    const [fx, fz] = playerFwd(P);
    if (sc.kind === "blackout") {
      S.blackout = 2.4;
      emit(S, { type: "scare", kind: "blackout", x: t.x, z: t.z });
    } else if (sc.kind === "ambush") {
      for (const type of sc.types || ["miner"]) {
        const p = findSpawn(S, false, 5);
        if (p) {
          const e = spawnEnemy(S, type, p.x, p.z, true, { spawnT: 0.6 });
          emit(S, { type: "spawn", e });
        }
      }
      emit(S, { type: "scare", kind: "ambush", x: t.x, z: t.z });
    } else {
      // growl, bang, falling dust or rocks somewhere ahead
      emit(S, { type: "scare", kind: sc.kind, x: P.x + fx * 7, z: P.z + fz * 7 });
      S.shake = Math.max(S.shake, sc.kind === "rocks" || sc.kind === "dust" ? 0.45 : 0.2);
    }
  }
}

const LEVER_LABEL = { red: "Pull the red lever", blue: "Pull the blue lever", green: "Pull the green lever", yellow: "Pull the yellow lever" };

/** what E would do right now */
function findInteract(S) {
  const P = S.P;
  const [fx, fz] = playerFwd(P);
  let best = null, bs = -1;
  const consider = (x, z, maxD, obj) => {
    const dx = x - P.x, dz = z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > maxD) return;
    const dot = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
    if (dot < 0.45) return;
    const s = dot * 2 - d;
    if (s > bs) {
      bs = s;
      best = obj;
    }
  };
  for (const d of S.doors) {
    if (d.open >= 0.85 || (d.kind !== "gate" && d.target >= 1)) continue;
    consider(d.x, d.z, 2.3, { kind: d.kind, d });
  }
  for (const s of S.switches) if (!s.on) consider(s.x, s.z, 2.0, { kind: "switch", s });
  for (const k of S.keypads) if (!k.solved) consider(k.x, k.z, 2.0, { kind: "keypad", k });
  for (const n of S.notes) consider(n.x, n.z, 1.9, { kind: "note", n });
  for (const m of S.machines) if (!m.on) consider(m.x, m.z, 2.3, { kind: "machine", m });
  for (const c of S.carts) if (!c.moving && !c.moved) consider(c.x, c.z, 2.2, { kind: "cart", c });
  for (const it of S.items) {
    if (it.taken) continue;
    if (NEED_E.has(it.kind)) consider(it.x, it.z, 1.9, { kind: "item", it });
    else if (it.kind === "h" && it.full && P.hp >= P.maxHp) consider(it.x, it.z, 1.3, { kind: "full", it });
  }
  return best;
}

const ITEM_LABEL = { G: "Take the mining pistol", S: "Take the pump shotgun", Y: "Take the flare gun" };

function machinePrompt(S, m) {
  const isGen = m.kind === "g";
  const need = m.need;
  if (need.item && (S.count[need.item] || 0) < need.count) {
    const n = Math.min(need.count, S.count[need.item] || 0);
    return { text: isGen ? `The generator needs fuel (${n}/${need.count})` : `The elevator controls need gears (${n}/${need.count})`, ok: false };
  }
  return { text: isGen ? "Start the generator" : "Repair the elevator controls", ok: true };
}

function updateInteract(S, inp) {
  const o = findInteract(S);
  let prompt = null;
  if (o) {
    if (o.kind === "door") prompt = { text: "Open door", ok: true };
    else if (o.kind === "gate") prompt = { text: "The blast door is sealed", ok: false };
    else if (o.kind === "lock") prompt = S.keys > 0 ? { text: "Unlock the gate with your key", ok: true } : { text: "Locked — find a key", ok: false };
    else if (o.kind === "exit") prompt = S.exitOpen ? { text: "Go through the exit", ok: true } : { text: "Exit sealed — complete the objective", ok: false };
    else if (o.kind === "switch") prompt = { text: o.s.color ? LEVER_LABEL[o.s.color] : "Pull the lever", ok: true };
    else if (o.kind === "keypad") prompt = { text: "Enter the code", ok: true };
    else if (o.kind === "note") prompt = { text: "Read the note", ok: true };
    else if (o.kind === "machine") prompt = machinePrompt(S, o.m);
    else if (o.kind === "cart") prompt = cartTarget(S, o.c) ? { text: "Push the mine cart", ok: true } : { text: "The cart won't move", ok: false };
    else if (o.kind === "item") prompt = { text: ITEM_LABEL[o.it.kind], ok: true };
    else if (o.kind === "full") prompt = { text: "Health is full", ok: false };
  }
  S.prompt = prompt;
  if (!inp.interact) return;
  if (!o || !prompt?.ok) {
    if (o) emit(S, { type: "denied", text: prompt?.text });
    return;
  }
  switch (o.kind) {
    case "door":
      o.d.target = 1;
      emit(S, { type: "door", d: o.d });
      break;
    case "lock":
      S.keys--;
      o.d.target = 1;
      emit(S, { type: "gate", x: o.d.x, z: o.d.z, lock: true });
      emit(S, { type: "msg", text: "The gate unlocks with a heavy clank", kind: "good" });
      break;
    case "switch":
      pullLever(S, o.s);
      break;
    case "keypad":
      emit(S, { type: "keypad", k: o.k });
      break;
    case "note":
      o.n.read = true;
      emit(S, { type: "note", n: o.n });
      break;
    case "machine":
      o.m.on = true;
      if (o.m.need.item) S.count[o.m.need.item] -= o.m.need.count;
      if (o.m.kind === "g") S.power = true;
      emit(S, { type: "machine", m: o.m });
      break;
    case "cart": {
      const t = cartTarget(S, o.c);
      if (t) {
        o.c.moving = true;
        o.c.tx = t.x;
        o.c.tz = t.z;
        emit(S, { type: "cart", c: o.c });
      }
      break;
    }
    case "item":
      takeItem(S, o.it);
      break;
    case "exit":
      if (!S.completed) {
        S.completed = true;
        o.d.target = 1;
        S.status = "complete";
        S.P.vx = S.P.vz = 0;
        emit(S, { type: "complete" });
      }
      break;
    default:
  }
}

function pullLever(S, s) {
  const order = S.L.order;
  if (!order || !s.color) {
    s.on = true;
    emit(S, { type: "switch", s });
    return;
  }
  if (order[S.seqI] === s.color) {
    s.on = true;
    S.seqI++;
    emit(S, { type: "switch", s });
    if (S.seqI >= order.length) S.seqDone = true;
  } else {
    for (const o of S.switches) o.on = false;
    S.seqI = 0;
    emit(S, { type: "seqFail", s });
    emit(S, { type: "msg", text: "Wrong order! The levers snap back", kind: "warn" });
  }
}

/** keypad entry from the UI; returns true when the code is right */
export function enterCode(S, id, code) {
  const k = S.keypads[id];
  if (!k || k.solved || S.status !== "play") return false;
  // called between steps: collect the events and hand them to the next step
  const saved = S.ev;
  S.ev = [];
  const ok = String(code) === k.code;
  if (ok) {
    k.solved = true;
    for (const g of k.open) openGate(S, g);
    emit(S, { type: "codeOk", k });
  } else emit(S, { type: "codeFail", k });
  S.uiEv = (S.uiEv || []).concat(S.ev);
  S.ev = saved;
  return ok;
}

/* --------------------------------------------------------------- step */
export function step(S, dt, inp = {}) {
  S.ev = S.uiEv && S.uiEv.length ? S.uiEv : [];
  S.uiEv = [];
  if (S.status !== "play") {
    updateDoors(S, dt);
    updateEnemies(S, dt);
    return S.ev;
  }
  S.t += dt;
  S.stepT += dt;
  S.blackout = Math.max(0, S.blackout - dt);
  S.shake = Math.max(0, S.shake - dt * 1.5);
  updatePlayer(S, dt, inp);
  if (S.status !== "play") return S.ev;
  S.flowT -= dt;
  const pcell = cellOf(S.P.z) * S.G.w + cellOf(S.P.x);
  if (S.flowT <= 0 || pcell !== S.flowCell) {
    S.flowT = 0.3;
    computeFlow(S);
  }
  updateDoors(S, dt);
  updateCarts(S, dt);
  updatePickups(S);
  updateInteract(S, inp);
  if (S.status !== "play") return S.ev;
  updateTriggers(S);
  updateEnemies(S, dt);
  if (S.status !== "play") return S.ev;
  updateFlares(S, dt);
  updateBossFx(S, dt);
  if (S.status !== "play") return S.ev;
  updateWave(S, dt);
  updateObjectives(S);
  if (S.E.length > 26) S.E = S.E.filter((e) => e.alive || e.deadT < 20);
  return S.ev;
}

export function bossInfo(S) {
  const b = S.E.find((e) => e.type === "brute" && e.alive && e.alerted);
  return b ? { hp: b.hp, max: b.maxHp, enraged: b.enraged, dazed: b.dazed > 0, final: S.id === 12 } : null;
}

export function levelReport(S) {
  return {
    id: S.id,
    time: S.t,
    kills: S.stats.kills,
    accuracy: S.stats.shots ? Math.round((S.stats.hits / S.stats.shots) * 100) : 0,
    heads: S.stats.heads,
    dmgTaken: Math.round(S.stats.dmgTaken),
    hp: Math.round(S.P.hp),
  };
}
