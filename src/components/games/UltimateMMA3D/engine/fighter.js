/**
 * Fighter simulation state + standing locomotion.
 *
 * A fighter is a plain object mutated by the engine at a fixed timestep.
 * Everything is in metres / seconds; positions are on the canvas plane (x, z),
 * `yaw` is the facing angle (forward = (sin yaw, cos yaw)), local +X is the
 * fighter's left (matching the rig's character space).
 *
 * Health is split into head / body / legs pools (100 each); `daze` is
 * short-term head trauma (rocks, knockdowns, KOs) that decays over time.
 * Stamina caps shrink with body damage; movement slows with leg damage.
 */
import { BODY_R, OCT_APOTHEM, clamp, wrapAngle } from "./constants.js";

export function effectiveAttrs(base, upgrades = {}) {
  const out = { ...base };
  for (const [k, v] of Object.entries(upgrades)) if (k in out) out[k] = clamp(out[k] + v, 30, 99);
  return out;
}

export function createFighter(data, { side = 0, attrs = null, name = null } = {}) {
  const A = attrs || data.attrs;
  const scale = data.look?.scale || 1;
  const staMax = 80 + A.cardio * 0.4;
  return {
    side,
    data,
    name: name || data.name,
    A,
    scale,
    // reach relative to height (ape index), applied to strike paths
    reachK: clamp(data.reach / data.height / 1.03, 0.94, 1.08) * scale,
    pos: { x: side === 0 ? -1.6 : 1.6, z: 0 },
    vel: { x: 0, z: 0 },
    yaw: side === 0 ? Math.PI / 2 : -Math.PI / 2,
    hp: { head: 100, body: 100, legs: 100 },
    sta: staMax,
    staMaxBase: staMax,
    daze: 0,
    act: { type: "idle", t: 0 },
    guard: null, // null | 'high' | 'body'
    combo: { chain: [], t: 9 },
    counterT: 0, // >0: next attack counts as a counter
    hitstop: 0,
    knockdowns: 0,
    kdRound: 0,
    rockedT: 0,
    lastHitT: 99, // seconds since last taking a clean strike
    pressedCage: false,
    intent: blankIntent(),
    buffered: null, // buffered attack id (pressed during recovery)
    bufferT: 0,
  };
}

export function blankIntent() {
  return { mx: 0, mz: 0, guard: null, dodge: null, attack: null, action: null, struggle: false };
}

/** Overall health 0–100 (head weighs most). */
export const overallHealth = (f) => f.hp.head * 0.45 + f.hp.body * 0.35 + f.hp.legs * 0.2;
export const staMax = (f) => f.staMaxBase * (0.62 + 0.38 * (f.hp.body / 100));
/** 0.7 … 1: fatigue multiplier for speed and power. */
export const fatigue = (f) => 0.7 + 0.3 * clamp(f.sta / (staMax(f) * 0.45), 0, 1);
export const forward = (f) => ({ x: Math.sin(f.yaw), z: Math.cos(f.yaw) });

/** Local (x = left, y, z = forward) → world point. */
export function toWorld(f, lx, ly, lz) {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: f.pos.x + lx * c + lz * s, y: ly, z: f.pos.z - lx * s + lz * c };
}

export const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

/** Can start a new standing action this frame? */
export function canAct(f) {
  const a = f.act;
  if (a.type === "idle" || a.type === "move" || a.type === "block") return true;
  return false;
}

