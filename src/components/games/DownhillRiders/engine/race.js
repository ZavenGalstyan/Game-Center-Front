/**
 * Downhill Riders — one race: the single authoritative simulation.
 *
 *   COUNTDOWN  3 · 2 · 1 · GO — riders held at the gate (pedalling early
 *              does nothing, so nobody gets a jump on the start)
 *   RACING     everyone rides; checkpoints, orbs, contact, crashes and
 *              checkpoint respawns
 *   FINISHED   the player crossed the line with every checkpoint done;
 *              rivals still on the hill get a projected finish (their pace),
 *              so results are immediate and fair
 * (MENU / GARAGE / TRAIL_SELECT / PAUSED live in the React shell; pausing
 * simply stops stepping the race. CRASHED is a per-rider sub-state.)
 *
 * Checkpoints must be passed in order (forward crossings only); the finish
 * only counts with all of them done. Position = finished first, then ordered
 * checkpoint progress, then distance along the trail — never straight-line
 * distance to the finish.
 */
import { buildTrail, locate, groundAt } from "./trail.js";
import { createBike, stepBike, respawnBike, crashBike, CRASH_TIME, RADIUS } from "./bike.js";
import { createAI, aiInput } from "./ai.js";
import { paramsFor, RIVALS } from "../data/bikes.js";
import { clamp } from "./rng.js";

export const STEP = 1 / 120;
export const RSTATE = Object.freeze({ COUNTDOWN: "COUNTDOWN", RACING: "RACING", FINISHED: "FINISHED" });
const COUNT = 3.6;
export const MEDALS = ["gold", "silver", "bronze", null];

const trailCache = new Map();
/** Trails are immutable: build once per track and share between attempts. */
export function trailFor(def) {
  if (!trailCache.has(def)) trailCache.set(def, buildTrail(def));
  return trailCache.get(def);
}

/** Rival bikes: starter-like stats nudged up with difficulty (never beyond Ridgeline-class). */
export function rivalStats(difficulty, k) {
  // anchored on the bike a player has by then: top speed creeps up slowly (on
  // steep trails it decides everything), acceleration / handling grow faster
  const d = difficulty;
  const off = (k - 1) * 0.12;
  return {
    speed: clamp(2.45 + d * 0.75 - off, 1, 3.4),
    accel: clamp(2.8 + d * 1.2 - off, 1, 4.4),
    handling: clamp(2.9 + d * 0.9 - off, 1, 3.9),
    jump: clamp(2.8 + d * 1.6 - off, 1, 4.6),
  };
}

