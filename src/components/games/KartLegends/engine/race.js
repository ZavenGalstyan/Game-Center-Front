/**
 * Kart Legends — one race: the single authoritative simulation.
 *
 *   COUNTDOWN  3 · 2 · 1 · GO — karts held on the grid (engines can rev)
 *   RACING     everyone drives; checkpoints, laps, pads, pickups, contact
 *   FINISHED   the player crossed the line on the final lap; rivals still on
 *              track get a projected finish (their pace), so results are
 *              immediate and fair
 * (MENU / GARAGE / RACE_SELECT / PAUSED live in the React shell; pausing
 * simply stops stepping the race.)
 *
 * Laps: checkpoints must be passed in order; crossing the line forward with
 * all of them done completes a lap. Backwards, repeated or short-circuited
 * crossings never count. Position = laps, then checkpoints, then distance
 * along the lap — never straight-line distance to the line.
 */
import { buildTrack, locate } from "./track.js";
import { createKart, stepKart, addBoost } from "./kart.js";
import { createAI, aiInput } from "./ai.js";
import { statsFor, RIVALS } from "../data/karts.js";
import { clamp } from "./rng.js";

export const STEP = 1 / 120;
export const RSTATE = Object.freeze({ COUNTDOWN: "COUNTDOWN", RACING: "RACING", FINISHED: "FINISHED" });
const COUNT = 3.6;

