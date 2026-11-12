/**
 * Prison of Fear: Final Lockdown — framework-free simulation.
 *
 * The world is a grid of 2 m cells parsed from the ASCII maps in levels.js.
 * Everything that moves is a circle on the XZ plane colliding with per-cell
 * boxes (walls, bars, furniture, closed doors). Shots are 3D rays tested
 * against the grid (DDA) and against enemy cylinders + head spheres. Enemies
 * follow a BFS flow field from the player's cell, so they always respect
 * walls without a full path-finder. No Three.js in here: the renderer only
 * reads this state, and the Node test tools drive it directly.
 *
 * step(S, dt, input) advances the game and returns the events of that step
 * (shots, hits, deaths, objective changes …) for audio, FX and the HUD.
 */
import { LEVEL_BY_ID } from "./levels.js";

export const CELL = 2;
export const EYE = 1.62;
export const PR = 0.32;
export const CEIL = 3.4;
const INF = 30000;

export const WEAPONS = {
  pistol: { id: "pistol", name: "Pistol", key: 1, dmg: 26, pellets: 1, interval: 0.24, mag: 12, reload: 1.2, range: 46, near: 20, minMul: 0.55, spread: 0.014, aimSpread: 0.003, moveSpread: 0.018, kick: 0.018, knock: 0.6, stagger: 0.12, maxRes: 120 },
  shotgun: { id: "shotgun", name: "Shotgun", key: 2, dmg: 12, pellets: 9, interval: 0.85, mag: 6, reload: 2.1, range: 18, near: 5, minMul: 0.2, spread: 0.07, aimSpread: 0.05, moveSpread: 0.02, kick: 0.06, knock: 3.6, stagger: 0.35, maxRes: 40 },
};
export const WEAPON_ORDER = ["pistol", "shotgun"];

export const ENEMIES = {
  infected: { name: "Infected Prisoner", hp: 60, r: 0.36, body: 1.5, headY: 1.63, headR: 0.21, walk: 0.9, run: 2.8, dmg: 10, reach: 1.45, windup: 0.55, cool: 1.15, detect: 13, knock: 1, stag: 1, doors: true },
  creature: { name: "Aggressive Creature", hp: 80, r: 0.4, body: 1.2, headY: 1.28, headR: 0.24, walk: 1.4, run: 5.0, dmg: 16, reach: 1.6, windup: 0.36, cool: 0.85, detect: 18, knock: 0.9, stag: 0.8, doors: true },
  brute: { name: "Prison Brute", hp: 650, r: 0.72, body: 2.35, headY: 2.5, headR: 0.34, walk: 1.0, run: 2.4, dmg: 28, reach: 2.5, windup: 0.95, cool: 1.6, detect: 20, knock: 0.15, stag: 0.25, doors: false },
};

export const DIFFICULTY = {
  easy: { dmg: 0.6, hp: 0.8 },
  normal: { dmg: 1, hp: 1 },
  hard: { dmg: 1.4, hp: 1.15 },
};

const ENEMY_CHAR = { i: "infected", c: "creature", b: "brute" };
const ITEM_CHARS = "aohmkS";
const DECO = { B: 0.35, t: 0.4, r: 0.45, l: 0.3 };
const FLOORISH = new Set([".", "P", "R", "T", "z", "*", "!", "~", "w", ...ITEM_CHARS, ...Object.keys(ENEMY_CHAR)]);
const NEED_E = new Set(["k", "S", "m"]);
const MAX_ALIVE = 8;

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

/* --------------------------------------------------------------- parsing */
export function parseLevel(L) {
  const rows = L.map;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ch = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) ch.push(rows[r][c] ?? " ");
  const at = (c, r) => (c < 0 || r < 0 || c >= w || r >= h ? "#" : ch[r * w + c]);
  const isWallish = (k) => k === "#" || k === " " || k === "=" || k === "D" || k === "X" || /[1-4]/.test(k);
  const out = { w, h, ch, at, doors: [], items: [], enemies: [], switches: [], reach: [], triggers: [], spawns: [], lights: [], deco: [], puddles: [], bars: [], start: null };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const k = at(c, r);
      const x = cx(c), z = cx(r);
      // axis: "x" = the panel spans along X (walls west+east of it)
      const axis = isWallish(at(c - 1, r)) && isWallish(at(c + 1, r)) ? "x" : "z";
      if (k === "D" || k === "X" || /[1-4]/.test(k)) out.doors.push({ c, r, x, z, axis, kind: k === "D" ? "door" : k === "X" ? "exit" : "gate", gid: /[1-4]/.test(k) ? k : null });
      else if (k === "=") out.bars.push({ c, r, x, z, axis });
      else if (DECO[k] !== undefined) out.deco.push({ c, r, x, z, kind: k, axis });
      if (k === "P") out.start = { c, r, x, z };
      if (ENEMY_CHAR[k]) out.enemies.push({ type: ENEMY_CHAR[k], x, z, c, r });
      if (ITEM_CHARS.includes(k)) out.items.push({ kind: k, x, z, c, r });
      if (k === "R") out.reach.push({ x, z });
      if (k === "T") out.triggers.push({ x, z });
      if (k === "z") out.spawns.push({ x, z, c, r });
      if (k === "*" || k === "!") out.lights.push({ x, z, c, r, kind: k === "*" ? "lamp" : "alarm" });
      if (k === "~") out.puddles.push({ x, z });
      if (k === "w") {
        // mount on the first neighbouring wall
        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        let d = dirs.find(([dc, dr]) => at(c + dc, r + dr) === "#") || [0, -1];
        out.switches.push({ c, r, x: x + d[0] * (CELL / 2 - 0.08), z: z + d[1] * (CELL / 2 - 0.08), nx: -d[0], nz: -d[1] });
      }
    }
  out.floorish = (k) => FLOORISH.has(k);
  return out;
}

