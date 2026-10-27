/**
 * Iron Arena — tank state and physics (fixed-step, delta-time based).
 *
 * The hull keeps a planar velocity split into forward and lateral parts:
 * tracks drive the forward speed toward the throttle target with
 * acceleration / braking / coasting, while lateral slip decays at a rate set
 * by surface grip (ice ≈ drifting). Yaw rate has its own inertia. Gravity
 * acts along slopes (steep climbs stall), tanks leave ledges and land, and
 * ride decks/ramps through arena.surfaceAt. Three collision circles along
 * the hull resolve against the static world; velocity into a wall is removed
 * so the tank slides instead of sticking.
 */
import { approach, approachAngle, clamp, damp, DEG, rotYXZ, unrotYXZ, wrap } from "./util.js";
import { STEP_UP } from "./arena.js";

const GRAV = 22; // a bit heavier than real gravity: tanks feel weighty
const MAX_SLOPE = 34 * DEG;

/** hull dimensions per model (length along z, width, height to turret ring) */
export const DIMS = {
  scout: { len: 5.6, wid: 3.0, hgt: 1.45, top: 2.25, barrel: 3.4, pivotZ: -0.3 },
  striker: { len: 6.6, wid: 3.4, hgt: 1.6, top: 2.55, barrel: 4.2, pivotZ: -0.2 },
  phantom: { len: 6.0, wid: 3.3, hgt: 1.35, top: 2.15, barrel: 3.4, pivotZ: -0.4 },
  blazer: { len: 6.3, wid: 3.5, hgt: 1.6, top: 2.6, barrel: 2.6, pivotZ: -0.1 },
  thunder: { len: 6.5, wid: 3.5, hgt: 1.6, top: 2.6, barrel: 3.4, pivotZ: -0.2 },
  guardian: { len: 7.1, wid: 3.9, hgt: 1.75, top: 2.8, barrel: 4.0, pivotZ: -0.3 },
  sniper: { len: 6.8, wid: 3.3, hgt: 1.5, top: 2.45, barrel: 5.6, pivotZ: -0.6 },
  titan: { len: 8.0, wid: 4.3, hgt: 1.95, top: 3.15, barrel: 4.6, pivotZ: -0.5 },
};
export const ELEV = {
  default: [-8 * DEG, 20 * DEG],
  titan: [-6 * DEG, 28 * DEG],
  sniper: [-7 * DEG, 16 * DEG],
};

const tmp = { x: 0, y: 0, z: 0 };
const tmp2 = { x: 0, y: 0, z: 0 };

export function createTank({ id, name, team, isPlayer, stats, skin, color, x, z, yaw, A }) {
  const dims = DIMS[stats.model] || DIMS.striker;
  const r = (dims.wid / 2) * 0.96;
  const off = dims.len / 2 - r;
  const t = {
    id,
    name,
    team,
    isPlayer: !!isPlayer,
    stats,
    tankId: stats.id,
    skin,
    color,
    dims,
    r,
    circles: off > 0.3 ? [-off, 0, off] : [0],
    elev: ELEV[stats.model] || ELEV.default,
    x,
    z,
    y: A.surfaceAt(x, z, 60).h,
    yaw,
    pitch: 0,
    roll: 0,
    vf: 0,
    vl: 0,
    vy: 0,
    w: 0,
    grounded: true,
    turret: 0,
    gun: 0,
    hp: stats.hp,
    alive: true,
    deathAt: 0,
    respawnAt: 0,
    protT: 0,
    input: { throttle: 0, steer: 0, ax: x + Math.sin(yaw) * 50, ay: 2, az: z + Math.cos(yaw) * 50, fire: false, ability: false },
    ws: { cd: 0, burstLeft: 0, burstT: 0, clip: stats.weapon.clip || 0, reloading: false, reloadT: 0, charging: false, chargeT: 0, heat: 0, overheated: false, flameAcc: 0, idleT: 0, firing: false },
    ab: { cd: 4, active: 0 },
    fx: { burnT: 0, burnDps: 0, burnBy: -1, shield: 0, nitro: 0, cloak: 0, focus: 0, over: 0, repair: 0, barrage: 0 },
    sinceHit: 99,
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    caps: 0,
    returns: 0,
    dealt: 0,
    shots: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    damagers: new Map(),
    carrying: -1,
    trackL: 0,
    trackR: 0,
    surface: "dirt",
    inWater: false,
    bump: 0,
    landV: 0,
    recoil: 0,
    speed: 0,
    prev: null,
    brain: null,
  };
  t.prev = snapshotPose(t, {});
  return t;
}

