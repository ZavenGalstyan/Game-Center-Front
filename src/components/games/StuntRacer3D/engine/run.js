/**
 * Stunt Racer 3D — one level attempt: the single authoritative simulation.
 *
 *   COUNTDOWN   3 · 2 · 1 · GO — the car is held on the start line
 *   PLAYING     driving; checkpoints, stars, nitro, boost pads, obstacles,
 *               crumbling tiles, the finish gate
 *   FALLING     the car went off the track (or out of a loop): it tumbles,
 *               the camera watches, then the screen fades
 *   RESPAWNING  faded out: the car is placed, still, on the last checkpoint,
 *               facing down the track, briefly immune to obstacles
 *   COMPLETE    crossed the finish: time, stars, medal are final
 * (MENU / LEVEL_SELECT / GARAGE / PAUSED live in the React shell — pausing
 * simply stops stepping the run, so nothing can advance while paused.)
 *
 * Fixed 120 Hz steps; the run clock drives every obstacle, so patterns are
 * the same on every attempt and visible during the countdown. The race timer
 * starts at GO and keeps running through falls (a fall costs time, not the
 * level). Stars count once each per attempt (respawns never reset them).
 */
import { buildTrack } from "./track.js";
import { createCar, stepCar, placeOnTrack, paramsFor, CAR_HW } from "./car.js";
import { obstacleDefaults, collide } from "./obstacles.js";
import { G } from "./track.js";
import { clamp } from "./util.js";

export const STEP = 1 / 120;
export const STATE = Object.freeze({
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  FALLING: "FALLING",
  RESPAWNING: "RESPAWNING",
  COMPLETE: "COMPLETE",
});
const COUNT = 3.2;
const FALL_TIME = 1.15;
const FADE_OUT = 0.32;
const FADE_IN = 0.45;
export const STAR_R = 2.3;
const NITRO_R = 2.8;
const NITRO_REGEN = 12;
const TILE_DELAY = 0.42;

const trackCache = new Map();
/** Tracks are immutable: build once per level and share between attempts. */
export function trackFor(def) {
  if (!trackCache.has(def)) {
    if (trackCache.size > 8) trackCache.delete(trackCache.keys().next().value);
    trackCache.set(def, buildTrack(def));
  }
  return trackCache.get(def);
}

/** Medal for a finish time on a level (bronze = finished). */
export function medalFor(def, time) {
  const m = def.medals || estimateMedals(def);
  if (time <= m.gold) return "gold";
  if (time <= m.silver) return "silver";
  return "bronze";
}
/** Fallback when a level has no authored thresholds yet: from its length. */
export function estimateMedals(def) {
  const T = trackFor(def);
  const est = (T.finish - T.start) / 33;
  return { gold: Math.ceil(est * 1.1), silver: Math.ceil(est * 1.38) };
}

export function createRun(def, carDef, opts = {}) {
  const T = opts.track || trackFor(def);
  const p = paramsFor(carDef.stats);
  const car = createCar(T, p, T.start, 0);
  car.nitro = 0.5;
  const obstacles = T.obstacles.map((o, i) => {
    const f = T.frameAt(o.s);
    const hw = f.w / 2;
    return { ...obstacleDefaults(o, hw), id: i, hw, lastHit: -9 };
  });
  const tiles = [];
  for (const fl of T.falls) for (const tl of fl.tiles) tiles.push({ ...tl, trig: -1, drop: 0, vel: 0 });
  const run = {
    def,
    T,
    car,
    carDef,
    state: STATE.COUNTDOWN,
    countdown: COUNT,
    clock: 0, // drives obstacles (runs during the countdown too)
    time: 0, // race timer (from GO)
    acc: 0,
    events: [],
    cpIndex: 0, // checkpoints passed
    respawnS: T.start,
    stars: new Set(),
    nitroTaken: T.nitros.map(() => -99),
    obstacles,
    tiles,
    padInside: -1,
    fallT: 0,
    fadeT: 0,
    fade: 0, // 0 clear … 1 black (for the renderer)
    resetCool: 0,
    respawns: 0,
    finished: false,
    results: null,
    paused: false,
    stats: { jumps: 0, landings: 0, crashes: 0, distance: 0, nitroUsed: 0, airTime: 0, bestAir: 0 },
    ai: opts.ai || null,
    lastCount: 4,
  };
  run.tick = (dt, input) => tick(run, dt, input);
  run.drain = () => {
    const e = run.events;
    run.events = [];
    return e;
  };
  run.stepN = (n, input) => {
    for (let i = 0; i < n; i++) step(run, input);
  };
  return run;
}

const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false };

function tick(run, dt, input) {
  if (run.paused) return;
  run.acc = Math.min(run.acc + dt, 0.25);
  while (run.acc >= STEP) {
    run.acc -= STEP;
    step(run, input);
  }
}

