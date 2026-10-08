/**
 * Police Escape 3D — arcade car physics on the flat city plane (used by the
 * player AND the police; traffic is kinematic, see traffic.js).
 *
 * State: position (x, z), heading h (forward = (sin h, cos h), + turns
 * left), world velocity (vx, vz). Each fixed step:
 *   - velocity is split into forward / sideways parts; the engine, brakes and
 *     drag act forward, tyre grip bleeds the sideways part away (much less
 *     with the handbrake → controlled slides); wet asphalt and sidewalks have
 *     less grip / more drag
 *   - steering yaw rate is speed-sensitive: quick at low speed, calm at speed,
 *     never an instant spin
 *   - two circles (front / rear axle) collide with the city's rectangles: the
 *     car is pushed out, the into-the-wall speed is removed (a little bounce),
 *     the heading eases along the wall so the car slides off instead of
 *     sticking, and hard impacts report damage
 * The car can't flip or leave the ground — it's an arcade model on purpose.
 */
import { solidsNear, surfaceAt } from "./city.js";
import { clamp, wrapAngle, approach } from "./util.js";

export const CAR_R = 1.05;
export const AXLE = 1.25;
const REVERSE_MAX = 12;

/** Physics parameters from the four 1..10 stats shown in the garage. */
export function paramsFor(stats) {
  const { speed = 5, accel = 5, handling = 5, durability = 5 } = stats;
  return {
    vmax: 31 + speed * 1.5, // 5 → 38.5 m/s ≈ 139 km/h
    accel: 9 + accel * 1.2,
    yawMax: 1.55 + handling * 0.12,
    grip: 6 + handling * 0.65,
    dmgMul: 1.35 - durability * 0.07, // damage taken multiplier
    mass: 1 + durability * 0.04,
    nitroV: 11,
    nitroA: 13,
  };
}

export function createCar(p, x, z, h) {
  return {
    p,
    x,
    z,
    h,
    vx: 0,
    vz: 0,
    fwd: 0,
    side: 0,
    steerVis: 0,
    throttle: 0,
    braking: false,
    handbrake: false,
    nitroOn: false,
    nitro: 0.6,
    slip: 0,
    wheelSpin: 0,
    surface: "road",
    wet: false,
    bump: 0, // visual body jolt
    lastHit: 0,
  };
}

export function placeCar(car, x, z, h) {
  car.x = x;
  car.z = z;
  car.h = h;
  car.vx = car.vz = car.fwd = car.side = 0;
  car.steerVis = 0;
  car.nitroOn = false;
}

/**
 * One fixed step. inp = { throttle, brake, steer (+ left), handbrake, nitro }.
 * extra: extra rectangles (roadblocks). Returns impacts [{ vn, x, z, kind }].
 */