/** Locomotion + facing for standing fighters (not attacking / reacting). */
export function stepMovement(f, opp, dt, { locked = false } = {}) {
  const A = f.A;
  const legK = 0.55 + 0.45 * (f.hp.legs / 100);
  const fat = fatigue(f);
  const foot = 0.85 + 0.3 * (A.footwork / 100);
  const fwd = forward(f);
  const left = { x: fwd.z, z: -fwd.x };
  let tx = 0;
  let tz = 0;
  const mobile = !locked && (f.act.type === "idle" || f.act.type === "move" || f.act.type === "block");
  if (mobile) {
    const guardK = f.act.type === "block" ? 0.45 : 1;
    const sp = (f.intent.mz >= 0 ? 1.55 : 1.3) * foot * legK * fat * guardK;
    const lat = 1.35 * foot * legK * fat * guardK;
    tx = (fwd.x * f.intent.mz * sp + left.x * f.intent.mx * lat) * 1;
    tz = (fwd.z * f.intent.mz * sp + left.z * f.intent.mx * lat) * 1;
  }
  // momentum: accelerate toward the target velocity
  const acc = (mobile ? 11 : 7) * dt;
  f.vel.x += clamp(tx - f.vel.x, -acc, acc);
  f.vel.z += clamp(tz - f.vel.z, -acc, acc);
  // friction on knockback overshoot
  const sp2 = Math.hypot(f.vel.x, f.vel.z);
  if (sp2 > 4) {
    f.vel.x *= 4 / sp2;
    f.vel.z *= 4 / sp2;
  }
  f.pos.x += f.vel.x * dt;
  f.pos.z += f.vel.z * dt;
  // circling: lateral motion orbits the opponent rather than drifting off
  // (handled implicitly by re-facing every frame)
  if (opp) {
    const want = Math.atan2(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z);
    const turn = f.act.type === "attack" ? 2.5 : f.act.type === "hit" ? 3 : 9;
    const d = wrapAngle(want - f.yaw);
    f.yaw = wrapAngle(f.yaw + clamp(d, -turn * dt, turn * dt));
  }
  if (mobile) f.act.type = f.intent.guard ? "block" : Math.hypot(f.vel.x, f.vel.z) > 0.15 ? "move" : "idle";
}

/** Keep a fighter inside the octagon (8 half-planes). Returns true if touching the fence. */
export function clampToCage(f, margin = BODY_R) {
  let touching = false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const d = f.pos.x * nx + f.pos.z * nz;
    const lim = OCT_APOTHEM - margin;
    if (d > lim) {
      f.pos.x -= (d - lim) * nx;
      f.pos.z -= (d - lim) * nz;
      const vn = f.vel.x * nx + f.vel.z * nz;
      if (vn > 0) {
        f.vel.x -= vn * nx;
        f.vel.z -= vn * nz;
      }
      touching = true;
    }
    if (d > lim - 0.35) touching = true;
  }
  f.pressedCage = touching;
  return touching;
}

/** Distance from a point to the fence (positive inside). */
export function cageGap(x, z) {
  let g = Infinity;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g = Math.min(g, OCT_APOTHEM - (x * Math.cos(a) + z * Math.sin(a)));
  }
  return g;
}

/** Push two standing fighters apart so they never overlap. */
export function separate(a, b, min) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz) || 1e-4;
  if (d >= min) return;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.pos.x -= nx * push;
  a.pos.z -= nz * push;
  b.pos.x += nx * push;
  b.pos.z += nz * push;
  // kill closing velocity
  const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
  if (rel < 0) {
    a.vel.x += (nx * rel) / 2;
    a.vel.z += (nz * rel) / 2;
    b.vel.x -= (nx * rel) / 2;
    b.vel.z -= (nz * rel) / 2;
  }
}

/** Per-second stamina regen / drain. */
export function stepStamina(f, dt) {
  const A = f.A;
  const max = staMax(f);
  const base = (7 + A.cardio * 0.075) * (0.55 + 0.45 * (f.hp.body / 100));
  const t = f.act.type;
  let k = 1;
  if (t === "move") k = 0.55;
  else if (t === "block" || t === "blockHit") k = 0.35;
  else if (t === "attack" || t === "dodge" || t === "shoot") k = 0;
  else if (t === "clinch" || t === "ground") k = 0.4;
  else if (t === "sub") k = 0;
  else if (t === "down") k = 1.4;
  f.sta = clamp(f.sta + base * k * dt, 0, max);
  // daze recovers over time (faster for durable, well-conditioned fighters)
  f.daze = Math.max(0, f.daze - (4 + A.chin * 0.04 + A.cardio * 0.02) * dt);
}

export function spend(f, amount) {
  f.sta = Math.max(0, f.sta - amount);
}
