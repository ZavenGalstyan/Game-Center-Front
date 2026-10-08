/**
 * Stunt Racer 3D — headless simulation tests (the engine is framework-free).
 *
 *   node src/components/games/StuntRacer3D/tools/simTest.mjs all
 *   node .../simTest.mjs gates        quality gates (levels 1–3 mechanics)
 *   node .../simTest.mjs torture      torture tests
 *   node .../simTest.mjs levels [id]  validate every level (or one)
 *   node .../simTest.mjs cars         every car on every level
 *   node .../simTest.mjs save         storage / unlock logic
 *   node .../simTest.mjs medals [--write]  bot reference times → data/medals.js
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRun, STATE, STEP, trackFor, tileDropped } from "../engine/run.js";
import { placeOnTrack, paramsFor, stepCar, createCar } from "../engine/car.js";
import { buildTrack, roadAt, G } from "../engine/track.js";
import { createBot } from "../engine/bot.js";
import { collide } from "../engine/obstacles.js";
import { LEVELS, getLevel } from "../data/levels.js";
import { CARS, CAR_BY_ID } from "../data/cars.js";

const BLAZE = CAR_BY_ID.get("blaze");
let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
    console.log("  ✗ " + msg);
  }
}
const kmh = (v) => v * 3.6;
const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false };
const GAS = { ...IDLE, throttle: 1 };

/** A run already past the countdown. */
function playing(def, carDef = BLAZE, opts = {}) {
  const run = createRun(def, carDef, opts);
  run.state = STATE.PLAYING;
  run.countdown = 0;
  return run;
}
function drive(run, inp, seconds, until) {
  const n = Math.round(seconds / STEP);
  const fn = typeof inp === "function" ? inp : () => inp;
  for (let i = 0; i < n; i++) {
    run.ai = () => fn(run);
    run.stepN(1);
    if (until && until(run)) return true;
  }
  return false;
}
function botRun(def, carDef = BLAZE, opts = {}, limit = 240) {
  const run = createRun(def, carDef, { ai: createBot(opts) });
  const ev = [];
  for (let i = 0; i < limit / STEP && run.state !== STATE.COMPLETE; i++) {
    run.stepN(1);
    for (const e of run.drain()) ev.push({ ...e, t: run.time, s: run.car.s });
  }
  return { run, ev };
}
/** Synthetic test level. */
const testLevel = (pieces, extra = {}) => ({ id: 999, name: "test", world: 1, width: 12, y0: 100, pieces, ...extra });

