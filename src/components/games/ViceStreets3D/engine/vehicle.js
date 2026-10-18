/**
 * Vice Streets 3D — arcade vehicle physics (framework-free, delta-time).
 *
 * A kinematic bicycle model on the ground plane:
 *   • forward speed from engine force (falls off toward top speed), brakes,
 *     reverse, rolling + air drag and the slope under the car;
 *   • yaw rate = v · tan(steer) / wheelbase, with the steering lock shrinking
 *     with speed (speed-dependent turning);
 *   • sideways velocity is bled off by tyre grip each step, so cars track
 *     where they point; the handbrake drops rear grip for a controlled slide;
 *   • the body is three circles along its length for collisions with the
 *     city (push out, bounce, scrape, impact damage) and with other cars;
 *   • cosmetic suspension: pitch under acceleration / braking, roll in turns,
 *     bounce over kerbs, wheel spin and steer angles for the renderer.
 *
 * Every car in the city — player, traffic, police, racers — runs this model;
 * AI only produces inputs.
 */
import { vehicleStats } from "../data/vehicles.js";
import { clamp, damp, wrapA, headingOf } from "./util.js";

let NEXT_ID = 1;
export const REVERSE_TOP = 11;

export function makeVehicle(type, x, z, h, opts = {}) {
  const st = vehicleStats(type, opts.upgrades || {});
  return {
    id: NEXT_ID++,
    type,
    st,
    x,
    z,
    y: 0,
    h,
    vx: 0,
    vz: 0,
    vf: 0,
    vl: 0,
    yawRate: 0,
    steer: 0,
    hp: opts.hp ?? st.hp,
    wrecked: false,
    paint: opts.paint || st.paint,
    owner: opts.owner || null, // "player" when it belongs to the player's garage
    garageId: opts.garageId || null,
    role: opts.role || "parked", // parked | traffic | police | racer | mission | player
    driver: null, // "player" | "ai" | null
    locked: !!opts.locked,
    lights: false,
    siren: false,
    horn: 0,
    brakeLight: 0,
    reverseLight: 0,
    wheelRot: 0,
    wheelSteer: 0,
    pitch: 0,
    roll: 0,
    bounce: 0,
    bounceV: 0,
    lastHit: 0,
    hitCool: 0,
    skid: 0,
    slip: 0,
    throttle: 0,
    rpm: 0,
    stuckT: 0,
    input: { throttle: 0, brake: 0, steer: 0, handbrake: false },
    persistent: !!opts.persistent,
    ...opts.extra,
  };
}

export function setUpgrades(v, up) {
  const frac = v.hp / v.st.hp;
  v.st = vehicleStats(v.type, up);
  v.hp = clamp(frac, 0, 1) * v.st.hp;
}

export const fwd = (v) => [Math.sin(v.h), Math.cos(v.h)];
/** circles (x, z, r) covering the body, front first */
export function bodyCircles(v, out = []) {
  const r = v.st.wid / 2;
  const off = v.st.len / 2 - r;
  const fx = Math.sin(v.h);
  const fz = Math.cos(v.h);
  out.length = 3;
  out[0] = { x: v.x + fx * off, z: v.z + fz * off, r, o: off };
  out[1] = { x: v.x, z: v.z, r: r * 1.02, o: 0 };
  out[2] = { x: v.x - fx * off, z: v.z - fz * off, r, o: -off };
  return out;
}

/**
 * Step one vehicle. `world` = { col (Collision), city, t } ; returns impact info
 * { impact (m/s into the wall), x, z } when it hit something solid this step.
 */