export function createRace(def, playerKart, opts = {}) {
  const T = buildTrack(def);
  const laps = def.laps || 3;
  const difficulty = opts.difficulty ?? def.difficulty ?? 0.3;
  const racers = [];
  // player starts at the back-left slot? No — 3rd slot: a fair, readable start
  const order = opts.gridOrder || [3, 0, 1, 2];
  for (let k = 0; k < 4; k++) {
    const slot = T.grid[order[k]];
    const isPlayer = k === 0;
    const rival = RIVALS[(k - 1 + 3) % 3];
    const kart = createKart(statsFor(isPlayer ? playerKart.stats : rivalStats(difficulty, k)), slot);
    racers.push({
      id: k,
      isPlayer,
      name: isPlayer ? "You" : rival.name,
      colors: isPlayer ? playerKart.colors : rival.colors,
      shape: isPlayer ? playerKart.shape : rival.shape,
      kart,
      ai: isPlayer ? opts.playerAI || null : createAI(k - 1, difficulty, def.seed || 1),
      lap: 0,
      nextCp: 0,
      sPrev: ((slot.s % T.length) + T.length) % T.length,
      prog: slot.s,
      lapStart: COUNT,
      lapTimes: [],
      bestLap: null,
      finished: false,
      finishTime: null,
      place: k + 1,
      padCool: new Map(),
      wrongWay: 0,
    });
  }
  const R = {
    def,
    T,
    laps,
    racers,
    player: racers[0],
    state: RSTATE.COUNTDOWN,
    time: 0, // since the race was created (countdown included)
    raceTime: 0, // since GO
    countdown: COUNT,
    acc: 0,
    events: [],
    pickups: T.pickups.map((p) => ({ ...p, cool: 0 })),
    stats: { drifts: 0, boosts: 0, miniTurbos: 0, distance: 0 },
    results: null,
  };
  const emit = (e) => R.events.push(e);
  emit({ type: "count", n: 3 });
  for (const r of racers) r.kart.loc = locate(T, r.kart.x, r.kart.z, -1);
  // grid order is the starting order (the first updateLaps runs at GO)
  racers.slice().sort((a, b) => b.prog - a.prog).forEach((r, i) => (r.place = i + 1));

  function updateLaps(r) {
    const L = T.length;
    const s = r.kart.loc.s;
    const sNow = ((s % L) + L) % L;
    const prev = r.sPrev;
    const cps = T.checkpoints;
    // ordered checkpoints (forward, small steps only)
    if (r.nextCp < cps.length) {
      const cp = cps[r.nextCp];
      if (prev < cp && sNow >= cp && sNow - prev < 40) {
        r.nextCp++;
        if (r.isPlayer) emit({ type: "checkpoint", n: r.nextCp });
      }
    }
    // the line
    if (prev > L - 40 && sNow < 40) {
      if (r.nextCp >= cps.length) {
        const lapTime = R.raceTime - (r.lapTimes.reduce((a, b) => a + b, 0));
        r.lapTimes.push(lapTime);
        r.bestLap = r.bestLap == null ? lapTime : Math.min(r.bestLap, lapTime);
        r.lap++;
        r.nextCp = 0;
        if (r.isPlayer) emit({ type: r.lap >= laps ? "finishLine" : "lap", lap: r.lap, time: lapTime, final: r.lap === laps - 1 });
        if (r.lap >= laps && !r.finished) {
          r.finished = true;
          r.finishTime = R.raceTime;
          if (!r.isPlayer) emit({ type: "rivalFinished", name: r.name });
        }
      }
    }
    r.sPrev = sNow;
    // continuous progress for ranking
    let eff = sNow;
    if (r.nextCp === 0 && sNow > cps[0] + 15) eff = sNow - L; // still behind the line
    r.prog = r.lap * L + eff + r.nextCp * 0.001;
    // wrong way: moving against the track direction for a while
    const S = T.samples[r.kart.loc.i];
    const fwd = Math.sin(r.kart.h) * S.tx + Math.cos(r.kart.h) * S.tz;
    r.wrongWay = fwd < -0.5 && r.kart.vF > 3 ? r.wrongWay + STEP : 0;
  }

  function ranking() {
    const list = racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
    list.forEach((r, i) => (r.place = i + 1));
    return list;
  }

  function contacts() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const A = racers[i].kart;
        const B = racers[j].kart;
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        const m = A.radius + B.radius;
        if (d >= m || d < 1e-5) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (m - d) / 2;
        A.x -= nx * push;
        A.z -= nz * push;
        B.x += nx * push;
        B.z += nz * push;
        // closing speed along the contact normal
        const av = [Math.sin(A.h) * A.vF + Math.cos(A.h) * A.vS, Math.cos(A.h) * A.vF - Math.sin(A.h) * A.vS];
        const bv = [Math.sin(B.h) * B.vF + Math.cos(B.h) * B.vS, Math.cos(B.h) * B.vF - Math.sin(B.h) * B.vS];
        const closing = (av[0] - bv[0]) * nx + (av[1] - bv[1]) * nz;
        if (closing > 0.5) {
          A.vF *= 0.95;
          B.vF *= 0.97;
          A.vS -= (Math.cos(A.h) * nx - Math.sin(A.h) * nz) * closing * 0.35;
          B.vS += (Math.cos(B.h) * nx - Math.sin(B.h) * nz) * closing * 0.35;
          if (racers[i].isPlayer || racers[j].isPlayer) emit({ type: "bump", hard: clamp(closing / 8, 0, 1) });
        }
      }
    }
  }

  function features(r, dt) {
    const K = r.kart;
    for (const [k, v] of r.padCool) r.padCool.set(k, v - dt);
    T.pads.forEach((pad, k) => {
      if ((r.padCool.get(k) || 0) > 0) return;
      const dx = K.x - pad.x;
      const dz = K.z - pad.z;
      const along = dx * Math.sin(pad.h) + dz * Math.cos(pad.h);
      const lat = dx * Math.cos(pad.h) - dz * Math.sin(pad.h);
      if (Math.abs(along) < pad.len / 2 + 0.4 && Math.abs(lat) < pad.hw + 0.4) {
        r.padCool.set(k, 1.2);
        addBoost(K, 1.0, "pad");
        K.vF = Math.max(K.vF, K.p.maxSpeed * 1.12);
        if (r.isPlayer) emit({ type: "pad" });
      }
    });
    for (const pk of R.pickups) {
      if (pk.cool > 0) continue;
      if (Math.hypot(K.x - pk.x, K.z - pk.z) < 1.5) {
        pk.cool = 6;
        K.meter = Math.min(1, K.meter + 1 / 3);
        if (r.isPlayer) emit({ type: "pickup" });
      }
    }
  }

  function finishRace() {
    // rivals still racing: project their finish from their current pace
    for (const r of racers) {
      if (r.finished) continue;
      const remaining = laps * T.length - r.prog;
      const pace = Math.max(8, r.prog / Math.max(1, R.raceTime));
      r.finishTime = R.raceTime + remaining / pace;
      r.projected = true;
    }
    const list = racers.slice().sort((a, b) => a.finishTime - b.finishTime);
    list.forEach((r, i) => (r.place = i + 1));
    const P = R.player;
    R.results = {
      place: P.place,
      time: P.finishTime,
      bestLap: P.bestLap,
      lapTimes: P.lapTimes.slice(),
      order: list.map((r) => ({ name: r.name, colors: r.colors, time: r.finishTime, projected: !!r.projected, isPlayer: r.isPlayer })),
    };
    R.state = RSTATE.FINISHED;
    emit({ type: "finished", place: P.place, results: R.results });
  }

  function step(playerInput) {
    const dt = STEP;
    R.time += dt;
    if (R.state === RSTATE.COUNTDOWN) {
      const before = Math.ceil(R.countdown - 0.6);
      R.countdown -= dt;
      const after = Math.ceil(R.countdown - 0.6);
      if (after !== before && after >= 1) emit({ type: "count", n: after });
      if (R.countdown <= 0.6) {
        R.state = RSTATE.RACING;
        emit({ type: "go" });
      }
      // held on the grid: engines may rev, wheels don't move
      for (const r of racers) {
        r.kart.vF = 0;
        r.kart.vS = 0;
        r.kart.revving = r.isPlayer ? !!(playerInput && playerInput.throttle > 0) : R.countdown < 1.6;
      }
      return;
    }
    if (R.state === RSTATE.FINISHED) {
      // everyone coasts / AI keep driving for the backdrop
      for (const r of racers) {
        const inp = r.isPlayer ? { throttle: 0, brake: 0.3, steer: 0, drift: false, boostPressed: false } : aiInput(R, r, dt, null);
        stepKart(r.kart, inp, T, dt);
      }
      contacts();
      return;
    }
    R.raceTime += dt;
    const P = R.player;
    for (const r of racers) {
      const inp = r.isPlayer ? (r.ai ? aiInput(R, r, dt, null) : playerInput) : aiInput(R, r, dt, P.prog);
      const before = { x: r.kart.x, z: r.kart.z };
      stepKart(r.kart, inp, T, dt, r.isPlayer ? (e) => {
        if (e.type === "driftStart") R.stats.drifts++;
        if (e.type === "boost") R.stats.boosts++;
        if (e.type === "miniTurbo") R.stats.miniTurbos++;
        emit(e);
      } : null);
      if (r.isPlayer) R.stats.distance += Math.hypot(r.kart.x - before.x, r.kart.z - before.z);
      features(r, dt);
    }
    for (const pk of R.pickups) pk.cool = Math.max(0, pk.cool - dt);
    contacts();
    for (const r of racers) updateLaps(r);
    ranking();
    if (P.finished) finishRace();
  }

  R.tick = (dt, input) => {
    R.acc = Math.min(R.acc + Math.min(dt, 0.1), 0.25);
    let inp = input.frame();
    while (R.acc >= STEP) {
      R.acc -= STEP;
      step(inp);
      inp = { ...inp, boostPressed: false };
    }
  };
  R.stepN = (n, inp) => {
    for (let i = 0; i < n; i++) step(i === 0 ? inp : { ...inp, boostPressed: false });
  };
  R.drain = () => {
    const e = R.events;
    R.events = [];
    return e;
  };
  return R;
}

/** Rival karts: Rookie-like stats nudged up with difficulty (never beyond Legend). */
function rivalStats(difficulty, k) {
  // capped below the best karts, so upgrading your kart always pays off
  const v = clamp(2.7 + difficulty * 1.0 - (k - 1) * 0.15, 1, 3.7);
  return { speed: v, accel: clamp(v + 0.2, 1, 5), handling: clamp(v, 1, 5), boost: 3 };
}
