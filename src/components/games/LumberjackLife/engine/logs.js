/**
 * Lumberjack Life — logs. Every log has exactly ONE owner at a time:
 *
 *   WORLD      lying on the ground (simulated: settles, rolls on cross-slopes, sleeps)
 *   PLAYER     on the lumberjack's shoulder
 *   CART       on the hand cart bed (slot)
 *   BED        on a tractor trailer / truck bed (slot, holder = vehicle id)
 *   MILL       on the sawmill intake deck or being processed
 *   PROCESSED  turned into planks (then deleted from the map)
 *
 * Ownership only changes through `setOwner`, which validates the transition,
 * so a log can't be in two containers, picked up twice, or processed twice.
 *
 * Physics is deliberately small and stable: a resting log's height and pitch
 * come straight from the terrain under its two ends; it only moves by rolling
 * sideways down a cross-slope steeper than LOG.rollThreshold, with friction,
 * a speed cap and sleep. Logs push each other / obstacles apart positionally
 * (never by impulses), so nothing can launch or jitter forever.
 */
import { LOG } from "./constants.js";
import { clamp } from "./math.js";
import { PLAY_RADIUS } from "../data/regions.js";

export const OWNERS = ["WORLD", "PLAYER", "CART", "BED", "MILL", "PROCESSED"];

const LEGAL = {
  WORLD: ["PLAYER"],
  PLAYER: ["WORLD", "CART", "BED", "MILL"],
  CART: ["PLAYER", "MILL"],
  BED: ["PLAYER", "MILL"],
  MILL: ["PROCESSED"],
  PROCESSED: [],
};

export function spawnLog(world, { species, len, rA, rB, x, z, yaw, treeId = null, owner = "WORLD" }) {
  const id = `L${++world.logSeq}`;
  const log = {
    id,
    species,
    len,
    rA,
    rB,
    r: (rA + rB) / 2,
    x,
    z,
    y: 0,
    yaw,
    pitch: 0,
    roll: world.rng() * 6.28,
    v: 0,
    owner,
    holder: null,
    slot: -1,
    sleeping: false,
    sleepT: 0,
    collected: false,
    treeId,
  };
  world.logs.set(id, log);
  if (owner === "WORLD") restOnGround(world, log);
  return log;
}

/** Validated ownership change. Returns false (and changes nothing) if illegal. */
export function setOwner(world, log, owner, holder = null, slot = -1) {
  if (!log || !world.logs.has(log.id)) return false;
  if (!LEGAL[log.owner] || !LEGAL[log.owner].includes(owner)) return false;
  log.owner = owner;
  log.holder = holder;
  log.slot = slot;
  log.v = 0;
  log.sleeping = owner !== "WORLD";
  log.sleepT = 0;
  if (owner === "PROCESSED") world.logs.delete(log.id);
  return true;
}

export const logEnds = (log) => {
  const ax = Math.sin(log.yaw) * log.len * 0.5;
  const az = Math.cos(log.yaw) * log.len * 0.5;
  return { ax: log.x - ax, az: log.z - az, bx: log.x + ax, bz: log.z + az };
};

/** height + pitch from the terrain under both ends (never below the ground) */
export function restOnGround(world, log) {
  const H = world.terrain.heightAt;
  const e = logEnds(log);
  const ya = Math.max(H(e.ax, e.az), H((e.ax * 3 + log.x) / 4, (e.az * 3 + log.z) / 4)) + log.rA;
  const yb = Math.max(H(e.bx, e.bz), H((e.bx * 3 + log.x) / 4, (e.bz * 3 + log.z) / 4)) + log.rB;
  const ym = H(log.x, log.z) + log.r;
  log.y = Math.max((ya + yb) / 2, ym);
  log.pitch = Math.atan2(yb - ya, log.len);
}

/** cross-slope (rise per metre perpendicular to the log axis) */
function crossSlope(world, log) {
  const px = Math.cos(log.yaw);
  const pz = -Math.sin(log.yaw);
  return world.terrain.slopeAlong(log.x, log.z, px, pz);
}

export function stepLogs(world, dt) {
  for (const log of world.logs.values()) {
    if (log.owner !== "WORLD" || log.sleeping) continue;
    const s = crossSlope(world, log);
    // gravity component along the perpendicular (downhill = −slope)
    if (Math.abs(s) > LOG.rollThreshold || Math.abs(log.v) > LOG.sleepSpeed) {
      log.v += -s * LOG.rollAccel * dt;
    }
    const f = LOG.rollFriction * dt;
    log.v = Math.abs(log.v) <= f ? 0 : log.v - Math.sign(log.v) * f;
    log.v = clamp(log.v, -LOG.maxRoll, LOG.maxRoll);
    if (log.v !== 0) {
      const px = Math.cos(log.yaw);
      const pz = -Math.sin(log.yaw);
      log.x += px * log.v * dt;
      log.z += pz * log.v * dt;
      log.roll += (log.v * dt) / Math.max(0.08, log.r);
    }
    // obstacles + other logs (positional only)
    const push = world.pushLog(log);
    if (push > 0.002) log.v *= 0.4;
    // stay in the valley
    const d = Math.hypot(log.x, log.z);
    if (d > PLAY_RADIUS + 3) {
      log.x *= (PLAY_RADIUS + 3) / d;
      log.z *= (PLAY_RADIUS + 3) / d;
      log.v = 0;
    }
    restOnGround(world, log);
    if (Math.abs(log.v) < LOG.sleepSpeed && push < 0.003) {
      log.sleepT += dt;
      if (log.sleepT > LOG.sleepTime) {
        log.sleeping = true;
        log.v = 0;
      }
    } else log.sleepT = 0;
  }
}

/** wake resting logs near a point (something landed / was removed nearby) */
export function wakeLogs(world, x, z, r) {
  for (const log of world.logs.values()) {
    if (log.owner === "WORLD" && Math.hypot(log.x - x, log.z - z) < r + log.len / 2) {
      log.sleeping = false;
      log.sleepT = 0;
    }
  }
}

/**
 * Stack layout for N slots on a bed: rows of `perRow`, each row nesting in
 * the gaps of the row below. Returns local {x (across), y (up), z (along)}.
 */
export function stackSlot(i, perRow, spacing, rowLift) {
  let row = 0;
  let n = perRow;
  let idx = i;
  while (idx >= n && n > 1) {
    idx -= n;
    row++;
    n--;
  }
  const width = (n - 1) * spacing;
  return { x: -width / 2 + idx * spacing, y: row * rowLift, row };
}