export function stepVehicle(v, dt, world) {
  const S = v.st;
  const inp = v.input;
  const fx = Math.sin(v.h);
  const fz = Math.cos(v.h);
  const rx = -fz;
  const rz = fx;
  let vf = v.vx * fx + v.vz * fz;
  let vl = v.vx * rx + v.vz * rz;
  const dead = v.wrecked || v.hp <= 0;
  const throttle = dead ? 0 : clamp(inp.throttle, -1, 1);
  const brake = clamp(inp.brake, 0, 1);
  const hb = !!inp.handbrake;

  // ---- longitudinal
  let a = 0;
  if (throttle > 0) {
    if (vf < -0.5) a += S.brake * throttle; // pressing forward while rolling back brakes first
    else a += S.accel * throttle * Math.max(0, 1 - Math.pow(Math.max(0, vf) / S.top, 2.2));
  } else if (throttle < 0) {
    // reverse gear
    if (vf > 0.5) a -= S.brake * -throttle;
    else a -= S.accel * 0.55 * -throttle * Math.max(0, 1 - Math.pow(Math.max(0, -vf) / REVERSE_TOP, 2));
  }
  const sgn = Math.sign(vf);
  let decel = 0.35 + 0.00045 * vf * vf; // rolling + air drag
  if (brake > 0) decel += S.brake * brake;
  if (hb) decel += 5.5;
  if (dead) decel += 2.5;
  // slope: gravity along the heading
  if (world.city) {
    const g0 = world.city.groundAt(v.x - fx * 1.2, v.z - fz * 1.2);
    const g1 = world.city.groundAt(v.x + fx * 1.2, v.z + fz * 1.2);
    a -= 9.8 * ((g1 - g0) / 2.4) * 0.85;
  }
  vf += a * dt;
  if (sgn !== 0) {
    const d = decel * dt;
    if (Math.abs(vf) <= d && Math.abs(throttle) < 0.05) vf = 0;
    else if (Math.abs(vf) > d) vf -= Math.sign(vf) * d;
    else vf = 0;
  }
  if (vf > S.top * 1.08) vf = S.top * 1.08;
  if (vf < -REVERSE_TOP * 1.1) vf = -REVERSE_TOP * 1.1;

  // ---- steering (lock shrinks with speed), +steer = right = heading decreases
  // arcade steering: near-full lock at parking speed (tight U-turns), easing to
  // ~half at 30 m/s for stability; the wheels reach the input in ~0.1 s
  const spd = Math.abs(vf);
  const lock = S.steer * (0.45 + 0.55 / (1 + (spd * spd) / (16 * 16)));
  const target = clamp(inp.steer, -1, 1) * lock * (dead ? 0.6 : 1);
  v.steer = damp(v.steer, target, Math.abs(target) > Math.abs(v.steer) ? 16 : 20, dt);
  // in a handbrake slide the car keeps rotating on its whole speed, not just
  // the (collapsing) forward part, so the tail swings right round
  const vYaw = hb ? (vf < -1 ? -1 : 1) * Math.hypot(vf, vl) : vf;
  let yaw = (vYaw * Math.tan(v.steer)) / S.wheelbase;
  // the handbrake swings the tail out; arcade tyre grip caps how hard a car can
  // turn (well above real tyres — cars corner like a GTA car, never spin out)
  const gripMax = 24 * (S.grip / 10);
  const latA = Math.abs(yaw * vYaw);
  if (latA > gripMax && spd > 1) {
    yaw *= gripMax / latA;
    v.slip = clamp((latA - gripMax) / 8, 0, 1);
  } else v.slip = damp(v.slip, 0, 6, dt);
  // handbrake: the locked rear lets the tail come round past the grip limit
  if (hb && spd > 4) yaw *= 1.6;
  v.yawRate = damp(v.yawRate, -yaw, 22, dt);
  v.h = wrapA(v.h + v.yawRate * dt);

  // ---- lateral grip: sideways speed bleeds off (much less with the handbrake)
  const grip = hb ? 1.6 : S.grip;
  vl *= Math.exp(-grip * dt);
  // the body turned this step but the velocity did not: re-express it in the
  // new heading (the leftover sideways part is what grip bleeds off next step)
  const nfx = Math.sin(v.h);
  const nfz = Math.cos(v.h);
  const nrx = -nfz;
  const nrz = nfx;
  const ovx = fx * vf + rx * vl;
  const ovz = fz * vf + rz * vl;
  vf = ovx * nfx + ovz * nfz;
  vl = ovx * nrx + ovz * nrz;
  v.skid = clamp(Math.abs(vl) / 4 + (hb && spd > 6 ? 0.6 : 0) + (brake > 0.5 && spd > 12 ? 0.5 : 0), 0, 1);
  v.vx = nfx * vf + nrx * vl;
  v.vz = nfz * vf + nrz * vl;
  v.vf = vf;
  v.vl = vl;
  v.throttle = throttle;
  v.brakeLight = brake > 0.05 || (throttle < 0 && vf > 0.5) || (throttle > 0 && vf < -0.5) ? 1 : 0;
  v.reverseLight = vf < -0.3 && throttle < 0 ? 1 : 0;

  // ---- move + collide with the city
  const px = v.x;
  const pz = v.z;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  const hit = world.col ? collideStatic(v, world.col, world) : null;
  if (world.city) {
    const onRoad = world.city.onRoad(v.x, v.z);
    const gy = world.city.groundAt(v.x, v.z) + (onRoad ? 0 : 0.12);
    // one small jolt when a kerb is crossed (not a kick every frame while settling)
    if (v._onRoad !== undefined && onRoad !== v._onRoad && spd > 2) v.bounceV += (onRoad ? -0.35 : 0.8) * Math.min(1, spd / 15);
    v._onRoad = onRoad;
    v.y = Math.abs(gy - v.y) > 2 ? gy : damp(v.y, gy, 18, dt);
    // pitch of the ground itself (hills)
    const g0 = world.city.groundAt(v.x - nfx * 1.3, v.z - nfz * 1.3);
    const g1 = world.city.groundAt(v.x + nfx * 1.3, v.z + nfz * 1.3);
    v.slope = Math.atan2(g1 - g0, 2.6);
  }
  // ---- cosmetic suspension + wheels
  v.pitch = damp(v.pitch, clamp(-a * 0.0065 + (brake > 0 && vf > 1 ? 0.03 * brake : 0), -0.05, 0.05), 6, dt);
  v.roll = damp(v.roll, clamp(-v.yawRate * vf * 0.0042, -0.07, 0.07), 6, dt);
  v.bounceV += (-v.bounce * 160 - v.bounceV * 12) * dt;
  v.bounce += v.bounceV * dt;
  v.bounce = clamp(v.bounce, -0.08, 0.08);
  v.wheelRot += (vf * dt) / 0.34;
  v.wheelSteer = v.steer;
  v.rpm = damp(v.rpm, clamp(Math.abs(vf) / S.top, 0, 1) * 0.8 + Math.abs(throttle) * 0.25, 5, dt);
  v.moved = Math.hypot(v.x - px, v.z - pz);
  v.hitCool = Math.max(0, v.hitCool - dt);
  return hit;
}

