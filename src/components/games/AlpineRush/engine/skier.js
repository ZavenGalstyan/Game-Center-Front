/**
 * Alpine Rush — the skier controller (player and AI rivals ski the same
 * one). Fixed-step, framework-free, units are metres / seconds.
 *
 *   gravity     the slope grade pulls the skier downhill (g · grade); snow
 *               friction (μ · g), surface drag and air drag (k · v²) settle
 *               it at a terminal speed — steeper = faster, flats bleed speed,
 *               a short climb slows it. Nothing ever stops instantly.
 *   posture     upright (no keys) · tuck (W) · race tuck (Shift) — each
 *               lowers the air drag (faster) but costs steering authority.
 *               At walking pace a tuck key skates / poles you forward.
 *   carving     A / D carve: the yaw rate is limited by the lateral grip the
 *               edges can hold (a_lat / v), so the turn radius grows with
 *               speed; Q / E carve harder (tighter, more speed lost). The
 *               rate ramps in smoothly (no instant 90° turns). Turning costs
 *               speed (carve drag ∝ yaw rate · speed). Grip bleeds the
 *               sideways slide — little on ice, so mistakes there skid wide.
 *   edge stress hard carving (Q / E) near top speed builds stress; let it
 *               reach the limit and an edge catches — a fall.
 *   snowplough  S: skis in a wedge, strong braking (weak on ice), slower
 *               turning. Works at every speed, never reverses.
 *   air         airborne whenever the ground falls away faster than gravity
 *               can follow (kickers, rollers, crests) or on Space (grounded
 *               only — never twice in the air). Travel keeps its momentum;
 *               A / D rotate the body (it re-aligns itself when released).
 *               Landing checks the impact speed and how far the skis point
 *               away from the travel direction: clean · wobbly · fall.
 *   obstacles   trees / rocks / snow cannons: glancing hits cost speed,
 *               head-on hits are a fall. Snow fences: jump them or go round.
 *   edges       safety nets push back (hit one hard and you tangle); cliff
 *               edges let the skier fall — the race respawns them.
 *   falls       tumble + slide to a stop, then get up on the spot (the
 *               time lost is the penalty); falls off a cliff respawn at the
 *               last checkpoint instead.
 *
 * Steering convention: steer +1 = left (heading increases).
 */
import { clamp, wrapAngle } from "./rng.js";
import { locate, groundAt, G, SURFACES, FENCE_H } from "./course.js";

export const RADIUS = 0.45;
export const GETUP_TIME = 2.3; // fall → standing again (seconds)
export const FALL_TIME = 2.0; // off a cliff → respawn
const TUCK_K = 0.72;
const RACE_K = 0.56;
const PLOW_K = 1.35;

export function createSkier(params, at) {
  return {
    p: params,
    x: at.x,
    z: at.z,
    y: at.y,
    h: at.h,
    vF: 0,
    vS: 0,
    vy: 0,
    ax: 0, // world velocity while airborne
    az: 0,
    air: false,
    airT: 0,
    yawRate: 0,
    steerVis: 0,
    lean: 0,
    tuck: 0, // 0 upright · 0.6 tuck · 1 race tuck (smoothed)
    plow: 0, // smoothed snowplough amount
    sharp: 0,
    stress: 0,
    loc: null,
    gnd: null,
    hint: -1,
    crash: null,
    invuln: 0,
    jumpCool: 0,
    compress: 0,
    compressV: 0,
    rough: 0,
    braking: false,
    carving: 0, // |yaw rate| share of the maximum (for spray / audio)
    surf: "normal",
    hold: false,
    lastS: at.s ?? 0,
    wobbleT: 0,
    landT: 0,
    pole: 0,
    hitT: 0,
    maxV: 0,
  };
}

/** Puts a skier back on the piste at a respawn point, standing still. */
export function respawnSkier(K, pt, T, v = 4) {
  K.x = pt.x;
  K.z = pt.z;
  K.y = pt.y;
  K.h = pt.h;
  K.vF = v;
  K.vS = 0;
  K.vy = 0;
  K.air = false;
  K.airT = 0;
  K.yawRate = 0;
  K.crash = null;
  K.invuln = 1.4;
  K.jumpCool = 0.4;
  K.stress = 0;
  K.compress = 0;
  K.compressV = 0;
  K.hint = -1;
  K.loc = locate(T, K.x, K.z, -1);
  K.hint = K.loc.i;
  K.gnd = groundAt(T, K.loc);
  K.y = K.gnd.y;
  K.vy = -T.interp(K.loc.s).a.grade * v; // moving with the slope (not launching off it)
  K.lastS = K.loc.s;
}

