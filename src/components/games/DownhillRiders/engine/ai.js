/**
 * Downhill Riders — AI riders. They produce the same input a player does and
 * ride the same bike controller, so they obey the same rules: no teleports
 * (only the same checkpoint respawn a crashed player gets), no extra grip, no
 * passing through cliffs, no skipped checkpoints.
 *
 *   line      a point ahead on the trail centreline (or the shortcut, for
 *             riders that know it) plus a lane offset
 *   lanes     re-planned a few times a second: away from rocks, trees and
 *             mud ahead, toward the inside of the next bend, off drop edges
 *   speed     the fastest the bike could hold through the tightest bend
 *             ahead, scaled by the rider's corner skill and a small error
 *             that changes every few seconds (so they don't nail every
 *             corner)
 *   logs      decide once per log: hop it (timed) or roll over it slowly
 *   air       sometimes trick, only when there's clearly time to land it
 *   boost     spend a segment on a clear straight
 *   balance   a gentle, capped nudge toward the player (±4 % top speed
 *             beyond 80 m apart) — never permanent rubber-banding
 */
import { clamp, wrapAngle, mulberry32 } from "./rng.js";
import { predictAirTime, TRICKS } from "./bike.js";

export function createAI(index, difficulty, seed) {
  const rand = mulberry32(seed * 31 + index * 977 + 5);
  const d = clamp(difficulty, 0, 1);
  return {
    skill: 0.9 + d * 0.08 + (rand() - 0.5) * 0.02 - index * 0.012,
    corner: 0.8 + d * 0.13 + (rand() - 0.5) * 0.03,
    // how hard they pedal: the main difference between an easy and a hard rival
    effort: clamp(0.7 + d * 0.3 + (rand() - 0.5) * 0.04 - index * 0.02, 0.6, 1),
    look: 6 + rand() * 2,
    lane: (rand() - 0.5) * 2,
    laneTarget: 0,
    laneT: 0,
    hopSkill: 0.78 + d * 0.2,
    trickSkill: 0.15 + d * 0.65,
    boostSkill: 0.35 + d * 0.65,
    shortcut: (d > 0.3 && index === 0) || (d > 0.65 && index === 1) ? 1 : 0,
    err: 1,
    errT: 0,
    errAmp: 0.07 - d * 0.035,
    logs: new Map(),
    sides: new Map(), // obstacle id → the side we committed to pass it on
    airPlan: null,
    scActive: false,
    rand,
  };
}

/** The player-strength driver used by tests ("could a player win this?"). */
export function createBotDriver(skill = 1) {
  const ai = createAI(0, 1, 7);
  ai.skill = skill;
  ai.corner = 0.86 + (skill - 0.9) * 0.6;
  ai.lane = 0;
  ai.shortcut = skill >= 0.95 ? 1 : 0;
  ai.boostSkill = 1;
  ai.hopSkill = 1;
  ai.trickSkill = skill >= 0.95 ? 1 : 0.3;
  ai.errAmp = 0.02;
  ai.effort = skill >= 0.95 ? 1 : 0.9;
  ai.bot = true;
  return ai;
}

/** Fastest speed the bike can hold on a bend of curvature k (rad/m). */
function cornerSpeed(P, k, f) {
  if (k < 1e-4) return Infinity;
  const a = (f * P.turn) / k;
  return a / (1 + (0.28 * a) / P.vmax);
}

function maxCurvAhead(T, s, from, to) {
  let m = 0;
  for (let d = from; d <= to; d += 2) m = Math.max(m, Math.abs(T.sampleAtS(s + d).curv));
  return m;
}

