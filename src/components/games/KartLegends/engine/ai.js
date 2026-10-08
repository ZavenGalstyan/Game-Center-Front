/**
 * Kart Legends — AI drivers. They produce the same input a player does and
 * drive the same kart controller, so they obey the same rules: no teleports,
 * no extra grip, no wall-clipping.
 *
 *   line      a point ahead on the centreline (or the shortcut, for drivers
 *             that know it) plus the driver's lane offset
 *   speed     slow for the tightest curvature in the next stretch: v² = a·r,
 *             with `a` the driver's cornering nerve
 *   lanes     drift between lanes; dodge sideways when a kart is close ahead
 *   boost     spend a meter segment on a clear straight
 *   balance   a gentle, capped nudge toward the player (never permanent
 *             rubber-banding): ±4 % top speed beyond 70 m apart
 *   unstick   reverse briefly when wedged
 */
import { clamp, wrapAngle, mulberry32 } from "./rng.js";

export function createAI(index, difficulty, seed) {
  const rand = mulberry32(seed * 31 + index * 977);
  const d = clamp(difficulty, 0, 1);
  return {
    skill: 0.85 + d * 0.07 + (rand() - 0.5) * 0.03 - index * 0.008,
    nerve: 15.5 + d * 4.5 + rand() * 2,
    look: 7 + rand() * 2,
    lane: (rand() - 0.5) * 3,
    laneTarget: 0,
    laneT: 0,
    boostSkill: 0.3 + d * 0.7,
    shortcut: d > 0.35 && index === 0 ? 1 : d > 0.7 && index === 1 ? 1 : 0,
    stuckT: 0,
    reverseT: 0,
    rand,
    wantBoost: 0,
    drifts: d > 0.15 && index !== 2 ? 1 : d > 0.5 ? 1 : 0,
  };
}

/** The player-strength driver used by tests ("could a player win this?"). */
export function createBotDriver(skill = 1) {
  const ai = createAI(0, 1, 7);
  ai.skill = skill;
  ai.nerve = 23;
  ai.lane = 0;
  ai.shortcut = 1;
  ai.boostSkill = 1;
  ai.drifts = 1;
  return ai;
}

function maxCurvAhead(T, s, from, to) {
  let m = 0;
  for (let d = from; d <= to; d += 2) m = Math.max(m, Math.abs(T.sampleAtS(s + d).curv));
  return m;
}

/** Curvature ahead along the shortcut (and the main road after it). */
function maxCurvShort(T, SC, loc, from, to) {
  const st = (loc.shortT || 0) * SC.length;
  let m = 0;
  for (let d = from; d <= to; d += 2) {
    const a = st + d;
    const c = a < SC.length ? SC.samples[Math.min(SC.samples.length - 1, Math.floor(a))].curv : T.sampleAtS(SC.s1 + a - SC.length).curv;
    m = Math.max(m, Math.abs(c));
  }
  return m;
}

