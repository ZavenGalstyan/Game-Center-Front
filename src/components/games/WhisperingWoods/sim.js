/**
 * Whispering Woods — pure simulation (no Three.js, no DOM).
 *
 *  - LAYOUT: deterministic forest built once from data.js — colliders
 *    (circles + oriented boxes) in a spatial hash, trees, rocks, world-space
 *    landmark parts for the renderer, notes, nav points and a 0.5 m walk grid.
 *  - createGame(): one run. update(dt, input) moves the player with
 *    collision, runs stamina, note aiming, the gate, fear and the creature's
 *    state machine (hidden → wander/stalk/watch → chase → retreat → hidden).
 *    Things the UI/audio should react to are pushed onto `game.events`.
 *
 * The creature steers straight at its target when the line is clear and
 * otherwise follows a BFS flow field over the walk grid, so walls and trees
 * never trap it; if it still gets stuck while unseen it simply relocates.
 */
import {
  HALF, START, EYE, PLAYER_R, MONSTER_R, TRAILS, TRAIL_CLEAR, LANDMARKS, LM, GATE, NOTES, NOTE_REACH, NAV_EXTRA, toWorld, groundY,
} from "./data.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L = dx * dx + dz * dz;
  let t = L > 0 ? ((px - ax) * dx + (pz - az) * dz) / L : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function trailDist(x, z) {
  let best = Infinity;
  for (const tr of TRAILS) for (let i = 0; i < tr.length - 1; i++) best = Math.min(best, segDist(x, z, tr[i][0], tr[i][1], tr[i + 1][0], tr[i + 1][1]));
  return best;
}

/* ======================================================================== layout */
const CELL = 4; // spatial hash cell (m)
const hkey = (ix, iz) => (ix + 512) * 1024 + (iz + 512);

function makeHash() {
  const map = new Map();
  let stamp = 0;
  return {
    add(c) {
      const r = c.br;
      for (let ix = Math.floor((c.x - r) / CELL); ix <= Math.floor((c.x + r) / CELL); ix++)
        for (let iz = Math.floor((c.z - r) / CELL); iz <= Math.floor((c.z + r) / CELL); iz++) {
          const k = hkey(ix, iz);
          let a = map.get(k);
          if (!a) map.set(k, (a = []));
          a.push(c);
        }
    },
    /** colliders whose cells overlap the box [x0,x1]×[z0,z1] (deduped) */
    query(x0, z0, x1, z1, out) {
      out.length = 0;
      stamp++;
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
        for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
          const a = map.get(hkey(ix, iz));
          if (!a) continue;
          for (const c of a) if (c.stamp !== stamp) {
            c.stamp = stamp;
            out.push(c);
          }
        }
      return out;
    },
  };
}

function circleCol(x, z, r, tall, extra) {
  return { t: "c", x, z, r, br: r, tall, stamp: 0, ...extra };
}
function boxCol(x, z, hw, hd, rot, tall, extra) {
  return { t: "b", x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), br: Math.hypot(hw, hd), tall, stamp: 0, ...extra };
}

/** signed distance from point to collider surface (negative inside) */
function colDist(c, x, z) {
  if (c.t === "c") return Math.hypot(x - c.x, z - c.z) - c.r;
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
  const qx = Math.abs(lx) - c.hw, qz = Math.abs(lz) - c.hd;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
}

