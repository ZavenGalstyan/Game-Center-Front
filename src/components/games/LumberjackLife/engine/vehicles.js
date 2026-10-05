/**
 * Lumberjack Life — the hand cart and the drivable vehicles.
 *
 * Arcade handling, stability first: a kinematic bicycle model (speed,
 * steering angle, yaw rate = v·tan(steer)/wheelbase), terrain-following
 * height/pitch/roll sampled under the wheels, slope limits, and positional
 * collision pushes (never impulses) against trunks, stumps, rocks, the mill
 * and fallen trunks. Trailers use hitch kinematics.
 *
 * Cargo is real: every log on a bed has owner CART/BED and a slot; the
 * renderer draws each one.
 */
import { clamp, wrap, damp } from "./math.js";
import { PLAY_RADIUS } from "../data/regions.js";
import { MILL_LAYOUT, millToWorld } from "./mill.js";
import { vehicleById } from "../data/equipment.js";

export const CART = { handle: 1.45, radius: 0.62, bedLen: 1.7, perRow: 3, spacing: 0.34, lift: 0.3 };

export const VEH_DIM = {
  tractor: { wheelbase: 2.05, circles: [[0, 1.05, 0.95], [0, -0.75, 0.95]], hitch: -1.85, trailerLen: 2.55, trailerCircles: [[0, 0.95, 1.0], [0, -0.95, 1.0]], bedOnTrailer: true, maxSteer: 0.6, seat: [0, 1.45, -0.35] },
  truck: { wheelbase: 4.1, circles: [[0, 2.6, 1.1], [0, 0.6, 1.1], [0, -1.6, 1.1]], hitch: null, bedOnTrailer: false, maxSteer: 0.52, seat: [0.45, 1.75, 2.35] },
};

export function createCart(home) {
  return {
    id: "cart",
    kind: "cart",
    x: home.x,
    z: home.z,
    yaw: home.yaw,
    y: 0,
    pitch: 0,
    roll: 0,
    logs: [],
    cap: 5,
    pulled: false,
    wheel: 0,
  };
}

export function createVehicle(defId, x, z, yaw) {
  const def = vehicleById(defId);
  const dim = VEH_DIM[def.kind === "truck" ? "truck" : "tractor"];
  const v = {
    id: def.id,
    def,
    kind: def.kind,
    dim,
    x,
    z,
    yaw,
    y: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    steer: 0,
    throttle: 0,
    occupied: false,
    logs: [],
    cap: def.capacity,
    wheel: 0,
    trailer: null,
  };
  if (dim.bedOnTrailer) {
    const hx = x + Math.sin(yaw) * dim.hitch;
    const hz = z + Math.cos(yaw) * dim.hitch;
    v.trailer = { x: hx - Math.sin(yaw) * dim.trailerLen, z: hz - Math.cos(yaw) * dim.trailerLen, yaw, y: 0, pitch: 0, roll: 0, wheel: 0 };
  }
  return v;
}

/* ------------------------------------------------------------ terrain pose */
function groundPose(world, o, halfLen, halfWid) {
  const H = world.terrain.heightAt;
  const fx = Math.sin(o.yaw);
  const fz = Math.cos(o.yaw);
  const rx = -fz;
  const rz = fx;
  const hf = H(o.x + fx * halfLen, o.z + fz * halfLen);
  const hb = H(o.x - fx * halfLen, o.z - fz * halfLen);
  const hr = H(o.x + rx * halfWid, o.z + rz * halfWid);
  const hl = H(o.x - rx * halfWid, o.z - rz * halfWid);
  const hc = H(o.x, o.z);
  o.y = Math.max(hc, (hf + hb) / 2);
  o.pitch = Math.atan2(hf - hb, halfLen * 2);
  o.roll = Math.atan2(hr - hl, halfWid * 2);
}