/* --------------------------------------------------------------- creation */
export function createSim(levelId, opts = {}) {
  const L = LEVEL_BY_ID[levelId];
  const G = parseLevel(L);
  const diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
  const owned = { pistol: true, shotgun: levelId > 6 };
  const am = L.ammo || {};
  const P = {
    x: G.start.x,
    z: G.start.z,
    yaw: { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 }[L.face || "n"],
    pitch: 0,
    vx: 0,
    vz: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    alive: true,
    w: owned.shotgun && am.shotgun ? "pistol" : "pistol",
    owned,
    ammo: { pistol: { mag: (am.pistol || [12, 12])[0], res: (am.pistol || [12, 12])[1] }, shotgun: { mag: (am.shotgun || [0, 0])[0], res: (am.shotgun || [0, 0])[1] } },
    fireT: 9,
    cool: 0,
    reloadT: 0,
    reloadDur: 0,
    switchT: 0,
    punchT: 9,
    punchCd: 0,
    punchHit: true,
    combo: 0,
    comboT: 0,
    block: false,
    blockT: 0,
    blockAmt: 0,
    aim: 0,
    hurtT: 0,
    hurtDir: 0,
    moving: 0,
    sprinting: false,
    bob: 0,
    recoil: 0,
    stepT: 0,
    dryT: 0,
  };
  const S = {
    id: levelId,
    L,
    G,
    diff,
    rand: rng((opts.seed ?? levelId * 7919) + 13),
    P,
    E: [],
    doors: G.doors.map((d, i) => ({ ...d, id: i, open: 0, target: 0, bang: 0, bangEv: 0 })),
    items: G.items.map((it, i) => ({ ...it, id: i, taken: false })),
    switches: G.switches.map((s, i) => ({ ...s, id: i, on: false })),
    triggers: G.triggers.map((t, i) => ({ ...t, id: i, fired: false, scare: (L.scares || [])[i] || { kind: "bang" } })),
    t: 0,
    status: "play",
    step: 0,
    stepT: 0,
    got: {},
    count: {},
    targets: null,
    wave: null,
    exitOpen: false,
    completed: false,
    blackout: 0,
    shake: 0,
    stats: { kills: 0, shots: 0, hits: 0, heads: 0, dmgTaken: 0, punches: 0, blocks: 0 },
    flow: new Int16Array(G.w * G.h).fill(INF),
    flowT: 0,
    flowCell: -1,
    prompt: null,
    ev: [],
    nextEnemyId: 1,
    addsSpawned: false,
    hintT: 0,
  };
  S.doorAt = new Map(S.doors.map((d) => [d.r * G.w + d.c, d]));
  S.barAt = new Map(G.bars.map((b) => [b.r * G.w + b.c, b.axis]));
  for (const e of G.enemies) spawnEnemy(S, e.type, e.x, e.z, false);
  computeFlow(S);
  enterStep(S);
  return S;
}

function spawnEnemy(S, type, x, z, alerted, extra = {}) {
  const D = ENEMIES[type];
  const boss = type === "brute";
  let hp = D.hp * S.diff.hp;
  if (boss && S.L.bossHp) hp = S.L.bossHp * S.diff.hp;
  if (boss && S.id === 8) hp = 420 * S.diff.hp;
  if (boss && S.id === 10) hp = 850 * S.diff.hp;
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
  if (k === "#" || k === " ") return [c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL];
  if (k === "=") {
    if (mode !== "move") return null;
    return thinBox(S, c, r, S.barAt.get(cellIdx(S, c, r)) || "x", 0.14);
  }
  if (DECO[k] !== undefined) {
    if (mode !== "move") return null;
    const m = DECO[k];
    return [c * CELL + m, r * CELL + m, (c + 1) * CELL - m, (r + 1) * CELL - m];
  }
  const d = S.doorAt.get(cellIdx(S, c, r));
  if (d) {
    if (d.open >= 0.85) return null;
    return thinBox(S, c, r, d.axis, 0.16);
  }
  return null;
}
function thinBox(S, c, r, axis, half) {
  const x = cx(c), z = cx(r);
  return axis === "x" ? [c * CELL, z - half, (c + 1) * CELL, z + half] : [x - half, r * CELL, x + half, (r + 1) * CELL];
}