function planLane(ai, R, racer, loc) {
  const T = R.T;
  const K = racer.bike;
  const S = T.interp(loc.sMain).a;
  const w = S.w;
  const s = loc.sMain;
  // a line toward the inside of the next bend
  let c = 0;
  for (let d = 6; d <= 30; d += 4) c += T.sampleAtS(s + d).curv;
  c /= 7;
  const ideal = clamp(c * 160, -1, 1) * w * 0.45 + ai.lane * 0.25;
  let best = ai.laneTarget;
  let bestCost = Infinity;
  // look further ahead the faster we go (a line change takes time, not distance)
  const sp = Math.max(0, K.vF);
  const horizon = Math.max(40, 18 + sp * 1.9);
  const conv = Math.max(24, sp * 1.35);
  const others = R.racers.filter((o) => o !== racer && !o.bike.crash && o.bike.loc && o.bike.loc.s - s > -1 && o.bike.loc.s - s < 12);
  const feats = [];
  for (let d = 0; d <= horizon; d += 6) for (const f of T.featAt[clamp(Math.round(s + d), 0, T.N - 1)]) if (!feats.includes(f)) feats.push(f);
  for (let lane = -w * 0.78; lane <= w * 0.78 + 1e-6; lane += 0.5) {
    const Sx = T.sampleAtS(s + 15);
    const dropL = Sx.dropL || S.dropL;
    const dropR = Sx.dropR || S.dropR;
    if ((dropL && lane > w - 1.0) || (dropR && lane < -w + 1.0)) continue;
    // commit to a chosen line (changing your mind mid-slalom is how riders crash)
    let cost = Math.abs(lane - ideal) * 0.8 + Math.abs(lane - ai.laneTarget) * 2.2;
    for (const o of others) {
      const dl = Math.abs(lane - o.bike.loc.lat);
      if (dl < 1.8) cost += 14 * (1 - dl / 1.8);
    }
    for (const f of feats) {
      const ahead = (f.s ?? f.s0) - s;
      if (ahead < -1 || ahead > horizon) continue;
      if (f.type === "rock" || f.type === "tree") {
        // where the bike will actually be when it gets there: it needs ~30 m
        // to move across, so judge the predicted line, not just the lane
        const at = loc.lat + (lane - loc.lat) * Math.min(1, Math.max(0, ahead) / conv);
        const dl = Math.min(Math.abs(lane - f.lat), Math.abs(at - f.lat));
        // once committed to a side of an obstacle, never swap sides mid-approach
        const side = ai.sides.get(f.id);
        if (side && Math.sign(lane - f.lat || 1) !== side && ahead < conv * 1.2) cost += 400;
        const hard = f.r + 0.95; // the bike can't pass closer than this
        const soft = f.r + 1.9; // comfort margin
        if (dl < hard) cost += 220;
        else if (dl < soft) cost += 30 * (1 - (dl - hard) / (soft - hard));
      } else if (f.type === "patch") {
        if (lane >= f.lat0 - 0.6 && lane <= f.lat1 + 0.6) cost += f.surf === "mud" ? 25 : f.surf === "roots" ? 6 : 3;
      } else if (f.type === "ramp" && !f.full) {
        if (Math.abs(lane - f.lat) < f.hw - 0.4) cost -= ai.trickSkill > 0.4 ? 10 : 2;
      } else if (f.type === "orb") {
        if (Math.abs(lane - f.lat) < 0.9) cost -= 4;
      }
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = lane;
    }
  }
  ai.laneTarget = best;
  // commit to a side for every solid obstacle that's now within reach
  for (const f of feats) {
    if (f.type !== "rock" && f.type !== "tree") continue;
    const ahead = f.s - s;
    if (ahead > 0 && ahead < conv * 1.2 && !ai.sides.has(f.id)) ai.sides.set(f.id, Math.sign(best - f.lat || 1));
  }
}

