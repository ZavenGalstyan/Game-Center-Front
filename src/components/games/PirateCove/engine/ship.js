/**
 * Pirate Cove — ship physics. Arcade, not a sailing exam:
 *
 *  - `throttle` is the sail setting (-0.2 … 1). Holding W/S trims it and it
 *    stays where you leave it, like real canvas — no key-holding marathons.
 *  - speed eases toward throttle × maxSpeed (heavier ships ease slower);
 *    turning bleeds a little speed.
 *  - steering has inertia: the rudder eases in, angular velocity eases toward
 *    the rudder target, and steerage way matters (a stopped ship turns slowly).
 *  - a small lateral slip decays quickly — enough to feel the hull carry
 *    through a turn, never car-like drift.
 *  - the visual pose (bob, pitch, roll, heel into turns) is derived from the
 *    shared swell in waves.js.
 *
 * Heading θ: forward = (sin θ, cos θ) in (x, z); right = (-cos θ, sin θ).
 */
import { waveHeight } from "./waves.js";
import { clamp, wrapAngle } from "./rng.js";
import { SHIP_DRAFT } from "./terrain.js";

export function forwardOf(h) {
  return { x: Math.sin(h), z: Math.cos(h) };
}
export function rightOf(h) {
  return { x: -Math.cos(h), z: Math.sin(h) };
}

let nextId = 1;

export function createShip(stats, opts = {}) {
  return {
    id: opts.id || `ship${nextId++}`,
    team: opts.team || "enemy",
    stats,
    look: opts.look || {},
    typeId: opts.typeId || stats.id,
    name: opts.name || stats.name,
    boss: !!opts.boss,
    x: opts.x || 0,
    z: opts.z || 0,
    heading: opts.heading || 0,
    speed: opts.speed || 0,
    lat: 0,
    angVel: 0,
    throttle: opts.throttle ?? 0,
    rudder: 0,
    hull: opts.hull ?? stats.hull,
    maxHull: stats.hull,
    alive: true,
    sinking: false,
    sinkT: 0,
    removed: false,
    docked: false,
    // render pose
    y: 0,
    pitch: 0,
    roll: 0,
    heel: 0,
    // cannons: reload deadlines (game time); `pending` holds rippling broadside shots
    reload: { left: 0, right: 0, bow: 0 },
    pending: [],
    lastHitAt: -99,
    lastScrape: -99,
    grounded: 0,
    recoil: { left: 0, right: 0 },
    damageFlash: 0,
    smoke: 0,
    group: opts.group || null,
    spawnIndex: opts.spawnIndex ?? 0,
    ai: null,
    looted: false,
    distance: 0,
  };
}

/** Hull sample points (bow → stern) for grounding, in ship-local metres along the keel. */
function keelSamples(L) {
  return [0.46 * L, 0.2 * L, -0.1 * L, -0.42 * L];
}

/**
 * One fixed step. `ctrl` = { throttleDelta, steer, setThrottle? } in -1..1.
 * `env` = { terrain, time, waveAmp, boundary:{r, warn} }. Returns impact info for audio/FX.
 */