/** cell walkable for path-finding. forEnemy: closed ordinary doors count (they can force them). */
function passable(S, c, r, forEnemy, doorsOk = true) {
  const G = S.G;
  if (c < 0 || r < 0 || c >= G.w || r >= G.h) return false;
  const k = G.at(c, r);
  if (G.floorish(k)) return true;
  const d = S.doorAt.get(cellIdx(S, c, r));
  if (d) {
    if (d.open >= 0.85) return true;
    if (d.kind === "door") return doorsOk && (forEnemy ? true : true);
    return false;
  }
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
        let dx = o.x - px, dz = o.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          o.x += (dx / d) * (r - d);
          o.z += (dz / d) * (r - d);
        } else {
          // centre inside the box: push out along the shallowest side
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

/** move a circle by (dx,dz) with sub-steps; returns true if it was blocked noticeably */
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

/** can a circle of radius r walk straight from a to b? */
function walkClear(S, ax, az, bx, bz, r) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / 0.35);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (circleBlocked(S, ax + (bx - ax) * t, az + (bz - az) * t, r * 0.9)) return false;
  }
  return true;
}

/**
 * 2D DDA over the grid. Returns the ray parameter t (in the units of the
 * direction vector) of the first blocking box, or maxT.
 */
export function rayGrid(S, ox, oz, dx, dz, maxT, mode) {
  let c = cellOf(ox), r = cellOf(oz);
  const stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1;
  const tdC = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tdR = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tmC = dx !== 0 ? ((dx > 0 ? (c + 1) * CELL : c * CELL) - ox) / dx : Infinity;
  let tmR = dz !== 0 ? ((dz > 0 ? (r + 1) * CELL : r * CELL) - oz) / dz : Infinity;
  for (let i = 0; i < 80; i++) {
    const b = cellBox(S, c, r, mode);
    if (b) {
      const t = raySlab(ox, oz, dx, dz, b);
      if (t !== null && t <= maxT) return t;
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
  const dx = bx - ax, dz = bz - az;
  return rayGrid(S, ax, az, dx, dz, 1, "sight") >= 0.999;
}
/** melee can't pass bars, furniture or closed doors either */
function meleeClear(S, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 0.01) return true;
  // shorten both ends a little so touching furniture doesn't block
  const s = Math.min(0.25, L * 0.3) / L;
  return rayGrid(S, ax + dx * s, az + dz * s, dx * (1 - 2 * s), dz * (1 - 2 * s), 1, "move") >= 0.999;
}

/* --------------------------------------------------------------- flow field */
function computeFlow(S) {
  const G = S.G;
  const f = S.flow;
  f.fill(INF);
  const pc = cellOf(S.P.x), pr = cellOf(S.P.z);
  if (!passable(S, pc, pr, true)) return;
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
        if (!passable(S, nc, nr, true)) continue;
        if (dc && dr && (!passable(S, c + dc, r, true) || !passable(S, c, r + dr, true))) continue;
        // no diagonal steps through door cells
        if (dc && dr && (S.doorAt.has(nr * G.w + nc) || S.doorAt.has(i))) continue;
        const j = nr * G.w + nc;
        if (f[j] <= d) continue;
        f[j] = d;
        q[qt++] = j;
      }
  }
  S.flowCell = pr * G.w + pc;
}

/** cells reachable from the player through ordinary doors (not locked gates) */
function reachableSet(S) {
  const G = S.G;
  const seen = new Uint8Array(G.w * G.h);
  const pc = cellOf(S.P.x), pr = cellOf(S.P.z);
  const q = [pr * G.w + pc];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    const c = i % G.w, r = (i - c) / G.w;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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
    S.targets = S.E.filter((e) => e.alive && seen[cellOf(e.z) * S.G.w + cellOf(e.x)]).map((e) => e.id);
  }
  if (st.t === "wave") S.wave = { i: -1, queue: [], delay: 1.2, ids: [], of: st.waves.length, done: false, spawnT: 0 };
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
    case "item":
      return !!S.got[st.item];
    case "collect":
      return (S.count[st.item] || 0) >= st.count;
    case "switch":
      return S.switches.filter((s) => s.on).length >= st.count;
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
  if (st.t === "kill" && S.targets) {
    const left = S.targets.filter((id) => S.E.find((e) => e.id === id)?.alive).length;
    progress = { kind: "enemies", n: left };
  } else if (st.t === "collect") progress = { kind: "count", n: S.count[st.item] || 0, of: st.count };
  else if (st.t === "wave" && S.wave) progress = { kind: "wave", n: Math.max(1, S.wave.i + 1), of: S.wave.of, left: S.wave.ids.filter((id) => S.E.find((e) => e.id === id)?.alive).length + S.wave.queue.length };
  else if (st.t === "switch") progress = { kind: "count", n: S.switches.filter((s) => s.on).length, of: st.count };
  return { text: st.text, hint: st.hint || null, i: S.step, of: S.L.steps.length, progress };
}