export function tileDropped(run, s) {
  for (const tl of run.tiles) if (s >= tl.s0 && s < tl.s1) return tl.drop > 0.3;
  return false;
}

function step(run, input) {
  const dt = STEP;
  const car = run.car;
  run.clock += dt;
  run.resetCool = Math.max(0, run.resetCool - dt);
  const ev = run.events;
  const inp = run.ai ? run.ai(run) : input ? input.frame() : IDLE;

  // crumbling tiles fall once triggered (and come back on a respawn)
  for (const tl of run.tiles) {
    if (tl.trig >= 0 && run.clock - tl.trig > TILE_DELAY) {
      tl.vel += G * dt;
      tl.drop += tl.vel * dt;
    }
  }

  switch (run.state) {
    case STATE.COUNTDOWN: {
      run.countdown -= dt;
      const n = Math.ceil(run.countdown - 0.2);
      if (n < run.lastCount && n >= 1) {
        run.lastCount = n;
        ev.push({ type: "count", n });
      }
      if (run.countdown <= 0) {
        run.state = STATE.PLAYING;
        ev.push({ type: "go" });
      }
      return;
    }
    case STATE.COMPLETE: {
      // roll to a stop past the line
      stepCar(car, run.T, { throttle: 0, brake: car.fwd > 2 ? 1 : 0, steer: -car.lat * 0.1, handbrake: false, nitro: false }, dt, envOf(run));
      return;
    }
    case STATE.FALLING: {
      run.time += dt;
      run.fallT += dt;
      stepCar(car, run.T, IDLE, dt, envOf(run));
      run.fade = clamp((run.fallT - (FALL_TIME - FADE_OUT)) / FADE_OUT, 0, 1);
      if (run.fallT >= FALL_TIME) {
        run.state = STATE.RESPAWNING;
        run.fadeT = 0;
        respawn(run);
      }
      return;
    }
    case STATE.RESPAWNING: {
      run.time += dt;
      run.fadeT += dt;
      run.fade = clamp(1 - run.fadeT / FADE_IN, 0, 1);
      if (run.fadeT >= FADE_IN * 0.6) {
        run.state = STATE.PLAYING;
      }
      return;
    }
    default:
      break;
  }

  // --- PLAYING -----------------------------------------------------------------------
  run.time += dt;
  run.fade = Math.max(0, run.fade - dt * 3);
  if (inp.reset && run.resetCool <= 0) {
    run.resetCool = 1;
    ev.push({ type: "reset" });
    beginFall(run, "reset");
    run.fallT = FALL_TIME - FADE_OUT; // straight to the fade
    return;
  }
  const env = envOf(run);
  const sPrev = car.s;
  stepCar(car, run.T, inp, dt, env);
  run.stats.nitroUsed += car.nitroOn ? dt : 0;
  run.stats.distance += Math.abs(car.fwd) * dt;
  if (car.mode === "air") run.stats.airTime += dt;
  if (car.mode === "fall") {
    beginFall(run, car.fallWhy);
    return;
  }
  for (const e of ev) {
    if (e.type === "land" && !e.counted) {
      e.counted = true;
      if (e.airT > 0.4) {
        run.stats.jumps++;
        run.stats.bestAir = Math.max(run.stats.bestAir, e.airT);
        if (e.quality === "clean") {
          run.stats.landings++;
          if (e.airT > 0.6) {
            car.nitro = Math.min(1, car.nitro + 0.12);
            ev.push({ type: "clean", airT: e.airT });
          }
        }
      }
    }
  }
  if (car.mode === "ground") {
    triggerTiles(run);
    obstacleHits(run);
  }
  pickups(run, sPrev);
  gates(run, sPrev);
}

function envOf(run) {
  if (!run._env) run._env = { events: null, dropped: (s) => tileDropped(run, s) };
  run._env.events = run.events;
  return run._env;
}

function beginFall(run, why) {
  const car = run.car;
  if (car.mode !== "fall") {
    car.mode = "fall";
    car.fallT = 0;
    car.fallWhy = why;
    car.tumble = { x: 0, y: 0, z: 0, ax: 1.5, ay: 0.4, az: 0.8 };
  }
  run.state = STATE.FALLING;
  run.fallT = 0;
  if (why !== "reset") {
    run.stats.crashes++;
    run.events.push({ type: "crash", why });
  }
}

function respawn(run) {
  const car = run.car;
  placeOnTrack(car, run.T, run.respawnS, 0, 0);
  car.ghostT = 2.2;
  car.nitro = Math.max(car.nitro, 0.25); // never stranded without a little nitro
  run.padInside = -1;
  for (const tl of run.tiles) {
    tl.trig = -1;
    tl.drop = 0;
    tl.vel = 0;
  }
  run.respawns++;
  run.events.push({ type: "respawn" });
}