export function stepShip(s, ctrl, env, dt) {
  const st = s.stats;
  if (s.docked) {
    s.speed = 0;
    s.angVel = 0;
    s.lat = 0;
    s.rudder = 0;
    pose(s, env, dt);
    return null;
  }
  if (!s.alive) {
    // Drift to a stop while sinking.
    s.speed *= Math.exp(-dt * 0.6);
    s.angVel *= Math.exp(-dt * 1.2);
    s.heading = wrapAngle(s.heading + s.angVel * dt);
    const f = forwardOf(s.heading);
    s.x += f.x * s.speed * dt;
    s.z += f.z * s.speed * dt;
    s.sinkT += dt;
    pose(s, env, dt);
    return null;
  }

  // --- sail setting
  if (ctrl.setThrottle != null) s.throttle = clamp(ctrl.setThrottle, -0.2, 1);
  else if (ctrl.throttleDelta) s.throttle = clamp(s.throttle + ctrl.throttleDelta * dt * (ctrl.throttleDelta > 0 ? 0.75 : 0.95), -0.2, 1);

  const target = s.throttle >= 0 ? s.throttle * st.maxSpeed : s.throttle * st.maxSpeed * 1.25;
  const heavy = st.length / 13; // 1 sloop … ~1.9 galleon
  if (s.speed < target) {
    const a = st.accel * (1 - 0.45 * clamp(s.speed / st.maxSpeed, 0, 1));
    s.speed = Math.min(target, s.speed + a * dt);
  } else {
    const d = (st.accel * 0.75 + Math.abs(s.speed - target) * 0.25) / Math.sqrt(heavy);
    s.speed = Math.max(target, s.speed - d * dt);
  }

  // --- steering with inertia
  const steer = clamp(ctrl.steer || 0, -1, 1);
  s.rudder += (steer - s.rudder) * Math.min(1, dt * 3.2);
  const way = clamp(Math.abs(s.speed) / (st.maxSpeed * 0.5), 0, 1);
  const eff = 0.32 + 0.68 * way;
  const dir = s.speed < -0.2 ? -0.6 : 1;
  const angTarget = s.rudder * st.turnRate * eff * dir;
  s.angVel += (angTarget - s.angVel) * Math.min(1, (dt * 2.4) / Math.sqrt(heavy));
  s.heading = wrapAngle(s.heading + s.angVel * dt);
  s.speed -= Math.abs(s.angVel) * s.speed * 0.1 * dt;

  // a touch of carry through turns, decaying fast
  s.lat += -s.angVel * s.speed * 0.07 * dt;
  s.lat *= Math.exp(-dt * 2.6);

  const f = forwardOf(s.heading);
  const r = rightOf(s.heading);
  const vx = f.x * s.speed + r.x * s.lat;
  const vz = f.z * s.speed + r.z * s.lat;
  s.x += vx * dt;
  s.z += vz * dt;
  s.distance += Math.hypot(vx, vz) * dt;

  const impact = collideTerrain(s, env, dt);
  boundary(s, env, dt);
  pose(s, env, dt);
  return impact;
}

/** Pushes the hull off any shoal/rock/island it overlaps; slows it; reports hard impacts. */
function collideTerrain(s, env, dt) {
  const T = env.terrain;
  const L = s.stats.length;
  const B = s.stats.beam;
  const f = forwardOf(s.heading);
  const r = rightOf(s.heading);
  let impact = null;
  let touching = false;
  for (const along of keelSamples(L)) {
    for (const across of [0, -B * 0.42, B * 0.42]) {
      const px = s.x + f.x * along + r.x * across;
      const pz = s.z + f.z * along + r.z * across;
      const h = T.height(px, pz);
      if (h <= SHIP_DRAFT) continue;
      touching = true;
      const [gx, gz] = T.grad(px, pz, 0.8);
      let gl = Math.hypot(gx, gz);
      let nx;
      let nz;
      if (gl < 1e-4) {
        // Flat top (rare): push straight back along the hull.
        nx = -f.x * Math.sign(s.speed || 1);
        nz = -f.z * Math.sign(s.speed || 1);
        gl = 1;
      } else {
        nx = -gx / gl;
        nz = -gz / gl;
      }
      const pen = Math.min(1.2, (h - SHIP_DRAFT) * 0.35 + 0.05);
      s.x += nx * pen;
      s.z += nz * pen;
      // velocity into the slope
      const into = -(f.x * nx + f.z * nz) * s.speed;
      if (into > 0.5) {
        const now = env.time;
        if (now - s.lastScrape > 0.7) {
          s.lastScrape = now;
          impact = { x: px, z: pz, speed: into };
        }
        s.speed *= 0.55;
      }
    }
  }
  s.grounded = touching ? Math.min(3, s.grounded + dt) : Math.max(0, s.grounded - dt * 2);
  if (touching) s.speed *= Math.exp(-dt * 1.5);
  return impact;
}

/** Soft sea edge: past `warn` the current grows and turns the bow home; never a hard wall in open water. */
function boundary(s, env, dt) {
  const b = env.boundary;
  if (!b) return;
  const d = Math.hypot(s.x - (b.cx || 0), s.z - (b.cz || 0));
  s.outside = d > b.warn ? clamp((d - b.warn) / (b.r - b.warn), 0, 1.5) : 0;
  if (s.outside <= 0) return;
  const home = Math.atan2((b.cx || 0) - s.x, (b.cz || 0) - s.z);
  const diff = wrapAngle(home - s.heading);
  s.heading = wrapAngle(s.heading + Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.5 * s.outside));
  // current pushes back toward the centre
  const push = 4 * s.outside * dt;
  s.x += ((b.cx || 0) - s.x) / d * push;
  s.z += ((b.cz || 0) - s.z) / d * push;
  if (s.outside > 1) s.speed = Math.min(s.speed, s.stats.maxSpeed * 0.4);
  if (d > b.r + 50) {
    s.x = (b.cx || 0) + ((s.x - (b.cx || 0)) / d) * (b.r + 50);
    s.z = (b.cz || 0) + ((s.z - (b.cz || 0)) / d) * (b.r + 50);
  }
}