/** Gets up where the fall ended (kept inside the piste), facing downhill. */
export function getUp(K, T) {
  const q = locate(T, K.x, K.z, K.hint);
  const S = T.samples[q.i];
  const lim = S.w - 1.2;
  const lat = clamp(q.lat, -lim, lim);
  const p = T.pointAt(q.s, lat);
  respawnSkier(K, { x: p.x, z: p.z, y: p.y, h: p.h }, T, 1.5);
}

export function crashSkier(K, kind, ev) {
  if (K.crash) return;
  K.crash = { t: 0, kind, fell: kind === "fell", spin: K.steerVis >= 0 ? 1 : -1, v0: Math.hypot(K.vF, K.vS) };
  K.stress = 0;
  ev?.({ type: "crash", kind });
}

function stepCrash(K, T, dt) {
  const C = K.crash;
  C.t += dt;
  if (C.fell) {
    K.vy -= G * dt;
    K.y += K.vy * dt;
    K.x += (K.air ? K.ax : Math.sin(K.h) * K.vF) * dt;
    K.z += (K.air ? K.az : Math.cos(K.h) * K.vF) * dt;
    K.vF *= Math.exp(-1.0 * dt);
    K.ax *= Math.exp(-1.0 * dt);
    K.az *= Math.exp(-1.0 * dt);
    return;
  }
  // tumble and slide down the slope to a stop
  const q0 = K.loc || locate(T, K.x, K.z, K.hint);
  const S = T.interp(q0.s).a;
  if (K.air) {
    K.vF = Math.hypot(K.ax, K.az);
    K.air = false;
  }
  K.vF += (G * S.grade * 0.5 - 2.6 - K.vF * 0.9) * dt;
  if (K.vF < 0) K.vF = 0;
  K.vS *= Math.exp(-4 * dt);
  K.x += (Math.sin(K.h) * K.vF + Math.cos(K.h) * K.vS) * dt;
  K.z += (Math.cos(K.h) * K.vF - Math.sin(K.h) * K.vS) * dt;
  const q = locate(T, K.x, K.z, K.hint);
  K.hint = q.i;
  if (Math.abs(q.lat) > q.barrier) {
    const Sm = T.samples[q.i];
    if (q.drop) {
      // slid off the edge
      C.fell = true;
      C.t = 0;
      K.vy = -1;
      return;
    }
    const sg = Math.sign(q.lat);
    const pen = Math.abs(q.lat) - q.barrier;
    K.x -= Sm.nx * sg * pen;
    K.z -= Sm.nz * sg * pen;
  }
  const g = groundAt(T, q);
  if (!g.fall) {
    K.y += (g.y - K.y) * Math.min(1, dt * 12);
    K.gnd = g;
  }
  K.loc = q;
}

/** Seconds until airborne skier touches down (ballistic, against the real ground). */
export function predictAirTime(K, T, maxT = 3) {
  const dt = 1 / 30;
  let x = K.x;
  let z = K.z;
  let y = K.y;
  let vy = K.vy;
  let hint = K.hint;
  for (let t = dt; t <= maxT; t += dt) {
    x += K.ax * dt;
    z += K.az * dt;
    vy -= G * dt;
    y += vy * dt;
    const loc = locate(T, x, z, hint);
    hint = loc.i;
    const g = groundAt(T, loc);
    if (g.fall) continue;
    if (y <= g.y) return t;
  }
  return maxT;
}