/** bed reference point (where logs sit) in world space */
export function bedCenter(v) {
  if (v.kind === "cart") return { x: v.x, z: v.z, yaw: v.yaw };
  if (v.trailer) return { x: v.trailer.x, z: v.trailer.z, yaw: v.trailer.yaw };
  const back = -1.15;
  return { x: v.x + Math.sin(v.yaw) * back, z: v.z + Math.cos(v.yaw) * back, yaw: v.yaw };
}

export const bedFull = (v) => v.logs.length >= v.cap;

/* ------------------------------------------------------------ cart */
export function stepCart(world, dt) {
  const c = world.cart;
  if (!c) return;
  const P = world.player;
  if (c.pulled) {
    const fx = Math.sin(P.yaw);
    const fz = Math.cos(P.yaw);
    const hx = P.x - fx * 0.32;
    const hz = P.z - fz * 0.32;
    let dx = hx - c.x;
    let dz = hz - c.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const ox = c.x;
    const oz = c.z;
    c.yaw = Math.atan2(dx, dz);
    c.x = hx - dx * CART.handle;
    c.z = hz - dz * CART.handle;
    // collide the bed (two circles along the axis)
    for (const off of [0.45, -0.45]) {
      const px = c.x + dx * off;
      const pz = c.z + dz * off;
      const r = world.pushCircle(px, pz, CART.radius * 0.8, { logs: false, fallen: true, skipCart: true });
      c.x += r.x - px;
      c.z += r.z - pz;
    }
    // the cart is heavy: if it got stuck, the player can't run away from it
    const hx2 = c.x + Math.sin(c.yaw) * CART.handle;
    const hz2 = c.z + Math.cos(c.yaw) * CART.handle;
    const gap = Math.hypot(hx - hx2, hz - hz2);
    if (gap > 0.35) {
      const k = (gap - 0.35) / gap;
      P.x -= (hx - hx2) * k;
      P.z -= (hz - hz2) * k;
    }
    c.wheel += Math.hypot(c.x - ox, c.z - oz) / 0.36;
  }
  groundPose(world, c, 0.8, 0.5);
}

