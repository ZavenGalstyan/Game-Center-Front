/**
 * Alpine Rush — one race: the single authoritative simulation.
 *
 *   COUNTDOWN  3 · 2 · 1 · GO — skiers held in the start house (nobody gets
 *              a jump on the start); at GO everyone pushes out of the gate
 *   RACING     the clock runs (fixed 120 Hz steps → identical at any frame
 *              rate; pausing simply stops stepping), gates, falls, respawns
 *   FINISHED   the player crossed the finish line; rivals still on the hill
 *              get a projected time (their pace), so results are immediate
 *
 * Race rule (the same in every mode, shown before the start and in the
 * HUD): gates must be passed in order between their two poles. A missed
 * gate is never re-skied — it adds a time penalty (TIME TRIAL / RIVAL RACE
 * +3 s, SLALOM +5 s). Missing more than a third of the gates is a
 * disqualification: no medal, no unlock. Medals: TIME TRIAL and SLALOM by
 * the adjusted time against the course's gold / silver / bronze times;
 * RIVAL RACE by finishing position (on adjusted times). FREE SKI has no
 * clock that counts, no gates and no rivals.
 */
import { buildCourse, locate, groundAt } from "./course.js";
import { createSkier, stepSkier, respawnSkier, getUp, crashSkier, GETUP_TIME, FALL_TIME, RADIUS, speedOf } from "./skier.js";
import { createAI, aiInput } from "./ai.js";
import { paramsFor, skiParams, RIVALS } from "../data/skis.js";
import { clamp } from "./rng.js";

export const STEP = 1 / 120;
export const RSTATE = Object.freeze({ COUNTDOWN: "COUNTDOWN", RACING: "RACING", FINISHED: "FINISHED" });
const COUNT = 3.6;
export const MISS_PENALTY = { time: 3, rival: 3, slalom: 5, free: 0 };
export const MODE_NAMES = { time: "Time Trial", slalom: "Slalom", rival: "Rival Race", free: "Free Ski" };
export const dsqLimit = (nGates) => Math.floor(nGates / 3);

const courseCache = new Map();
/** Courses are immutable: build once per def and share between attempts. */
export function courseFor(def) {
  if (!courseCache.has(def)) courseCache.set(def, buildCourse(def));
  return courseCache.get(def);
}

/**
 * Rival ski stats. Top speed stays at or below the skis a player has by then
 * (on steep pitches it decides everything); difficulty comes from cornering,
 * line choice and tuck discipline (engine/ai.js profiles) instead.
 */
export function rivalStats(difficulty, k) {
  const d = difficulty;
  const off = (k - 1) * 0.15;
  return {
    speed: clamp(2.0 + d * 1.4 - off, 1, 3.6),
    handling: clamp(2.6 + d * 2.0 - off, 1, 4.8),
    braking: clamp(2.8 + d * 1.2, 1, 4.5),
    stability: clamp(3 + d * 1.5, 1, 5),
  };
}

export function medalFor(def, mode, adjusted, place, dsq) {
  if (dsq) return null;
  if (mode === "rival") return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : null;
  const m = def.medals;
  if (!m) return null;
  if (adjusted <= m[0]) return "gold";
  if (adjusted <= m[1]) return "silver";
  if (adjusted <= m[2]) return "bronze";
  return null;
}