/** world position of the current objective target, for the HUD marker */
export function objectiveTarget(S) {
  const st = curStep(S);
  if (!st) return null;
  if (st.t === "reach") return S.G.reach[reachIndex(S)] || null;
  if (st.t === "item" || st.t === "collect") {
    const it = S.items.find((i) => !i.taken && i.kind === st.item);
    return it ? { x: it.x, z: it.z } : null;
  }
  if (st.t === "switch") {
    const sw = S.switches.find((s) => !s.on);
    return sw ? { x: sw.x, z: sw.z } : null;
  }
  if (st.t === "exit") {
    const d = S.doors.find((d) => d.kind === "exit");
    return d ? { x: d.x, z: d.z } : null;
  }
  return null;
}

function openGate(S, gid) {
  let any = false;
  for (const d of S.doors) if (d.kind === "gate" && d.gid === gid && d.target < 1) {
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
  const pick = cands[Math.floor(S.rand() * Math.min(3, cands.length))];
  return pick;
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
        const e = spawnEnemy(S, type, p.x, p.z, true, { spawnT: 0.6 });
        W.ids.push(e.id);
      } else W.queue.unshift(type);
      W.spawnT = 0.7;
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
  const W = WEAPONS[P.w];
  // look
  P.yaw += inp.dYaw || 0;
  P.pitch = clamp(P.pitch + (inp.dPitch || 0), -1.35, 1.35);
  // block (hold Q)
  const wantBlock = !!inp.block && P.punchT > 0.25;
  if (wantBlock && !P.block) {
    P.block = true;
    P.blockT = 0;
    if (P.reloadT > 0) cancelReload(P);
  } else if (!wantBlock) P.block = false;
  if (P.block) P.blockT += dt;
  P.blockAmt += ((P.block ? 1 : 0) - P.blockAmt) * Math.min(1, dt * 14);
  // aim
  const aiming = !!inp.aim && !P.block && P.switchT <= 0;
  P.aim += ((aiming ? 1 : 0) - P.aim) * Math.min(1, dt * 12);
  // move
  const [fx, fz] = playerFwd(P);
  const rx = -fz, rz = fx;
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  const wantSprint = !!inp.sprint && mz > 0.1 && !P.block && P.aim < 0.5;
  P.sprinting = wantSprint && P.stamina > 1;
  if (P.sprinting) P.stamina = Math.max(0, P.stamina - 24 * dt);
  else P.stamina = Math.min(100, P.stamina + (ml > 0 ? 14 : 22) * dt);
  const speed = P.block ? 2.0 : P.aim > 0.5 ? 2.4 : P.sprinting ? 6.0 : 3.7;
  if (mz < 0) mz *= 0.75; // backpedalling is slower
  const tvx = (fx * mz + rx * mx) * speed, tvz = (fz * mz + rz * mx) * speed;
  const acc = Math.min(1, dt * (ml > 0 ? 11 : 14));
  P.vx += (tvx - P.vx) * acc;
  P.vz += (tvz - P.vz) * acc;
  moveCircle(S, P, P.vx * dt, P.vz * dt, PR);
  const sp = Math.hypot(P.vx, P.vz);
  P.moving = sp;
  P.bob += sp * dt * 1.9;
  P.stepT -= sp * dt;
  if (P.stepT <= 0 && sp > 1) {
    P.stepT = P.sprinting ? 1.7 : 1.45;
    emit(S, { type: "foot", sprint: P.sprinting });
  }
  // timers
  P.fireT += dt;
  P.cool = Math.max(0, P.cool - dt);
  P.hurtT = Math.max(0, P.hurtT - dt);
  P.recoil *= Math.exp(-dt * 10);
  P.punchT += dt;
  P.punchCd = Math.max(0, P.punchCd - dt);
  P.comboT = Math.max(0, P.comboT - dt);
  P.dryT = Math.max(0, P.dryT - dt);
  if (P.comboT <= 0) P.combo = 0;
  if (P.switchT > 0) P.switchT = Math.max(0, P.switchT - dt);
  // weapon switching
  let want = null;
  if (inp.weapon === 1) want = "pistol";
  if (inp.weapon === 2) want = "shotgun";
  if (inp.wheel) {
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
    } else if (inp.weapon) emit(S, { type: "msg", text: "You haven't found the shotgun yet", kind: "warn", key: "noShotgun" });
  }
  // reload
  const A = P.ammo[P.w];
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) {
      const need = W.mag - A.mag;
      const n = Math.min(need, A.res);
      A.mag += n;
      A.res -= n;
      P.reloadT = 0;
      emit(S, { type: "reloaded", w: P.w });
    }
  }
  if (inp.reload) tryReload(S);
  // punch (F) — always available, even with no ammo
  if (inp.punch && P.punchCd <= 0 && !P.block) startPunch(S);
  if (P.punchT >= 0.09 && !P.punchHit) resolvePunch(S);
  // fire
  const busy = P.block || P.switchT > 0 || P.punchT < 0.3 || P.reloadT > 0;
  if (inp.fireP && !busy && P.cool <= 0) {
    if (A.mag > 0) fire(S);
    else if (A.res > 0) tryReload(S);
    else {
      P.cool = 0.3;
      emit(S, { type: "dry" });
      if (P.dryT <= 0) {
        P.dryT = 4;
        const other = P.w === "pistol" ? "shotgun" : "pistol";
        const oa = P.ammo[other];
        emit(S, { type: "msg", text: P.owned[other] && oa.mag + oa.res > 0 ? "Out of ammo! Switch weapons or press F to punch" : "Out of ammo! Press F to punch", kind: "warn" });
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
  const W = WEAPONS[P.w];
  const A = P.ammo[P.w];
  if (P.reloadT > 0 || A.mag >= W.mag || A.res <= 0 || P.block || P.switchT > 0) return;
  P.reloadT = W.reload;
  P.reloadDur = W.reload;
  emit(S, { type: "reload", w: P.w });
}

function eyeRay(P, spread, rand) {
  const cp = Math.cos(P.pitch);
  let dx = -Math.sin(P.yaw) * cp, dy = Math.sin(P.pitch), dz = -Math.cos(P.yaw) * cp;
  if (spread > 0) {
    // perpendicular basis
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

/** 3D ray vs the world + enemies. Returns { t, enemy, head, y, surface } */
export function castShot(S, ox, oy, oz, dx, dy, dz, range) {
  let t = rayGrid(S, ox, oz, dx, dz, range, "shot");
  let surface = t < range ? "wall" : null;
  if (dy < -1e-4) {
    const tf = -oy / dy;
    if (tf < t) {
      t = tf;
      surface = "floor";
    }
  } else if (dy > 1e-4 && S.L.theme !== "yard") {
    const tc = (CEIL - oy) / dy;
    if (tc < t) {
      t = tc;
      surface = "ceil";
    }
  }
  let best = null;
  for (const e of S.E) {
    if (!e.alive) continue;
    const D = e.D;
    // head sphere
    const hx = e.x - Math.sin(e.yaw) * (e.type === "creature" ? 0.25 : 0.05), hz = e.z - Math.cos(e.yaw) * (e.type === "creature" ? 0.25 : 0.05);
    const th = raySphere(ox, oy, oz, dx, dy, dz, hx, D.headY, hz, D.headR);
    if (th !== null && th < t && (!best || th < best.t)) best = { t: th, enemy: e, head: true };
    // body cylinder
    const tb = rayCyl(ox, oz, dx, dz, e.x, e.z, D.r);
    if (tb !== null && tb < t && (!best || tb < best.t)) {
      const y = oy + dy * tb;
      if (y >= 0 && y <= D.body) best = { t: tb, enemy: e, head: false };
    }
  }
  if (best) return { ...best, y: oy + dy * best.t, surface: "flesh" };
  return { t, enemy: null, head: false, y: oy + dy * t, surface };
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
  const spread = W.spread + (W.aimSpread - W.spread) * P.aim + Math.min(1, P.moving / 4) * W.moveSpread;
  const dmgBy = new Map();
  const impacts = [];
  let anyHit = false, anyHead = false;
  for (let i = 0; i < W.pellets; i++) {
    const [dx, dy, dz] = eyeRay(P, spread, S.rand);
    const h = castShot(S, P.x, EYE, P.z, dx, dy, dz, W.range);
    const x = P.x + dx * h.t, y = EYE + dy * h.t, z = P.z + dz * h.t;
    if (h.enemy) {
      const fall = h.t <= W.near ? 1 : Math.max(W.minMul, 1 - ((h.t - W.near) / (W.range - W.near)) * (1 - W.minMul));
      const dmg = W.dmg * fall * (h.head ? (P.w === "shotgun" ? 1.5 : 2.2) : 1);
      const cur = dmgBy.get(h.enemy) || { dmg: 0, head: false, n: 0 };
      cur.dmg += dmg;
      cur.head = cur.head || h.head;
      cur.n++;
      dmgBy.set(h.enemy, cur);
      anyHit = true;
      anyHead = anyHead || h.head;
      impacts.push({ x, y, z, surface: "flesh" });
    } else if (h.surface) impacts.push({ x, y, z, surface: h.surface });
  }
  if (anyHit) S.stats.hits++;
  if (anyHead) S.stats.heads++;
  emit(S, { type: "shot", w: P.w, hit: anyHit, head: anyHead, impacts });
  for (const [e, h] of dmgBy) {
    const [fx, fz] = playerFwd(P);
    const knock = W.knock * (h.n / W.pellets) * (P.w === "shotgun" ? 1 : 1);
    damageEnemy(S, e, h.dmg, { kx: fx * knock, kz: fz * knock, stagger: W.stagger * (P.w === "shotgun" ? h.n / W.pellets : 1), head: h.head, src: P.w });
  }
  noise(S, 22);
}

function noise(S, radius) {
  const P = S.P;
  for (const e of S.E) {
    if (!e.alive || e.alerted) continue;
    const f = S.flow[cellOf(e.z) * S.G.w + cellOf(e.x)];
    if (Math.hypot(e.x - P.x, e.z - P.z) < radius * 0.6 || f * CELL < radius) alert(S, e);
  }
}

function alert(S, e) {
  if (e.alerted || !e.alive) return;
  e.alerted = true;
  if (e.state === "idle") e.state = "chase";
  emit(S, { type: "alert", e });
}

function damageEnemy(S, e, dmg, o = {}) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.hitT = 0;
  e.kx += (o.kx || 0) * e.D.knock;
  e.kz += (o.kz || 0) * e.D.knock;
  const stag = (o.stagger || 0) * e.D.stag;
  if (stag > 0.08 && e.state !== "dead") {
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
  } else if (e.type === "brute" && !e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    emit(S, { type: "roar", e });
    S.shake = Math.max(S.shake, 0.6);
    if (S.L.bossAdds && !S.addsSpawned) {
      S.addsSpawned = true;
      for (const type of S.L.bossAdds) {
        const p = findSpawn(S, true, 9);
        if (p) spawnEnemy(S, type, p.x, p.z, true, { spawnT: 1.0 });
      }
      emit(S, { type: "msg", text: "The brute calls for help!", kind: "warn" });
    }
  }
}

function startPunch(S) {
  const P = S.P;
  P.combo = P.comboT > 0 ? (P.combo % 3) + 1 : 1;
  P.comboT = 0.9;
  P.punchT = 0;
  P.punchHit = false;
  P.punchCd = P.combo === 3 ? 0.62 : 0.4;
  if (P.reloadT > 0) cancelReload(P);
  S.stats.punches++;
  emit(S, { type: "punch", combo: P.combo });
}

function resolvePunch(S) {
  const P = S.P;
  P.punchHit = true;
  const [fx, fz] = playerFwd(P);
  let best = null, bd = 9;
  for (const e of S.E) {
    if (!e.alive) continue;
    const dx = e.x - P.x, dz = e.z - P.z;
    const d = Math.hypot(dx, dz) - e.D.r;
    if (d > 1.55) continue;
    const dot = d < 0.2 ? 1 : (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz));
    if (dot < 0.55) continue;
    if (!meleeClear(S, P.x, P.z, e.x, e.z)) continue;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) {
    emit(S, { type: "punchMiss" });
    return;
  }
  const heavy = P.combo === 3;
  const dmg = heavy ? 38 : 20;
  const k = heavy ? 5.5 : 3.2;
  damageEnemy(S, best, dmg, { kx: fx * k, kz: fz * k, stagger: heavy ? 0.75 : 0.42, src: "punch" });
  emit(S, { type: "punchHit", e: best, heavy, x: best.x, y: best.D.headY * 0.85, z: best.z });
  noise(S, 8);
}

function hurtPlayer(S, e, dmg) {
  const P = S.P;
  if (!P.alive) return;
  dmg *= S.diff.dmg;
  const [fx, fz] = playerFwd(P);
  const dx = e.x - P.x, dz = e.z - P.z;
  const dl = Math.max(0.01, Math.hypot(dx, dz));
  const facing = (dx * fx + dz * fz) / dl > 0.25;
  let blocked = false, perfect = false;
  if (P.block && facing) {
    blocked = true;
    if (P.blockT < 0.32) {
      perfect = true;
      dmg = 0;
      e.stagger = Math.max(e.stagger, e.type === "brute" ? 0.6 : 1.0);
      e.kx += (dx / dl) * 3 * e.D.knock;
      e.kz += (dz / dl) * 3 * e.D.knock;
    } else dmg *= e.type === "brute" ? 0.45 : 0.3;
    S.stats.blocks++;
  }
  P.hp = Math.max(0, P.hp - dmg);
  S.stats.dmgTaken += dmg;
  if (dmg > 0) {
    P.hurtT = 0.5;
    P.hurtDir = angDiff(P.yaw, faceYaw(P.x, P.z, e.x, e.z));
    // shove
    const push = e.type === "brute" ? 4.5 : 1.6;
    P.vx -= (dx / dl) * push * (blocked ? 0.5 : 1);
    P.vz -= (dz / dl) * push * (blocked ? 0.5 : 1);
  }
  emit(S, { type: "hurt", dmg, blocked, perfect, e });
  if (P.hp <= 0) {
    P.alive = false;
    S.status = "dead";
    emit(S, { type: "dead" });
  }
}

/* --------------------------------------------------------------- enemies */
function flowAt(S, x, z) {
  return S.flow[cellOf(z) * S.G.w + cellOf(x)];
}

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
    const enr = e.enraged ? 1.25 : 1;
    // knockback
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
    // perception
    e.thinkT -= dt;
    if (e.thinkT <= 0) {
      e.thinkT = 0.2;
      e.sees = P.alive && dist < 40 && lineOfSight(S, e.x, e.z, P.x, P.z);
      if (!e.alerted && P.alive) {
        const r = D.detect * (P.sprinting ? 1.2 : 1);
        if ((e.sees && dist < r) || dist < 3.2) {
          alert(S, e);
          // wake the pack
          for (const o of S.E) if (o !== e && o.alive && !o.alerted && Math.hypot(o.x - e.x, o.z - e.z) < 7) alert(S, o);
        }
      }
    }
    e.growlT -= dt;
    if (e.growlT <= 0) {
      e.growlT = (e.alerted ? 3 : 7) + S.rand() * 6;
      if (dist < 22) emit(S, { type: "growl", e, idle: !e.alerted });
    }
    let mvx = 0, mvz = 0, spd = 0;
    if (!P.alive) {
      e.state = e.alerted ? "chase" : e.state;
      e.speed = 0;
      continue;
    }
    if (e.state === "idle") {
      // shuffle around the spawn point
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
          spd = D.run * enr;
          // creatures slow down right before striking range so they don't overshoot
          if (dist < reach + 0.6) spd *= 0.6;
        }
      }
    } else if (e.state === "windup") {
      const wind = D.windup / enr;
      if (e.stateT >= wind) {
        e.state = "recover";
        e.stateT = 0;
        e.cool = D.cool / enr;
        // strike
        const reach = D.reach * 1.2 + PR;
        const fdot = (Math.sin(-e.yaw) * dx + -Math.cos(e.yaw) * dz) / Math.max(0.01, dist);
        const hit = dist <= reach && fdot > (e.type === "brute" ? 0.3 : 0.1) && meleeClear(S, e.x, e.z, P.x, P.z);
        emit(S, { type: "strike", e, hit });
        if (e.type === "brute") S.shake = Math.max(S.shake, dist < 6 ? 0.5 : 0.2);
        if (hit) hurtPlayer(S, e, D.dmg * (e.enraged ? 1.1 : 1));
      } else if (e.stateT < wind * 0.6) {
        // track the player while winding up
        e.yaw += angDiff(e.yaw, faceYaw(e.x, e.z, P.x, P.z)) * Math.min(1, dt * 8);
      }
    } else if (e.state === "recover") {
      if (e.stateT > 0.35) {
        e.state = "chase";
        e.stateT = 0;
      }
    }
    if (spd > 0) {
      // separation from other enemies
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
    e.walkPh += e.speed * dt * (e.type === "brute" ? 1.6 : e.type === "creature" ? 2.6 : 2.4);
    // never overlap the player
    const pd = Math.hypot(e.x - P.x, e.z - P.z);
    const pr = D.r + PR;
    if (pd < pr && pd > 1e-3) {
      e.x += ((e.x - P.x) / pd) * (pr - pd);
      e.z += ((e.z - P.z) / pd) * (pr - pd);
      resolveCircle(S, e, D.r);
    }
    // forcing ordinary doors open
    if (e.alerted && D.doors) forceDoor(S, e, dt);
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
      if (dc && dr && (!passable(S, c + dc, r, true) || !passable(S, c, r + dr, true))) continue;
      bv = v;
      best = [nc, nr];
    }
  if (!best) {
    if (here >= INF) return null; // can't reach: hold position
    return [(P.x - e.x) / dist, (P.z - e.z) / dist];
  }
  // big enemies aim for the centre of the next cell so they slide around corners
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
    // only when the door is actually on the way to the player
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