export function stepSkier(K, inp, T, dt, ev) {
  const P = K.p;
  if (K.crash) {
    stepCrash(K, T, dt);
    return;
  }
  if (K.invuln > 0) K.invuln = Math.max(0, K.invuln - dt);
  if (K.jumpCool > 0) K.jumpCool -= dt;
  if (K.hitT > 0) K.hitT -= dt;
  if (K.wobbleT > 0) K.wobbleT -= dt;
  if (K.landT > 0) K.landT -= dt;
  const loc = K.loc || locate(T, K.x, K.z, K.hint);
  const gnd = K.gnd || groundAt(T, loc);
  K.hint = loc.i;
  const steer = clamp(inp.steer || 0, -1, 1);
  const sharp = inp.sharp ? 1 : 0;
  const brk = !K.hold && inp.brake ? 1 : 0;
  const tuckIn = inp.race ? 1 : inp.tuck ? 0.6 : 0;
  const surfName = K.air ? "normal" : gnd.surf;
  const sf = SURFACES[surfName] || SURFACES.normal;
  K.surf = K.air ? "air" : surfName;

  // posture (smoothed so the model blends, the physics uses the target)
  K.tuck += ((brk ? 0 : tuckIn) - K.tuck) * Math.min(1, dt * 6);
  K.plow += (brk - K.plow) * Math.min(1, dt * 8);
  K.sharp += (sharp * Math.abs(steer) - K.sharp) * Math.min(1, dt * 8);

  // --- held in the start house -------------------------------------------------------
  if (K.hold) {
    K.vF = 0;
    K.vS = 0;
    K.yawRate = 0;
    K.braking = false;
    K.steerVis += (0 - K.steerVis) * Math.min(1, dt * 6);
    return;
  }

  const S = T.interp(loc.s).a;
  // --- longitudinal (on the snow) -----------------------------------------------------
  let vF = K.vF;
  if (!K.air) {
    const posture = brk ? PLOW_K : tuckIn >= 1 ? RACE_K : tuckIn > 0 ? TUCK_K : 1;
    let a = G * S.grade;
    if (vF > 0.05) a -= G * sf.mu * (P.surfMu?.[surfName] ?? 1);
    a -= P.aero * posture * vF * vF;
    a -= sf.drag * (P.surfDrag?.[surfName] ?? 1) * vF * 10;
    // carving costs speed (more when carving hard)
    a -= P.carveLoss * Math.abs(K.yawRate) * vF * (sharp ? 1.6 : 1);
    if (brk) a -= P.brake * sf.brake * (P.surfBrake?.[surfName] ?? 1) * clamp(vF / 2.5, 0.25, 1);
    // skating / poling at walking pace
    if (tuckIn > 0 && !brk && vF < 7.5) a += 2.4 * (1 - vF / 7.5);
    if (inp.wind) a += inp.wind.x * Math.sin(K.h) + inp.wind.z * Math.cos(K.h);
    vF += a * dt;
    const cap = P.vmax * sf.cap;
    if (vF > cap) vF = Math.max(cap, vF - 6 * dt);
    if (vF < 0) vF = 0;
    K.vF = vF;
    K.braking = brk > 0 && vF > 0.8;
  } else {
    // in the air: momentum carries, light drag, the wind pushes
    const sp = Math.hypot(K.ax, K.az);
    const k = Math.max(0, 1 - P.aero * 0.7 * sp * dt);
    K.ax *= k;
    K.az *= k;
    if (inp.wind) {
      K.ax += inp.wind.x * dt * 0.6;
      K.az += inp.wind.z * dt * 0.6;
    }
    K.braking = false;
  }

  // --- steering / carving -----------------------------------------------------------------
  const sp = K.air ? Math.hypot(K.ax, K.az) : Math.max(0, K.vF);
  if (!K.air) {
    const postSteer = brk ? 0.8 : tuckIn >= 1 ? 0.62 : tuckIn > 0 ? 0.82 : 1;
    const turnK = sf.turn * (P.surfTurn?.[surfName] ?? 1);
    const aLat = P.aLat * turnK * (sharp ? 1.38 : 1) * postSteer;
    const yawMax = Math.min(P.turnLow * turnK * (brk ? 0.85 : 1), aLat / Math.max(sp, 2.2));
    const target = steer * yawMax;
    K.yawRate += (target - K.yawRate) * Math.min(1, dt * P.turnResp * (sharp ? 1.35 : 1));
    K.carving = yawMax > 1e-4 ? Math.abs(K.yawRate) / Math.max(1e-3, P.aLat / Math.max(sp, 2.2)) : 0;
  } else {
    // body rotation in the air (travel barely changes); re-aligns when released
    const travel = Math.atan2(K.ax, K.az);
    const want = steer !== 0 ? steer * P.airSpin : wrapAngle(travel - K.h) * 2.2;
    K.yawRate += (want - K.yawRate) * Math.min(1, dt * 5);
    // a little air control of the travel direction
    if (steer !== 0) {
      const turn = steer * 0.16 * dt;
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const ax = K.ax;
      K.ax = ax * c + K.az * s;
      K.az = -ax * s + K.az * c;
    }
    K.carving = 0;
  }
  K.h = wrapAngle(K.h + K.yawRate * dt);
  K.steerVis += (steer * (1 + 0.4 * sharp) - K.steerVis) * Math.min(1, dt * 7);
  const leanT = K.air ? 0 : clamp(Math.atan2(K.yawRate * sp, G), -1.0, 1.0);
  K.lean += (leanT - K.lean) * Math.min(1, dt * 6);

  // --- grip: carry velocity through the heading change, bleed the slide -----------------
  if (!K.air) {
    const dh = K.yawRate * dt;
    const c = Math.cos(dh);
    const s = Math.sin(dh);
    const oF = K.vF;
    const oS = K.vS;
    K.vF = oF * c + oS * s;
    K.vS = -oF * s + oS * c;
    if (inp.wind) K.vS += (inp.wind.x * Math.cos(K.h) - inp.wind.z * Math.sin(K.h)) * dt;
    const grip = P.grip * sf.grip * (P.surfGrip?.[surfName] ?? 1) * (brk ? 1.25 : 1);
    const keep = Math.exp(-grip * dt);
    const mag2 = K.vF * K.vF + K.vS * K.vS;
    K.vS *= keep;
    if (K.vF > 0) {
      const full = Math.sqrt(Math.max(0, mag2 - K.vS * K.vS));
      // a skid scrubs speed: only part of the slide turns back into forward speed
      K.vF += (full - K.vF) * 0.55;
    }
  }

  // --- edge stress (hard carving at speed) ------------------------------------------------
  if (!K.air) {
    const frac = sp / P.vmax;
    const load = sharp && Math.abs(steer) > 0.5 ? clamp((frac - 0.62) / 0.3, 0, 1.4) : 0;
    const roughLoad = (SURFACES[surfName]?.bump || 0) > 0.5 ? clamp((frac - 0.55) / 0.4, 0, 1) * 0.35 : 0;
    const before = K.stress;
    if (load + roughLoad > 0) K.stress += (load * 0.85 + roughLoad) * P.stressRate * dt;
    else K.stress = Math.max(0, K.stress - dt * 0.9);
    if (before < 0.55 && K.stress >= 0.55) ev?.({ type: "wobble" });
    if (K.stress >= 1 && K.invuln <= 0) {
      crashSkier(K, "edge", ev);
      return;
    }
  }

  // --- jump (grounded only) -----------------------------------------------------------------
  if (inp.jump && !K.air && K.jumpCool <= 0 && sp > 1.2) {
    takeoff(K, gnd);
    K.vy = Math.max(K.vy, 0) + P.jump;
    K.jumpCool = 0.45;
    K.compress = -0.2;
    ev?.({ type: "jump" });
  }

  // --- integrate -----------------------------------------------------------------------------
  const ox = K.x;
  const oz = K.z;
  if (K.air) {
    K.x += K.ax * dt;
    K.z += K.az * dt;
  } else {
    const fx = Math.sin(K.h);
    const fz = Math.cos(K.h);
    K.x += (fx * K.vF + Math.cos(K.h) * K.vS) * dt;
    K.z += (fz * K.vF - Math.sin(K.h) * K.vS) * dt;
  }

  // --- edges -----------------------------------------------------------------------------------
  let q = locate(T, K.x, K.z, K.hint);
  K.hint = q.i;
  if (Math.abs(q.lat) > q.barrier && !q.drop) {
    const Sm = T.samples[q.i];
    const sg = Math.sign(q.lat);
    const nx = Sm.nx * sg;
    const nz = Sm.nz * sg;
    const pen = Math.abs(q.lat) - q.barrier;
    K.x -= nx * pen;
    K.z -= nz * pen;
    const wx = K.air ? K.ax : Math.sin(K.h) * K.vF + Math.cos(K.h) * K.vS;
    const wz = K.air ? K.az : Math.cos(K.h) * K.vF - Math.sin(K.h) * K.vS;
    const into = wx * nx + wz * nz;
    if (into > 0) {
      if (into > 12 && K.invuln <= 0 && !K.air) {
        ev?.({ type: "net", hard: 1 });
        crashSkier(K, "net", ev);
        K.loc = q;
        return;
      }
      const rx = wx - nx * into * 1.15;
      const rz = wz - nz * into * 1.15;
      if (K.air) {
        K.ax = rx * 0.9;
        K.az = rz * 0.9;
      } else {
        K.vF = Math.max(0, (rx * Math.sin(K.h) + rz * Math.cos(K.h)) * 0.9);
        K.vS = (rx * Math.cos(K.h) - rz * Math.sin(K.h)) * 0.4;
        const along = Math.hypot(rx, rz) > 0.3 ? Math.atan2(rx, rz) : Sm.h;
        K.h = wrapAngle(K.h + wrapAngle(along - K.h) * (K.vF > 2 ? 0.22 : 0.1));
      }
      if (into > 2) ev?.({ type: "net", hard: clamp(into / 12, 0, 1) });
    }
    q = locate(T, K.x, K.z, K.hint);
    K.hint = q.i;
  }
  // start house behind, fence at the end of the run-out
  if (q.s < 1) {
    const Sm = T.samples[0];
    K.x += Sm.tx * (1 - q.s);
    K.z += Sm.tz * (1 - q.s);
  }
  if (q.s > T.length - 3) {
    K.vF = Math.min(K.vF, 1);
    K.ax *= 0.5;
    K.az *= 0.5;
    const Sm = T.samples[T.N - 1];
    K.x -= Sm.tx * (q.s - (T.length - 3));
    K.z -= Sm.tz * (q.s - (T.length - 3));
  }

  // --- vertical -----------------------------------------------------------------------------
  const g2 = groundAt(T, q);
  if (!K.air) {
    const yb = K.y + K.vy * dt - 0.5 * G * dt * dt;
    if (g2.y < yb - 0.04) {
      // the snow fell away: airborne with the vertical speed we had
      takeoff(K, gnd);
      K.y = yb;
      K.vy -= G * dt;
      ev?.({ type: "takeoff", ramp: gnd.ramp ? gnd.ramp.size : null, big: !!(gnd.ramp && gnd.ramp.size !== "small") });
    } else {
      // follow the snow, but never faster than a real slope could lift you
      // (a step onto an obstacle is not a launch pad)
      const lim = K.vF * 0.7 + 1.5;
      K.vy = clamp((g2.y - K.y) / dt, -lim, K.vF * 0.5 + 1);
      K.y = g2.y;
    }
  } else {
    K.airT += dt;
    K.vy -= G * dt;
    K.y += K.vy * dt;
    if (g2.fall && K.y < g2.trailY - 2.5) {
      crashSkier(K, "fell", ev);
      K.loc = q;
      K.gnd = g2;
      return;
    }
    if (!g2.fall && K.y <= g2.y) {
      land(K, g2, q, T, ev);
      if (K.crash) {
        K.loc = q;
        K.gnd = g2;
        return;
      }
    }
  }

  // --- obstacles ------------------------------------------------------------------------------
  const near = T.featAt[clamp(Math.round(q.s), 0, T.N - 1)];
  for (const f of near) {
    if (f.type === "rock" || f.type === "tree" || f.type === "cannon") {
      const dx = K.x - f.x;
      const dz = K.z - f.z;
      const d = Math.hypot(dx, dz);
      const rr = f.r + RADIUS;
      if (d >= rr || d < 1e-5) continue;
      if (f.type === "rock" && K.y - g2.trailY > f.r * 0.9) continue; // sailing over it
      const nx = dx / d;
      const nz = dz / d;
      K.x += nx * (rr - d);
      K.z += nz * (rr - d);
      const wx = K.air ? K.ax : Math.sin(K.h) * K.vF + Math.cos(K.h) * K.vS;
      const wz = K.air ? K.az : Math.cos(K.h) * K.vF - Math.sin(K.h) * K.vS;
      const into = -(wx * nx + wz * nz);
      if (into <= 0) continue;
      if (into > Math.max(7.5, sp * 0.55) && K.invuln <= 0) {
        crashSkier(K, f.type, ev);
        K.loc = q;
        K.gnd = g2;
        return;
      }
      const rx = wx + nx * into * 1.05;
      const rz = wz + nz * into * 1.05;
      if (K.air) {
        K.ax = rx * 0.75;
        K.az = rz * 0.75;
      } else {
        K.vF = Math.max(0, (rx * Math.sin(K.h) + rz * Math.cos(K.h)) * 0.72);
        K.vS = (rx * Math.cos(K.h) - rz * Math.sin(K.h)) * 0.5;
      }
      K.hitT = 0.6;
      K.hitNx = nx;
      K.hitNz = nz;
      ev?.({ type: "hit", kind: f.type, hard: clamp(into / 8, 0, 1) });
    } else if (f.type === "fence") {
      if (K.lastS < f.s && q.s >= f.s && q.lat >= f.lat0 - RADIUS && q.lat <= f.lat1 + RADIUS && q.s - K.lastS < 4) {
        if (K.y - g2.trailY > FENCE_H) {
          ev?.({ type: "clearFence" });
          continue;
        }
        if (sp > 5.5 && K.invuln <= 0) {
          crashSkier(K, "fence", ev);
          K.loc = q;
          K.gnd = g2;
          return;
        }
        // bump to a stop against it
        const back = T.pointAt(f.s - 0.6, q.lat);
        K.x = back.x;
        K.z = back.z;
        K.vF = 0;
        K.ax = 0;
        K.az = 0;
        ev?.({ type: "hit", kind: "fence", hard: 0.4 });
        q = locate(T, K.x, K.z, K.hint);
      }
    }
  }

  // --- suspension / feel ------------------------------------------------------------------------
  const sfx = SURFACES[g2.surf] || SURFACES.normal;
  const rough = K.air ? 0 : sfx.bump * clamp(K.vF / 14, 0, 1.5) * P.roughness;
  K.rough = rough;
  K.compressV += (-K.compress * 60 - K.compressV * 9) * dt;
  K.compress += K.compressV * dt;
  if (rough > 0 && Math.random() < rough * dt * 10) {
    K.compressV += (Math.random() - 0.3) * rough * 2;
    if (rough > 0.4) K.vS += (Math.random() - 0.5) * rough * 0.8;
  }
  K.pole += dt * (tuckIn > 0 && K.vF < 7.5 && !K.air ? 2.6 : 0);
  K.maxV = Math.max(K.maxV, K.air ? Math.hypot(K.ax, K.az) : K.vF);
  K.lastS = q.s;
  K.loc = q;
  K.gnd = g2;
  K.moved = Math.hypot(K.x - ox, K.z - oz);
}

