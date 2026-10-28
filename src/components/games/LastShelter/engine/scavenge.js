/**
 * Last Shelter — Phase A: the 60-second scavenge (framework-free sim).
 *
 * One runner (Hollis or June) moves through the house with circle-vs-box
 * collision, grabs items into a limited carry space, escorts family members
 * (an escort fills both hands) and drops everything into the garage hatch.
 * When the clock hits zero the runner must be standing at the hatch, or the
 * run ends outside. Everything here is plain data so it can be saved,
 * restored and driven by the Node bot in tools/simTest.mjs.
 */
import { mulberry, shuffle } from "./rng.js";
import { ITEMS } from "../data/items.js";
import { FAMILY } from "../data/family.js";
import { buildColliders, HATCH, HIDING, LOOT, PLAYER_START, SPAWNS, HOUSE_W, HOUSE_D } from "../data/house.js";

export const TIME_LIMIT = 60;
export const INTRO = 3.2;
export const BASE_CAP = 4;
export const RADIUS = 0.32;
export const REACH = 1.3;
export const SPEED = 4.7;

let COLLIDERS = null;
export const colliders = () => COLLIDERS || (COLLIDERS = buildColliders());

export function createScavenge({ seed = 1, runner = "hollis" } = {}) {
  const rand = mulberry(seed ^ 0x5eed);
  // spread loot: each kind prefers its rooms, but anything can be anywhere
  const free = shuffle(rand, SPAWNS.map((s, i) => i));
  const items = [];
  let uid = 0;
  for (const L of LOOT) {
    for (let n = 0; n < L.n; n++) {
      let idx = -1;
      if (rand() < 0.75) {
        const want = L.pref[Math.floor(rand() * L.pref.length)];
        idx = free.findIndex((i) => SPAWNS[i].room === want);
      }
      if (idx < 0) idx = 0;
      const sp = SPAWNS[free.splice(idx, 1)[0]];
      items.push({ id: ++uid, kind: L.kind, x: sp.x, z: sp.z, y: sp.y, taken: false });
    }
  }
  const family = FAMILY.filter((f) => f.id !== runner).map((f) => {
    const opts = HIDING[f.id];
    const p = opts[Math.floor(rand() * opts.length)];
    return { id: f.id, x: p.x, z: p.z, yaw: rand() * Math.PI * 2, state: "waiting" };
  });
  return {
    seed,
    runner,
    t: 0,
    intro: INTRO,
    limit: TIME_LIMIT,
    paused: false,
    P: { x: PLAYER_START.x, z: PLAYER_START.z, yaw: PLAYER_START.yaw, speed: 0 },
    items,
    family,
    carry: [],
    cap: BASE_CAP,
    backpack: false,
    escort: null,
    trail: [],
    delivered: { water: 0, food: 0, medkit: 0, flashlight: 0, radio: 0, toolkit: 0, map: 0, gasmask: 0, batteries: 0, books: 0, backpack: 0 },
    saved: [],
    target: null,
    inHatch: false,
    ended: null,
    lastWhole: TIME_LIMIT,
    events: [],
  };
}

export const timeLeft = (S) => Math.max(0, S.limit - S.t);
export const usedSlots = (S) => (S.escort ? S.cap : S.carry.reduce((a, k) => a + ITEMS[k].slots, 0));
export const distHatch = (S) => Math.hypot(S.P.x - HATCH.x, S.P.z - HATCH.z);

/** Push a circle out of every overlapping box (a few passes for corners). */
export function resolve(x, z, r = RADIUS) {
  const C = colliders();
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of C) {
      const cx = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x;
      const cz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: leave by the nearest face
        const opts = [
          [x - b.x0 + r, -1, 0],
          [b.x1 - x + r, 1, 0],
          [z - b.z0 + r, 0, -1],
          [b.z1 - z + r, 0, 1],
        ].sort((p, q) => p[0] - q[0]);
        x += opts[0][1] * opts[0][0];
        z += opts[0][2] * opts[0][0];
      }
      moved = true;
    }
    if (!moved) break;
  }
  x = Math.min(HOUSE_W - r, Math.max(r, x));
  z = Math.min(HOUSE_D - r, Math.max(r, z));
  return [x, z];
}

/** Nearest thing the runner can act on right now (or null). */
export function findTarget(S) {
  let best = null;
  let bd = Infinity;
  const { x, z } = S.P;
  for (const f of S.family) {
    if (f.state !== "waiting") continue;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < REACH + 0.25 && d < bd) {
      bd = d;
      best = { type: "family", id: f.id };
    }
  }
  for (const it of S.items) {
    if (it.taken) continue;
    const d = Math.hypot(it.x - x, it.z - z) - 0.08;
    if (d < REACH && d < bd) {
      bd = d;
      best = { type: "item", id: it.id, kind: it.kind };
    }
  }
  if (!best) return null;
  if (best.type === "item") {
    const k = ITEMS[best.kind];
    best.blocked = S.escort ? "escort" : usedSlots(S) + k.slots > S.cap ? "full" : null;
  } else {
    best.blocked = S.escort ? "escort" : S.carry.length ? "hands" : null;
  }
  return best;
}