/* --------------------------------------------------------------- world */
function updateDoors(S, dt) {
  let changed = false;
  for (const d of S.doors) {
    if (d.open < d.target) {
      const was = d.open >= 0.85;
      d.open = Math.min(d.target, d.open + dt * (d.kind === "gate" ? 0.75 : d.kind === "exit" ? 1 : 2.2));
      if (!was && d.open >= 0.85) changed = true;
    }
  }
  if (changed) {
    computeFlow(S);
    S.flowT = 0.2;
  }
}

function updatePickups(S) {
  const P = S.P;
  for (const it of S.items) {
    if (it.taken || NEED_E.has(it.kind)) continue;
    if (Math.hypot(it.x - P.x, it.z - P.z) > 0.95) continue;
    if (it.kind === "h" && P.hp >= P.maxHp) {
      it.full = true;
      continue;
    }
    takeItem(S, it);
  }
}

function takeItem(S, it) {
  const P = S.P;
  it.taken = true;
  S.got[it.kind] = true;
  S.count[it.kind] = (S.count[it.kind] || 0) + 1;
  let text = "";
  if (it.kind === "a") {
    P.ammo.pistol.res = Math.min(WEAPONS.pistol.maxRes, P.ammo.pistol.res + 18);
    text = "+18 pistol rounds";
  } else if (it.kind === "o") {
    P.ammo.shotgun.res = Math.min(WEAPONS.shotgun.maxRes, P.ammo.shotgun.res + 8);
    text = "+8 shotgun shells";
  } else if (it.kind === "h") {
    P.hp = Math.min(P.maxHp, P.hp + 40);
    text = "+40 health";
  } else if (it.kind === "m") {
    P.hp = Math.min(P.maxHp, P.hp + 20);
    text = "Medical supplies collected";
  } else if (it.kind === "k") text = "Keycard collected";
  else if (it.kind === "S") {
    P.owned.shotgun = true;
    P.ammo.shotgun.mag = Math.max(P.ammo.shotgun.mag, 6);
    P.ammo.shotgun.res = Math.max(P.ammo.shotgun.res, 12);
    P.w = "shotgun";
    P.switchT = 0.5;
    cancelReload(P);
    text = "Shotgun acquired! Press 2 to equip it";
  }
  emit(S, { type: "pickup", kind: it.kind, it, text });
}