export function snapshotPose(t, out) {
  out.x = t.x;
  out.y = t.y;
  out.z = t.z;
  out.yaw = t.yaw;
  out.pitch = t.pitch;
  out.roll = t.roll;
  out.turret = t.turret;
  out.gun = t.gun;
  return out;
}

/** world position of the turret pivot */
export function pivot(t, out = {}) {
  rotYXZ(t.yaw, t.pitch, t.roll, 0, t.dims.hgt, t.dims.pivotZ, out);
  out.x += t.x;
  out.y += t.y;
  out.z += t.z;
  return out;
}
/** barrel direction (world) and muzzle position */
export function muzzle(t, out = {}) {
  const ce = Math.cos(t.gun);
  const lx = Math.sin(t.turret) * ce;
  const ly = Math.sin(t.gun);
  const lz = Math.cos(t.turret) * ce;
  rotYXZ(t.yaw, t.pitch, t.roll, lx, ly, lz, tmp2);
  out.dx = tmp2.x;
  out.dy = tmp2.y;
  out.dz = tmp2.z;
  // pivot + turret height offset + barrel
  rotYXZ(t.yaw, t.pitch, t.roll, 0, t.dims.hgt + 0.45, t.dims.pivotZ, tmp);
  const L = t.dims.barrel;
  out.x = t.x + tmp.x + out.dx * L;
  out.y = t.y + tmp.y + out.dy * L;
  out.z = t.z + tmp.z + out.dz * L;
  return out;
}