export function stepCar(car, city, inp, dt, opts = {}) {
  const p = car.p;
  const impacts = [];
  // nitro (held; burns ~3.5 s per full tank)
  if (inp.nitro && car.nitro > 0.01 && !opts.noNitro) {
    car.nitroOn = true;
    car.nitro = Math.max(0, car.nitro - dt / 3.5);
  } else car.nitroOn = false;
  const steerIn = clamp(inp.steer || 0, -1, 1);
  const growing = Math.abs(steerIn) > Math.abs(car.steerVis) && Math.sign(steerIn) === Math.sign(car.steerVis || steerIn);
  car.steerVis = approach(car.steerVis, steerIn, (growing ? 4.2 : 7.5) * dt);
  car.handbrake = !!inp.handbrake;
  car.throttle = car.nitroOn ? 1 : inp.throttle || 0;

  const surf = surfaceAt(city, car.x, car.z);
  car.surface = surf.kind === "road" ? "road" : "side";
  car.wet = surf.wet;
  // steering first (speed-sensitive yaw), from the speed along the current nose
  const fwd0 = car.vx * Math.sin(car.h) + car.vz * Math.cos(car.h);
  const av = Math.abs(fwd0);
  const gain = clamp(av / 4.5, 0, 1) * (1 - 0.45 * clamp(av / p.vmax, 0, 1.3));
  const yaw = car.steerVis * p.yawMax * gain * Math.sign(fwd0 || 1) * (car.handbrake ? 1.7 : 1);
  car.h = wrapAngle(car.h + yaw * dt);
  // the world velocity stays put; seen from the new nose it now has a
  // sideways part, which tyre grip bleeds away (slowly with the handbrake)
  const sh = Math.sin(car.h);
  const ch = Math.cos(car.h);
  let fwd = car.vx * sh + car.vz * ch;
  let side = car.vx * ch - car.vz * sh;

  const sideK = car.surface === "side" ? 0.78 : 1;
  const vmaxEff = (p.vmax + (car.nitroOn ? p.nitroV : 0)) * sideK * (opts.speedMul || 1);
  const accEff = p.accel + (car.nitroOn ? p.nitroA : 0);
  let a = 0;
  car.braking = false;
  if (car.throttle > 0 && !(inp.brake && fwd > 1)) {
    if (fwd < -0.5) a = 24;
    else if (fwd < vmaxEff) a = accEff * car.throttle * (1 - Math.pow(Math.max(0, fwd) / vmaxEff, 2.2) * 0.93);
    else a = -(fwd - vmaxEff) * 1.8;
  } else if (inp.brake) {
    if (fwd > 0.8) {
      a = -26;
      car.braking = true;
    } else if (fwd > -REVERSE_MAX) a = -10;
  } else {
    const drag = 1.4 + 0.004 * fwd * fwd + (car.surface === "side" ? 3 : 0);
    a = -Math.sign(fwd) * Math.min(drag, Math.abs(fwd) / dt);
  }
  if (fwd > vmaxEff + 0.5 && !car.nitroOn) a = Math.min(a, -(fwd - vmaxEff) * 1.8);
  if (car.handbrake && Math.abs(fwd) > 1) a -= 7 * Math.sign(fwd);
  fwd += a * dt;
  const gripK = p.grip * (car.handbrake ? 0.14 : 1) * (car.wet ? 0.5 : 1) * (car.surface === "side" ? 0.85 : 1);
  side *= Math.exp(-gripK * dt);
  fwd *= 1 - Math.min(0.6, Math.abs(side) * 0.02) * dt;
  car.slip = side;
  car.vx = sh * fwd + ch * side;
  car.vz = ch * fwd - sh * side;
  car.fwd = fwd;
  car.side = side;

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.wheelSpin += (fwd * dt) / 0.36;
  car.bump *= Math.exp(-8 * dt);

  // --- collisions with the city (+ roadblocks) ---------------------------------------
  for (let iter = 0; iter < 2; iter++) {
    for (const k of [-1, 1]) {
      const cx = car.x + Math.sin(car.h) * AXLE * k;
      const cz = car.z + Math.cos(car.h) * AXLE * k;
      const hit = (s) => {
        const qx = clamp(cx, s.x0, s.x1);
        const qz = clamp(cz, s.z0, s.z1);
        let nx = cx - qx;
        let nz = cz - qz;
        let d = Math.hypot(nx, nz);
        let pen;
        if (d < 1e-6) {
          // centre inside: push out along the shallowest side
          const dl = cx - s.x0;
          const dr = s.x1 - cx;
          const dtp = cz - s.z0;
          const db = s.z1 - cz;
          const m = Math.min(dl, dr, dtp, db);
          nx = m === dl ? -1 : m === dr ? 1 : 0;
          nz = m === dtp ? -1 : m === db ? 1 : 0;
          if (nx && nz) nz = 0;
          pen = m + CAR_R;
        } else {
          if (d >= CAR_R) return;
          nx /= d;
          nz /= d;
          pen = CAR_R - d;
        }
        car.x += nx * pen;
        car.z += nz * pen;
        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) {
          car.vx -= (1.2 * vn) * nx;
          car.vz -= (1.2 * vn) * nz;
          // scrape: lose some speed along the wall, ease the heading along it
          const fr = 1 - Math.min(0.45, -vn * 0.035);
          car.vx *= fr;
          car.vz *= fr;
          const tx = -nz;
          const tz = nx;
          const along = Math.sign(Math.sin(car.h) * tx + Math.cos(car.h) * tz) || 1;
          const th = Math.atan2(tx * along, tz * along);
          car.h = wrapAngle(car.h + wrapAngle(th - car.h) * Math.min(1, -vn * 0.03));
          if (-vn > 2.5) impacts.push({ vn: -vn, x: cx - nx * CAR_R, z: cz - nz * CAR_R, kind: s.kind || "wall" });
        }
      };
      for (const i of solidsNear(city, cx, cz, CAR_R + 1)) hit(city.solids[i]);
      if (opts.extra) for (const s of opts.extra) if (Math.abs(s.x0 + s.x1 - 2 * cx) < s.x1 - s.x0 + 6 && Math.abs(s.z0 + s.z1 - 2 * cz) < s.z1 - s.z0 + 6) hit(s);
    }
  }
  const s2 = Math.sin(car.h);
  const c2 = Math.cos(car.h);
  car.fwd = car.vx * s2 + car.vz * c2;
  car.side = car.vx * c2 - car.vz * s2;
  return impacts;
}

/** Damage from an impact of normal speed vn (m/s): minor contacts are free. */
export function impactDamage(vn, p, k = 1) {
  if (vn < 7) return 0;
  return (vn - 7) * 1.9 * p.dmgMul * k;
}

export const kmh = (car) => Math.round(Math.abs(car.fwd) * 3.6);