// ==========================================================================================
function gates() {
  console.log("— Quality gate 1: Level 1 (First Flight) —");
  const L1 = getLevel(1);
  const T1 = trackFor(L1);
  // acceleration
  {
    const run = playing(testLevel([{ t: "S", len: 2600, start: true }]));
    let t100 = null;
    drive(run, GAS, 16, (r) => {
      if (t100 == null && kmh(r.car.fwd) >= 100) t100 = r.time;
      return false;
    });
    const p = paramsFor(BLAZE.stats);
    ok(t100 != null && t100 > 1.6 && t100 < 4.5, `0-100 km/h in a sensible time (${t100?.toFixed(2)} s)`);
    ok(Math.abs(run.car.fwd - p.vmax) < 1.5, `settles at top speed (${kmh(run.car.fwd).toFixed(0)} vs ${kmh(p.vmax).toFixed(0)} km/h)`);
    // braking
    const s0 = run.car.s;
    drive(run, { ...IDLE, brake: 1 }, 6, (r) => r.car.fwd <= 0.3);
    ok(run.car.s - s0 < 45, `stops from top speed in ${(run.car.s - s0).toFixed(1)} m`);
    // reverse
    drive(run, { ...IDLE, brake: 1 }, 4);
    ok(run.car.fwd < -5 && run.car.fwd >= -11.5, `reverses after stopping (${run.car.fwd.toFixed(1)} m/s), capped`);
    drive(run, GAS, 1.5);
    ok(run.car.fwd > 0, "throttle while rolling back brakes then drives forward");
  }
  // steering: responsive slow, calmer fast, handbrake tighter
  {
    const yawRate = (speed, hb = false) => {
      const run = playing(testLevel([{ t: "S", len: 900, start: true }], { width: 200 }));
      placeOnTrack(run.car, run.T, 100, 0, speed);
      const h0 = run.car.h;
      drive(run, { ...IDLE, throttle: 1, steer: 1, handbrake: hb }, 0.6);
      const h1 = run.car.h;
      drive(run, { ...IDLE, throttle: 1, steer: 1, handbrake: hb }, 0.2);
      return { total: h1 - h0, rate: (run.car.h - h1) / 0.2 };
    };
    const slow = yawRate(8);
    const fast = yawRate(40);
    const hb = yawRate(20, true);
    const mid = yawRate(20);
    ok(slow.rate > 1.0, `low-speed steering is responsive (${slow.rate.toFixed(2)} rad/s)`);
    ok(fast.rate < slow.rate * 1.05 && fast.rate > 0.5, `high-speed steering is calmer (${fast.rate.toFixed(2)} rad/s)`);
    ok(hb.rate > mid.rate * 1.3, `handbrake turns sharper (${hb.rate.toFixed(2)} vs ${mid.rate.toFixed(2)})`);
    ok(slow.total < 1.2, "no instant rotation (steering ramps in)");
  }
  // jump on Level 1 at a range of speeds
  {
    const ramp = T1.ramps[0];
    let lands = 0;
    let tried = 0;
    let minOk = null;
    for (let v = 12; v <= paramsFor(BLAZE.stats).vmax; v += 2) {
      const run = playing(L1);
      placeOnTrack(run.car, run.T, ramp.s0 - 3, 0, v);
      run.cpIndex = 1;
      run.respawnS = T1.checkpoints[0].s;
      let landed = false;
      let flew = false;
      drive(run, { ...GAS, throttle: 0.5 }, 5, (r) => {
        if (r.car.mode === "air") flew = true;
        if (flew && r.car.mode === "ground") landed = true;
        return landed || r.state === STATE.FALLING;
      });
      if (v * 3.6 >= 60) {
        tried++;
        if (landed) lands++;
      }
      if (landed && minOk == null) minOk = v;
    }
    ok(lands === tried, `Level 1 jump lands at every speed from 60 km/h to top speed (${lands}/${tried})`);
    ok(minOk != null && minOk * 3.6 < 55, `Level 1 jump is forgiving (lands from ${(minOk * 3.6).toFixed(0)} km/h)`);
  }
  // falling into the gap → respawn at the checkpoint
  {
    const run = playing(L1);
    const ramp = T1.ramps[0];
    placeOnTrack(run.car, run.T, ramp.lip - 2, 0, 4);
    run.cpIndex = 1;
    run.respawnS = T1.checkpoints[0].s;
    let fell = false;
    drive(run, (r) => (r.respawns ? IDLE : { ...IDLE, throttle: 0.15 }), 8, (r) => {
      if (r.state === STATE.FALLING) fell = true;
      return fell && r.state === STATE.PLAYING;
    });
    ok(fell, "too slow off the ramp → falls into the gap");
    ok(run.state === STATE.PLAYING && Math.abs(run.car.s - T1.checkpoints[0].s) < 0.5, `respawned at the checkpoint (s=${run.car.s.toFixed(1)})`);
    ok(run.car.mode === "ground" && Math.abs(run.car.fwd) < 0.01 && run.car.psi === 0 && run.car.U.y > 0.95, "respawn: grounded, still, facing down the track, upright");
    drive(run, IDLE, 3);
    ok(run.state === STATE.PLAYING && run.car.mode === "ground", "no immediate re-fall after respawn");
  }
  // checkpoint + finish + reset key
  {
    const { run, ev } = botRun(L1);
    ok(run.state === STATE.COMPLETE, "bot finishes Level 1");
    ok(ev.some((e) => e.type === "checkpoint") && ev.some((e) => e.type === "land" && e.airT > 0.4), "checkpoint passed and the jump flown");
    ok(run.stats.crashes === 0, "no crashes on Level 1");
    const r2 = playing(L1);
    drive(r2, GAS, 20, (q) => q.cpIndex >= 1);
    ok(r2.cpIndex === 1, "checkpoint registers while driving");
    r2.ai = () => ({ ...IDLE, reset: true });
    r2.stepN(1);
    r2.ai = () => IDLE;
    drive(r2, IDLE, 1.5);
    ok(Math.abs(r2.car.s - T1.checkpoints[0].s) < 0.5 && r2.state === STATE.PLAYING, "R resets to the last checkpoint");
  }
  // falling off an unguarded edge
  {
    const run = playing(testLevel([{ t: "S", len: 300, start: true, rails: false }]));
    placeOnTrack(run.car, run.T, 60, 0, 20);
    let fell = false;
    drive(run, { ...GAS, steer: 1 }, 6, (r) => {
      if (r.state === STATE.FALLING) fell = true;
      return fell && r.state === STATE.PLAYING;
    });
    ok(fell, "steering off an unguarded edge falls");
    ok(run.state === STATE.PLAYING && run.car.mode === "ground", "…and respawns on the road");
    const runR = playing(testLevel([{ t: "S", len: 300, start: true }]));
    placeOnTrack(runR.car, runR.T, 60, 0, 30);
    let hitWall = false;
    drive(runR, { ...GAS, steer: 1 }, 4, (r) => {
      for (const e of r.events) if (e.type === "wall") hitWall = true;
      return false;
    });
    ok(runR.stats.crashes === 0 && Math.abs(runR.car.lat) <= 6, "rails keep the car on the road");
  }

  console.log("— Quality gate 2: Level 2 (nitro pickup, boost pad, medium jump, obstacle) —");
  {
    const L2 = getLevel(2);
    const { run, ev } = botRun(L2);
    ok(run.state === STATE.COMPLETE && run.stats.crashes === 0, "bot finishes Level 2 cleanly");
    ok(ev.some((e) => e.type === "nitro"), "nitro canister collected");
    ok(ev.filter((e) => e.type === "boost").length === 1, "boost pad fired exactly once");
    ok(ev.some((e) => e.type === "land" && e.airT > 0.8), "medium jump flown");
    // nitro behaviour
    const r = playing(testLevel([{ t: "S", len: 2600, start: true }]));
    drive(r, GAS, 14);
    const top = r.car.fwd;
    r.car.nitro = 1;
    drive(r, { ...GAS, nitro: true }, 2);
    ok(r.car.fwd > top + 4, `nitro raises top speed (${kmh(top).toFixed(0)} → ${kmh(r.car.fwd).toFixed(0)} km/h)`);
    drive(r, { ...GAS, nitro: true }, 3);
    ok(r.car.nitro < 0.02 && !r.car.nitroOn, "nitro runs out (not unlimited)");
    drive(r, GAS, 6);
    ok(Math.abs(r.car.fwd - top) < 1.5, "speed returns to normal after nitro");
    // boost pad no stacking
    const T2 = trackFor(L2);
    const pad = T2.boosts[0];
    const rb = playing(L2);
    placeOnTrack(rb.car, rb.T, pad.s - 10, 0, 30);
    let boosts = 0;
    drive(rb, GAS, 2, (q) => {
      for (const e of q.events) if (e.type === "boost") boosts++;
      q.events.length = 0;
      return false;
    });
    ok(boosts === 1 && rb.car.fwd < paramsFor(BLAZE.stats).vmax + 8.5, `boost pad: one shove, capped (${kmh(rb.car.fwd).toFixed(0)} km/h)`);
    // obstacle: sit in its path, it must push, never wreck
    const ob = rb.obstacles[0];
    const ro = playing(L2);
    placeOnTrack(ro.car, ro.T, ob.s - 25, 0, 25);
    let hits = 0;
    drive(ro, GAS, 3, (q) => {
      for (const e of q.events) if (e.type === "hit") hits++;
      q.events.length = 0;
      return false;
    });
    ok(ro.stats.crashes === 0 && ro.state === STATE.PLAYING, `driving into the slider never wrecks the car (${hits} hits)`);
    // the slider leaves a gap at all times
    let always = true;
    for (let t = 0; t < 10; t += 0.05) {
      let any = false;
      for (let y = -ob.hw + 1.2; y <= ob.hw - 1.2; y += 0.25) if (!collide(ob, t, ob.hw, 0, y, 0)) any = true;
      if (!any) always = false;
    }
    ok(always, "the slider always leaves a lane open");
  }

  console.log("— Quality gate 3: Level 3 (giant loop) —");
  {
    const L3 = getLevel(3);
    const T3 = trackFor(L3);
    const lp = T3.loops[0];
    const cpBefore = T3.checkpoints.filter((c) => c.s < lp.s0).pop();
    ok(!!cpBefore, "a checkpoint before the loop");
    const tryLoop = (v, inp) => {
      const run = playing(L3);
      placeOnTrack(run.car, run.T, lp.s0 - 2, 0, v);
      run.cpIndex = T3.checkpoints.indexOf(cpBefore) + 1;
      run.respawnS = cpBefore.s;
      run.car.nitro = 1;
      let result = "stuck";
      let maxS = 0;
      let minUy = 1;
      drive(run, inp, 8, (r) => {
        maxS = Math.max(maxS, r.car.s);
        if (r.car.inLoop) minUy = Math.min(minUy, r.car.U.y);
        if (r.state === STATE.FALLING) {
          result = "fell";
          return true;
        }
        if (r.car.s > lp.s1 + 15 && r.car.mode === "ground") {
          result = "through";
          return true;
        }
        if (r.car.s < lp.s0 - 20) {
          result = "rolledBack";
          return true;
        }
        return false;
      });
      return { result, run, maxS, minUy };
    };
    const sign = lp.minKmh / 3.6;
    let thr = null;
    for (let v = 18; v <= 45; v += 0.5) {
      if (tryLoop(v, IDLE).result === "through") {
        thr = v;
        break;
      }
    }
    console.log(`    loop R=${lp.R}: coasting threshold ${(thr * 3.6).toFixed(0)} km/h, sign says ${lp.minKmh} km/h`);
    ok(thr != null && thr <= sign, "coasting in at the signed speed makes it round");
    const atSign = tryLoop(sign, GAS);
    ok(atSign.result === "through" && atSign.minUy < -0.95, "correct-speed entry: drives upside down and exits");
    const slow = tryLoop(sign * 0.6, GAS);
    ok(slow.result === "fell" || slow.result === "rolledBack", `low-speed entry fails safely (${slow.result})`);
    if (slow.result === "fell") {
      drive(slow.run, IDLE, 3);
      ok(slow.run.state === STATE.PLAYING && Math.abs(slow.run.car.s - cpBefore.s) < 0.5, "…respawned before the loop");
    }
    const rolled = tryLoop(sign * 0.45, IDLE);
    ok(rolled.result !== "stuck", `very slow entry never soft-locks (${rolled.result})`);
    const nit = tryLoop(sign * 0.85, { ...GAS, nitro: true });
    ok(nit.result === "through", "nitro entry from below the sign makes it");
    const fast = tryLoop(55, { ...GAS, nitro: true });
    ok(fast.result === "through", "max-speed nitro entry is fine");
    // exit is offset sideways (no overlap with the entry), exit straight
    const f0 = T3.frameAt(lp.s0);
    const f1 = T3.frameAt(lp.s1);
    ok(Math.hypot(f1.x - f0.x, f1.z - f0.z) > f0.w, "loop exit is offset from its entry");
    ok(Math.abs(f1.y - f0.y) < 0.01 && f1.tx * f0.tx + f1.tz * f0.tz > 0.999, "loop exits level and in the entry direction");
    // restart inside the loop
    const mid = tryLoop(sign + 3, GAS);
    void mid;
    const r = playing(L3);
    placeOnTrack(r.car, r.T, lp.s0 - 2, 0, sign + 5);
    r.cpIndex = T3.checkpoints.indexOf(cpBefore) + 1;
    r.respawnS = cpBefore.s;
    drive(r, GAS, 4, (q) => q.car.s > lp.s0 + lp.R * Math.PI * 0.9);
    ok(r.car.inLoop && r.car.U.y < 0, "car is upside down in the loop");
    r.ai = () => ({ ...IDLE, reset: true });
    r.stepN(1);
    drive(r, IDLE, 1.5);
    ok(r.state === STATE.PLAYING && Math.abs(r.car.s - cpBefore.s) < 0.5 && r.car.U.y > 0.95, "reset inside the loop → upright at the checkpoint");
    const { run } = botRun(L3);
    ok(run.state === STATE.COMPLETE && run.stats.crashes === 0 && run.stars.size === T3.stars.length, "bot finishes Level 3 with every star (incl. the one at the top of the loop)");
  }
}