export function stepTank(t, A, dt, frozen = false) {
  snapshotPose(t, t.prev);
  if (!t.alive) return;
  const st = t.stats;
  const inp = t.input;
  const fx = t.fx;
  const throttle = frozen ? 0 : clamp(inp.throttle, -1, 1);
  const steer = frozen ? 0 : clamp(inp.steer, -1, 1);

  /* ---------------- surface */
  const sAt = A.surfaceAt(t.x, t.z, t.y + 0.1);
  const deck = sAt.deck;
  const surf = A.surfaceType(t.x, t.z, deck);
  t.surface = surf;
  t.inWater = surf === "water" || (!deck && A.inWater(t.x, t.z));
  const ice = surf === "ice";
  const grip = ice ? 0.9 : t.inWater ? 5 : 10;
  const nitro = fx.nitro > 0;
  const speedMul = (nitro ? 1.65 : 1) * (t.inWater ? A.water?.slow ?? 0.55 : 1) * (t.carrying >= 0 ? 0.92 : 1);
  const accelMul = (nitro ? 2 : 1) * (ice ? 0.45 : 1);
  const maxF = st.speed * speedMul;
  const maxR = st.speed * 0.5 * (t.inWater ? 0.6 : 1);

  /* ---------------- slope along the hull */
  let slopeF = 0;
  if (t.grounded) {
    const L = t.dims.len * 0.45;
    const fx0 = Math.sin(t.yaw);
    const fz0 = Math.cos(t.yaw);
    const hf = A.surfaceAt(t.x + fx0 * L, t.z + fz0 * L, t.y + 0.6).h;
    const hb = A.surfaceAt(t.x - fx0 * L, t.z - fz0 * L, t.y + 0.6).h;
    slopeF = Math.atan2(hf - hb, 2 * L); // > 0: nose uphill
  }

  if (t.grounded) {
    let target = throttle > 0 ? throttle * maxF : throttle * maxR;
    // engines can't push up slopes steeper than MAX_SLOPE
    if (target > 0 && slopeF > 0) target *= clamp((MAX_SLOPE - slopeF) / (10 * DEG), 0, 1);
    if (target < 0 && slopeF < 0) target *= clamp((MAX_SLOPE + slopeF) / (10 * DEG), 0, 1);
    const a = st.accel * accelMul;
    if (Math.abs(throttle) > 0.05 && Math.sign(target) !== Math.sign(t.vf) && Math.abs(t.vf) > 0.4) t.vf = approach(t.vf, 0, a * 2.4 * dt * (ice ? 0.4 : 1));
    else if (Math.abs(target) > Math.abs(t.vf) || Math.sign(target) !== Math.sign(t.vf)) t.vf = approach(t.vf, target, a * dt);
    else t.vf = approach(t.vf, target, a * (Math.abs(throttle) < 0.05 ? 0.9 : 1.6) * dt * (ice ? 0.25 : 1));
    // gravity along the slope
    t.vf -= GRAV * Math.sin(slopeF) * 0.55 * dt;
    // lateral slip decays with grip
    t.vl *= 1 - damp(grip, dt);
    // yaw with inertia (positive yaw = turn left)
    const turnK = 1 - 0.28 * clamp(Math.abs(t.vf) / Math.max(1, st.speed), 0, 1);
    const wT = -steer * st.turn * turnK * (nitro ? 1.1 : 1) * (t.inWater ? 0.75 : 1);
    t.w = approach(t.w, wT, st.turn * (ice ? 2.2 : 7) * dt);
  } else {
    t.w *= 1 - damp(1.5, dt);
  }
  const yaw0 = t.yaw;
  t.yaw = wrap(t.yaw + t.w * dt);

  /* ---------------- integrate planar motion */
  let sy = Math.sin(t.yaw);
  let cy = Math.cos(t.yaw);
  // forward (sy, cy), left (cy, -sy)
  let vx = sy * t.vf + cy * t.vl;
  let vz = cy * t.vf - sy * t.vl;
  const ox = t.x;
  const oz = t.z;
  t.x += vx * dt;
  t.z += vz * dt;

  /* ---------------- static collisions */
  t.bump = 0;
  let nxs = 0;
  let nzs = 0;
  let hits = 0;
  const resolve = () => {
    for (let pass = 0; pass < 2; pass++)
      for (const off of t.circles) {
        const cx = t.x + sy * off;
        const cz = t.z + cy * off;
        const p = A.collideCircle(cx, cz, t.r, t.y, t.dims.top);
        if (p.hit) {
          t.x += p.x - cx;
          t.z += p.z - cz;
          nxs += p.nx;
          nzs += p.nz;
          hits++;
        }
      }
  };
  resolve();
  if (hits && t.yaw !== yaw0 && t.circles.length > 1) {
    // wedged: if the turn left the hull overlapping something, the turn is blocked
    let resid = 0;
    for (const off of t.circles) {
      const cx = t.x + sy * off;
      const cz = t.z + cy * off;
      const p = A.collideCircle(cx, cz, t.r, t.y, t.dims.top);
      resid = Math.max(resid, Math.hypot(p.x - cx, p.z - cz));
    }
    if (resid > 0.12) {
      t.yaw = yaw0;
      t.w = 0;
      sy = Math.sin(t.yaw);
      cy = Math.cos(t.yaw);
      resolve();
    }
  }
  if (hits) {
    const nl = Math.hypot(nxs, nzs);
    if (nl > 1e-6) {
      const nx = nxs / nl;
      const nz = nzs / nl;
      const vn = vx * nx + vz * nz;
      if (vn < 0) {
        t.bump = -vn;
        vx -= nx * vn * 1.15;
        vz -= nz * vn * 1.15;
        // friction against the wall
        vx *= 0.97;
        vz *= 0.97;
        t.vf = vx * sy + vz * cy;
        t.vl = vx * cy - vz * sy;
      }
    }
  }
  t.speed = Math.hypot(t.x - ox, t.z - oz) / Math.max(1e-6, dt);

  /* ---------------- vertical */
  const L2 = t.dims.len * 0.42;
  const W2 = t.dims.wid * 0.42;
  const yRef = t.y + 0.1;
  const hc = A.surfaceAt(t.x, t.z, yRef).h;
  const hf = A.surfaceAt(t.x + sy * L2, t.z + cy * L2, yRef).h;
  const hb = A.surfaceAt(t.x - sy * L2, t.z - cy * L2, yRef).h;
  const hl = A.surfaceAt(t.x + cy * W2, t.z - sy * W2, yRef).h;
  const hr = A.surfaceAt(t.x - cy * W2, t.z + sy * W2, yRef).h;
  const ground = Math.max(hc, (hf + hb) / 2, (hl + hr) / 2);
  if (t.grounded) {
    if (ground >= t.y - 0.32 - Math.abs(t.vf) * dt * 0.7) {
      t.vy = (ground - t.y) / dt;
      t.y = ground;
    } else {
      t.grounded = false;
      t.vy = Math.min(t.vy, 0);
    }
  }
  if (!t.grounded) {
    t.vy -= GRAV * dt;
    t.y += t.vy * dt;
    if (t.y <= ground) {
      t.landV = -t.vy;
      t.y = ground;
      t.vy = 0;
      t.grounded = true;
    }
  }
  if (t.y < ground - STEP_UP) t.y = ground; // safety: never sink into the ground

  // hull attitude follows the surface (springy, visual + aiming)
  const tp = t.grounded ? -Math.atan2(hf - hb, 2 * L2) : t.pitch + 0.25 * dt;
  const tr = t.grounded ? Math.atan2(hl - hr, 2 * W2) : t.roll * 0.98;
  t.pitch += (clamp(tp, -0.6, 0.6) - t.pitch) * damp(12, dt);
  t.roll += (clamp(tr, -0.5, 0.5) - t.roll) * damp(12, dt);

  /* ---------------- tracks */
  const half = t.dims.wid / 2;
  t.trackL += (t.vf - t.w * half) * dt;
  t.trackR += (t.vf + t.w * half) * dt;

  aimTurret(t, dt, frozen);
  t.recoil = Math.max(0, t.recoil - dt * 3);
}