/* ------------------------------------------------------------ driving */
export function stepVehicle(world, v, inp, dt) {
  const dim = v.dim;
  const def = v.def;
  const driving = v.occupied && world.player.driving === v.id;
  const thr = driving && !world.inputLocked ? clamp(inp.ay, -1, 1) : 0;
  const steerIn = driving && !world.inputLocked ? clamp(inp.ax, -1, 1) : 0;
  const brake = driving && inp.brake;
  v.throttle = thr;
  v.steer = damp(v.steer, -steerIn * dim.maxSteer, 6, dt);

  const maxF = def.speed;
  const maxR = 3.6;
  if (brake) {
    v.speed = Math.abs(v.speed) < 0.3 ? 0 : v.speed - Math.sign(v.speed) * 12 * dt;
  } else if (thr > 0.05) {
    if (v.speed < -0.1) v.speed += 10 * dt;
    else v.speed = Math.min(maxF * thr, v.speed + def.accel * thr * dt);
  } else if (thr < -0.05) {
    if (v.speed > 0.1) v.speed -= 10 * dt;
    else v.speed = Math.max(-maxR * -thr, v.speed - 3.2 * -thr * dt);
  } else {
    const drag = 2.6 * dt;
    v.speed = Math.abs(v.speed) <= drag ? 0 : v.speed - Math.sign(v.speed) * drag;
  }
  // slopes: gravity along the heading, and a hard limit on what it can climb
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const slope = world.terrain.slopeAlong(v.x, v.z, fx, fz);
  v.speed -= 9.81 * slope * 0.35 * dt;
  if (slope * Math.sign(v.speed) > 0.55) v.speed *= 1 - Math.min(1, 6 * dt);
  if (!driving && Math.abs(v.speed) < 0.5) v.speed = 0; // parked: handbrake on

  // move
  const ox = v.x;
  const oz = v.z;
  v.yaw = wrap(v.yaw + (v.speed * Math.tan(v.steer) / dim.wheelbase) * dt);
  v.x += Math.sin(v.yaw) * v.speed * dt;
  v.z += Math.cos(v.yaw) * v.speed * dt;

  // collide
  let hit = 0;
  for (const [, oz2, r] of dim.circles) {
    const px = v.x + Math.sin(v.yaw) * oz2;
    const pz = v.z + Math.cos(v.yaw) * oz2;
    const res = world.pushCircle(px, pz, r, { logs: false, fallen: true, skipVehicle: v.id });
    const dx = res.x - px;
    const dz = res.z - pz;
    if (dx || dz) {
      v.x += dx;
      v.z += dz;
      hit = Math.max(hit, Math.hypot(dx, dz));
    }
    world.shoveLogs(px, pz, r);
  }
  const d = Math.hypot(v.x, v.z);
  if (d > PLAY_RADIUS + 4) {
    v.x *= (PLAY_RADIUS + 4) / d;
    v.z *= (PLAY_RADIUS + 4) / d;
    hit = Math.max(hit, 0.05);
  }
  if (hit > 0.004) {
    if (Math.abs(v.speed) > 2.2) world.emit({ type: "bump", x: v.x, z: v.z, power: Math.abs(v.speed) });
    v.speed *= -0.15;
  }
  const moved = Math.hypot(v.x - ox, v.z - oz);
  v.wheel += (moved / 0.55) * Math.sign(v.speed || 1);
  if (driving) world.stats.distanceDriven += moved;
  groundPose(world, v, dim.wheelbase * 0.55, 0.85);

  // trailer
  const t = v.trailer;
  if (t) {
    const hx = v.x + Math.sin(v.yaw) * dim.hitch;
    const hz = v.z + Math.cos(v.yaw) * dim.hitch;
    let dx = hx - t.x;
    let dz = hz - t.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const tox = t.x;
    const toz = t.z;
    t.yaw = Math.atan2(dx, dz);
    t.x = hx - dx * dim.trailerLen;
    t.z = hz - dz * dim.trailerLen;
    for (const [, oz2, r] of dim.trailerCircles) {
      const px = t.x + dx * oz2;
      const pz = t.z + dz * oz2;
      const res = world.pushCircle(px, pz, r * 0.85, { logs: false, fallen: true, skipVehicle: v.id });
      t.x += res.x - px;
      t.z += res.z - pz;
      world.shoveLogs(px, pz, r * 0.85);
    }
    // jack-knife guard
    const rel = wrap(t.yaw - v.yaw);
    if (Math.abs(rel) > 1.3) {
      t.yaw = wrap(v.yaw + Math.sign(rel) * 1.3);
      t.x = hx - Math.sin(t.yaw) * dim.trailerLen;
      t.z = hz - Math.cos(t.yaw) * dim.trailerLen;
    }
    t.wheel += Math.hypot(t.x - tox, t.z - toz) / 0.45;
    groundPose(world, t, 1.3, 0.9);
  }
}

/** driver's door: where the player must stand to get in */
export function doorPoint(v) {
  const side = v.kind === "truck" ? 1.6 : 1.2;
  const along = v.kind === "truck" ? 2.3 : -0.2;
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  return { x: v.x + Math.sin(v.yaw) * along + rx * side, z: v.z + Math.cos(v.yaw) * along + rz * side };
}

export function seatPoint(v) {
  const s = v.dim.seat;
  return { x: v.x + Math.sin(v.yaw) * s[2] + Math.cos(v.yaw) * -s[0], z: v.z + Math.cos(v.yaw) * s[2] - Math.sin(v.yaw) * -s[0] };
}

/** intake reach for a bed: is this cargo close enough to unload onto the deck? */
export function bedNearIntake(v) {
  const b = bedCenter(v);
  const p = millToWorld(MILL_LAYOUT.intake.x, MILL_LAYOUT.intake.z);
  return Math.hypot(b.x - p.x, b.z - p.z) < (v.kind === "cart" ? 4.2 : 8);
}