// ==========================================================================================
function torture() {
  console.log("— Torture tests —");
  const L2 = getLevel(2);
  const T2 = trackFor(L2);
  const ramp = T2.ramps[0];
  const vmax = paramsFor(BLAZE.stats).vmax;
  // jump at max speed + nitro
  {
    const run = playing(L2);
    placeOnTrack(run.car, run.T, ramp.s0 - 3, 0, vmax + 10);
    run.car.nitro = 1;
    drive(run, { ...GAS, nitro: true }, 6, (r) => r.car.mode === "ground" && r.car.s > ramp.lip + 5);
    ok(run.stats.crashes === 0, "jump at maximum speed with nitro: no crash");
  }
  // jump while steering hard (rails catch / air control limited)
  for (const dir of [1, -1]) {
    const run = playing(L2);
    placeOnTrack(run.car, run.T, ramp.s0 - 3, 0, vmax);
    let crashed = false;
    drive(run, { ...GAS, steer: dir }, 4, (r) => {
      if (r.state === STATE.FALLING) crashed = true;
      return r.car.mode === "ground" && r.car.s > ramp.lip + 5;
    });
    ok(true, `jump while steering ${dir > 0 ? "left" : "right"}: ${crashed ? "fell (allowed)" : "landed"}`);
    drive(run, IDLE, 4);
    ok(run.state === STATE.PLAYING || run.state === STATE.RESPAWNING, "…and the run continues");
  }
  // land sideways
  {
    const run = playing(L2);
    placeOnTrack(run.car, run.T, ramp.s0 - 3, 0, vmax);
    drive(run, GAS, 3, (r) => r.car.mode === "air" && r.car.airT > 0.2);
    run.car.h += 1.2; // force the body 70° off the flight path
    let quality = null;
    drive(run, IDLE, 3, (r) => {
      for (const e of r.events) if (e.type === "land") quality = e.quality;
      return quality != null;
    });
    ok(quality === "sketchy" && run.car.mode === "ground", "sideways landing → sketchy, keeps driving (no soft lock)");
    drive(run, GAS, 3);
    ok(run.car.fwd > 5, "…and drives away");
  }
  // pause while airborne: nothing advances
  {
    const run = playing(L2);
    placeOnTrack(run.car, run.T, ramp.s0 - 3, 0, vmax);
    drive(run, GAS, 3, (r) => r.car.mode === "air" && r.car.airT > 0.2);
    const snap = JSON.stringify([run.car.x, run.car.y, run.car.z, run.time, run.clock]);
    run.paused = true;
    for (let i = 0; i < 100; i++) run.tick(1 / 60, null);
    ok(JSON.stringify([run.car.x, run.car.y, run.car.z, run.time, run.clock]) === snap, "pause while airborne: frozen");
    run.paused = false;
    drive(run, GAS, 3);
    ok(run.car.mode === "ground" || run.state !== STATE.PLAYING, "…resumes and lands");
  }
  // frame-time spikes (tab hitch / fullscreen toggle mid-jump)
  {
    const run = playing(L2);
    placeOnTrack(run.car, run.T, ramp.s0 - 3, 0, vmax);
    for (let i = 0; i < 40; i++) run.tick(i % 7 === 0 ? 0.5 : 1 / 30, { frame: () => GAS });
    ok(Number.isFinite(run.car.x + run.car.y + run.car.z), "huge frame times are clamped (no explosion)");
  }
  // same star twice
  {
    const T1 = trackFor(getLevel(1));
    const run = playing(getLevel(1));
    const st = T1.stars[0];
    placeOnTrack(run.car, run.T, st.s - 10, st.lat, 15);
    let n = 0;
    drive(run, GAS, 2, (r) => {
      for (const e of r.events) if (e.type === "star") n++;
      r.events.length = 0;
      return false;
    });
    placeOnTrack(run.car, run.T, st.s - 10, st.lat, 15);
    drive(run, GAS, 2, (r) => {
      for (const e of r.events) if (e.type === "star") n++;
      r.events.length = 0;
      return false;
    });
    ok(n === 1 && run.stars.size === 1, "the same star counts once");
  }
  // skip a checkpoint (fly over it) → later one still counts, finish still valid
  {
    const L = testLevel([
      { t: "S", len: 60, start: true },
      { t: "S", len: 60, cp: true },
      { t: "S", len: 60, cp: true },
      { t: "S", len: 120, finish: 30 },
    ]);
    const run = playing(L);
    placeOnTrack(run.car, run.T, 140, 0, 30); // past cp 1, before cp 2
    drive(run, GAS, 6, (r) => r.state === STATE.COMPLETE);
    ok(run.cpIndex === 2 && run.state === STATE.COMPLETE, "skipped checkpoint: later checkpoint + finish still register");
  }
  // collide with moving obstacles of every type at speed
  {
    const types = ["spinner", "arm", "hammer", "ball", "slider", "gate", "doors", "wall"];
    for (const type of types) {
      const L = testLevel([
        { t: "S", len: 60, start: true },
        { t: "S", len: 80, cp: true, x: [["ob", 50, { type }]] },
        { t: "S", len: 120, finish: 30 },
      ]);
      let hits = 0;
      let done = 0;
      for (let ph = 0; ph < 1; ph += 0.125) {
        const run = playing(L);
        run.obstacles[0].phase = ph;
        drive(run, GAS, 14, (r) => {
          for (const e of r.events) if (e.type === "hit") hits++;
          r.events.length = 0;
          return r.state === STATE.COMPLETE;
        });
        if (run.state === STATE.COMPLETE && run.stats.crashes === 0) done++;
      }
      ok(done === 8, `${type}: straight-line blast through at 8 phases always finishes (${hits} hits, never wrecked)`);
    }
  }
  // falling tiles reset on respawn; stopping on them drops you, never soft-locks
  {
    const L = testLevel([
      { t: "S", len: 60, start: true },
      { t: "S", len: 40, cp: true },
      { t: "S", len: 48, fall: true, rails: false },
      { t: "S", len: 120, finish: 30 },
    ]);
    const run = playing(L);
    placeOnTrack(run.car, run.T, 105, 0, 4);
    let fell = false;
    drive(run, { ...IDLE, brake: 1 }, 6, (r) => {
      if (r.state === STATE.FALLING) fell = true;
      return fell && r.state === STATE.PLAYING;
    });
    ok(fell, "stopping on crumbling tiles drops the car");
    ok(run.tiles.every((t) => t.trig < 0 && t.drop === 0), "tiles are restored on respawn");
    drive(run, GAS, 10, (r) => r.state === STATE.COMPLETE);
    ok(run.state === STATE.COMPLETE, "driving over them at speed works");
  }
  // reset spam
  {
    const run = playing(getLevel(1));
    for (let i = 0; i < 300; i++) {
      run.ai = () => ({ ...GAS, reset: i % 3 === 0 });
      run.stepN(1);
    }
    drive(run, GAS, 3);
    ok(run.state === STATE.PLAYING && run.car.mode === "ground", "reset spam never breaks the run");
  }
}