function updateTriggers(S) {
  const P = S.P;
  for (const t of S.triggers) {
    if (t.fired || Math.hypot(t.x - P.x, t.z - P.z) > 1.7) continue;
    t.fired = true;
    const sc = t.scare;
    if (sc.kind === "blackout") {
      S.blackout = 2.4;
      emit(S, { type: "scare", kind: "blackout", x: t.x, z: t.z });
    } else if (sc.kind === "ambush") {
      for (const type of sc.types || ["infected"]) {
        const p = findSpawn(S, false, 5);
        if (p) spawnEnemy(S, type, p.x, p.z, true, { spawnT: 0.3 });
      }
      emit(S, { type: "scare", kind: "ambush", x: t.x, z: t.z });
    } else {
      // a bang or a scream somewhere ahead
      const [fx, fz] = playerFwd(P);
      emit(S, { type: "scare", kind: sc.kind, x: P.x + fx * 8, z: P.z + fz * 8 });
      if (sc.kind === "bang") S.shake = Math.max(S.shake, 0.25);
    }
  }
}

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
    if (d.open >= 0.85 || (d.kind === "door" && d.target >= 1)) continue;
    consider(d.x, d.z, 2.3, { kind: d.kind, d });
  }
  for (const s of S.switches) if (!s.on) consider(s.x, s.z, 2.0, { kind: "switch", s });
  for (const it of S.items) {
    if (it.taken) continue;
    if (NEED_E.has(it.kind)) consider(it.x, it.z, 1.9, { kind: "item", it });
    else if (it.kind === "h" && it.full && P.hp >= P.maxHp) consider(it.x, it.z, 1.3, { kind: "full", it });
  }
  return best;
}