function triggerTiles(run) {
  const s = run.car.s;
  for (const tl of run.tiles) if (tl.trig < 0 && s >= tl.s0 - 1 && s < tl.s1) {
    tl.trig = run.clock;
    run.events.push({ type: "crumble" });
  }
}

function obstacleHits(run) {
  const car = run.car;
  if (car.ghostT > 0) return;
  for (const o of run.obstacles) {
    const x = car.s - o.s;
    if (x < -6 || x > 6) continue;
    const c = collide(o, run.clock, o.hw, x, car.lat, car.psi, 0);
    if (!c) continue;
    // push out
    car.s += c.nx * c.d;
    car.lat += c.ny * c.d;
    const rvx = car.vs - c.vx;
    const rvy = car.vl - c.vy;
    const vn = rvx * c.nx + rvy * c.ny;
    if (vn < 0) {
      const j = -(1 + 0.3) * vn;
      car.vs += j * c.nx;
      car.vl += j * c.ny;
      // the obstacle's own motion shoves the car (scaled by stability)
      const push = Math.max(0, c.vx * c.nx + c.vy * c.ny) * car.p.knock;
      car.vs += push * c.nx * 0.6;
      car.vl += push * c.ny * 0.9;
      car.vs *= 0.82;
      if (run.clock - o.lastHit > 0.3) {
        o.lastHit = run.clock;
        run.events.push({ type: "hit", hard: clamp(-vn / 18 + 0.2, 0.2, 1), kind: o.type });
      }
    }
  }
}

function pickups(run, sPrev) {
  const car = run.car;
  const T = run.T;
  // stars (once each per attempt)
  for (let i = 0; i < T.stars.length; i++) {
    if (run.stars.has(i)) continue;
    const st = T.stars[i];
    if (Math.abs(st.s - car.s) > 8) continue;
    const c = st.pos;
    if (Math.hypot(c.x - car.x - car.U.x * 0.6, c.y - car.y - car.U.y * 0.6, c.z - car.z - car.U.z * 0.6) < STAR_R) {
      run.stars.add(i);
      run.events.push({ type: "star", i, n: run.stars.size, of: T.stars.length });
    }
  }
  // nitro canisters (come back after a while)
  for (let i = 0; i < T.nitros.length; i++) {
    if (run.clock - run.nitroTaken[i] < NITRO_REGEN) continue;
    const nt = T.nitros[i];
    if (Math.abs(nt.s - car.s) > 6) continue;
    const c = T.pointAt(nt.s, nt.lat, 1.0);
    if (Math.hypot(c.x - car.x - car.U.x * 0.6, c.y - car.y - car.U.y * 0.6, c.z - car.z - car.U.z * 0.6) < NITRO_R) {
      run.nitroTaken[i] = run.clock;
      car.nitro = Math.min(1, car.nitro + 0.35);
      run.events.push({ type: "nitro" });
    }
  }
  // boost pads: one shove per crossing, never stacking
  if (car.mode === "ground") {
    let inside = -1;
    for (let i = 0; i < T.boosts.length; i++) {
      const b = T.boosts[i];
      if (car.s >= b.s && car.s <= b.s + b.len && Math.abs(car.lat - b.lat) < b.w / 2 + 0.6) inside = i;
    }
    if (inside >= 0 && inside !== run.padInside) {
      car.boostT = 1.35;
      run.events.push({ type: "boost" });
    }
    run.padInside = inside;
  } else run.padInside = -1;
}

function gates(run, sPrev) {
  const car = run.car;
  const T = run.T;
  const s = car.s;
  if (s <= sPrev && car.mode === "ground") return;
  const f = T.frameAt(s);
  const within = Math.abs(car.lat) < f.w / 2 + 2.5;
  // checkpoints — passing a later one also counts any skipped before it
  while (run.cpIndex < T.checkpoints.length && s >= T.checkpoints[run.cpIndex].s && within) {
    const cp = T.checkpoints[run.cpIndex];
    run.cpIndex++;
    run.respawnS = cp.s;
    run.car.nitro = Math.min(1, run.car.nitro + 0.2);
    run.events.push({ type: "checkpoint", n: run.cpIndex, of: T.checkpoints.length });
  }
  if (s >= T.finish && within && !run.finished) {
    run.finished = true;
    run.state = STATE.COMPLETE;
    const time = Math.round(run.time * 100) / 100;
    run.results = {
      time,
      stars: [...run.stars].sort((a, b) => a - b),
      starCount: run.stars.size,
      starTotal: T.stars.length,
      medal: medalFor(run.def, time),
      stats: { ...run.stats, time },
    };
    car.nitroOn = false;
    run.events.push({ type: "finish", results: run.results });
  }
}

export { CAR_HW };
