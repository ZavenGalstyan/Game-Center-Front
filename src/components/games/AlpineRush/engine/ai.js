/**
 * Alpine Rush — AI skiers. They produce the same input a player does (steer,
 * tuck, race tuck, snowplough, hard carve) and ski the same controller, so
 * they obey the same rules: no teleports (only the respawn a fallen player
 * gets), no extra grip, no skipped gates.
 *
 *   line      a lane (lateral offset) as a function of distance: through the
 *             centre of every upcoming gate corridor (slightly to the inside
 *             of the turn for good skiers), the piste centre otherwise,
 *             re-planned a few times a second around trees, rocks, snow
 *             cannons and fences ahead
 *   steering  aim at a point on that line a speed-scaled distance ahead
 *   speed     the line's curvature over the next stretch gives the fastest
 *             speed the skis can carve it at (a_lat / κ); braking distance
 *             back from every tight spot gives what's allowed now — brake
 *             (snowplough) above it, tuck below it
 *   profiles  BEGINNER / INTERMEDIATE / ADVANCED / EXPERT: corner margin,
 *             tuck discipline, line precision and a small error that
 *             changes every few seconds
 */
import { clamp, wrapAngle, mulberry32 } from "./rng.js";
import { SURFACES } from "./course.js";

export const PROFILES = {
  beginner: { label: "Beginner", corner: 0.66, tuck: 0.55, race: 0, err: 0.09, inside: 0.1, look: 7 },
  intermediate: { label: "Intermediate", corner: 0.76, tuck: 0.8, race: 0.25, err: 0.06, inside: 0.25, look: 7.5 },
  advanced: { label: "Advanced", corner: 0.85, tuck: 0.95, race: 0.6, err: 0.04, inside: 0.4, look: 8 },
  expert: { label: "Expert", corner: 0.91, tuck: 1, race: 0.9, err: 0.02, inside: 0.5, look: 8.5 },
};

export function profileFor(difficulty, index) {
  const d = clamp(difficulty - index * 0.07, 0, 1);
  if (d < 0.25) return "beginner";
  if (d < 0.5) return "intermediate";
  if (d < 0.78) return "advanced";
  return "expert";
}

export function createAI(index, difficulty, seed, profileName = null) {
  const rand = mulberry32(seed * 31 + index * 977 + 5);
  const name = profileName || profileFor(difficulty, index);
  const pr = PROFILES[name];
  return {
    profile: name,
    corner: pr.corner + (rand() - 0.5) * 0.03,
    tuckSkill: pr.tuck,
    raceSkill: pr.race,
    errAmp: pr.err,
    inside: pr.inside,
    look: pr.look + rand() * 1.5,
    lane: 0,
    // a personal line inside every corridor so rivals do not ski into each other
    offset: [0, -0.9, 0.9, 0][index % 4] ?? 0,
    laneT: 0,
    plan: null,
    err: 1,
    errT: 0,
    sides: new Map(),
    rand,
  };
}

/** The player-strength skier used by the tests ("can a player get gold?"). */
export function createBotDriver(skill = 1) {
  const ai = createAI(0, 1, 7, "expert");
  ai.corner = 0.86 + (skill - 0.9) * 0.9;
  ai.tuckSkill = skill >= 0.95 ? 1 : 0.85;
  ai.raceSkill = skill >= 0.95 ? 1 : 0.4;
  ai.errAmp = 0.015;
  ai.inside = 0.45;
  ai.bot = true;
  return ai;
}

/** Lane through gates: piecewise-smooth lat(s) for the next stretch. */
function buildPlan(ai, R, racer, s0) {
  const T = R.T;
  const gates = R.mode === "free" ? [] : T.gates;
  const pts = [];
  const K = racer.sk;
  pts.push([s0, K.loc ? K.loc.lat : 0]);
  let next = racer.nextGate;
  const horizon = s0 + 160;
  for (let k = next; k < gates.length && gates[k].s < horizon; k++) {
    const g = gates[k];
    // aim a little toward the inside of the turn the gate starts (the next one's side)
    const nx = gates[k + 1];
    const toward = nx ? Math.sign(nx.lat - g.lat) : 0;
    const lat = g.lat + toward * g.hw * ai.inside * 0.3;
    pts.push([g.s, clamp(lat + (ai.offset || 0), g.lat - g.hw * 0.55, g.lat + g.hw * 0.55)]);
  }
  const last = pts[pts.length - 1];
  if (last[0] < horizon) pts.push([Math.max(last[0] + 30, Math.min(horizon, T.sFinish + 10)), next >= gates.length || !gates.length ? ai.freeLane ?? 0 : last[1] * 0.5]);
  ai.plan = pts;
}

/** Smooth (cosine-eased) lateral along the plan. */
function laneAt(plan, s) {
  if (!plan || plan.length === 0) return 0;
  if (s <= plan[0][0]) return plan[0][1];
  for (let i = 1; i < plan.length; i++) {
    const [sb, lb] = plan[i];
    if (s <= sb) {
      const [sa, la] = plan[i - 1];
      const u = clamp((s - sa) / Math.max(1e-3, sb - sa), 0, 1);
      const e = (1 - Math.cos(Math.PI * u)) / 2;
      return la + (lb - la) * e;
    }
  }
  return plan[plan.length - 1][1];
}