const _circ = [];
/** push the body circles out of static boxes; returns impact info or null */
const _near = [];
function collideStatic(v, col, world) {
  const cs = bodyCircles(v, _circ);
  // lightweight street furniture breaks / gets knocked away instead of stopping the car
  if (world && world.breakProp) {
    for (const c of cs) {
      for (const s of col.near(c.x, c.z, c.r, _near)) {
        if (!s.prop || s.prop.broken || s.y1 <= v.y + 0.15) continue;
        const cx = c.x < s.x0 ? s.x0 : c.x > s.x1 ? s.x1 : c.x;
        const cz = c.z < s.z0 ? s.z0 : c.z > s.z1 ? s.z1 : c.z;
        let nx = c.x - cx;
        let nz = c.z - cz;
        const d = Math.hypot(nx, nz);
        if (d >= c.r) continue;
        if (d > 1e-4) {
          nx /= d;
          nz /= d;
        } else {
          const sp = Math.hypot(v.vx, v.vz) || 1;
          nx = -v.vx / sp;
          nz = -v.vz / sp;
        }
        const impact = Math.max(0, -(v.vx * nx + v.vz * nz));
        world.breakProp(v, s, impact, -nx, -nz);
      }
    }
  }
  let mx = 0;
  let mz = 0;
  let nx = 0;
  let nz = 0;
  let deepest = 0;
  let lever = 0;
  let solid = null;
  const feet = v.y + 0.15;
  for (const c of cs) {
    const p = { x: c.x, z: c.z };
    const r = col.pushCircle(p, c.r, feet, Math.max(1, v.st.hgt - 0.2), 0.3);
    if (r.hit > 0) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.abs(dx) > Math.abs(mx)) mx = dx;
      if (Math.abs(dz) > Math.abs(mz)) mz = dz;
      nx += r.nx;
      nz += r.nz;
      if (r.hit > deepest) {
        deepest = r.hit;
        lever = c.o;
        solid = r.solid;
      }
    }
  }
  if (deepest <= 0) return null;
  v.x += mx;
  v.z += mz;
  const L = Math.hypot(nx, nz) || 1;
  nx /= L;
  nz /= L;
  const vn = v.vx * nx + v.vz * nz;
  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    const e = impact > 6 ? 0.28 : 0.12;
    v.vx -= (1 + e) * vn * nx;
    v.vz -= (1 + e) * vn * nz;
    // scrape: lose some tangential speed too
    const k = impact > 4 ? 0.82 : 0.95;
    v.vx *= k;
    v.vz *= k;
    // off-centre hits twist the car
    const fx = Math.sin(v.h);
    const fz = Math.cos(v.h);
    const cross = fx * nz - fz * nx;
    v.yawRate += cross * Math.sign(lever) * Math.min(impact, 20) * 0.06;
  }
  return { impact, nx, nz, x: v.x - nx * v.st.wid * 0.5, z: v.z - nz * v.st.wid * 0.5, solid };
}