/** does segment a→b intersect collider c? */
function segHits(c, ax, az, bx, bz) {
  if (c.t === "c") return segDist(c.x, c.z, ax, az, bx, bz) < c.r;
  const tl = (x, z) => {
    const dx = x - c.x, dz = z - c.z;
    return [dx * c.c - dz * c.s, dx * c.s + dz * c.c];
  };
  const [x0, z0] = tl(ax, az), [x1, z1] = tl(bx, bz);
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, d, h] of [[x0, dx, c.hw], [z0, dz, c.hd]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return false;
    } else {
      let a = (-h - p) / d, b = (h - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function buildLayout() {
  const rng = mulberry32(90210);
  const hash = makeHash();
  const colliders = [];
  const add = (c) => {
    colliders.push(c);
    hash.add(c);
  };
  const parts = []; // world-space render parts

  /* landmarks */
  for (const lm of LANDMARKS) {
    const base = groundY(lm.x, lm.z);
    for (const p of lm.parts) {
      const w = toWorld(lm, p.x, p.z);
      const rotY = lm.rot + (p.ry || 0);
      if (p.m !== "none") parts.push({ ...p, wx: w.x, wy: base + p.y, wz: w.z, rotY, lm: lm.id });
      if (!p.c) continue;
      if (p.k === "box" || p.k === "prism") {
        const h = p.h;
        const tall = h >= 1.7;
        add(boxCol(w.x, w.z, p.w / 2, p.d / 2, rotY, tall, { lm: lm.id }));
      } else {
        const r = p.cr || p.r || Math.max(p.rt, p.rb);
        const tall = (p.k === "cyl" && p.h >= 3) || (p.k === "rock" && r >= 1.2);
        add(circleCol(w.x, w.z, r, tall, { lm: lm.id }));
      }
    }
  }

  /* exit gate: pillars, fence wings, and the (dynamic) gate leaves */
  const gz = GATE.z;
  add(boxCol(-2.65, gz, 0.35, 0.35, 0, true, { lm: "gate" }));
  add(boxCol(2.65, gz, 0.35, 0.35, 0, true, { lm: "gate" }));
  add(boxCol(-8.5, gz, 5.5, 0.12, 0, true, { lm: "gate" }));
  add(boxCol(8.5, gz, 5.5, 0.12, 0, true, { lm: "gate" }));
  const gateLeaf = boxCol(0, gz, GATE.halfOpening, 0.14, 0, true, { lm: "gate", gate: true });
  add(gateLeaf);

  /* trees */
  const trees = [];
  const treeGrid = new Map();
  const tkey = (x, z) => hkey(Math.floor(x / 4), Math.floor(z / 4));
  const near = (x, z, d) => {
    const ix = Math.floor(x / 4), iz = Math.floor(z / 4);
    for (let a = ix - 1; a <= ix + 1; a++)
      for (let b = iz - 1; b <= iz + 1; b++) {
        const arr = treeGrid.get(hkey(a, b));
        if (arr) for (const t of arr) if (Math.hypot(t.x - x, t.z - z) < d) return true;
      }
    return false;
  };
  const navPts = [];
  for (const tr of TRAILS) for (const [x, z] of tr) navPts.push({ x, z });
  for (const [x, z] of NAV_EXTRA) navPts.push({ x, z, extra: true });
  const tmp = [];
  const clearOfCols = (x, z, d) => {
    hash.query(x - d - 6, z - d - 6, x + d + 6, z + d + 6, tmp);
    for (const c of tmp) if (colDist(c, x, z) < d) return false;
    return true;
  };
  const reserved = (x, z, r) => {
    if (Math.hypot(x - START.x, z - START.z) < 8 + r) return true;
    if (Math.hypot(x - GATE.x, z - (GATE.z + 2)) < 7 + r) return true;
    for (const lm of LANDMARKS) if (Math.hypot(x - lm.x, z - lm.z) < lm.clear + r) return true;
    for (const n of navPts) if (n.extra && Math.hypot(x - n.x, z - n.z) < 2.5) return true;
    return false;
  };
  const OUT = 92;
  for (let i = 0; i < 16000 && trees.length < 2400; i++) {
    const x = (rng() * 2 - 1) * OUT, z = (rng() * 2 - 1) * OUT;
    const inside = Math.abs(x) < HALF + 1.5 && Math.abs(z) < HALF + 1.5;
    const r = 0.26 + rng() * 0.2;
    // no colliding trees right against the boundary (they would fight the clamp)
    if (Math.max(Math.abs(x), Math.abs(z)) > HALF - 1.6 && Math.max(Math.abs(x), Math.abs(z)) < HALF + 0.9) continue;
    if (inside) {
      if (near(x, z, 3.3)) continue;
      if (trailDist(x, z) < TRAIL_CLEAR + r) continue;
      if (reserved(x, z, r)) continue;
      if (!clearOfCols(x, z, r + 1.2)) continue;
    } else {
      if (near(x, z, 2.3)) continue;
      // keep the view through the gate open
      if (z < -HALF && Math.abs(x) < 4) continue;
    }
    const dead = rng() < (inside ? 0.18 : 0.08);
    const t = { x, z, r, h: dead ? 6 + rng() * 4 : 9 + rng() * 7, dead, rot: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.08, inside };
    trees.push(t);
    const k = tkey(x, z);
    if (!treeGrid.has(k)) treeGrid.set(k, []);
    treeGrid.get(k).push(t);
    if (inside) add(circleCol(x, z, r + 0.05, false, { tree: true }));
  }

  /* rocks */
  const rocks = [];
  for (let i = 0; i < 400 && rocks.length < 80; i++) {
    const x = (rng() * 2 - 1) * (HALF - 2), z = (rng() * 2 - 1) * (HALF - 2);
    const r = 0.25 + rng() * rng() * 1.1;
    if (trailDist(x, z) < TRAIL_CLEAR + r || reserved(x, z, r) || near(x, z, r + 1) || !clearOfCols(x, z, r + 1)) continue;
    const rock = { x, z, r, sy: 0.5 + rng() * 0.4, rot: rng() * 6.28 };
    rocks.push(rock);
    if (r > 0.55) add(circleCol(x, z, r * 0.85, r >= 1.2));
  }

  /* notes in world space */
  const notes = NOTES.map((n, i) => {
    const lm = LM[n.lm];
    const w = toWorld(lm, n.at[0], n.at[2]);
    const s = toWorld(lm, n.stand[0], n.stand[1]);
    const ry = lm.rot + n.ry;
    return { i, lm: n.lm, place: lm.name, x: w.x, y: groundY(lm.x, lm.z) + n.at[1], z: w.z, ry, tilt: n.tilt, nx: Math.sin(ry), nz: Math.cos(ry), stand: s, text: n.text };
  });

  /* walk grid (0.5 m) — cell blocked when too close to a collider */
  const G = 0.5, N = Math.round((HALF * 2) / G);
  const blocked = new Uint8Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = -HALF + (i + 0.5) * G, z = -HALF + (j + 0.5) * G;
      hash.query(x - 3, z - 3, x + 3, z + 3, tmp);
      for (const c of tmp) if (colDist(c, x, z) < 0.42) {
        blocked[j * N + i] = 1;
        break;
      }
    }

  return { colliders, hash, parts, trees, rocks, notes, nav: navPts, gateLeaf, grid: { G, N, blocked } };
}

export const LAYOUT = buildLayout();
const { hash: HASH, grid: GRID } = LAYOUT;

/* ======================================================================== physics helpers */
const qbuf = [];

/** push a circle at p out of every collider (mutates p) */
export function resolve(p, r, gateOpen = false) {
  for (let it = 0; it < 4; it++) {
    let moved = false;
    HASH.query(p.x - r - 3, p.z - r - 3, p.x + r + 3, p.z + r + 3, qbuf);
    for (const c of qbuf) {
      if (c.gate && gateOpen) continue;
      if (c.t === "c") {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m) {
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          p.x = c.x + nx * m;
          p.z = c.z + nz * m;
          moved = true;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        const cx = clamp(lx, -c.hw, c.hw), cz = clamp(lz, -c.hd, c.hd);
        let ex = lx - cx, ez = lz - cz;
        const d = Math.hypot(ex, ez);
        let nlx, nlz;
        if (d > 1e-6) {
          if (d >= r) continue;
          nlx = cx + (ex / d) * r;
          nlz = cz + (ez / d) * r;
        } else {
          // centre inside the box: leave through the nearest face
          const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
          if (px < pz) {
            nlx = Math.sign(lx || 1) * (c.hw + r);
            nlz = lz;
          } else {
            nlx = lx;
            nlz = Math.sign(lz || 1) * (c.hd + r);
          }
        }
        // back to world (rotate by +rot)
        p.x = c.x + nlx * c.c + nlz * c.s;
        p.z = c.z - nlx * c.s + nlz * c.c;
        moved = true;
      }
    }
    p.x = clamp(p.x, -HALF, HALF);
    p.z = clamp(p.z, -HALF, HALF);
    if (!moved) break;
  }
  return p;
}

/** is the straight line a→b blocked? `tallOnly` ignores knee-high clutter (for sight) */
export function lineBlocked(ax, az, bx, bz, tallOnly = false, gateOpen = false) {
  HASH.query(Math.min(ax, bx) - 1, Math.min(az, bz) - 1, Math.max(ax, bx) + 1, Math.max(az, bz) + 1, qbuf);
  for (const c of qbuf) {
    if (tallOnly && !c.tall) continue;
    if (c.gate && gateOpen) continue;
    if (segHits(c, ax, az, bx, bz)) return true;
  }
  return false;
}

/** like lineBlocked but for a body of radius r (centre line + two side lines) */
export function lineBlockedFat(ax, az, bx, bz, r = 0.35, gateOpen = false) {
  if (lineBlocked(ax, az, bx, bz, false, gateOpen)) return true;
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const ox = (-dz / L) * r, oz = (dx / L) * r;
  return lineBlocked(ax + ox, az + oz, bx + ox, bz + oz, false, gateOpen) || lineBlocked(ax - ox, az - oz, bx - ox, bz - oz, false, gateOpen);
}

/** clearance (distance to nearest collider surface), capped at 6 */
export function clearance(x, z) {
  HASH.query(x - 6, z - 6, x + 6, z + 6, qbuf);
  let best = 6;
  for (const c of qbuf) best = Math.min(best, colDist(c, x, z));
  return best;
}

/* ======================================================================== grid / flow field */
export const cellOf = (x, z) => {
  const { G, N } = GRID;
  const i = clamp(Math.floor((x + HALF) / G), 0, N - 1), j = clamp(Math.floor((z + HALF) / G), 0, N - 1);
  return j * N + i;
};
export const cellCenter = (k) => {
  const { G, N } = GRID;
  return { x: -HALF + ((k % N) + 0.5) * G, z: -HALF + (Math.floor(k / N) + 0.5) * G };
};
/** nearest unblocked cell to k (spiral search) */
function openCell(k) {
  const { N, blocked } = GRID;
  if (!blocked[k]) return k;
  const i0 = k % N, j0 = Math.floor(k / N);
  for (let r = 1; r < 8; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (!blocked[j * N + i]) return j * N + i;
      }
  return k;
}

const NB = [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 3], [1, -1, 3], [-1, 1, 3], [-1, -1, 3]];
/** BFS-ish (integer Dijkstra with 2/3 weights via bucket queue) distance field to `target` */
export function flowField(target, out) {
  const { N, blocked } = GRID;
  const size = N * N;
  const dist = out && out.length === size ? out : new Int32Array(size);
  dist.fill(0x3fffffff);
  const t = openCell(target);
  dist[t] = 0;
  // bucket queue (weights 2/3) — three rotating buckets suffice
  let buckets = [[t], [], [], []];
  let cur = 0;
  let pending = 1;
  while (pending > 0) {
    const b = buckets[cur % 4];
    buckets[cur % 4] = [];
    for (const k of b) {
      pending--;
      const d = dist[k];
      if (d !== cur) continue;
      const i = k % N, j = (k - i) / N;
      for (const [di, dj, w] of NB) {
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= N || c >= N) continue;
        const nk = c * N + a;
        if (blocked[nk]) continue;
        if (di && dj && (blocked[j * N + a] || blocked[c * N + i])) continue; // no corner cutting
        const nd = d + w;
        if (nd < dist[nk]) {
          dist[nk] = nd;
          buckets[nd % 4].push(nk);
          pending++;
        }
      }
    }
    cur++;
    if (cur > 4 * size) break;
  }
  return dist;
}
/** nearest open cell to world point (x,z) that is not behind a wall */
function openCellFrom(x, z) {
  const { N, blocked, G } = GRID;
  const k0 = cellOf(x, z);
  if (!blocked[k0]) return k0;
  const i0 = k0 % N, j0 = Math.floor(k0 / N);
  let best = -1, bd = Infinity;
  for (let r = 1; r < 6 && best < 0; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = j * N + i;
        if (blocked[k]) continue;
        const cx = -HALF + (i + 0.5) * G, cz = -HALF + (j + 0.5) * G;
        const d = Math.hypot(cx - x, cz - z);
        if (d < bd && !lineBlockedFat(x, z, cx, cz, 0.3)) {
          bd = d;
          best = k;
        }
      }
  return best >= 0 ? best : openCell(k0);
}

