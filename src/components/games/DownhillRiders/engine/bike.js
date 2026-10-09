/**
 * Downhill Riders — the arcade bike controller (player and rivals ride the
 * same one). Fixed-step, framework-free.
 *
 *   downhill    gravity along the trail grade pulls the bike; aero drag
 *               (k·v²) and rolling drag settle it at a terminal speed —
 *               steeper = faster. Pedalling (W) adds force that fades
 *               above the gear's comfortable speed; braking (S) is strong.
 *   steering    yaw rate scales up with speed, eases off near top speed and
 *               is smoothed (no instant rotation). Grip bleeds sideways
 *               velocity — less on snow / ice / mud and at very high speed,
 *               so mistakes at speed slide wide.
 *   air         the bike leaves the ground whenever the ground falls away
 *               faster than gravity can follow (ramp lips, gaps, edges) or
 *               on a bunny hop (Space). Steering keeps some authority.
 *   tricks      Q / E in the air (+ steer for the spin variants). Only
 *               started with enough height and predicted air time; one at a
 *               time, at most three per jump; points bank on a clean
 *               landing, a landing mid-trick is sketchy (no points) or a
 *               crash.
 *   boost       a 3-segment meter; one Shift press spends a segment on a
 *               short burst. Clean tricks, orbs and checkpoints refill it.
 *   obstacles   rocks / trees: glancing hits cost speed, hard head-on hits
 *               crash. Logs: hop them; rolling over costs speed, hitting
 *               one fast crashes.
 *   edges       walls push back (no bounce); drop edges let the bike fall —
 *               a crash, and the race respawns it at the last checkpoint.
 *
 * Steering convention: steer +1 = left (heading increases).
 */
import { clamp, wrapAngle } from "./rng.js";
import { locate, groundAt, G, SURFACES, LOG_H } from "./trail.js";

export const TRICKS = {
  whip: { name: "Whip", dur: 0.5, pts: 150 },
  tabletop: { name: "Tabletop", dur: 0.55, pts: 180 },
  barspin: { name: "Bar Spin", dur: 0.62, pts: 260 },
  spin: { name: "360 Spin", dur: 0.85, pts: 420 },
};
export const MAX_AIR_TRICKS = 3;
export const BOOST_SEG = 1 / 3;
export const CRASH_TIME = 1.9;
export const RADIUS = 0.42;
const CRASH_INTO = 9.5; // m/s into a rock / tree that crashes
const LOG_CRASH = 13.5; // rolling into a log this fast crashes

export function createBike(params, at) {
  return {
    p: params,
    x: at.x,
    z: at.z,
    y: at.y,
    h: at.h,
    vF: 0,
    vS: 0,
    vy: 0,
    air: false,
    airT: 0,
    yawRate: 0,
    steerVis: 0,
    lean: 0,
    loc: null,
    gnd: null,
    hint: -1,
    boostT: 0,
    meter: BOOST_SEG,
    trick: null,
    airTricks: [],
    crash: null,
    invuln: 0,
    hopCool: 0,
    compress: 0,
    compressV: 0,
    rough: 0,
    pedal: 0,
    pedaling: false,
    braking: false,
    surf: "dirt",
    hold: false, // held at the gate
    lastS: at.s ?? 0,
    sinceSlow: 0,
  };
}

/** Puts a bike back on the trail at a respawn point, ready to ride. */
export function respawnBike(B, pt, T) {
  B.x = pt.x;
  B.z = pt.z;
  B.y = pt.y;
  B.h = pt.h;
  B.vF = 10;
  B.vS = 0;
  B.vy = 0;
  B.air = false;
  B.airT = 0;
  B.yawRate = 0;
  B.trick = null;
  B.airTricks = [];
  B.crash = null;
  B.boostT = 0;
  B.invuln = 1.6;
  B.hopCool = 0.3;
  B.compress = 0;
  B.compressV = 0;
  B.hint = -1;
  B.loc = locate(T, B.x, B.z, -1);
  B.hint = B.loc.i;
  B.gnd = groundAt(T, B.loc);
  B.y = B.gnd.y;
  B.lastS = B.loc.s;
  B.sinceSlow = 0;
}

export function crashBike(B, kind, ev) {
  if (B.crash) return;
  B.crash = { t: 0, kind, fell: kind === "fell" || kind === "gap", spin: B.steerVis >= 0 ? 1 : -1 };
  B.trick = null;
  B.airTricks = [];
  B.boostT = 0;
  ev?.({ type: "crash", kind });
}

