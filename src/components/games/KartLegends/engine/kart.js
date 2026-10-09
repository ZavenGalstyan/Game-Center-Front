/**
 * Kart Legends — the arcade kart controller (player and AI drive the same
 * one). Fixed-step, framework-free.
 *
 *   longitudinal  accel fades toward top speed; brake, then reverse; coast drag
 *   steering      yaw rate scales up with speed, eases off near top speed;
 *                 can never spin on the spot
 *   grip          sideways velocity bleeds off at `grip` (lower while
 *                 drifting, on ice) — that's the slide and the inertia
 *   drift         hold drift while steering above 10 m/s: the kart hops and
 *                 slides; steering tightens / widens the arc; charge builds
 *                 through three tiers (capped) and releases as a mini-turbo
 *   boost         a 3-segment meter (drifts, pickups); one press spends one
 *                 segment; pads give a free burst
 *   surfaces      off-road caps speed and adds drag (forgiving, no resets)
 *   barriers      soft: the kart is put back inside, the into-wall velocity
 *                 removed, a little speed lost — no bouncing around
 *
 * Steering convention: steer +1 = left (heading increases).
 */
import { clamp, wrapAngle } from "./rng.js";
import { locate } from "./track.js";

export const DRIFT_TIERS = [0.5, 1.15, 1.9];
export const DRIFT_CAP = 2.2;
const TURBO = [0.55, 0.9, 1.35];
const SEG = 1 / 3;
const MIN_TURN = [0.85, 1.2, 1.5]; // radians of net turn a tier needs

export function createKart(params, at) {
  return {
    p: params,
    x: at.x,
    z: at.z,
    y: at.y,
    h: at.h,
    vF: 0, // forward speed (m/s, negative = reverse)
    vS: 0, // sideways speed (+ = left)
    yawRate: 0,
    steerVis: 0,
    drift: { on: false, dir: 0, charge: 0, tier: 0, t: 0, turned: 0 },
    boostT: 0, // active boost seconds left
    boostKind: null,
    meter: 0, // 0..1, thirds are usable segments
    offroad: false,
    ice: false,
    loc: null,
    hint: -1,
    wheelSpin: 0,
    bump: 0,
    hop: 0,
    radius: 0.95,
    turboCool: 0,
  };
}

/** Adds a boost burst (pads, mini-turbos). */
export function addBoost(K, seconds, kind) {
  if (seconds > K.boostT) {
    K.boostT = seconds;
    K.boostKind = kind;
  }
}