export function createRace(def, playerBike, opts = {}) {
  const T = opts.trail || trailFor(def);
  const difficulty = opts.difficulty ?? def.difficulty ?? 0.3;
  const order = opts.gridOrder || [1, 0, 2, 3];
  const start = T.pointAt(T.sGate + 3, 0);
  const racers = [];
  for (let k = 0; k < 4; k++) {
    const slot = T.grid[order[k]];
    const isPlayer = k === 0;
    const rival = RIVALS[k - 1] || RIVALS[0];
    const bike = createBike(paramsFor(isPlayer ? playerBike.stats : rivalStats(difficulty, k)), slot);
    bike.hold = true;
    bike.loc = locate(T, bike.x, bike.z, -1);
    bike.hint = bike.loc.i;
    bike.gnd = groundAt(T, bike.loc);
    bike.y = bike.gnd.y;
    bike.lastS = bike.loc.s;
    racers.push({
      id: k,
      isPlayer,
      name: isPlayer ? "You" : rival.name,
      colors: isPlayer ? playerBike.colors : rival.colors,
      bike,
      ai: isPlayer ? opts.playerAI || null : createAI(k - 1, difficulty, def.seed || 1),
      nextCp: 0,
      respawn: { ...start },
      sPrev: bike.loc.s,
      prog: bike.loc.s,
      finished: false,
      finishTime: null,
      place: k + 1,
      orbCool: new Map(),
      slowT: 0,
      crashes: 0,
      trickScore: 0,
      wrongWay: 0,
      maxS: bike.loc.s,
    });
  }
  const R = {
    def,
    T,
    racers,
    player: racers[0],
    state: RSTATE.COUNTDOWN,
    time: 0,
    raceTime: 0,
    countdown: COUNT,
    acc: 0,
    events: [],
    stats: { jumps: 0, tricks: 0, trickScore: 0, crashes: 0, distance: 0, boosts: 0, maxAir: 0, bestCombo: 0 },
    results: null,
    stuck: false,
  };
  const emit = (e) => R.events.push(e);
  emit({ type: "count", n: 3 });
  const rank = () => {
    const list = racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      if (a.nextCp !== b.nextCp) return b.nextCp - a.nextCp;
      return b.prog - a.prog;
    });
    list.forEach((r, i) => (r.place = i + 1));
    return list;
  };
  rank();

  function progress(r) {
    const B = r.bike;
    const s = B.loc ? B.loc.s : r.sPrev;
    const prev = r.sPrev;
    const cps = T.checkpoints;
    if (!B.crash && r.nextCp < cps.length && R.state !== RSTATE.FINISHED) {
      const cp = cps[r.nextCp];
      if (prev < cp.s && s >= cp.s && s - prev < 30) {
        r.nextCp++;
        r.respawn = { x: cp.x, z: cp.z, y: cp.y, h: cp.h };
        B.meter = Math.min(1, B.meter + 0.06);
        if (r.isPlayer) emit({ type: "checkpoint", n: r.nextCp, of: cps.length });
      }
    }
    if (!r.finished && R.state !== RSTATE.FINISHED && !B.crash && prev < T.sFinish && s >= T.sFinish && s - prev < 30 && r.nextCp >= cps.length) {
      r.finished = true;
      r.finishTime = R.raceTime;
      if (!r.isPlayer) emit({ type: "rivalFinished", name: r.name });
    }
    r.sPrev = s;
    r.prog = s;
    r.maxS = Math.max(r.maxS, s);
    const Sm = T.interp(B.loc ? B.loc.sMain : s).a;
    const fwd = Math.sin(B.h) * Sm.tx + Math.cos(B.h) * Sm.tz;
    r.wrongWay = fwd < -0.3 && !B.crash ? r.wrongWay + STEP : 0;
  }

  function contacts() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const A = racers[i].bike;
        const Bb = racers[j].bike;
        if (A.crash || Bb.crash || A.invuln > 0 || Bb.invuln > 0) continue;
        if (Math.abs(A.y - Bb.y) > 1.2) continue;
        const dx = Bb.x - A.x;
        const dz = Bb.z - A.z;
        const d = Math.hypot(dx, dz);
        const m = RADIUS * 2 + 0.2;
        if (d >= m || d < 1e-5) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (m - d) / 2;
        A.x -= nx * push;
        A.z -= nz * push;
        Bb.x += nx * push;
        Bb.z += nz * push;
        const av = [Math.sin(A.h) * A.vF, Math.cos(A.h) * A.vF];
        const bv = [Math.sin(Bb.h) * Bb.vF, Math.cos(Bb.h) * Bb.vF];
        const closing = (av[0] - bv[0]) * nx + (av[1] - bv[1]) * nz;
        if (closing > 0.4) {
          A.vF *= 0.96;
          Bb.vF *= 0.98;
          A.vS -= (Math.cos(A.h) * nx - Math.sin(A.h) * nz) * closing * 0.3;
          Bb.vS += (Math.cos(Bb.h) * nx - Math.sin(Bb.h) * nz) * closing * 0.3;
          if (racers[i].isPlayer || racers[j].isPlayer) emit({ type: "bump", hard: clamp(closing / 6, 0, 1) });
        }
      }
    }
  }

  function features(r, dt) {
    const B = r.bike;
    for (const [k, v] of r.orbCool) r.orbCool.set(k, v - dt);
    if (B.crash || !B.loc || B.loc.onShort) return;
    for (const f of T.featAt[clamp(Math.round(B.loc.sMain), 0, T.N - 1)]) {
      if (f.type !== "orb" || (r.orbCool.get(f.id) || 0) > 0) continue;
      if (Math.hypot(B.x - f.x, B.z - f.z) < 1.4 && B.y - f.y < 2.6) {
        r.orbCool.set(f.id, 10);
        B.meter = Math.min(1, B.meter + 1 / 3);
        if (r.isPlayer) emit({ type: "orb" });
      }
    }
  }

  function finishRace() {
    for (const r of racers) {
      if (r.finished) continue;
      const remaining = Math.max(0, T.sFinish - r.prog);
      const pace = Math.max(6, (r.prog - T.sGate) / Math.max(1, R.raceTime));
      r.finishTime = R.raceTime + remaining / pace + (r.bike.crash ? 2 : 0);
      r.projected = true;
    }
    const list = racers.slice().sort((a, b) => a.finishTime - b.finishTime);
    list.forEach((x, i) => (x.place = i + 1));
    const P = R.player;
    R.results = {
      place: P.place,
      medal: MEDALS[P.place - 1],
      time: P.finishTime,
      trickScore: R.stats.trickScore,
      tricks: R.stats.tricks,
      crashes: R.stats.crashes,
      bestCombo: R.stats.bestCombo,
      maxAir: R.stats.maxAir,
      order: list.map((x) => ({ name: x.name, colors: x.colors, time: x.finishTime, projected: !!x.projected, isPlayer: x.isPlayer })),
    };
    R.state = RSTATE.FINISHED;
    emit({ type: "finished", place: P.place, results: R.results });
  }

  const playerEv = (e) => {
    switch (e.type) {
      case "crash":
        R.stats.crashes++;
        break;
      case "boost":
        R.stats.boosts++;
        break;
      case "land":
        if (e.airT > 0.35) R.stats.jumps++;
        R.stats.maxAir = Math.max(R.stats.maxAir, e.airT || 0);
        break;
      case "trickLanded":
        R.stats.tricks += e.combo;
        R.stats.trickScore += e.pts;
        R.stats.bestCombo = Math.max(R.stats.bestCombo, e.combo);
        R.player.trickScore += e.pts;
        break;
      default:
        break;
    }
    emit(e);
  };

  function step(playerInput) {
    const dt = STEP;
    R.time += dt;
    if (R.state === RSTATE.COUNTDOWN) {
      const before = Math.ceil(R.countdown - 0.6);
      R.countdown -= dt;
      const after = Math.ceil(R.countdown - 0.6);
      if (after !== before && after >= 1) emit({ type: "count", n: after });
      for (const r of racers) {
        const inp = r.isPlayer ? playerInput || {} : { throttle: R.countdown < 1.6 ? 1 : 0 };
        stepBike(r.bike, inp, T, dt, null);
      }
      if (R.countdown <= 0.6) {
        R.state = RSTATE.RACING;
        for (const r of racers) r.bike.hold = false;
        emit({ type: "go" });
      }
      return;
    }
    if (R.state === RSTATE.FINISHED) {
      for (const r of racers) {
        if (r.bike.crash && r.bike.crash.t >= CRASH_TIME) respawnBike(r.bike, r.respawn, T);
        const inp = r.isPlayer ? { throttle: 0, brake: r.bike.vF > 3 ? 0.5 : 0, steer: 0 } : aiInput(R, r, dt, null);
        stepBike(r.bike, inp, T, dt, null);
        if (!r.isPlayer) progress(r); // rivals ride on to the line (results stay frozen)
      }
      contacts();
      return;
    }
    R.raceTime += dt;
    const P = R.player;
    for (const r of racers) {
      const B = r.bike;
      if (B.crash && B.crash.t >= CRASH_TIME) {
        respawnBike(B, r.respawn, T);
        r.slowT = 0;
        r.sPrev = B.loc.s;
        if (r.isPlayer) emit({ type: "respawn" });
      }
      let inp = r.isPlayer ? (r.ai ? aiInput(R, r, dt, null) : playerInput || {}) : aiInput(R, r, dt, P.prog);
      if (r.isPlayer && inp.respawn && !B.crash) {
        crashBike(B, "reset", playerEv);
        B.crash.t = CRASH_TIME - 0.5;
        inp = {};
      }
      const bx = B.x;
      const bz = B.z;
      const wasCrash = !!B.crash;
      stepBike(B, inp, T, dt, r.isPlayer ? playerEv : null);
      if (!wasCrash && B.crash) r.crashes++;
      if (r.isPlayer && !B.crash) R.stats.distance += Math.hypot(B.x - bx, B.z - bz);
      // stuck (wedged / stopped): rivals respawn themselves, the player gets a hint (R)
      if (!B.crash && B.vF < 0.6) r.slowT += dt;
      else r.slowT = Math.max(0, r.slowT - dt * 2);
      if (!r.isPlayer && r.slowT > 4) {
        crashBike(B, "reset", null);
        B.crash.t = CRASH_TIME - 0.4;
        r.slowT = 0;
      }
      features(r, dt);
    }
    R.stuck = P.slowT > 4.5;
    contacts();
    const before = P.place;
    for (const r of racers) progress(r);
    rank();
    if (P.place < before) emit({ type: "overtake", place: P.place });
    if (P.finished) finishRace();
  }

  R.tick = (dt, input) => {
    R.acc = Math.min(R.acc + Math.min(dt, 0.1), 0.25);
    let inp = input.frame();
    while (R.acc >= STEP) {
      R.acc -= STEP;
      step(inp);
      inp = { ...inp, hop: false, trick: null, boostPressed: false, respawn: false };
    }
  };
  R.stepN = (n, inp) => {
    for (let i = 0; i < n; i++) step(i === 0 ? inp : inp && { ...inp, hop: false, trick: null, boostPressed: false, respawn: false });
  };
  R.drain = () => {
    const e = R.events;
    R.events = [];
    return e;
  };
  /** Distance left to the finish line (m). */
  R.toFinish = (r = R.player) => Math.max(0, Math.round(T.sFinish - r.prog));
  /** Shell-level state name (for the HUD / tests). */
  R.gameState = () => (R.state === RSTATE.RACING && R.player.bike.crash ? "CRASHED" : R.state);
  return R;
}