// ==========================================================================================
function validateLevel(def, verbose = false) {
  const T = trackFor(def);
  const S = T.samples;
  const tag = `L${def.id} ${def.name}`;
  ok(S[Math.round(T.start)].road && S[Math.round(T.start)].kind === "start", `${tag}: starts on the start platform`);
  ok(T.finish > T.start + 200 && T.finish < T.L - 20 && S[Math.round(T.finish)].road, `${tag}: finish gate on the road, with run-out`);
  ok(T.stars.length === 3, `${tag}: three stars (${T.stars.length})`);
  ok(T.checkpoints.length >= 1, `${tag}: has checkpoints`);
  // the route never runs into itself (crossings must clear by a deck + car height)
  {
    let clash = null;
    for (let i = 0; i < S.length && !clash; i += 2)
      for (let j = i + 70; j < S.length; j += 2) {
        const a = S[i];
        const b = S[j];
        if (Math.abs(a.y - b.y) > 8.5) continue;
        if (Math.hypot(a.x - b.x, a.z - b.z) < (a.w + b.w) / 2 + 1) {
          clash = `${i}↔${j}`;
          break;
        }
      }
    ok(!clash, `${tag}: no self-overlap${clash ? ` (samples ${clash})` : ""}`);
  }
  // checkpoints on safe, flat-ish road, clear of obstacles and crumbling tiles
  for (const cp of T.checkpoints) {
    let safe = true;
    for (let s = cp.s - 2; s <= cp.s + 14; s++) {
      const p = S[Math.round(s)];
      if (!p || !p.road || p.kind === "loop" || p.kind === "ramp" || p.fall) safe = false;
    }
    for (const o of T.obstacles) if (o.s > cp.s - 6 && o.s < cp.s + 18) safe = false;
    ok(safe, `${tag}: checkpoint at ${cp.s} is a safe respawn`);
    const run = playing(def);
    run.respawnS = cp.s;
    run.cpIndex = T.checkpoints.indexOf(cp) + 1;
    placeOnTrack(run.car, run.T, cp.s, 0, 0);
    drive(run, IDLE, 3);
    ok(run.state === STATE.PLAYING && run.car.mode === "ground", `${tag}: idle after respawn at ${cp.s} stays put`);
  }
  // every gap: preceded by a ramp / lip, followed by road
  for (const g of T.gaps) ok(S[g.s0 - 1] && S[g.s0 - 1].road && S[Math.min(T.L, g.s1)].road, `${tag}: gap ${g.s0}-${g.s1} has road on both sides`);
  // each loop: checkpoint before it within reach, enough run-up
  for (const lp of T.loops) {
    const cp = T.checkpoints.filter((c) => c.s < lp.s0).pop();
    ok(!!cp && lp.s0 - cp.s > 70, `${tag}: loop at ${lp.s0} has a checkpoint with run-up before it`);
  }
  // ramps: lands at every speed from the floor (posted min or 75 km/h) to top speed
  const vmax = paramsFor(BLAZE.stats).vmax;
  for (const r of T.ramps) {
    const floor = (r.minKmh ?? 75) / 3.6;
    const bad = [];
    for (let v = floor; v <= vmax + 0.01; v += (vmax - floor) / 6) {
      const run = playing(def);
      placeOnTrack(run.car, run.T, r.s0 - 2, 0, v);
      let flew = false;
      let landed = false;
      drive(run, { ...IDLE, throttle: 0.6 }, 6, (q) => {
        if (q.car.mode === "air") flew = true;
        if (flew && q.car.mode === "ground") landed = true;
        return landed || q.state === STATE.FALLING;
      });
      if (!landed) bad.push(Math.round(v * 3.6));
    }
    ok(bad.length === 0, `${tag}: ramp at ${r.s0} lands from ${Math.round(floor * 3.6)} to ${Math.round(vmax * 3.6)} km/h${bad.length ? ` (fails at ${bad.join(",")})` : ""}`);
  }
  // obstacles: lanes open often enough, and none of them on a ramp or loop
  for (const o of T.obstacles) {
    const p = S[Math.round(o.s)];
    ok(p.road && p.kind !== "loop" && p.kind !== "ramp", `${tag}: ${o.type} at ${o.s} sits on plain road`);
  }
  // stars: within reach
  T.stars.forEach((st, i) => {
    const p = S[Math.round(st.s)];
    ok(Math.abs(st.lat) < p.w / 2 - 1, `${tag}: star ${i} within the road width`);
  });
  // the bot drives it with the starter car: no crashes
  const { run, ev } = botRun(def, BLAZE);
  ok(run.state === STATE.COMPLETE, `${tag}: bot finishes with BLAZE (${run.results ? run.results.time.toFixed(2) + " s" : "DNF at s=" + run.car.s.toFixed(0)})`);
  ok(run.stats.crashes === 0, `${tag}: no crashes (${run.stats.crashes})`);
  ok(run.stars.size === T.stars.length, `${tag}: bot collects all stars (${run.stars.size}/${T.stars.length})`);
  // a cautious no-nitro driver also finishes (nitro is a help, not a requirement off signed jumps)
  const slow = botRun(def, BLAZE, { nitro: false, stars: false, skill: 0.85 });
  const needNitro = T.loops.length > 0 || T.ramps.some((r) => r.minKmh);
  ok(slow.run.state === STATE.COMPLETE || needNitro, `${tag}: careful no-nitro driver finishes (${slow.run.results ? slow.run.results.time.toFixed(1) : "DNF"})`);
  if (verbose) {
    for (const e of ev) if (!["nitroOn", "nitroOff", "count"].includes(e.type)) console.log(`    ${e.t.toFixed(2)} ${e.type} s=${e.s.toFixed(0)} ${e.airT ? "air " + e.airT.toFixed(2) : ""}${e.quality ? " " + e.quality : ""}${e.why ? " " + e.why : ""}`);
  }
  const len = T.finish - T.start;
  return { id: def.id, time: run.results ? run.results.time : null, len, slow: slow.run.results ? slow.run.results.time : null };
}