function takeoff(K, gnd) {
  K.air = true;
  K.airT = 0;
  K.airStartY = K.y;
  K.ax = Math.sin(K.h) * K.vF + Math.cos(K.h) * K.vS;
  K.az = Math.cos(K.h) * K.vF - Math.sin(K.h) * K.vS;
  K.vS = 0;
  K.yawRate *= 0.3;
  K.takeoffRamp = gnd?.ramp || null;
}

function land(K, g2, q, T, ev) {
  const P = K.p;
  const S = T.interp(q.s).a;
  const travel = Math.atan2(K.ax, K.az);
  const sp = Math.hypot(K.ax, K.az);
  const groundVy = -S.grade * sp;
  // the part of the velocity INTO the slope (normal to the snow), not just vertical
  const impact = (K.vy - groundVy) / Math.sqrt(1 + S.grade * S.grade); // negative = into the snow
  const mis = Math.abs(wrapAngle(K.h - travel));
  const airT = K.airT;
  K.air = false;
  K.y = g2.y;
  K.vy = groundVy;
  K.airT = 0;
  // the travel velocity in the ski frame (a crooked landing becomes a skid)
  K.vF = Math.max(0, K.ax * Math.sin(K.h) + K.az * Math.cos(K.h));
  K.vS = K.ax * Math.cos(K.h) - K.az * Math.sin(K.h);
  K.yawRate = 0;
  const hard = clamp(-impact / P.impactTol, 0, 1.5);
  if ((mis > P.landTol || -impact > P.impactTol) && K.invuln <= 0) {
    crashSkier(K, "landing", ev);
    K.vF = sp * 0.6;
    return;
  }
  let quality = "clean";
  if (mis > 0.42 || hard > 0.75) {
    quality = "wobbly";
    K.vF *= 0.82;
    K.wobbleT = 0.7;
    K.stress = Math.min(0.5, K.stress + 0.25);
  }
  K.compressV -= 2 + hard * 6;
  K.landT = 0.35;
  ev?.({ type: "land", hard: Math.min(1, hard), airT, quality });
}

/** Display speed (km/h). */
export const kmh = (K) => Math.round(Math.max(0, K.air ? Math.hypot(K.ax, K.az) : K.vF) * 3.6);
/** Current ground speed (m/s). */
export const speedOf = (K) => Math.max(0, K.air ? Math.hypot(K.ax, K.az) : K.vF);