export function stepKart(K, inp, T, dt, ev) {
  const P = K.p;
  const loc = locate(T, K.x, K.z, K.hint);
  K.hint = loc.i;
  K.loc = loc;
  const inBand = loc.onShort ? Math.abs(loc.shortLat) <= T.shortcut.width : Math.abs(loc.lat) <= loc.w;
  K.offroad = !inBand;
  K.ice = loc.onShort ? T.shortcut.kind === "ice" : !!loc.slip;
  const boosting = K.boostT > 0;
  const rough = loc.onShort && T.shortcut.rough && !boosting;
  // drift mini-turbos are a milder kick than a meter boost or a pad
  const power = !boosting ? 1 : K.boostKind === "drift" ? 1 + (P.boostPower - 1) * 0.55 : P.boostPower;
  const vmax = P.maxSpeed * power * (K.offroad && !boosting ? 0.58 : 1) * (rough ? 0.84 : 1);

  // --- longitudinal ---------------------------------------------------------
  const thr = clamp(inp.throttle, 0, 1);
  const brk = clamp(inp.brake, 0, 1);
  let vF = K.vF;
  if (boosting) {
    if (vF < vmax) vF = Math.min(vmax, vF + P.accel * 1.9 * dt); // up to the boost cap, never past it
  } else if (thr > 0 && vF >= -0.5) {
    const f = Math.max(0, 1 - (vF / P.maxSpeed) ** 2);
    vF += P.accel * thr * (0.25 + 0.75 * f) * dt;
  }
  if (brk > 0) {
    if (vF > 0.5) vF -= 30 * brk * dt;
    else vF = Math.max(-9, vF - 11 * brk * dt);
  }
  if (thr === 0 && brk === 0 && !boosting) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 5 * dt);
  if (K.offroad) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 4 * dt);
  if (vF > vmax) vF = Math.max(vmax, vF - 16 * dt); // ease back after a boost
  K.vF = vF;

  // --- drift ------------------------------------------------------------------
  const steer = clamp(inp.steer, -1, 1);
  const D = K.drift;
  if (!D.on && inp.drift && Math.abs(steer) > 0.3 && vF > 10) {
    D.on = true;
    D.dir = Math.sign(steer);
    D.charge = 0;
    D.tier = 0;
    D.t = 0;
    D.turned = 0;
    K.hop = 0.18;
    ev?.({ type: "driftStart" });
  }
  if (K.turboCool > 0) K.turboCool -= dt;
  if (D.on) {
    D.t += dt;
    D.turned += K.yawRate * D.dir * dt; // net heading change into the drift
    const ending = !inp.drift || vF < 7;
    if (ending) {
      // a mini-turbo needs a real corner: ≥ ~50° of net turn into the drift
      // (bigger tiers need bigger corners), and never two within a second
      const byTurn = D.turned >= MIN_TURN[2] ? 3 : D.turned >= MIN_TURN[1] ? 2 : D.turned >= MIN_TURN[0] ? 1 : 0;
      const tier = Math.min(D.tier, byTurn);
      if (tier > 0 && inp.drift === false && vF >= 7 && K.turboCool <= 0) {
        // release: mini-turbo + a little meter, by tier
        addBoost(K, TURBO[tier - 1], "drift");
        K.vF = Math.max(K.vF, P.maxSpeed * 0.92);
        K.meter = Math.min(1, K.meter + 0.07 * tier);
        K.turboCool = 1.3 + TURBO[tier - 1];
        ev?.({ type: "miniTurbo", tier });
      }
      ev?.({ type: "driftEnd", tier: D.tier });
      D.on = false;
      D.dir = 0;
      D.charge = 0;
      D.tier = 0;
    } else {
      // charge only while really sliding at speed and steering into the turn
      // … and scaled by how hard the kart is really turning, so snaking down a
      // straight (counter-steering to stay straight) barely charges
      const turning = clamp((Math.abs(K.yawRate) / P.turn - 0.12) / 0.4, 0, 1);
      if (vF > 11) D.charge = Math.min(DRIFT_CAP, D.charge + dt * P.driftCharge * turning * (0.7 + 0.3 * Math.max(0, steer * D.dir)));
      const tier = D.charge >= DRIFT_TIERS[2] ? 3 : D.charge >= DRIFT_TIERS[1] ? 2 : D.charge >= DRIFT_TIERS[0] ? 1 : 0;
      if (tier > D.tier) {
        D.tier = tier;
        ev?.({ type: "driftTier", tier });
      }
    }
  }

  // --- steering -----------------------------------------------------------------
  const sp = Math.abs(vF);
  const auth = clamp(sp / 7, 0, 1) * (1 - 0.3 * clamp(sp / P.maxSpeed, 0, 1));
  let yaw;
  if (D.on) {
    // the drift arc: always turning into the drift; steering tightens / widens it
    yaw = D.dir * P.turn * (0.62 + 0.45 * steer * D.dir);
  } else {
    yaw = steer * P.turn * auth * Math.sign(vF || 1);
  }
  K.yawRate += (yaw - K.yawRate) * Math.min(1, dt * (D.on ? 8 : 12));
  K.h = wrapAngle(K.h + K.yawRate * dt);
  K.steerVis += (steer - K.steerVis) * Math.min(1, dt * 14);

  // --- grip: the sideways velocity left over from turning bleeds away --------------
  // carry the old velocity through the heading change
  const dh = K.yawRate * dt;
  const c = Math.cos(dh);
  const s = Math.sin(dh);
  const oldF = K.vF;
  const oldS = K.vS;
  K.vF = oldF * c + oldS * s;
  K.vS = -oldF * s + oldS * c;
  let grip = P.grip;
  if (D.on) grip *= 0.32;
  if (K.ice) grip *= D.on ? 0.8 : 0.45;
  if (K.offroad) grip *= 1.2;
  // most of the lost sideways speed turns back into forward speed (arcade)
  // (energy-safe: the speed regained never exceeds the speed carried in)
  const keep = Math.exp(-grip * dt);
  const mag2 = K.vF * K.vF + K.vS * K.vS;
  K.vS *= keep;
  if (K.vF > 0) {
    const full = Math.sqrt(Math.max(0, mag2 - K.vS * K.vS));
    K.vF += (full - K.vF) * (D.on ? 0.55 : 0.85);
  }
  if (K.vF > vmax) K.vF = Math.max(vmax, K.vF - 16 * dt);
  if (D.on) {
    // the slide outward: swing the velocity off the nose (a rotation — adds no speed)
    const phi = -D.dir * 0.9 * dt * (Math.min(sp, 22) / Math.max(sp, 1));
    const f = K.vF;
    K.vF = f * Math.cos(phi) + K.vS * Math.sin(phi);
    K.vS = -f * Math.sin(phi) + K.vS * Math.cos(phi);
  }

  // --- boost meter ------------------------------------------------------------------
  if (inp.boostPressed && K.meter >= SEG - 1e-6 && K.boostT < 0.15) {
    K.meter = Math.max(0, K.meter - SEG);
    addBoost(K, P.boostTime, "meter");
    K.vF = Math.max(K.vF, P.maxSpeed * 0.95);
    ev?.({ type: "boost" });
  }
  if (K.boostT > 0) {
    K.boostT = Math.max(0, K.boostT - dt);
    if (K.boostT === 0) K.boostKind = null;
  }

  // --- integrate --------------------------------------------------------------------
  const fx = Math.sin(K.h);
  const fz = Math.cos(K.h);
  const lx = Math.cos(K.h); // left = (cos h, −sin h)
  const lz = -Math.sin(K.h);
  K.x += (fx * K.vF + lx * K.vS) * dt;
  K.z += (fz * K.vF + lz * K.vS) * dt;

  // --- barriers ---------------------------------------------------------------------
  const q = locate(T, K.x, K.z, K.hint);
  K.hint = q.i;
  const inMain = Math.abs(q.lat) <= q.barrier - K.radius;
  const SC = T.shortcut;
  const inShort = SC && Math.abs(q.shortLat) <= SC.width + 0.6 - K.radius && q.shortT > 0.002 && q.shortT < 0.998;
  if (!inMain && !inShort) {
    // back into whichever band is nearer
    const penMain = Math.abs(q.lat) - (q.barrier - K.radius);
    const penShort = SC ? Math.abs(q.shortLat) - (SC.width + 0.6 - K.radius) : Infinity;
    let nx;
    let nz;
    if (penMain <= penShort) {
      const S = T.samples[q.i];
      const sg = Math.sign(q.lat);
      nx = S.nx * sg;
      nz = S.nz * sg;
      K.x -= nx * penMain;
      K.z -= nz * penMain;
    } else {
      const Q = q.shortSample;
      const sg = Math.sign(q.shortLat);
      nx = Q.nx * sg;
      nz = Q.nz * sg;
      K.x -= nx * penShort;
      K.z -= nz * penShort;
    }
    // remove the into-wall velocity, keep the slide along it, lose a bit
    const wx = fx * K.vF + lx * K.vS;
    const wz = fz * K.vF + lz * K.vS;
    const into = wx * nx + wz * nz;
    if (into > 0) {
      const rx = wx - nx * into * 1.15;
      const rz = wz - nz * into * 1.15;
      K.vF = (rx * fx + rz * fz) * 0.93;
      K.vS = (rx * lx + rz * lz) * 0.6;
      // nudge the nose along the wall so we don't grind
      const along = Math.atan2(rx, rz);
      if (K.vF > 2) K.h = wrapAngle(K.h + wrapAngle(along - K.h) * 0.25);
      if (into > 3) {
        K.bump = Math.min(1, into / 12);
        ev?.({ type: "wall", hard: K.bump });
        if (D.on) {
          D.on = false;
          D.charge = 0;
          D.tier = 0;
          ev?.({ type: "driftEnd", tier: 0 });
        }
      }
    }
  }
  K.y = q.y;
  K.loc = q;
  K.wheelSpin += K.vF * dt * 2.6;
  K.bump = Math.max(0, K.bump - dt * 3);
  K.hop = Math.max(0, K.hop - dt);
}

/** Speed for the HUD (km/h-ish, arcade scaled). */
export const kmh = (K) => Math.round(Math.abs(K.vF) * 4.2);