export function aiInput(R, racer, dt, playerProg) {
  const ai = racer.ai;
  const K = racer.kart;
  const T = R.T;
  const inp = { throttle: 0, brake: 0, steer: 0, drift: false, boostPressed: false };
  const loc = K.loc || { s: 0, lat: 0, i: 0 };
  const sp = Math.max(0, K.vF);
  const s = loc.s;

  // unstick: wedged against something with throttle on
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    inp.brake = 1;
    inp.steer = -Math.sign(loc.lat || 1) * 0.8;
    return inp;
  }
  if (R.state === "RACING" && sp < 1.2) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 1.6) {
    ai.stuckT = 0;
    ai.reverseT = 0.9;
  }

  // lanes: wander a little, dodge karts close ahead
  ai.laneT -= dt;
  if (ai.laneT <= 0) {
    ai.laneT = 2 + ai.rand() * 3;
    ai.laneTarget = (ai.rand() - 0.5) * Math.min(4, loc.w * 0.7);
  }
  for (const o of R.racers) {
    if (o === racer) continue;
    const ol = o.kart.loc;
    if (!ol) continue;
    const ahead = ol.s - s;
    if (ahead > 0 && ahead < 9 && Math.abs(ol.lat - (loc.lat || 0)) < 2) {
      ai.laneTarget = ol.lat > (loc.lat || 0) ? ol.lat - 2.8 : ol.lat + 2.8;
      ai.laneTarget = clamp(ai.laneTarget, -loc.w * 0.75, loc.w * 0.75);
    }
  }
  ai.lane += (ai.laneTarget - ai.lane) * Math.min(1, dt * 0.9);

  // target point
  const lookD = ai.look + sp * 0.42;
  let tx;
  let tz;
  const SC = T.shortcut;
  const sMod = ((s % T.length) + T.length) % T.length;
  const near = (a, b) => {
    let d = a - b;
    d = ((d % T.length) + T.length * 1.5) % T.length - T.length / 2;
    return d;
  };
  // commit to the shortcut at its mouth; let go at the far end (or if knocked off it)
  if (SC && ai.shortcut) {
    const d0 = near(sMod, SC.s0 % T.length);
    if (!ai.scActive && d0 > -lookD - 4 && d0 < 1.5) ai.scActive = true;
    if (ai.scActive && (loc.shortT > 0.97 || (loc.shortT > 0.05 && !loc.onShort && Math.abs(loc.shortLat) > SC.width + 5))) ai.scActive = false;
  } else ai.scActive = false;
  const useShort = !!ai.scActive;
  if (useShort) {
    // follow the shortcut's own centreline
    const st = loc.shortT || 0;
    const d = st * SC.length + lookD;
    if (d < SC.length) {
      const q = SC.samples[Math.min(SC.samples.length - 1, Math.floor(d))];
      tx = q.x;
      tz = q.z;
    } else {
      const q = T.sampleAtS(SC.s1 + (d - SC.length));
      tx = q.x;
      tz = q.z;
    }
  } else {
    const q = T.sampleAtS(s + lookD);
    tx = q.x + q.nx * ai.lane;
    tz = q.z + q.nz * ai.lane;
  }
  const want = Math.atan2(tx - K.x, tz - K.z);
  const diff = wrapAngle(want - K.h);
  inp.steer = clamp(diff * 2.6, -1, 1);

  // speed for the corners ahead (on the shortcut: its own bends)
  let target = K.p.maxSpeed * ai.skill;
  const curv = useShort ? maxCurvShort(T, SC, loc, 4, 14 + sp * 1.3) : maxCurvAhead(T, s, 4, 14 + sp * 1.3);
  if (curv > 1e-3) target = Math.min(target, Math.sqrt(ai.nerve / curv));
  if (K.ice) target *= 0.92;
  // limited catch-up, both ways
  if (playerProg != null) {
    const gap = racer.prog - playerProg;
    if (gap > 70) target *= 0.96;
    else if (gap < -70) target *= 1.04;
  }
  target = Math.min(target, K.p.maxSpeed * 1.0);
  if (sp < target - 0.4) inp.throttle = 1;
  else if (sp > target + 2.2) inp.brake = clamp((sp - target) / 6, 0.2, 1);

  // drift through long corners (same controller and rules as the player)
  if (ai.drifts && R.state === "RACING" && !useShort) {
    const D = K.drift;
    if (!D.on) {
      let c = 0;
      for (let d = 4; d <= 20; d += 4) c += T.sampleAtS(s + d).curv;
      c /= 5;
      if (sp > 15 && Math.abs(c) > 1 / 34 && Math.sign(c) === Math.sign(inp.steer) && Math.abs(inp.steer) > 0.35) inp.drift = true;
    } else {
      let c = 0;
      for (let d = 0; d <= 12; d += 3) c += T.sampleAtS(s + d).curv * D.dir;
      c /= 5;
      inp.drift = (c > 1 / 70 || D.t < 0.5) && D.t < 3.2 && Math.abs(loc.lat || 0) < loc.w + 0.5;
    }
  }

  // boost on a clear straight
  if (K.meter >= 1 / 3 && K.boostT <= 0 && R.state === "RACING") {
    const straight = maxCurvAhead(T, s, 0, 55) < 0.012;
    if (straight && ai.rand() < ai.boostSkill * dt * 2) inp.boostPressed = true;
  }
  return inp;
}