/** Seconds until this bike would touch down (ballistic, against the real ground ahead). */
export function predictAirTime(B, T, maxT = 3) {
  const dt = 1 / 30;
  let x = B.x;
  let z = B.z;
  let y = B.y;
  let vy = B.vy;
  const fx = Math.sin(B.h) * B.vF + Math.cos(B.h) * B.vS;
  const fz = Math.cos(B.h) * B.vF - Math.sin(B.h) * B.vS;
  let hint = B.hint;
  for (let t = dt; t <= maxT; t += dt) {
    x += fx * dt;
    z += fz * dt;
    vy -= G * dt;
    y += vy * dt;
    const loc = locate(T, x, z, hint);
    hint = loc.i;
    const g = groundAt(T, loc);
    if (g.fall || g.gap) {
      if (y < g.trailY - 1) return t;
      continue;
    }
    if (y <= g.y) return t;
  }
  return maxT;
}

function trickKind(key, steer) {
  if (key === "q") return Math.abs(steer) > 0.3 ? "spin" : "whip";
  return Math.abs(steer) > 0.3 ? "barspin" : "tabletop";
}

function stepCrash(B, T, dt) {
  const C = B.crash;
  C.t += dt;
  if (C.fell) {
    B.vy -= G * dt;
    B.y += B.vy * dt;
    const fx = Math.sin(B.h) * B.vF;
    const fz = Math.cos(B.h) * B.vF;
    B.vF *= Math.exp(-1.2 * dt);
    B.x += fx * dt;
    B.z += fz * dt;
    return;
  }
  // a short slide along the ground
  B.vF *= Math.exp(-3.4 * dt);
  B.vS *= Math.exp(-4 * dt);
  B.x += (Math.sin(B.h) * B.vF + Math.cos(B.h) * B.vS) * dt;
  B.z += (Math.cos(B.h) * B.vF - Math.sin(B.h) * B.vS) * dt;
  const q = locate(T, B.x, B.z, B.hint);
  B.hint = q.i;
  if (!q.onShort && Math.abs(q.lat) > q.barrier) {
    const S = T.samples[q.i];
    const sg = Math.sign(q.lat);
    const pen = Math.abs(q.lat) - q.barrier;
    B.x -= S.nx * sg * pen;
    B.z -= S.nz * sg * pen;
  }
  const g = groundAt(T, locate(T, B.x, B.z, B.hint));
  if (!g.fall && !g.gap) B.y += (g.y - B.y) * Math.min(1, dt * 10);
  B.loc = q;
}

