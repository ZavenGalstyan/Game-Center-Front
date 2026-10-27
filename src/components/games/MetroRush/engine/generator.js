/**
 * Metro Rush — procedural track generator.
 *
 * Track is built in chunks. Each chunk is a handful of "beats" (barrier rows,
 * trains, moving trains, slaloms, tunnels) spaced by TIME, so density follows
 * speed. A proposal is only accepted if the fairness validator proves it can
 * be survived from every entry lane at the speeds the runner will have while
 * crossing it; otherwise a calmer proposal is tried, ending with a fallback
 * that is trivially safe. Coins follow one of the validated routes, so the
 * coin trail always shows a line that works.
 */
import {
  CAR_L, CELL, LANES, MOVING_ACT, OVERHEAD_L, BARRIER_L, RAMP_L, TRAIN_H, gravityAt, jumpVel, laneX, lerp,
} from "./config.js";
import { rngInt, rngNext, rngPick, rngWeighted } from "./rng.js";
import { validate } from "./validator.js";

const r = (st, a, b) => a + rngNext(st) * (b - a);

/* ------------------------------------------------------------------ proposals */
function propose(st, v, d, calm) {
  const items = [];
  const lead = Math.max(6, v * 0.35);
  const busy = [lead, lead, lead];
  let cursor = lead + v * 0.25;
  const beats = calm >= 3 ? 1 : 2 + rngInt(st, 3) + Math.round(d * 2) - calm;
  const gapBase = lerp(1.5, 0.78, d) + calm * 0.18;

  const put = (kind, lane, z, extra = {}) => {
    if (z < busy[lane]) return false;
    if (kind === "barrier") {
      items.push({ kind, lane, z0: z, z1: z + BARRIER_L });
      busy[lane] = z + 2;
    } else if (kind === "overhead") {
      items.push({ kind, lane, z0: z, z1: z + OVERHEAD_L });
      busy[lane] = z + 2;
    }
    return true;
  };
  const putTrain = (lane, z, cars, ramp) => {
    const z0 = z;
    const zFree = ramp ? z0 - RAMP_L - 1 : z0;
    if (zFree < busy[lane]) return false;
    const z1 = z0 + cars * CAR_L;
    items.push({ kind: "train", lane, z0, z1, cars, ramp, moving: false });
    busy[lane] = z1 + 3;
    return true;
  };
  const putMoving = (lane, meet, cars, u) => {
    const k = v / (v + u);
    const z0 = meet + MOVING_ACT * (1 - k);
    const z1 = z0 + cars * CAR_L;
    if (meet - 14 < busy[lane]) return false;
    items.push({ kind: "train", lane, z0, z1, cars, ramp: false, moving: true, u });
    busy[lane] = z1 + 3;
    return true;
  };
  const lanes = () => {
    const a = [0, 1, 2];
    for (let i = 2; i > 0; i--) {
      const j = rngInt(st, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const act = () => (rngNext(st) < 0.58 ? "barrier" : "overhead");
  const carsFor = () => 1 + rngInt(st, 1 + Math.round(d * 2.2));

  for (let b = 0; b < beats; b++) {
    const z = cursor;
    const kind = rngWeighted(st, [
      ["single", 3],
      ["double", 2.4 + d],
      ["triple", d > 0.12 ? 1 + d : 0],
      ["train", 2.6],
      ["trains2", 1.4 + d * 1.6],
      ["trains3", d > 0.28 ? 0.6 + d : 0],
      ["moving", d > 0.06 ? 0.9 + d * 1.6 : 0],
      ["slalom", d > 0.18 ? 0.8 + d : 0],
      ["tunnel", d > 0.1 ? 0.6 : 0],
      ["breather", calm ? 2 : 0.5],
    ]);
    let used = 1;
    const L = lanes();
    if (kind === "single") put(act(), L[0], z);
    else if (kind === "double") {
      put(act(), L[0], z);
      put(act(), L[1], z + (rngNext(st) < 0.3 ? v * 0.4 : 0));
    } else if (kind === "triple") {
      const same = rngNext(st) < 0.5 ? act() : null;
      for (const l of L) put(same || act(), l, z);
    } else if (kind === "train") {
      putTrain(L[0], z, carsFor(), rngNext(st) < 0.45);
      if (rngNext(st) < 0.35 + d * 0.3) put(act(), L[1], z + r(st, 0, v * 0.6));
    } else if (kind === "trains2") {
      const off = r(st, 0, CAR_L * 0.8);
      putTrain(L[0], z, carsFor(), rngNext(st) < 0.4);
      putTrain(L[1], z + off, carsFor(), rngNext(st) < 0.4);
      used = 1.3;
    } else if (kind === "trains3") {
      const rampLane = rngInt(st, 3);
      for (const l of L) putTrain(l, z + r(st, 0, CAR_L * 0.9), carsFor() + 1, l === rampLane || rngNext(st) < 0.25);
      used = 1.6;
    } else if (kind === "moving") {
      const u = lerp(9, 15, d) * r(st, 0.9, 1.1);
      putMoving(L[0], z, 1 + rngInt(st, 2 + Math.round(d)), u);
      if (rngNext(st) < 0.4 + d * 0.3) putTrain(L[1], z + r(st, -CAR_L, CAR_L * 0.5), carsFor(), rngNext(st) < 0.5);
      used = 1.2;
    } else if (kind === "slalom") {
      let l = rngInt(st, 3);
      const n = 3 + rngInt(st, 2);
      for (let k = 0; k < n; k++) {
        put("barrier", l, z + k * v * 0.75);
        const other = [0, 1, 2].filter((x) => x !== l);
        put(rngNext(st) < 0.5 ? "barrier" : "overhead", rngPick(st, other), z + k * v * 0.75);
        l = rngPick(st, other);
      }
      used = n * 0.75;
    } else if (kind === "tunnel") {
      for (const l of L) put("overhead", l, z);
    }
    cursor += v * (gapBase * used) * r(st, 0.85, 1.2);
  }
  const len = Math.max(cursor, ...busy) + Math.max(8, v * 0.4);
  return { items, len };
}

/* ------------------------------------------------------------------ chunk build */
const shifted = (items, off) => items.map((it) => ({ ...it, z0: it.z0 - off, z1: it.z1 - off }));
function robust(items, len, vStart, vEnd) {
  const vMid = (vStart + vEnd) / 2;
  const h = CELL / 2;
  return (
    validate(shifted(items, h), len - h, vStart).ok &&
    validate(items, len, vMid).ok &&
    validate(shifted(items, h), len - h, vMid).ok &&
    validate(items, len, vEnd).ok &&
    validate(shifted(items, h), len - h, vEnd).ok
  );
}

/**
 * @param st       rng state
 * @param vStart   expected speed when the runner reaches the chunk
 * @param vEnd     expected speed when it leaves
 * @param d        difficulty 0..1
 * @param entry    preferred entry lane for the coin trail
 */
export function makeChunk(st, vStart, vEnd, d, entry = 1) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const calm = attempt < 6 ? 0 : attempt < 10 ? 1 : attempt < 13 ? 2 : 3;
    const p = propose(st, vStart, d, calm);
    const a = validate(p.items, p.len, vStart);
    if (!a.ok) continue;
    // robust, not marginal: must also pass with the grid shifted by half a
    // cell and across the speed range the runner will have in the chunk
    if (!robust(p.items, p.len, vStart, vEnd)) continue;
    return { ...p, plan: a.plan(entry) || a.plan(a.start.findIndex(Boolean)), attempts: attempt + 1, v: vStart };
  }
  // trivially safe fallback: one barrier, other lanes clear
  const items = [{ kind: "barrier", lane: rngInt(st, 3), z0: 20, z1: 20 + BARRIER_L }];
  const len = 20 + vStart * 1.2;
  const a = validate(items, len, vStart);
  return { items, len, plan: a.plan(entry), attempts: 15, v: vStart, fallback: true };
}

/** coin trail + extra lines + power-up spot for an accepted chunk */
export function dressChunk(st, chunk, opts) {
  const { v } = chunk;
  const coins = [];
  const plan = chunk.plan || [];
  const g = gravityAt(v);
  const vj = jumpVel(g);
  // sample the runner route every ~CELL into positions
  const pts = [];
  for (const s of plan) {
    const n = s.to.i - s.i;
    for (let k = 0; k < n; k++) {
      const z = (s.i + k) * CELL;
      let x = laneX(s.lane);
      let y = s.lev ? TRAIN_H + 1 : 1;
      if (s.act === "left" || s.act === "right" || s.act === "topLeft" || s.act === "topRight") {
        const f = Math.min(1, k / Math.max(1, n * 0.6));
        x = lerp(laneX(s.lane), laneX(s.to.lane), f);
      } else if (s.act === "jump") {
        const t = (k * CELL) / v;
        y = 1 + Math.max(0, vj * t - 0.5 * g * t * t);
      } else if (s.act === "slide") y = 0.7;
      else if (s.act === "fall") {
        const t = (k * CELL) / v;
        y = Math.max(1, TRAIN_H + 1 - 0.5 * g * t * t);
      }
      pts.push({ x, y, z, act: s.act, lev: s.lev });
    }
  }
  // ramps: lift coins over ramp cells
  const ramps = chunk.items.filter((it) => it.kind === "train" && it.ramp);
  for (const p of pts) {
    for (const it of ramps) {
      if (Math.abs(p.x - laneX(it.lane)) < 0.1 && p.z >= it.z0 - RAMP_L && p.z < it.z0) p.y = 1 + (TRAIN_H * (p.z - (it.z0 - RAMP_L))) / RAMP_L;
    }
  }
  if (!opts.noCoins && pts.length) {
    let z = 4 + rngNext(st) * 6;
    let on = rngNext(st) < 0.75;
    let segEnd = z + (on ? 18 + rngNext(st) * 30 : 8 + rngNext(st) * 18);
    let lastZ = -99;
    for (const p of pts) {
      if (p.z < z) continue;
      if (p.z > segEnd) {
        on = !on;
        segEnd = p.z + (on ? 18 + rngNext(st) * 34 : 8 + rngNext(st) * 20);
      }
      if (on && p.z - lastZ >= 2.2) {
        coins.push({ x: p.x, y: p.y, z: p.z });
        lastZ = p.z;
      }
    }
  }
  // a power-up on the route
  let pickup = null;
  if (opts.power && pts.length > 20) {
    const cands = pts.filter((p) => p.z > 10 && p.z < chunk.len - 6 && (p.act === "run" || p.act === "rampUp") && !coins.some((c) => Math.abs(c.z - p.z) < 1.6 && Math.abs(c.x - p.x) < 0.5));
    if (cands.length) {
      const p = cands[rngInt(st, cands.length)];
      pickup = { kind: opts.power, x: p.x, y: p.y + 0.15, z: p.z };
    }
  }
  return { coins, pickup, exitLane: plan.length ? plan[plan.length - 1].to.lane : opts.entry ?? 1 };
}

/** an obstacle-free chunk for Rocket Dash: a weaving coin line */
export function boostChunk(st, v, entry) {
  const len = v * 2.2;
  const coins = [];
  let lane = entry;
  let next = 12 + rngNext(st) * 10;
  for (let z = 4; z < len - 2; z += 2.4) {
    if (z > next) {
      const t = Math.max(0, Math.min(LANES - 1, lane + (rngNext(st) < 0.5 ? -1 : 1)));
      lane = t;
      next = z + 14 + rngNext(st) * 16;
    }
    coins.push({ x: laneX(lane), y: 1.2, z });
  }
  return { items: [], len, coins, pickup: null, exitLane: lane, plan: null, v };
}

/** the opening runway: no obstacles for a moment, a coin line in the middle lane */
export function startChunk(v) {
  const len = Math.max(60, v * 3.4);
  const coins = [];
  for (let z = 18; z < len - 6; z += 2.4) coins.push({ x: 0, y: 1, z });
  return { items: [], len, coins, pickup: null, exitLane: 1, plan: null, v };
}