const ITEM_LABEL = { k: "Pick up keycard", S: "Pick up shotgun", m: "Take medical supplies" };

function updateInteract(S, inp) {
  const P = S.P;
  const o = findInteract(S);
  let prompt = null;
  if (o) {
    if (o.kind === "door") prompt = { text: "Open door", ok: true };
    else if (o.kind === "gate") prompt = { text: "Security gate is locked", ok: false };
    else if (o.kind === "exit") prompt = S.exitOpen ? { text: "Escape through the exit", ok: true } : { text: "Exit locked — complete the objective", ok: false };
    else if (o.kind === "switch") prompt = { text: "Activate switch", ok: true };
    else if (o.kind === "item") prompt = { text: ITEM_LABEL[o.it.kind], ok: true };
    else if (o.kind === "full") prompt = { text: "Health is full", ok: false };
  }
  S.prompt = prompt;
  if (!inp.interact) return;
  if (!o || !prompt?.ok) {
    if (o) emit(S, { type: "denied" });
    return;
  }
  if (o.kind === "door") {
    o.d.target = 1;
    emit(S, { type: "door", d: o.d });
  } else if (o.kind === "switch") {
    o.s.on = true;
    emit(S, { type: "switch", s: o.s });
  } else if (o.kind === "item") takeItem(S, o.it);
  else if (o.kind === "exit" && !S.completed) {
    S.completed = true;
    o.d.target = 1;
    S.status = "complete";
    S.P.vx = S.P.vz = 0;
    emit(S, { type: "complete" });
  }
}

/* --------------------------------------------------------------- step */
export function step(S, dt, inp = {}) {
  S.ev = [];
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
  // flow field follows the player's cell (and refreshes a few times a second)
  S.flowT -= dt;
  const pcell = cellOf(S.P.z) * S.G.w + cellOf(S.P.x);
  if (S.flowT <= 0 || pcell !== S.flowCell) {
    S.flowT = 0.3;
    computeFlow(S);
  }
  updateDoors(S, dt);
  updatePickups(S);
  updateInteract(S, inp);
  if (S.status !== "play") return S.ev;
  updateTriggers(S);
  updateEnemies(S, dt);
  if (S.status !== "play") return S.ev;
  updateWave(S, dt);
  updateObjectives(S);
  // remove long-dead spawned corpses to keep the scene light
  if (S.E.length > 24) S.E = S.E.filter((e) => e.alive || e.deadT < 20);
  return S.ev;
}

export function bossInfo(S) {
  const b = S.E.find((e) => e.type === "brute" && e.alive && e.alerted);
  return b ? { hp: b.hp, max: b.maxHp, enraged: b.enraged } : null;
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