export function aiInput(R, racer, dt, playerS) {
  const ai = racer.ai;
  const K = racer.bike;
  const P = K.p;
  const T = R.T;
  const inp = { throttle: 0, brake: 0, steer: 0, hop: false, trick: null, boostPressed: false };
  const loc = K.loc;
  if (!loc || K.crash) return inp;
  const sp = Math.max(0, K.vF);
  const s = loc.s;

  // small corner error, re-rolled every few seconds
  ai.errT -= dt;
  if (ai.errT <= 0) {
    ai.errT = 2.5 + ai.rand() * 3;
    ai.err = 1 + (ai.rand() - 0.5) * 2 * ai.errAmp;
  }
  // lanes
  ai.laneT -= dt;
  if (ai.laneT <= 0) {
    ai.laneT = 0.2;
    if (!loc.onShort) planLane(ai, R, racer, loc);
  }
  ai.lane += (ai.laneTarget - ai.lane) * Math.min(1, dt * 2.2);

  // shortcut: commit at its mouth, let go at the far end
  const SC = T.shortcut;
  const lookD = ai.look + sp * 0.45;
  if (SC && ai.shortcut) {
    const d0 = s - SC.s0;
    if (!ai.scActive && d0 > -lookD - 4 && d0 < 1.5 && !loc.onShort) ai.scActive = true;
    if (ai.scActive && (loc.shortU > SC.length - 3 || (s > SC.s0 + 6 && !loc.onShort && Math.abs(loc.shortLat) > SC.width + 4))) ai.scActive = false;
  } else ai.scActive = false;
  const useShort = ai.scActive;
  let tx;
  let tz;
  if (useShort) {
    // progress along the shortcut even when slightly off its band (never aim back at its start)
    const u = (loc.onShort || loc.shortU > 1 ? loc.shortU : 0) + lookD;
    if (u < SC.length) {
      const q = SC.interp(u);
      tx = q.x;
      tz = q.z;
    } else {
      const q = T.pointAt(SC.s1 + (u - SC.length));
      tx = q.x;
      tz = q.z;
    }
  } else {
    const q = T.pointAt(loc.sMain + lookD, ai.lane);
    tx = q.x;
    tz = q.z;
  }
  const diff = wrapAngle(Math.atan2(tx - K.x, tz - K.z) - K.h);
  inp.steer = clamp(diff * 2.3 - K.yawRate * 0.3, -1, 1);
  // bounced off a rock / tree: steer away from it and re-plan at once
  if (K.hitT > 0) {
    const away = Math.sign(Math.cos(K.h) * K.hitNx - Math.sin(K.h) * K.hitNz) || 1;
    inp.steer = away;
    ai.laneT = 0;
  }

  // speed: what the bends ahead allow
  let target = P.vmax * ai.skill;
  let curv;
  if (useShort) {
    curv = 0;
    const u0 = loc.onShort || loc.shortU > 1 ? loc.shortU : 0;
    for (let d = 4; d <= 12 + sp * 1.2; d += 2) {
      const u = u0 + d;
      curv = Math.max(curv, Math.abs(u < SC.length ? SC.interp(u).a.curv : T.sampleAtS(SC.s1 + u - SC.length).curv));
    }
    target *= SC.kind === "bridge" || SC.kind === "cliff" ? 0.86 : 0.95;
  } else curv = maxCurvAhead(T, loc.sMain, 3, 12 + sp * 1.25);
  target = Math.min(target, cornerSpeed(P, curv, ai.corner * ai.err));
  const surf = K.gnd ? K.gnd.surf : "dirt";
  if (surf === "ice" || surf === "snow") target *= 0.95;
  // narrow drop sections: take them a little easier
  const Sh = T.interp(loc.sMain).a;
  if ((Sh.dropL || Sh.dropR) && Sh.w < 3) target *= 0.9;
  // logs: hop them or roll over slowly
  if (!loc.onShort) {
    const logLook = Math.max(30, 14 + sp * 1.7);
    for (let d = 0; d <= logLook; d += 3) {
      for (const f of T.featAt[clamp(Math.round(loc.sMain + d), 0, T.N - 1)]) {
        if (f.type !== "log") continue;
        const ahead = f.s - loc.sMain;
        if (ahead < 0 || ahead > logLook) continue;
        if (!ai.logs.has(f.id)) ai.logs.set(f.id, ai.rand() < ai.hopSkill);
        const hop = ai.logs.get(f.id);
        if (!hop) target = Math.min(target, 10.5);
        else if (!K.air && ahead < sp * 0.27 + 0.25 && ahead > sp * 0.1) inp.hop = true;
      }
    }
  }
  // limited catch-up, both ways
  if (playerS != null && !ai.bot) {
    const gap = racer.prog - playerS;
    if (gap > 80) target *= 0.96;
    else if (gap < -80) target *= 1.04;
  }
  // brake only for what's ahead (bends, logs) — never to shed a boost on the open trail
  const cruise = P.vmax * ai.skill * (playerS != null && !ai.bot ? 1.04 : 1);
  if (sp < target - 0.3) inp.throttle = ai.effort;
  else if (sp > target + 1.2 && target < cruise - 0.5) inp.brake = clamp((sp - target) / 5, 0.15, 1);

  // tricks: decided once per jump, only when there's clearly time
  if (K.air) {
    if (ai.airPlan == null) ai.airPlan = { want: ai.rand() < ai.trickSkill, tries: 0 };
    const plan = ai.airPlan;
    if (plan.want && !K.trick && K.airT > 0.04 && plan.tries < 2 && K.airTricks.length < 2) {
      const kind = ai.rand() < 0.5 ? "whip" : "tabletop";
      const tLeft = predictAirTime(K, T);
      if (tLeft > (TRICKS[kind].dur / P.trickSpeed) * 1.15 + 0.05) {
        inp.trick = kind === "whip" ? "q" : "e";
        inp.steer = 0;
        plan.tries++;
      } else plan.tries = 2;
    }
  } else ai.airPlan = null;

  // boost on a clear straight
  if (K.meter >= 1 / 3 && K.boostT <= 0 && R.state === "RACING" && !K.air) {
    const straight = maxCurvAhead(T, loc.sMain, 0, 45) < 1 / 70;
    if (straight && ai.rand() < ai.boostSkill * dt * 2.5) inp.boostPressed = true;
  }
  return inp;
}