/** follow the field `steps` cells downhill from (x,z); returns a world point */
export function flowAhead(dist, x, z, steps = 4) {
  const { N } = GRID;
  let k = openCellFrom(x, z);
  let pick = cellCenter(k);
  const start = k;
  for (let s = 0; s < steps; s++) {
    const i = k % N, j = (k - i) / N;
    let best = k, bd = dist[k];
    for (const [di, dj] of NB) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= N || c >= N) continue;
      const nk = c * N + a;
      if (dist[nk] < bd) {
        bd = dist[nk];
        best = nk;
      }
    }
    if (best === k) break;
    k = best;
    const c = cellCenter(k);
    // keep the furthest chain point a body can reach in a straight line
    if (s === 0 || !lineBlockedFat(x, z, c.x, c.z, 0.4)) pick = c;
    else break;
  }
  if (k === start) return cellCenter(k);
  return pick;
}
export const UNREACHED = 0x3fffffff;

/* ======================================================================== game */
export const TUNING = {
  walk: 3.3,
  sprint: 6.0,
  staminaDrain: 20,
  staminaRegenMove: 15,
  staminaRegenIdle: 25,
  exhaustedUntil: 30,
  catchDist: 1.15,
};

export function createGame({ seed = (Date.now() & 0x7fffffff) || 1, noMonster = false } = {}) {
  const rng = mulberry32(seed);
  const g = {
    t: 0,
    state: "play", // play | caught | won
    endT: 0,
    player: { x: START.x, z: START.z, y: EYE + groundY(START.x, START.z), yaw: START.yaw, pitch: 0, speed: 0, stamina: 100, exhausted: false, sprinting: false, moving: false, bob: 0, stepAcc: 0, light: true, lightCut: 0 },
    notes: LAYOUT.notes.map((n) => ({ ...n, taken: false })),
    collected: 0,
    gateOpen: false,
    gateT: 0, // 0..1 opening animation
    aim: -1,
    nearGate: false,
    fear: 0,
    panicCD: 0,
    stingCD: 0,
    gateMsgCD: 0,
    awake: false,
    glimpses: 0,
    pendingGlimpse: false,
    noMonster,
    events: [],
    monster: {
      x: 0, z: -200, yaw: 0, mode: "hidden", timer: 999, speed: 0, anim: 0,
      dist: Infinity, visible: false, seenThisAppearance: false, lostT: 0, chaseT: 0, seenT: 0,
      stuckT: 0, target: null, flow: null, flowCell: -1, flowAge: 0, watched: false, appearances: 0,
    },
  };
  const P = g.player, M = g.monster;
  const emit = (type, data) => g.events.push({ type, ...data });
  const threat = () => g.collected / 8;

  /* ------------------------------------------------ input-ish API */
  g.look = (dx, dy, sens = 1) => {
    if (g.state !== "play") return;
    P.yaw = wrapAngle(P.yaw - dx * 0.0022 * sens);
    P.pitch = clamp(P.pitch - dy * 0.0022 * sens, -1.35, 1.35);
  };
  g.toggleLight = () => {
    if (g.state !== "play") return;
    P.light = !P.light;
    emit("light", { on: P.light });
  };
  g.interact = () => {
    if (g.state !== "play") return false;
    if (g.aim >= 0) {
      const n = g.notes[g.aim];
      n.taken = true;
      g.collected++;
      g.aim = -1;
      emit("note", { index: n.i, text: n.text, count: g.collected, place: n.place });
      if (!g.awake) {
        g.awake = true;
        M.timer = Math.min(M.timer, 9 + rng() * 5);
      } else if (M.mode === "hidden") {
        M.timer = Math.min(M.timer, 4 + rng() * 5);
      }
      if (g.collected === 3 || g.collected === 6) g.pendingGlimpse = true;
      if (g.collected === 8) {
        g.gateOpen = true;
        emit("gateOpen");
      }
      return true;
    }
    if (g.nearGate && !g.gateOpen && g.gateMsgCD <= 0) {
      g.gateMsgCD = 2.5;
      emit("gateLocked", { count: g.collected });
    }
    return false;
  };

  /* ------------------------------------------------ player */
  const fwd = () => ({ x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) });

  function movePlayer(dt, inp) {
    const f = (inp.f ? 1 : 0) - (inp.b ? 1 : 0), s = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const wantMove = f !== 0 || s !== 0;
    const canSprint = inp.sprint && f > 0 && !P.exhausted && P.stamina > 0;
    let target = 0;
    if (wantMove) target = canSprint ? TUNING.sprint : TUNING.walk * (f < 0 && !s ? 0.75 : 1);
    P.speed += (target - P.speed) * Math.min(1, dt * 9);
    if (!wantMove && P.speed < 0.05) P.speed = 0;
    P.sprinting = canSprint && P.speed > TUNING.walk + 0.3;
    // stamina
    if (P.sprinting) {
      P.stamina = Math.max(0, P.stamina - TUNING.staminaDrain * dt);
      if (P.stamina <= 0) {
        P.exhausted = true;
        emit("exhausted");
      }
    } else {
      P.stamina = Math.min(100, P.stamina + (wantMove ? TUNING.staminaRegenMove : TUNING.staminaRegenIdle) * dt);
      if (P.exhausted && P.stamina >= TUNING.exhaustedUntil) P.exhausted = false;
    }
    // direction
    if (wantMove) {
      const fw = fwd();
      let dx = fw.x * f + -fw.z * s, dz = fw.z * f + fw.x * s;
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
      P.dirX = dx;
      P.dirZ = dz;
    }
    P.moving = P.speed > 0.2;
    if (P.speed > 0 && P.dirX !== undefined) {
      const dist = P.speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.2));
      const ox = P.x, oz = P.z;
      for (let i = 0; i < steps; i++) {
        P.x += (P.dirX * dist) / steps;
        P.z += (P.dirZ * dist) / steps;
        resolve(P, PLAYER_R, g.gateOpen);
      }
      const moved = Math.hypot(P.x - ox, P.z - oz);
      P.bob += moved * 1.9;
      P.stepAcc += moved;
      const stride = P.sprinting ? 2.3 : 1.8;
      if (P.stepAcc >= stride) {
        P.stepAcc -= stride;
        emit("step", { sprint: P.sprinting });
      }
    }
    P.y = EYE + groundY(P.x, P.z);
  }

  function updateAim() {
    g.aim = -1;
    const cp = Math.cos(P.pitch);
    const vx = -Math.sin(P.yaw) * cp, vy = Math.sin(P.pitch), vz = -Math.cos(P.yaw) * cp;
    let best = 0.8;
    for (const n of g.notes) {
      if (n.taken) continue;
      const dx = n.x - P.x, dy = n.y - P.y, dz = n.z - P.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > NOTE_REACH) continue;
      if ((dx * n.nx + dz * n.nz) > 0.05) continue; // looking at the back side
      const dot = (dx * vx + dy * vy + dz * vz) / d;
      const score = d < 1.1 ? Math.max(dot, 0.85) : dot;
      if (score <= best) continue;
      const fx = n.x + n.nx * 0.3, fz = n.z + n.nz * 0.3;
      if (lineBlocked(P.x, P.z, fx, fz, false, g.gateOpen)) continue;
      best = score;
      g.aim = n.i;
    }
    g.nearGate = Math.hypot(P.x - GATE.x, P.z - GATE.z) < 4.5;
  }

  /* ------------------------------------------------ monster */
  function inView(x, z, cosLimit = 0.72) {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1;
    const fw = fwd();
    return (dx * fw.x + dz * fw.z) / d > cosLimit;
  }
  const chaseSpeed = (th) => 3.4 + 1.6 * th;
  const appearDelay = () => Math.max(5, 24 - 2.3 * g.collected) + rng() * 8;

  function hide(delay) {
    M.mode = "hidden";
    M.timer = delay;
    M.x = 0;
    M.z = -400;
    M.visible = false;
    M.speed = 0;
  }

  /** pick a spawn point roughly `dist` away, outside the player's view */
  function pickSpawn(dmin, dmax, minAngleCos = Math.cos((80 * Math.PI) / 180), needPath = true) {
    const fw = fwd();
    const field = needPath ? flowField(openCellFrom(P.x, P.z)) : null;
    const cands = [];
    const tryPoint = (x, z, tag) => {
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return;
      const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
      if (d < dmin || d > dmax) return;
      if ((dx * fw.x + dz * fw.z) / d > minAngleCos) return; // in front of the player
      if (clearance(x, z) < MONSTER_R + 0.1) return;
      if (field && field[openCellFrom(x, z)] >= UNREACHED) return;
      if (z < GATE.z + 3) return;
      cands.push({ x, z, tag });
    };
    for (const n of LAYOUT.nav) tryPoint(n.x, n.z, "nav");
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, d = dmin + rng() * (dmax - dmin);
      tryPoint(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, "ring");
    }
    if (!cands.length) return null;
    const c = cands[Math.floor(rng() * cands.length)];
    if (field) {
      M.flow = field;
      M.flowCell = cellOf(P.x, P.z);
      M.flowAge = 0;
    }
    return c;
  }

  function appear(mode, spot, timer) {
    M.mode = mode;
    M.x = spot.x;
    M.z = spot.z;
    M.yaw = Math.atan2(P.x - M.x, P.z - M.z);
    M.timer = timer;
    M.seenThisAppearance = false;
    M.lostT = 0;
    M.chaseT = 0;
    M.seenT = 0;
    M.stuckT = 0;
    M.appearances++;
    emit("monsterAppear", { mode });
  }

  function spawn() {
    const th = threat();
    if (g.pendingGlimpse) {
      // a scripted glimpse: it stands behind the player, waiting to be noticed
      const spot = pickSpawn(10, 15, Math.cos((125 * Math.PI) / 180));
      if (spot && !lineBlocked(P.x, P.z, spot.x, spot.z, true)) {
        g.pendingGlimpse = false;
        g.glimpses++;
        appear("watch", spot, 9);
        return;
      }
    }
    if (g.collected <= 1 && rng() < 0.55) {
      const spot = pickSpawn(26, 46);
      if (spot) {
        appear("wander", spot, 18 + rng() * 8);
        M.target = null;
        return;
      }
    }
    const D = 34 - 18 * th;
    const spot = pickSpawn(D - 5, D + 5) || pickSpawn(D - 10, D + 14);
    if (spot) appear("stalk", spot, 22 + 8 * th);
    else M.timer = 1;
  }

  function steerTowards(tx, tz, speed, dt, direct) {
    let ax = tx, az = tz;
    if (!direct) {
      const tc = cellOf(tx, tz);
      M.flowAge += dt;
      if (!M.flow || (tc !== M.flowCell && M.flowAge > 0.35)) {
        M.flow = flowField(tc, M.flow);
        M.flowCell = tc;
        M.flowAge = 0;
      }
      const a = flowAhead(M.flow, M.x, M.z, 5);
      // smooth: aim at the furthest of the lookahead points we can see
      ax = a.x;
      az = a.z;
      if (Math.hypot(tx - M.x, tz - M.z) < 2.5 && !lineBlocked(M.x, M.z, tx, tz)) {
        ax = tx;
        az = tz;
      }
    }
    const dx = ax - M.x, dz = az - M.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const want = Math.atan2(dx, dz);
    M.yaw += wrapAngle(want - M.yaw) * Math.min(1, dt * 8);
    const step = Math.min(d, speed * dt);
    const ox = M.x, oz = M.z;
    const n = Math.max(1, Math.ceil(step / 0.25));
    for (let i = 0; i < n; i++) {
      M.x += (dx / d) * (step / n);
      M.z += (dz / d) * (step / n);
      resolve(M, MONSTER_R, false);
      // the creature never leaves through the gate
      if (M.z < GATE.z + 0.8) M.z = GATE.z + 0.8;
    }
    const moved = Math.hypot(M.x - ox, M.z - oz);
    M.speed = moved / Math.max(dt, 1e-4);
    M.anim += moved;
    if (step > 0.01 && moved < step * 0.3) M.stuckT += dt;
    else M.stuckT = Math.max(0, M.stuckT - dt);
    return moved;
  }

  function updateMonster(dt) {
    const th = threat();
    if (!g.awake && g.t > 75) {
      g.awake = true;
      M.timer = 2;
    }
    if (M.mode === "hidden") {
      M.visible = false;
      M.dist = Infinity;
      if (!g.awake) return;
      M.timer -= dt;
      if (M.timer <= 0) spawn();
      return;
    }
    const dx = P.x - M.x, dz = P.z - M.z;
    const dist = Math.hypot(dx, dz);
    M.dist = dist;
    const sight = dist < 40 && !lineBlocked(P.x, P.z, M.x, M.z, true, g.gateOpen);
    M.visible = sight && dist < 34 && inView(M.x, M.z);
    M.watched = M.visible && P.light && P.lightCut <= 0 && dist < 16 && inView(M.x, M.z, 0.9);
    if (M.visible && !M.seenThisAppearance) {
      M.seenThisAppearance = true;
      if (dist < 24 && g.stingCD <= 0 && M.mode !== "watch") {
        g.stingCD = 20;
        emit("sting", { dist });
      }
    }
    M.timer -= dt;

    // caught?
    if (dist < TUNING.catchDist && M.mode !== "retreat") {
      g.state = "caught";
      g.endT = 0;
      M.mode = "lunge";
      M.yaw = Math.atan2(dx, dz);
      emit("caught");
      return;
    }

    const clearLine = dist < 26 && !lineBlocked(M.x, M.z, P.x, P.z);
    const chaseRange = 11 + 6 * th;

    switch (M.mode) {
      case "watch": {
        M.yaw = Math.atan2(dx, dz);
        M.speed = 0;
        if (M.visible) {
          M.seenT += dt;
          if (M.seenT > 0 && !M._stung) {
            M._stung = true;
            emit("sting", { dist, glimpse: true });
            g.stingCD = 12;
          }
          if (M.seenT > 0.9) {
            M._stung = false;
            hide(appearDelay() * 0.6);
            emit("vanish");
          }
        } else if (M.timer <= 0 || dist < 5) {
          M._stung = false;
          M.mode = "stalk";
          M.timer = 18 + 6 * th;
        }
        break;
      }
      case "wander": {
        if (!M.target || Math.hypot(M.target.x - M.x, M.target.z - M.z) < 1.5 || M.stuckT > 3) {
          const opts = LAYOUT.nav.filter((n) => {
            const d = Math.hypot(n.x - P.x, n.z - P.z);
            return d > 18 && d < 55 && n.z > GATE.z + 4;
          });
          M.target = opts.length ? opts[Math.floor(rng() * opts.length)] : { x: -P.x * 0.5, z: -P.z * 0.5 };
          M.flow = null;
          M.stuckT = 0;
        }
        steerTowards(M.target.x, M.target.z, 1.3, dt, false);
        if ((dist < 8 + 8 * th && sight) || (M.visible && dist < 16)) startChase();
        else if (M.timer <= 0) retreat();
        break;
      }
      case "stalk": {
        steerTowards(P.x, P.z, 1.5 + 1.3 * th, dt, clearLine);
        if ((dist < chaseRange && sight) || (M.visible && dist < 20)) startChase();
        else if (M.timer <= 0) retreat();
        else if ((dist > 46 || M.stuckT > 2.5) && !M.visible) {
          const spot = pickSpawn(18, 30);
          if (spot) appear("stalk", spot, M.timer);
        }
        break;
      }
      case "chase": {
        M.chaseT += dt;
        let speed = chaseSpeed(th);
        if (M.watched) speed *= 0.7;
        steerTowards(P.x, P.z, speed, dt, clearLine);
        // it loses you when out of sight or far enough into the fog
        if (sight && dist < 20) M.lostT = Math.max(0, M.lostT - dt * 2);
        else M.lostT += dt;
        if (M.lostT > 3.5 - th || dist > 32 || M.chaseT > 10 + 6 * th) retreat();
        else if (M.stuckT > 2.5 && !M.visible) {
          const spot = pickSpawn(14, 22);
          if (spot) {
            appear("chase", spot, 0);
            M.chaseT = 6;
          }
        }
        break;
      }
      case "retreat": {
        // walk away from the player, then fade once out of sight
        const ax = M.x - dx, az = M.z - dz;
        steerTowards(clamp(ax, -HALF + 2, HALF - 2), clamp(az, GATE.z + 4, HALF - 2), 2.2, dt, true);
        if ((M.timer <= 0 && !M.visible) || M.timer < -4) hide(appearDelay());
        break;
      }
      default:
        break;
    }
  }
  function startChase() {
    if (M.mode !== "chase") emit("chase");
    M.mode = "chase";
    M.chaseT = 0;
    M.lostT = 0;
    M.timer = 0;
  }
  function retreat() {
    M.mode = "retreat";
    M.timer = 3;
    emit("retreat");
  }

  /* ------------------------------------------------ fear */
  function updateFear(dt) {
    let rise = 0;
    if (M.mode !== "hidden") {
      if (M.visible) rise += 10 + 42 * Math.max(0, 1 - M.dist / 34);
      if (M.dist < 12) rise += 12 * (1 - M.dist / 12);
      if (M.mode === "chase") rise += 4;
    }
    if (rise > 0) g.fear = Math.min(100, g.fear + rise * dt);
    else g.fear = Math.max(0, g.fear - 14 * dt);
    g.panicCD -= dt;
    if (g.fear >= 100 && g.panicCD <= 0) {
      g.panicCD = 8;
      g.fear = 55;
      P.lightCut = 1.4;
      emit("panic");
    }
  }

  /* ------------------------------------------------ step */
  g.update = (dt, input = {}) => {
    dt = Math.min(dt, 0.1);
    if (g.state !== "play") {
      g.endT += dt;
      if (g.gateOpen) g.gateT = Math.min(1, g.gateT + dt * 0.5);
      return;
    }
    g.t += dt;
    g.stingCD -= dt;
    g.gateMsgCD -= dt;
    P.lightCut = Math.max(0, P.lightCut - dt);
    movePlayer(dt, input);
    updateAim();
    if (g.gateOpen) g.gateT = Math.min(1, g.gateT + dt * 0.5);
    if (!g.noMonster) {
      updateMonster(dt);
      if (g.state !== "play") return;
      updateFear(dt);
    }
    if (g.gateOpen && P.z < GATE.winZ && Math.abs(P.x - GATE.x) < GATE.halfOpening - 0.1) {
      g.state = "won";
      g.endT = 0;
      emit("win");
    }
  };

  /* test helpers */
  g._spawn = spawn;
  g._pickSpawn = pickSpawn;
  g._appear = appear;
  g._hide = hide;
  return g;
}