/** vehicle ↔ vehicle collision (circle sets, mass-weighted impulse) */
const _ca = [];
const _cb = [];
export function collideVehicles(a, b) {
  const R = (a.st.len + b.st.len) / 2 + 0.5;
  const dx0 = b.x - a.x;
  const dz0 = b.z - a.z;
  if (dx0 * dx0 + dz0 * dz0 > R * R) return null;
  const A = bodyCircles(a, _ca);
  const B = bodyCircles(b, _cb);
  let best = null;
  for (const ca of A) {
    for (const cb of B) {
      const dx = cb.x - ca.x;
      const dz = cb.z - ca.z;
      const rr = ca.r + cb.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const pen = rr - d;
      if (!best || pen > best.pen) best = { pen, nx: dx / d, nz: dz / d, ca, cb, x: ca.x + (dx / d) * ca.r, z: ca.z + (dz / d) * ca.r };
    }
  }
  if (!best) return null;
  const { nx, nz, pen } = best;
  const ma = a.fixed ? 1e9 : a.st.mass;
  const mb = b.fixed ? 1e9 : b.st.mass;
  const wa = mb / (ma + mb);
  const wb = ma / (ma + mb);
  a.x -= nx * pen * wa;
  a.z -= nz * pen * wa;
  b.x += nx * pen * wb;
  b.z += nz * pen * wb;
  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;
  const vn = rvx * nx + rvz * nz;
  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    const j = -(1 + 0.25) * vn;
    a.vx -= nx * j * wa;
    a.vz -= nz * j * wa;
    b.vx += nx * j * wb;
    b.vz += nz * j * wb;
    // spin from off-centre contact
    a.yawRate += (Math.sin(a.h) * nz - Math.cos(a.h) * nx) * Math.sign(best.ca.o || 0.01) * Math.min(impact, 15) * 0.05 * wa;
    b.yawRate -= (Math.sin(b.h) * nz - Math.cos(b.h) * nx) * Math.sign(best.cb.o || 0.01) * Math.min(impact, 15) * 0.05 * wb;
  }
  return { impact, x: best.x, z: best.z, nx, nz };
}

/** impact speed (m/s) → health damage */
export function crashDamage(v, impact) {
  if (impact < 3.2) return 0;
  // arcade-tough: no single hit takes more than 28% of a car's health
  const d = (impact - 3.2) * 1.6 * (v.st.dmgK || 1) * (v.st.hp / 120) ** 0.35;
  return Math.min(d, v.st.hp * 0.28);
}

/**
 * AI helper: inputs that steer toward (tx, tz) at a target speed.
 * Returns the heading error (rad) so callers can slow for sharp turns.
 */
export function steerToward(v, tx, tz, targetSpeed, opts = {}) {
  const want = headingOf(tx - v.x, tz - v.z);
  const err = wrapA(want - v.h); // + = target is to the left
  const vf = v.vf;
  const reversing = opts.reverse;
  const inp = v.input;
  if (reversing) {
    inp.steer = clamp(err * 2.2, -1, 1);
    inp.throttle = -0.8;
    inp.brake = 0;
    inp.handbrake = false;
    return err;
  }
  inp.steer = clamp((-err * (opts.gain || 2.4)) / (1 + Math.max(0, vf - 6) / 10), -1, 1);
  const sharp = Math.abs(err);
  let tgt = targetSpeed * (sharp > 0.9 ? 0.35 : sharp > 0.45 ? 0.65 : 1);
  if (opts.maxSpeed != null) tgt = Math.min(tgt, opts.maxSpeed);
  const dv = tgt - vf;
  if (dv > 0.4) {
    inp.throttle = clamp(dv / 4, 0.25, 1);
    inp.brake = 0;
  } else if (dv < -1.2) {
    inp.throttle = 0;
    inp.brake = clamp(-dv / 6, 0.2, 1);
  } else {
    inp.throttle = dv > 0 ? 0.25 : 0;
    inp.brake = 0;
  }
  inp.handbrake = false;
  return err;
}