/** Bob / pitch / roll / heel from the swell. Smoothed so short chop never jitters the camera. */
function pose(s, env, dt) {
  const L = s.stats.length;
  const B = s.stats.beam;
  const A = env.waveAmp;
  const t = env.time;
  const f = forwardOf(s.heading);
  const r = rightOf(s.heading);
  const hb = waveHeight(s.x + f.x * L * 0.4, s.z + f.z * L * 0.4, t, A);
  const hs = waveHeight(s.x - f.x * L * 0.4, s.z - f.z * L * 0.4, t, A);
  const hp = waveHeight(s.x - r.x * B * 0.6, s.z - r.z * B * 0.6, t, A);
  const hr = waveHeight(s.x + r.x * B * 0.6, s.z + r.z * B * 0.6, t, A);
  const hc = waveHeight(s.x, s.z, t, A);
  const k = Math.min(1, dt * 4);
  const big = 13 / L; // larger hulls ride the swell more calmly
  let ty = (hb + hs + hp + hr + hc * 2) / 6;
  let tp = Math.atan2(hb - hs, L * 0.8) * (0.7 + 0.3 * big) - clamp(s.speed / s.stats.maxSpeed, 0, 1) * 0.025;
  let tr = Math.atan2(hp - hr, B * 1.2) * 0.45 * big;
  const heelT = clamp(-s.angVel * s.speed * 0.045, -0.2, 0.2);
  s.heel += (heelT - s.heel) * Math.min(1, dt * 2);
  if (!s.alive) {
    const sk = s.sinkT;
    ty -= Math.min(9, sk * sk * 0.12 + sk * 0.35);
    tp += Math.min(0.5, sk * 0.06) * (s.spawnIndex % 2 ? 1 : -1);
    tr += Math.min(0.75, sk * 0.11);
  }
  s.y += (ty - s.y) * k;
  s.pitch += (tp - s.pitch) * k;
  s.roll += (tr + s.heel - s.roll) * k;
}

/** Ship ↔ ship: three circles per hull, pushed apart; a hard ram hurts both a little. */
export function collideShips(ships, time, onRam) {
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i];
    if (a.removed || a.sinkT > 6) continue;
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j];
      if (b.removed || b.sinkT > 6) continue;
      const reach = (a.stats.length + b.stats.length) * 0.5 + 2;
      if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
      const fa = forwardOf(a.heading);
      const fb = forwardOf(b.heading);
      const ra = a.stats.beam * 0.55;
      const rb = b.stats.beam * 0.55;
      for (const sa of [-0.33, 0, 0.33]) {
        for (const sb of [-0.33, 0, 0.33]) {
          const ax = a.x + fa.x * sa * a.stats.length;
          const az = a.z + fa.z * sa * a.stats.length;
          const bx = b.x + fb.x * sb * b.stats.length;
          const bz = b.z + fb.z * sb * b.stats.length;
          const dx = bx - ax;
          const dz = bz - az;
          const d = Math.hypot(dx, dz);
          const min = ra + rb;
          if (d >= min || d < 1e-5) continue;
          const nx = dx / d;
          const nz = dz / d;
          const pen = (min - d) * 0.5;
          const wa = b.stats.length / (a.stats.length + b.stats.length);
          const wb = 1 - wa;
          if (!a.docked) {
            a.x -= nx * pen * wa * 2;
            a.z -= nz * pen * wa * 2;
          }
          if (!b.docked) {
            b.x += nx * pen * wb * 2;
            b.z += nz * pen * wb * 2;
          }
          const rel = (fa.x * a.speed - fb.x * b.speed) * nx + (fa.z * a.speed - fb.z * b.speed) * nz;
          if (rel > 2.5 && time - (a.lastRam || -9) > 1 && time - (b.lastRam || -9) > 1) {
            a.lastRam = b.lastRam = time;
            onRam?.(a, b, rel, (ax + bx) / 2, (az + bz) / 2);
          }
          a.speed *= 0.985;
          b.speed *= 0.985;
        }
      }
    }
  }
}