/** rotate turret / gun toward the input aim point at their servo speeds */
export function aimTurret(t, dt) {
  const inp = t.input;
  const pv = pivot(t, tmp);
  unrotYXZ(t.yaw, t.pitch, t.roll, inp.ax - pv.x, inp.ay - (pv.y + 0.45), inp.az - pv.z, tmp2);
  const dYaw = Math.atan2(tmp2.x, tmp2.z);
  const dEl = Math.atan2(tmp2.y, Math.hypot(tmp2.x, tmp2.z));
  t.turret = wrap(approachAngle(t.turret, dYaw, t.stats.turret * dt));
  t.gun = approach(t.gun, clamp(dEl, t.elev[0], t.elev[1]), 0.75 * dt);
}

/** push two overlapping tanks apart (circle sets) and exchange momentum */
export function collideTanks(a, b) {
  if (Math.abs(a.y - b.y) > 2.2) return 0;
  const sa = Math.sin(a.yaw);
  const ca = Math.cos(a.yaw);
  const sb = Math.sin(b.yaw);
  const cb = Math.cos(b.yaw);
  let impact = 0;
  for (const oa of a.circles)
    for (const ob of b.circles) {
      const ax = a.x + sa * oa;
      const az = a.z + ca * oa;
      const bx = b.x + sb * ob;
      const bz = b.z + cb * ob;
      const dx = bx - ax;
      const dz = bz - az;
      const d = Math.hypot(dx, dz);
      const pen = a.r + b.r - d;
      if (pen <= 0) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const ma = a.stats.hp;
      const mb = b.stats.hp;
      const ka = mb / (ma + mb);
      const kb = ma / (ma + mb);
      a.x -= nx * pen * ka;
      a.z -= nz * pen * ka;
      b.x += nx * pen * kb;
      b.z += nz * pen * kb;
      // relative velocity along the normal
      const avx = sa * a.vf + ca * a.vl;
      const avz = ca * a.vf - sa * a.vl;
      const bvx = sb * b.vf + cb * b.vl;
      const bvz = cb * b.vf - sb * b.vl;
      const rel = (bvx - avx) * nx + (bvz - avz) * nz;
      if (rel < 0) {
        impact = Math.max(impact, -rel);
        const j = -rel * 0.8;
        const dax = -nx * j * ka;
        const daz = -nz * j * ka;
        const dbx = nx * j * kb;
        const dbz = nz * j * kb;
        a.vf += dax * sa + daz * ca;
        a.vl += dax * ca - daz * sa;
        b.vf += dbx * sb + dbz * cb;
        b.vl += dbx * cb - dbz * sb;
      }
    }
  return impact;
}