function levels(only) {
  console.log("— Level validation —");
  const out = [];
  for (const def of LEVELS) {
    if (only && def.id !== only) continue;
    const r = validateLevel(def, !!only);
    out.push(r);
    console.log(`  L${def.id} ${def.name.padEnd(20)} ${Math.round(r.len)} m  bot ${r.time?.toFixed(2)} s  careful ${r.slow?.toFixed(1) ?? "—"} s  medals ${def.medals ? def.medals.gold + "/" + def.medals.silver : "est"}`);
  }
  return out;
}

function cars() {
  console.log("— Every car on every level —");
  for (const c of CARS) {
    let done = 0;
    let crashes = 0;
    for (const def of LEVELS) {
      const { run } = botRun(def, c);
      if (run.state === STATE.COMPLETE) done++;
      crashes += run.stats.crashes;
    }
    ok(done === LEVELS.length, `${c.name}: finishes ${done}/${LEVELS.length} (${crashes} crashes)`);
  }
}

async function save() {
  console.log("— Save / unlocks —");
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  const S = await import("../engine/storage.js");
  store.set("other-game-progress", "keep me");
  let st = S.loadState();
  ok(st.car === "blaze" && S.isLevelUnlocked(st, 1) && !S.isLevelUnlocked(st, 2), "fresh save: level 1 open, BLAZE selected");
  const r = S.recordFinish(st, 1, { time: 30, stars: [0, 2], medal: "silver", stats: { jumps: 2, landings: 1, crashes: 1, distance: 900, nitroUsed: 2, time: 30 } });
  st = r.state;
  ok(S.isLevelUnlocked(st, 2) && r.nextUnlocked, "finishing level 1 unlocks level 2");
  const r2 = S.recordFinish(st, 1, { time: 40, stars: [1], medal: "bronze", stats: { time: 40 } });
  ok(r2.state.best[1].time === 30 && r2.state.best[1].medal === "silver" && S.starCount(r2.state) === 3, "worse retry keeps the best time + medal; stars union");
  st = r2.state;
  S.saveState(st);
  const re = S.loadState();
  ok(JSON.stringify(re.best) === JSON.stringify(st.best) && re.stats.jumps === st.stats.jumps, "reload restores progress");
  ok(store.get("other-game-progress") === "keep me", "other games' keys untouched");
  store.set(S.STORAGE_KEY, "{garbage");
  ok(S.loadState().v === 1, "corrupt save falls back to defaults");
  store.set(S.STORAGE_KEY, JSON.stringify({ v: 1, car: "legend", best: { 1: { time: -3 } }, settings: { master: 9 } }));
  const bad = S.loadState();
  ok(bad.car === "blaze" && !bad.best[1] && bad.settings.master <= 1, "tampered save is sanitised (locked car, bad times, out-of-range volume)");
  // car unlocks
  let s2 = S.defaultState();
  for (let id = 1; id <= 6; id++) s2 = S.recordFinish(s2, id, { time: 30, stars: [0, 1, 2], medal: "gold", stats: { time: 30 } }).state;
  ok(S.isCarUnlocked(s2, "comet") && S.isCarUnlocked(s2, "viper") && !S.isCarUnlocked(s2, "titan"), "COMET (6 levels) and VIPER (15 stars… 18) unlock; TITAN not yet");
  const sel = S.selectCar(s2, "titan");
  ok(sel.car === s2.car, "can't select a locked car");
  ok(S.selectCar(s2, "comet").car === "comet", "can select an unlocked car");
}