export function stepBike(B, inp, T, dt, ev) {
  const P = B.p;
  if (B.crash) {
    stepCrash(B, T, dt);
    return;
  }
  if (B.invuln > 0) B.invuln = Math.max(0, B.invuln - dt);
  if (B.hopCool > 0) B.hopCool -= dt;
  if (B.hitT > 0) B.hitT -= dt;
  const loc = B.loc || locate(T, B.x, B.z, B.hint);
  const gnd = B.gnd || groundAt(T, loc);
  B.hint = loc.i;
  const steer = clamp(inp.steer || 0, -1, 1);
  const thr = B.hold ? 0 : clamp(inp.throttle || 0, 0, 1);
  const brk = clamp(inp.brake || 0, 0, 1);
  const sf = SURFACES[B.air ? "dirt" : gnd.surf] || SURFACES.dirt;
  const boosting = B.boostT > 0;
  B.pedaling = !B.air && thr > 0;
  B.braking = !B.air && brk > 0 && B.vF > 1;
  B.surf = B.air ? "air" : gnd.surf;

  // --- held at the gate ------------------------------------------------------------
  if (B.hold) {
    B.vF = 0;
    B.vS = 0;
    B.yawRate = 0;
    B.pedaling = (inp.throttle || 0) > 0;
    B.pedal += B.pedaling ? dt * 2 : 0;
    return;
  }

  // --- longitudinal --------------------------------------------------------------------
  let vF = B.vF;
  if (!B.air) {
    const S = loc.onShort ? T.shortcut.samples[0] : T.interp(loc.sMain).a;
    // arcade: ramps don't bleed speed — the trail grade keeps pulling
    let a = 9.8 * S.grade * 1.1;
    if (thr > 0) a += P.pedal * thr * clamp(1 - vF / P.pedalMax, 0.14, 1);
    a -= P.aero * vF * vF + 0.22 + sf.drag;
    if (brk > 0 && vF > 0) a -= 12 * brk;
    if (boosting) a += P.boostAccel;
    vF += a * dt;
    // ramp kicker: gap jumps always launch fast enough to clear
    if (gnd.ramp && gnd.ramp.minLaunch && vF < gnd.ramp.minLaunch) vF = gnd.ramp.minLaunch;
    const cap = P.vmax * sf.cap * (boosting ? 1.25 : 1);
    if (vF > cap) vF = Math.max(cap, vF - 9 * dt);
  } else {
    // in the air the descent keeps carrying the bike (no pedalling, light drag)
    const S = loc.onShort ? T.shortcut.samples[0] : T.interp(loc.sMain).a;
    vF += (9.8 * S.grade * 1.1 - P.aero * vF * vF - 0.1) * dt;
    if (boosting) vF += P.boostAccel * 0.4 * dt;
  }
  if (vF < 0) vF = 0;
  B.vF = vF;

  // --- steering ---------------------------------------------------------------------------
  const sp = vF;
  const auth = clamp(sp / 4, 0.25, 1) * (1 - 0.28 * clamp(sp / P.vmax, 0, 1.2));
  const yaw = steer * P.turn * auth * (B.air ? P.airCtl : 1);
  B.yawRate += (yaw - B.yawRate) * Math.min(1, dt * (B.air ? 4.5 : 9));
  B.h = wrapAngle(B.h + B.yawRate * dt);
  B.steerVis += (steer - B.steerVis) * Math.min(1, dt * 8);
  const leanT = B.air ? 0 : clamp(-B.yawRate * sp * 0.075, -0.75, 0.75);
  B.lean += (leanT - B.lean) * Math.min(1, dt * 7);

  // --- grip: carry velocity through the heading change, bleed the slide -----------------------
  const dh = B.yawRate * dt;
  const c = Math.cos(dh);
  const s = Math.sin(dh);
  const oF = B.vF;
  const oS = B.vS;
  B.vF = oF * c + oS * s;
  B.vS = -oF * s + oS * c;
  let grip = P.grip * sf.grip;
  if (B.air) grip = P.grip * 0.7;
  grip *= 1 - 0.3 * clamp((sp - P.vmax * 0.8) / (P.vmax * 0.4), 0, 1);
  const keep = Math.exp(-grip * dt);
  const mag2 = B.vF * B.vF + B.vS * B.vS;
  B.vS *= keep;
  if (B.vF > 0) {
    const full = Math.sqrt(Math.max(0, mag2 - B.vS * B.vS));
    B.vF += (full - B.vF) * 0.85;
  }

  // --- boost -----------------------------------------------------------------------------------
  if (inp.boostPressed && B.meter >= BOOST_SEG - 1e-6 && B.boostT < 0.2) {
    B.meter = Math.max(0, B.meter - BOOST_SEG);
    B.boostT = P.boostTime;
    ev?.({ type: "boost" });
  }
  if (B.boostT > 0) B.boostT = Math.max(0, B.boostT - dt);

  // --- bunny hop -----------------------------------------------------------------------------------
  if (inp.hop && !B.air && B.hopCool <= 0 && B.vF > 1.5) {
    B.air = true;
    B.airT = 0;
    B.vy = Math.max(B.vy, 0) + P.hop;
    B.hopCool = 0.5;
    B.compress = -0.25;
    B.airStartY = B.y;
    ev?.({ type: "hop" });
  }

  // --- integrate --------------------------------------------------------------------------------------
  const fx = Math.sin(B.h);
  const fz = Math.cos(B.h);
  const lx = Math.cos(B.h);
  const lz = -Math.sin(B.h);
  const ox = B.x;
  const oz = B.z;
  B.x += (fx * B.vF + lx * B.vS) * dt;
  B.z += (fz * B.vF + lz * B.vS) * dt;

  // --- edges -------------------------------------------------------------------------------------------
  let q = locate(T, B.x, B.z, B.hint);
  B.hint = q.i;
  const SC = T.shortcut;
  const inMain = Math.abs(q.lat) <= q.barrier;
  const inShort = SC && Math.abs(q.shortLat) <= q.shortBarrier && q.shortU > 0.3 && q.shortU < SC.length - 0.3;
  if (!inMain && !inShort) {
    const penMain = Math.abs(q.lat) - q.barrier;
    const penShort = SC ? Math.abs(q.shortLat) - q.shortBarrier : Infinity;
    const useShort = penShort < penMain;
    const isDrop = useShort ? q.shortDrop : q.drop;
    if (!isDrop) {
      let nx;
      let nz;
      if (!useShort) {
        const Sm = T.samples[q.i];
        const sg = Math.sign(q.lat);
        nx = Sm.nx * sg;
        nz = Sm.nz * sg;
        B.x -= nx * penMain;
        B.z -= nz * penMain;
      } else {
        const Q = q.shortSample;
        const sg = Math.sign(q.shortLat);
        nx = Q.nx * sg;
        nz = Q.nz * sg;
        B.x -= nx * penShort;
        B.z -= nz * penShort;
      }
      const wx = fx * B.vF + lx * B.vS;
      const wz = fz * B.vF + lz * B.vS;
      const into = wx * nx + wz * nz;
      if (into > 0) {
        const rx = wx - nx * into * 1.1;
        const rz = wz - nz * into * 1.1;
        B.vF = Math.max(0, (rx * fx + rz * fz) * 0.94);
        B.vS = (rx * lx + rz * lz) * 0.5;
        // slide the nose along the wall (always — a stopped bike must never stay pinned)
        const along = Math.hypot(rx, rz) > 0.3 ? Math.atan2(rx, rz) : Math.atan2(-nz * Math.sign(fx * -nz + fz * nx || 1), nx * Math.sign(fx * -nz + fz * nx || 1));
        B.h = wrapAngle(B.h + wrapAngle(along - B.h) * (B.vF > 2 ? 0.25 : 0.08));
        if (into > 2.5) ev?.({ type: "wall", hard: clamp(into / 10, 0, 1) });
      }
      q = locate(T, B.x, B.z, B.hint);
      B.hint = q.i;
    }
  }
  // start house behind, fence at the end of the run-out
  if (q.s < 1 && !q.onShort) {
    const Sm = T.samples[0];
    B.x += Sm.tx * (1 - q.s);
    B.z += Sm.tz * (1 - q.s);
  }
  if (q.s > T.length - 2) {
    B.vF = Math.min(B.vF, 1);
    const Sm = T.samples[T.N - 1];
    B.x -= Sm.tx * (q.s - (T.length - 2));
    B.z -= Sm.tz * (q.s - (T.length - 2));
  }

  // --- vertical ---------------------------------------------------------------------------------------
  const g2 = groundAt(T, q);
  if (!B.air) {
    const yb = B.y + B.vy * dt - 0.5 * G * dt * dt;
    if (g2.y < yb - 0.04) {
      // the ground fell away: airborne with the vertical speed we had
      B.air = true;
      B.airT = 0;
      B.airStartY = B.y;
      B.y = yb;
      B.vy -= G * dt;
      ev?.({ type: "takeoff", ramp: gnd.ramp ? gnd.ramp.size : null, big: !!(gnd.ramp && (gnd.ramp.size === "big" || gnd.ramp.gap)) });
    } else {
      const lim = B.vF * 0.6 + 1.5;
      B.vy = clamp((g2.y - B.y) / dt, -lim, lim);
      B.y = g2.y;
    }
  } else {
    B.airT += dt;
    B.vy -= G * dt;
    B.y += B.vy * dt;
    if ((g2.gap || g2.fall) && B.y < g2.trailY - (g2.fall ? 2.5 : 1.0)) {
      crashBike(B, g2.fall ? "fell" : "gap", ev);
      B.loc = q;
      B.gnd = g2;
      return;
    }
    if (!g2.fall && !g2.gap && B.y <= g2.y) land(B, g2, q, T, ev);
  }

  // --- tricks ----------------------------------------------------------------------------------------------
  if (inp.trick && B.air && !B.trick) {
    const kind = trickKind(inp.trick, steer);
    const dur = TRICKS[kind].dur / P.trickSpeed;
    const above = B.y - (g2.fall || g2.gap ? g2.trailY : g2.y);
    if (B.airTricks.length >= MAX_AIR_TRICKS) ev?.({ type: "trickDenied", why: "max" });
    else if (above > 0.8 && predictAirTime(B, T) >= dur * 0.75) {
      B.trick = { kind, t: 0, dur, dir: steer >= 0 ? 1 : -1 };
      ev?.({ type: "trickStart", kind });
    } else ev?.({ type: "trickDenied", why: "air" });
  }
  if (B.trick) {
    B.trick.t += dt;
    if (B.trick.t >= B.trick.dur) {
      B.airTricks.push(B.trick.kind);
      ev?.({ type: "trickDone", kind: B.trick.kind });
      B.trick = null;
    }
  }

  // --- obstacles ---------------------------------------------------------------------------------------
  if (!q.onShort) {
    const near = T.featAt[clamp(Math.round(q.sMain), 0, T.N - 1)];
    for (const f of near) {
      if (f.type === "rock" || f.type === "tree") {
        const dx = B.x - f.x;
        const dz = B.z - f.z;
        const d = Math.hypot(dx, dz);
        const rr = f.r + RADIUS;
        if (d >= rr || d < 1e-5) continue;
        const clearH = f.type === "tree" ? Infinity : f.r * 0.8;
        if (B.y - g2.trailY > clearH) continue; // sailing over it
        const nx = dx / d;
        const nz = dz / d;
        B.x += nx * (rr - d);
        B.z += nz * (rr - d);
        const wx = fx * B.vF + lx * B.vS;
        const wz = fz * B.vF + lz * B.vS;
        const into = -(wx * nx + wz * nz);
        if (into <= 0) continue;
        // only a real head-on hit crashes; glancing blows just cost speed (fair at 90+ km/h)
        if (into > Math.max(CRASH_INTO, B.vF * 0.55) && B.invuln <= 0) {
          crashBike(B, f.type, ev);
          B.loc = q;
          B.gnd = g2;
          return;
        }
        const rx = wx + nx * into * 1.05;
        const rz = wz + nz * into * 1.05;
        B.vF = Math.max(0, (rx * fx + rz * fz) * 0.72);
        B.vS = (rx * lx + rz * lz) * 0.5;
        B.hitT = 0.6;
        B.hitNx = nx;
        B.hitNz = nz;
        ev?.({ type: "hit", kind: f.type, hard: clamp(into / CRASH_INTO, 0, 1) });
      } else if (f.type === "log") {
        const prevS = B.lastS;
        if (prevS < f.s && q.sMain >= f.s && q.lat >= f.lat0 && q.lat <= f.lat1 && q.sMain - prevS < 4) {
          if (B.y - g2.trailY > LOG_H * 0.85) {
            ev?.({ type: "clearLog" });
            continue;
          }
          if (B.vF > LOG_CRASH && B.invuln <= 0) {
            crashBike(B, "log", ev);
            B.loc = q;
            B.gnd = g2;
            return;
          }
          B.vF *= 0.62;
          B.air = true;
          B.airT = 0;
          B.vy = 2.6;
          B.airStartY = B.y;
          ev?.({ type: "hit", kind: "log", hard: 0.6 });
        }
      }
    }
  }

  // --- suspension / feel -------------------------------------------------------------------------------
  const rough = B.air ? 0 : (SURFACES[g2.surf] || SURFACES.dirt).bump * clamp(B.vF / 16, 0, 1.4);
  B.rough = rough;
  B.compressV += (-B.compress * 70 - B.compressV * 9) * dt;
  B.compress += B.compressV * dt;
  if (rough > 0 && Math.random() < rough * dt * 9) B.compressV += (Math.random() - 0.3) * rough * 2.2;
  B.pedal += (B.pedaling ? (2.2 + B.vF * 0.12) * thr : boosting ? 3 : 0) * dt;
  B.lastS = q.sMain;
  B.loc = q;
  B.gnd = g2;
  B.moved = Math.hypot(B.x - ox, B.z - oz);
}