export function interact(S) {
  const tg = findTarget(S);
  if (!tg) return false;
  if (tg.blocked) {
    S.events.push({ type: "blocked", why: tg.blocked });
    return false;
  }
  if (tg.type === "item") {
    const it = S.items.find((i) => i.id === tg.id);
    it.taken = true;
    if (it.kind === "backpack") {
      S.backpack = true;
      S.cap = BASE_CAP + 2;
      S.delivered.backpack = 1;
    } else S.carry.push(it.kind);
    S.events.push({ type: "pickup", kind: it.kind, x: it.x, y: it.y, z: it.z, id: it.id });
  } else {
    const f = S.family.find((m) => m.id === tg.id);
    f.state = "following";
    S.escort = f.id;
    S.trail.length = 0;
    S.events.push({ type: "rescue", id: f.id });
  }
  return true;
}

function deposit(S) {
  if (S.carry.length) {
    for (const k of S.carry) S.delivered[k] += 1;
    S.events.push({ type: "deposit", kinds: S.carry.slice() });
    S.carry.length = 0;
  }
  if (S.escort) {
    const f = S.family.find((m) => m.id === S.escort);
    f.state = "saved";
    f.x = HATCH.x;
    f.z = HATCH.z;
    S.saved.push(f.id);
    S.escort = null;
    S.events.push({ type: "saved", id: f.id });
  }
}

/**
 * Advance the run. intent = { mx, mz } (world-space direction, length ≤ 1),
 * interact / descend are edge-triggered booleans.
 */
export function tickScavenge(S, intent, dt) {
  if (S.ended || S.paused) return;
  dt = Math.min(dt, 0.1);
  if (S.intro > 0) {
    S.intro = Math.max(0, S.intro - dt);
    if (S.intro === 0) S.events.push({ type: "go" });
    return;
  }
  S.t += dt;
  const P = S.P;
  let mx = intent.mx || 0;
  let mz = intent.mz || 0;
  const m = Math.hypot(mx, mz);
  if (m > 1) {
    mx /= m;
    mz /= m;
  }
  const load = usedSlots(S);
  const sp = SPEED * (S.escort ? 0.86 : 1 - Math.min(0.18, load * 0.03));
  const nx = P.x + mx * sp * dt;
  const nz = P.z + mz * sp * dt;
  const [rx, rz] = resolve(nx, nz);
  P.speed = Math.hypot(rx - P.x, rz - P.z) / dt;
  P.x = rx;
  P.z = rz;
  if (m > 0.05) {
    const want = Math.atan2(mx, mz);
    let d = want - P.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    P.yaw += d * Math.min(1, dt * 14);
  }
  // the escorted family member walks your trail
  if (S.escort) {
    const f = S.family.find((q) => q.id === S.escort);
    const last = S.trail[S.trail.length - 1];
    if (!last || Math.hypot(last.x - P.x, last.z - P.z) > 0.12) S.trail.push({ x: P.x, z: P.z });
    if (S.trail.length > 60) S.trail.shift();
    let goal = null;
    let acc = 0;
    for (let i = S.trail.length - 1; i > 0; i--) {
      acc += Math.hypot(S.trail[i].x - S.trail[i - 1].x, S.trail[i].z - S.trail[i - 1].z);
      if (acc > 0.85) {
        goal = S.trail[i - 1];
        break;
      }
    }
    if (goal) {
      const dx = goal.x - f.x;
      const dz = goal.z - f.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, sp * 1.25 * dt);
      if (d > 1e-4) {
        f.x += (dx / d) * step;
        f.z += (dz / d) * step;
        f.yaw = Math.atan2(dx, dz);
      }
      f.moving = step > 1e-3;
    } else f.moving = false;
  }
  S.inHatch = distHatch(S) < HATCH.r;
  if (S.inHatch) deposit(S);
  if (intent.interact) interact(S);
  S.target = findTarget(S);
  if (intent.descend && S.inHatch) return finish(S, "safe");
  const whole = Math.ceil(timeLeft(S));
  if (whole !== S.lastWhole) {
    S.lastWhole = whole;
    S.events.push({ type: "second", left: whole });
  }
  if (S.t >= S.limit) finish(S, S.inHatch ? "safe" : "failed");
}

function finish(S, how) {
  S.ended = how;
  S.events.push({ type: "end", how });
}

/** What went down the hatch, ready for the shelter phase. */
export function summary(S) {
  const d = S.delivered;
  return {
    runner: S.runner,
    survivors: S.ended === "safe" ? [S.runner, ...S.saved] : [],
    saved: S.saved.slice(),
    lost: S.family.filter((f) => f.state !== "saved").map((f) => f.id),
    delivered: { ...d },
    timeUsed: Math.min(S.limit, S.t),
  };
}

export function serializeScavenge(S) {
  const { events, target, ...rest } = S;
  return JSON.parse(JSON.stringify(rest));
}
export function restoreScavenge(d) {
  if (!d || !d.P || !Array.isArray(d.items)) return null;
  return { ...d, events: [], target: null, paused: false };
}