function medals(write) {
  console.log("— Medal reference times (bot, BLAZE) —");
  const lines = [];
  for (const def of LEVELS) {
    const { run } = botRun(def, BLAZE);
    if (!run.results) {
      console.log(`  L${def.id}: DNF`);
      continue;
    }
    const t = run.results.time;
    const gold = Math.ceil(t * 1.12 + 1);
    const silver = Math.ceil(t * 1.38 + 3);
    lines.push(`  ${def.id}: { gold: ${gold}, silver: ${silver} }, // bot ${t.toFixed(2)} s`);
    console.log(`  L${def.id} ${def.name.padEnd(20)} bot ${t.toFixed(2)}  gold ≤ ${gold}  silver ≤ ${silver}`);
  }
  if (write) {
    const file = fileURLToPath(new URL("../data/medals.js", import.meta.url));
    writeFileSync(
      file,
      `/**\n * Stunt Racer 3D — medal thresholds (seconds), generated by\n * tools/simTest.mjs medals --write from the bot's reference run with BLAZE:\n * gold ≈ bot × 1.12, silver ≈ bot × 1.38; bronze = finishing.\n */\nexport const MEDALS = {\n${lines.join("\n")}\n};\n`,
    );
    console.log("  wrote data/medals.js");
  }
}

// ==========================================================================================
const cmd = process.argv[2] || "all";
const arg = process.argv[3];
const t0 = Date.now();
if (cmd === "gates" || cmd === "all") gates();
if (cmd === "torture" || cmd === "all") torture();
if (cmd === "levels" || cmd === "all") levels(arg ? Number(arg) : null);
if (cmd === "cars" || cmd === "all") cars();
if (cmd === "save" || cmd === "all") await save();
if (cmd === "medals") medals(arg === "--write");
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (fail) {
  console.log("FAILURES:\n  " + fails.join("\n  "));
  process.exitCode = 1;
}
void G;
void roadAt;
void tileDropped;
void buildTrack;
void createCar;
void stepCar;