function land(B, g2, q, T, ev) {
  const P = B.p;
  const S = q.onShort ? T.shortcut.samples[0] : T.interp(q.sMain).a;
  const groundVy = -S.grade * B.vF;
  const impact = B.vy - groundVy; // negative = into the ground
  B.air = false;
  B.y = g2.y;
  B.vy = groundVy;
  const airT = B.airT;
  B.airT = 0;
  const tr = B.trick;
  B.trick = null;
  if (tr) {
    const p = tr.t / tr.dur;
    if (p < P.landTol) {
      B.airTricks = [];
      crashBike(B, "trick", ev);
      return;
    }
    // saved — but sketchy: no points for this jump
    B.airTricks = [];
    B.vF *= 0.78;
    B.compressV -= 4;
    ev?.({ type: "sketchy" });
    ev?.({ type: "land", hard: 1, airT });
    return;
  }
  const hard = clamp(-impact / 12, 0, 1);
  if (-impact > 9) B.vF *= P.landKeep;
  B.compressV -= 2 + hard * 7;
  if (B.airTricks.length) {
    const n = B.airTricks.length;
    const base = B.airTricks.reduce((a, k) => a + TRICKS[k].pts, 0);
    const pts = Math.round(base * (1 + 0.25 * (n - 1)));
    B.meter = Math.min(1, B.meter + 0.14 * n + (n > 1 ? 0.06 : 0));
    ev?.({ type: "trickLanded", pts, tricks: B.airTricks.slice(), combo: n });
    B.airTricks = [];
  }
  ev?.({ type: "land", hard, airT });
}

/** Display speed (km/h). */
export const kmh = (B) => Math.round(Math.max(0, B.vF) * 3.6);