/** Obstacle offset: push the lane clear of solid things ahead (committed side). */
function avoid(ai, T, s, lat, K) {
  let out = lat;
  for (let d = -2; d <= 40; d += 3) {
    for (const f of T.featAt[clamp(Math.round(s + d), 0, T.N - 1)]) {
      if (f.type === "rock" || f.type === "tree" || f.type === "cannon") {
        if (Math.abs((f.s ?? 0) - s) > 14) continue;
        const need = f.r + 1.6;
        const dl = out - f.lat;
        if (Math.abs(dl) < need) {
          let side = ai.sides.get(f.id);
          if (!side) {
            const w = T.sampleAtS(f.s).w;
            const roomL = w - (f.lat + need);
            const roomR = f.lat - need + w;
            side = Math.abs(dl) > 0.3 ? Math.sign(dl) : roomL > roomR ? 1 : -1;
            if ((side > 0 && roomL < 1) || (side < 0 && roomR < 1)) side = -side;
            ai.sides.set(f.id, side);
          }
          out = f.lat + side * need;
        }
      } else if (f.type === "fence") {
        if (Math.abs(f.s - s) > 10) continue;
        if (out > f.lat0 - 1.6 && out < f.lat1 + 1.6) {
          const w = T.sampleAtS(f.s).w;
          const left = f.lat1 + 2.2;
          const right = f.lat0 - 2.2;
          out = left < w - 0.8 && (Math.abs(left - lat) < Math.abs(right - lat) || right < -w + 0.8) ? left : right;
        }
      }
    }
  }
  void K;
  return out;
}

export function aiInput(R, racer, dt) {
  const ai = racer.ai;
  const K = racer.sk;
  const P = K.p;
  const T = R.T;
  const inp = { tuck: 0, race: 0, brake: 0, steer: 0, sharp: 0, jump: false };
  const loc = K.loc;
  if (!loc || K.crash) return inp;
  const sp = K.air ? Math.hypot(K.ax, K.az) : Math.max(0, K.vF);
  const s = loc.s;

  ai.errT -= dt;
  if (ai.errT <= 0) {
    ai.errT = 2.5 + ai.rand() * 3;
    ai.err = 1 + (ai.rand() - 0.5) * 2 * ai.errAmp;
  }
  ai.laneT -= dt;
  if (ai.laneT <= 0 || !ai.plan) {
    ai.laneT = 0.15;
    buildPlan(ai, R, racer, s);
  }

  // in the air: keep the skis straight (they re-align themselves)
  if (K.air) return inp;

  const look = ai.look + sp * 0.42;
  // aim at the next gate itself until we are nearly through it (looking past
  // it cuts the corner and clips the gate)
  const ng = R.mode !== "free" ? T.gates[racer.nextGate] : null;
  const sa = ng && ng.s - s > 2.5 && ng.s < s + look ? ng.s : s + look;
  let want = avoid(ai, T, sa, laneAt(ai.plan, sa), K);
  // give way: keep clear of a skier alongside or just ahead (rivals never ram)
  {
    for (const o of R.racers) {
      if (o === racer || o.sk.crash || !o.sk.loc) continue;
      const ds = o.sk.loc.s - s;
      if (ai.bot && ds < 0) continue; // the player-strength skier only steers round skiers ahead (overtaking)
      const dl = want - o.sk.loc.lat;
      if (ds > -5 && ds < 10 && Math.abs(dl) < 2.0) want = o.sk.loc.lat + (Math.sign(dl) || (o.sk.loc.lat > 0 ? -1 : 1)) * 2.0;
    }
  }
  const w = T.sampleAtS(sa).w;
  const lat = clamp(want, -w + 1.0, w - 1.0);
  const tp = T.pointAt(sa, lat);
  const diff = wrapAngle(Math.atan2(tp.x - K.x, tp.z - K.z) - K.h);
  inp.steer = clamp(diff * 2.6 - K.yawRate * 0.28, -1, 1);
  if (K.hitT > 0) {
    const away = Math.sign(Math.cos(K.h) * K.hitNx - Math.sin(K.h) * K.hitNz) || 1;
    inp.steer = away;
    ai.laneT = 0;
  }

  // speed: the curvature of the line ahead → what the edges can hold → braking distance
  const surf = SURFACES[K.gnd ? K.gnd.surf : "normal"] || SURFACES.normal;
  const aLat = P.aLat * ai.corner * ai.err * surf.turn;
  const brakeA = P.brake * surf.brake * 0.8;
  let allowed = P.vmax;
  const step = 4;
  let prevLat = laneAt(ai.plan, s);
  let prevSlope = 0;
  for (let d = step; d <= 26 + sp * 2.6; d += step) {
    const sd = s + d;
    const la = avoid(ai, T, sd, laneAt(ai.plan, sd), K);
    const slope = (la - prevLat) / step;
    const k2 = Math.abs(slope - prevSlope) / step + Math.abs(T.sampleAtS(sd).curv);
    prevLat = la;
    prevSlope = slope;
    if (d <= step) continue;
    const vc = k2 > 1e-4 ? Math.sqrt(aLat / k2) : Infinity;
    const va = Math.sqrt(vc * vc + 2 * brakeA * Math.max(0, d - 6));
    if (va < allowed) allowed = va;
  }
  // icy / rough stretches: a little more respect
  if (surf === SURFACES.ice) allowed *= 0.94;
  allowed = Math.max(allowed, 6);
  const straight = Math.abs(inp.steer) < 0.25;
  if (sp > allowed + 1.2) inp.brake = 1;
  else if (sp < allowed - 0.6) {
    if (ai.rand() < ai.tuckSkill || ai.bot) inp.tuck = 1;
    if (straight && ai.raceSkill > 0 && sp < allowed - 3 && (ai.bot ? ai.raceSkill >= 1 : ai.rand() < ai.raceSkill)) inp.race = 1;
  }
  // hard carve when the line asks for more than a normal carve gives
  if (Math.abs(inp.steer) > 0.92 && Math.abs(diff) > 0.18 && sp < P.vmax * 0.66) inp.sharp = 1;
  // a fresh start: push out of the gate
  if (sp < 5 && R.state === "RACING") inp.tuck = 1;
  return inp;
}