export function createRace(def, ski, opts = {}) {
  const T = opts.course || courseFor(def);
  const mode = opts.mode || def.mode || "time";
  const free = mode === "free";
  const difficulty = opts.difficulty ?? def.difficulty ?? 0.3;
  const nRivals = mode === "rival" ? 3 : 0;
  const order = [1, 2, 0, 3];
  const start = T.pointAt(T.sGate + 3, 0);
  const racers = [];
  for (let k = 0; k <= nRivals; k++) {
    // staggered start in a rival race (each rival 2.5 m further back in the start pad)
    // so the field strings out instead of piling into the first gate together
    const g0 = T.grid[nRivals ? order[k] : 1];
    const slot = k > 0 ? { ...T.pointAt(g0.s - 2.5 * k, g0.lat), s: g0.s - 2.5 * k } : g0;
    const isPlayer = k === 0;
    const rival = RIVALS[k - 1] || RIVALS[0];
    const params = isPlayer ? opts.params || skiParams(ski) : paramsFor(rivalStats(difficulty, k));
    const sk = createSkier(params, slot);
    sk.hold = true;
    sk.loc = locate(T, sk.x, sk.z, -1);
    sk.hint = sk.loc.i;
    sk.gnd = groundAt(T, sk.loc);
    sk.y = sk.gnd.y;
    sk.lastS = sk.loc.s;
    racers.push({
      id: k,
      isPlayer,
      name: isPlayer ? "You" : rival.name,
      colors: isPlayer ? opts.custom || null : rival.colors,
      skiLook: isPlayer ? null : rival.ski,
      sk,
      bike: sk, // alias (shared helpers)
      ai: isPlayer ? opts.playerAI || null : createAI(k - 1, difficulty, def.seed || 1),
      nextGate: 0,
      nextCp: 0,
      passed: [],
      missed: 0,
      splits: [],
      respawn: { ...start },
      sPrev: sk.loc.s,
      prog: sk.loc.s,
      finished: false,
      finishTime: null,
      place: k + 1,
      slowT: 0,
      falls: 0,
      wrongWay: 0,
    });
  }
  const R = {
    def,
    T,
    mode,
    free,
    racers,
    player: racers[0],
    state: RSTATE.COUNTDOWN,
    time: 0,
    raceTime: 0,
    countdown: COUNT,
    acc: 0,
    events: [],
    wind: { x: 0, z: 0, str: 0 },
    penaltyPer: MISS_PENALTY[mode] ?? 3,
    dsqAt: dsqLimit(T.gates.length),
    stats: { jumps: 0, maxAir: 0, falls: 0, distance: 0, gatesPassed: 0, gatesMissed: 0, topSpeed: 0, airTime: 0 },
    results: null,
    stuck: false,
  };
  const emit = (e) => R.events.push(e);
  emit({ type: "count", n: 3 });
  const gates = free ? [] : T.gates;

  const rank = () => {
    const list = racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime + a.missed * R.penaltyPer - (b.finishTime + b.missed * R.penaltyPer);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
    list.forEach((r, i) => (r.place = i + 1));
    return list;
  };
  rank();

  function progress(r) {
    const K = r.sk;
    const s = K.loc ? K.loc.s : r.sPrev;
    const prev = r.sPrev;
    const live = R.state === RSTATE.RACING || (R.state === RSTATE.FINISHED && !r.isPlayer);
    if (live && s - prev < 30) {
      // gates, in order: every one is resolved exactly once (passed or missed)
      while (r.nextGate < gates.length && prev < gates[r.nextGate].s && s >= gates[r.nextGate].s) {
        const g = gates[r.nextGate];
        const lat = K.loc ? K.loc.lat : 0;
        const ok = Math.abs(lat - g.lat) <= g.hw - RADIUS * 0.3;
        r.nextGate++;
        if (ok) {
          r.passed.push(g.i);
          r.splits.push(R.raceTime);
          if (r.isPlayer) {
            R.stats.gatesPassed++;
            emit({ type: "gate", n: g.n, of: gates.length, split: R.raceTime, color: g.color });
          }
        } else {
          r.missed++;
          if (r.isPlayer) {
            R.stats.gatesMissed++;
            emit({ type: "gateMissed", n: g.n, of: gates.length, penalty: R.penaltyPer, missed: r.missed, dsq: r.missed > R.dsqAt });
          }
        }
      }
      // respawn checkpoints
      const cps = T.checkpoints;
      while (r.nextCp < cps.length && prev < cps[r.nextCp].s && s >= cps[r.nextCp].s) {
        const cp = cps[r.nextCp];
        r.respawn = { x: cp.x, z: cp.z, y: cp.y, h: cp.h };
        r.nextCp++;
      }
      if (!r.finished && prev < T.sFinish && s >= T.sFinish && R.state !== RSTATE.FINISHED) {
        // a gate skipped right before the line still counts as missed
        while (r.nextGate < gates.length) {
          r.nextGate++;
          r.missed++;
          if (r.isPlayer) R.stats.gatesMissed++;
        }
        r.finished = true;
        r.finishTime = R.raceTime;
        if (!r.isPlayer) emit({ type: "rivalFinished", name: r.name });
      } else if (!r.finished && !r.isPlayer && R.state === RSTATE.FINISHED && prev < T.sFinish && s >= T.sFinish) {
        r.finished = true;
        r.finishTime = r.finishTime ?? R.raceTime;
      }
    }
    r.sPrev = s;
    r.prog = s;
    const Sm = T.interp(s).a;
    const fwd = Math.sin(K.h) * Sm.tx + Math.cos(K.h) * Sm.tz;
    r.wrongWay = fwd < -0.3 && !K.crash && !K.air ? r.wrongWay + STEP : 0;
  }

  function contacts() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const A = racers[i].sk;
        const B = racers[j].sk;
        if (A.crash || B.crash || A.invuln > 0 || B.invuln > 0 || A.air || B.air) continue;
        if (Math.abs(A.y - B.y) > 1.2) continue;
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        const m = RADIUS * 2 + 0.25;
        if (d >= m || d < 1e-5) continue;
        const nx = dx / d;
        const nz = dz / d;
        // rivals yield: when the player is involved the rival takes most of the push
        const pa = racers[i].isPlayer ? 0.15 : racers[j].isPlayer ? 1.85 : 1;
        const push = (m - d) / 2;
        A.x -= nx * push * pa;
        A.z -= nz * push * pa;
        B.x += nx * push * (2 - pa);
        B.z += nz * push * (2 - pa);
        // speed is only lost on an actual impact, never while merely side by side
        const av = [Math.sin(A.h) * A.vF, Math.cos(A.h) * A.vF];
        const bv = [Math.sin(B.h) * B.vF, Math.cos(B.h) * B.vF];
        const closing = (av[0] - bv[0]) * nx + (av[1] - bv[1]) * nz;
        if (closing > 0.5) {
          // whoever runs into the other from behind pays; the skier in front keeps its speed
          const aBehind = racers[i].prog < racers[j].prog;
          if (aBehind) A.vF *= 0.985;
          else B.vF *= 0.985;
          A.vS -= (Math.cos(A.h) * nx - Math.sin(A.h) * nz) * closing * 0.3 * (racers[i].isPlayer ? 0.4 : 1);
          B.vS += (Math.cos(B.h) * nx - Math.sin(B.h) * nz) * closing * 0.3 * (racers[j].isPlayer ? 0.4 : 1);
          if (racers[i].isPlayer || racers[j].isPlayer) emit({ type: "bump", hard: Math.min(1, closing / 6) });
        }
      }
    }
  }

  function windAt(t) {
    const W = def.wind;
    if (!W) return { x: 0, z: 0, str: 0 };
    const P = R.player.sk;
    const S = P.loc ? T.interp(P.loc.s).a : T.samples[0];
    const str = W.strength * (0.55 * Math.sin((t * Math.PI * 2) / (W.period || 7)) + 0.45 * Math.sin(t * 1.7 + 1.3));
    return { x: S.nx * str, z: S.nz * str, str };
  }

  function finishRace() {
    for (const r of racers) {
      if (r.finished) continue;
      const remaining = Math.max(0, T.sFinish - r.prog);
      const pace = Math.max(6, (r.prog - T.sGate) / Math.max(1, R.raceTime));
      r.finishTime = R.raceTime + remaining / pace + (r.sk.crash ? 2.5 : 0);
      r.projected = true;
    }
    const adj = (r) => r.finishTime + r.missed * R.penaltyPer;
    const list = racers.slice().sort((a, b) => adj(a) - adj(b));
    list.forEach((x, i) => (x.place = i + 1));
    const P = R.player;
    const dsq = !free && P.missed > R.dsqAt;
    const adjusted = adj(P);
    R.results = {
      mode,
      free,
      time: P.finishTime,
      penalty: P.missed * R.penaltyPer,
      adjusted,
      missed: P.missed,
      gates: gates.length,
      passed: P.passed.length,
      dsq,
      place: P.place,
      medal: free ? null : medalFor(def, mode, adjusted, P.place, dsq),
      splits: P.splits.slice(),
      falls: R.stats.falls,
      topSpeed: R.stats.topSpeed,
      jumps: R.stats.jumps,
      order: mode === "rival" ? list.map((x) => ({ name: x.name, colors: x.colors, time: adj(x), raw: x.finishTime, missed: x.missed, projected: !!x.projected, isPlayer: x.isPlayer })) : null,
    };
    R.state = RSTATE.FINISHED;
    emit({ type: "finished", results: R.results });
  }

  const playerEv = (e) => {
    switch (e.type) {
      case "crash":
        R.stats.falls++;
        break;
      case "land":
        if (e.airT > 0.3) R.stats.jumps++;
        R.stats.maxAir = Math.max(R.stats.maxAir, e.airT || 0);
        R.stats.airTime += e.airT || 0;
        break;
      default:
        break;
    }
    emit(e);
  };

  function stepRacer(r, inp, ev) {
    const K = r.sk;
    if (K.crash) {
      if (K.crash.fell && K.crash.t >= FALL_TIME) {
        respawnSkier(K, r.respawn, T);
        r.sPrev = K.loc.s;
        if (r.isPlayer) emit({ type: "respawn" });
      } else if (!K.crash.fell && K.crash.t >= GETUP_TIME) {
        getUp(K, T);
        r.sPrev = K.loc.s;
        if (r.isPlayer) emit({ type: "getUp" });
      }
    }
    stepSkier(K, inp, T, STEP, ev);
  }

  function step(playerInput) {
    const dt = STEP;
    R.time += dt;
    if (R.state === RSTATE.COUNTDOWN) {
      const before = Math.ceil(R.countdown - 0.6);
      R.countdown -= dt;
      const after = Math.ceil(R.countdown - 0.6);
      if (after !== before && after >= 1) emit({ type: "count", n: after });
      for (const r of racers) stepSkier(r.sk, {}, T, dt, null);
      if (R.countdown <= 0.6) {
        R.state = RSTATE.RACING;
        for (const r of racers) {
          r.sk.hold = false;
          r.sk.vF = 3.2; // push out of the start house
        }
        emit({ type: "go" });
      }
      return;
    }
    R.wind = windAt(R.time);
    if (R.state === RSTATE.FINISHED) {
      for (const r of racers) {
        const inp = r.isPlayer ? { brake: speedOf(r.sk) > 2 ? 1 : 0, steer: 0 } : aiInput(R, r, dt);
        inp.wind = R.wind;
        stepRacer(r, inp, null);
        if (!r.isPlayer) progress(r);
      }
      contacts();
      return;
    }
    R.raceTime += dt;
    const P = R.player;
    for (const r of racers) {
      const K = r.sk;
      let inp = r.isPlayer ? (r.ai ? aiInput(R, r, dt) : { ...(playerInput || {}) }) : aiInput(R, r, dt);
      if (r.isPlayer && inp.respawn && !K.crash) {
        crashSkier(K, "fell", playerEv);
        K.crash.t = FALL_TIME - 0.4;
        inp = {};
      }
      inp.wind = R.wind;
      const bx = K.x;
      const bz = K.z;
      const wasCrash = !!K.crash;
      stepRacer(r, inp, r.isPlayer ? playerEv : null);
      if (!wasCrash && K.crash) r.falls++;
      if (r.isPlayer && !K.crash) {
        R.stats.distance += Math.hypot(K.x - bx, K.z - bz);
        R.stats.topSpeed = Math.max(R.stats.topSpeed, speedOf(K));
      }
      if (!K.crash && speedOf(K) < 0.5) r.slowT += dt;
      else r.slowT = Math.max(0, r.slowT - dt * 2);
      if (!r.isPlayer && r.slowT > 5) {
        crashSkier(K, "fell", null);
        K.crash.t = FALL_TIME - 0.3;
        r.slowT = 0;
      }
    }
    R.stuck = P.slowT > 5;
    contacts();
    const before = P.place;
    for (const r of racers) progress(r);
    rank();
    if (P.place < before && racers.length > 1) emit({ type: "overtake", place: P.place });
    if (P.finished) finishRace();
  }

  R.tick = (dt, input) => {
    R.acc = Math.min(R.acc + Math.min(dt, 0.2), 0.3); // real time down to 5 fps
    let inp = input.frame();
    while (R.acc >= STEP) {
      R.acc -= STEP;
      step(inp);
      inp = { ...inp, jump: false, respawn: false };
    }
  };
  R.stepN = (n, inp) => {
    for (let i = 0; i < n; i++) step(i === 0 ? inp : inp && { ...inp, jump: false, respawn: false });
  };
  R.drain = () => {
    const e = R.events;
    R.events = [];
    return e;
  };
  R.toFinish = (r = R.player) => Math.max(0, Math.round(T.sFinish - r.prog));
  /** Shell-level state name (for the HUD / tests). */
  R.gameState = () => (R.state === RSTATE.RACING && R.player.sk.crash ? "FALLEN" : R.state);
  /** Live medal target for the HUD (time modes). */
  R.target = () => {
    if (free || mode === "rival" || !def.medals) return null;
    const P = R.player;
    const projected = R.raceTime + P.missed * R.penaltyPer;
    const names = ["gold", "silver", "bronze"];
    for (let i = 0; i < 3; i++) if (projected <= def.medals[i]) return { medal: names[i], time: def.medals[i] };
    return { medal: null, time: def.medals[2] };
  };
  return R;
}
