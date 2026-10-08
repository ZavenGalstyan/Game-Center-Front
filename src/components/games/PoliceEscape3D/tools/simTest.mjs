/**
 * Police Escape 3D — headless simulation tests (the engine is framework-free).
 *
 *   node src/components/games/PoliceEscape3D/tools/simTest.mjs all
 *   node .../simTest.mjs drive       driving model
 *   node .../simTest.mjs police      police AI quality gate
 *   node .../simTest.mjs gate        first complete mission
 *   node .../simTest.mjs torture     edge cases
 *   node .../simTest.mjs missions [id]  validate every mission (or one)
 *   node .../simTest.mjs cars        every car finishes every mission
 *   node .../simTest.mjs save        storage / unlocks
 *   node .../simTest.mjs targets [--write]  star target times → data/targets.js
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMission, STATE, STEP, cityFor, startPose } from "../engine/mission.js";
import { placeCar } from "../engine/car.js";
import { insideSolid, fieldFrom, onRoad, edgePoint, locate } from "../engine/city.js";
import { createBot } from "../engine/bot.js";
import { PSTATE, placePolice } from "../engine/police.js";
import { lightFor } from "../engine/traffic.js";
import { MISSIONS, getMission } from "../data/missions.js";
import { CARS, CAR_BY_ID } from "../data/cars.js";

const SHADOW = CAR_BY_ID.get("shadow");
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
const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false };
const GAS = { ...IDLE, throttle: 1 };
const kmh = (v) => v * 3.6;

function playing(def, car = SHADOW, opts = {}) {
  const run = createMission(def, car, opts);
  run.state = STATE.PLAYING;
  for (const c of run.police) c.state = PSTATE.PURSUIT;
  return run;
}
function drive(run, inp, seconds, until) {
  const fn = typeof inp === "function" ? inp : () => inp;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    run.ai = () => fn(run);
    run.stepN(1);
    if (until && until(run)) return true;
  }
  return false;
}
function botRun(def, car = SHADOW, opts = {}, limit = 420) {
  const run = createMission(def, car, { ...opts, ai: createBot(opts.bot) });
  const ev = [];
  for (let i = 0; i < limit / STEP && run.state !== STATE.COMPLETE && run.state !== STATE.BUSTED; i++) {
    run.stepN(1);
    for (const e of run.drain()) ev.push({ ...e, t: run.time });
  }
  return { run, ev };
}
/** A run with no police (driving tests). */
const quiet = (def) => {
  const run = playing(def, SHADOW, { traffic: 0 });
  run.police.length = 0;
  run.def = { ...run.def, police: { start: 0, max: 1 } };
  return run;
};

// ==========================================================================================
function driveTests() {
  console.log("— Driving model —");
  const M1 = getMission(1);
  // a long straight: the start avenue
  {
    const run = quiet(M1);
    let t100 = null;
    drive(run, GAS, 12, (r) => {
      if (t100 == null && kmh(r.player.fwd) >= 100) t100 = r.time;
      return r.player.x > 700;
    });
    ok(t100 != null && t100 > 1.5 && t100 < 5, `0–100 km/h in ${t100?.toFixed(2)} s`);
    ok(Math.abs(run.player.fwd - run.player.p.vmax) < 2, `top speed ${kmh(run.player.fwd).toFixed(0)} km/h`);
    const x0 = run.player.x;
    drive(run, { ...IDLE, brake: 1 }, 5, (r) => r.player.fwd < 0.3);
    ok(run.player.x - x0 < 40, `stops from top speed in ${(run.player.x - x0).toFixed(1)} m`);
    drive(run, { ...IDLE, brake: 1 }, 3);
    ok(run.player.fwd < -5 && run.player.fwd > -12.5, `reverses (${run.player.fwd.toFixed(1)} m/s)`);
  }
  // steering: responsive slow, calmer fast, handbrake slides and turns tighter
  {
    const rate = (v, hb) => {
      const run = quiet(M1);
      const sp = startPose(run.city, M1);
      placeCar(run.player, sp.x + 300, sp.z, sp.h);
      run.player.vx = Math.sin(sp.h) * v;
      run.player.vz = Math.cos(sp.h) * v;
      const h0 = run.player.h;
      drive(run, { ...IDLE, throttle: 0.6, steer: 1, handbrake: hb }, 0.5);
      return { turn: run.player.h - h0, slip: Math.abs(run.player.slip) };
    };
    const slow = rate(8, false);
    const fast = rate(36, false);
    const hb = rate(20, true);
    const mid = rate(20, false);
    ok(slow.turn > 0.4, `low-speed steering is responsive (${slow.turn.toFixed(2)} rad in 0.5 s)`);
    ok(fast.turn < slow.turn * 1.2 && fast.turn > 0.2, `high-speed steering is calmer (${fast.turn.toFixed(2)})`);
    ok(hb.turn > mid.turn * 1.25 && hb.slip > mid.slip * 2, `handbrake: tighter turn (${hb.turn.toFixed(2)} vs ${mid.turn.toFixed(2)}) with a slide (${hb.slip.toFixed(1)} m/s)`);
    ok(slow.turn < 1.6, "no instant spin");
  }
  // walls: never through a building, damage only on real impacts
  {
    const run = quiet(M1);
    const sp = startPose(run.city, M1);
    // aim straight at the block north of the start road
    placeCar(run.player, sp.x + 40, sp.z, Math.PI);
    run.player.nitro = 1;
    let inside = false;
    drive(run, { ...GAS, nitro: true }, 4, (r) => {
      if (insideSolid(r.city, r.player.x, r.player.z, -0.05)) inside = true;
      return false;
    });
    ok(!inside, "full-speed nitro into a building: never inside it");
    ok(run.integrity < 100, `head-on wall impact costs integrity (${run.integrity.toFixed(0)})`);
    ok(run.integrity > 50, "…but one impact is never a wreck");
    const run2 = quiet(M1);
    placeCar(run2.player, sp.x + 40, sp.z, Math.PI);
    drive(run2, { ...IDLE, throttle: 0.1 }, 3);
    ok(run2.integrity === 100, "a gentle nudge into a wall does no damage");
    // sliding along a wall at an angle keeps moving
    const run3 = quiet(M1);
    placeCar(run3.player, sp.x + 60, sp.z, Math.PI / 2 + 0.35);
    run3.player.vx = Math.sin(run3.player.h) * 25;
    run3.player.vz = Math.cos(run3.player.h) * 25;
    drive(run3, GAS, 2);
    ok(run3.player.fwd > 10, `glancing a wall: slides off and keeps going (${kmh(run3.player.fwd).toFixed(0)} km/h)`);
  }
  // sidewalk slowdown
  {
    const run = quiet(M1);
    const sp = startPose(run.city, M1);
    // put the car on the sidewalk strip beside the start road, parallel to it
    const e = run.city.edges[locate(run.city, sp.x, sp.z).e];
    placeCar(run.player, sp.x + 60, sp.z - (e.w / 2 + 1.6), sp.h);
    drive(run, GAS, 6);
    ok(run.player.p.vmax - run.player.fwd > 4 || run.player.surface === "road", `sidewalk slows the car (${kmh(run.player.fwd).toFixed(0)} km/h)`);
  }
  // nitro
  {
    const run = quiet(M1);
    drive(run, GAS, 8);
    const top = run.player.fwd;
    run.player.nitro = 1;
    drive(run, { ...GAS, nitro: true }, 1.5);
    ok(run.player.fwd > top + 4, `nitro raises speed (${kmh(top).toFixed(0)} → ${kmh(run.player.fwd).toFixed(0)} km/h)`);
    drive(run, { ...GAS, nitro: true }, 4);
    ok(run.player.nitro < 0.02, "nitro runs out (not infinite)");
    const n0 = run.player.nitro;
    drive(run, GAS, 4);
    ok(run.player.nitro > n0, "nitro recharges slowly with distance");
  }
}

// ==========================================================================================
function policeTests() {
  console.log("— Police AI quality gate —");
  const M1 = getMission(1);
  const city = cityFor(M1);
  // reach a player parked across the city: follows roads, turns at
  // intersections, goes around buildings
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    const far = city.nodes[city.intNode(7, 1)];
    placeCar(run.player, far.x, far.z, 0);
    let reached = 0;
    let insideSolidT = 0;
    let offRoadMax = 0;
    drive(run, IDLE, 70, (r) => {
      r.bust = 0; // navigation only here — busting is checked below
      for (const c of r.police) {
        if (insideSolid(r.city, c.car.x, c.car.z, -0.2)) insideSolidT++;
        const q = locate(r.city, c.car.x, c.car.z, 40);
        offRoadMax = Math.max(offRoadMax, q.d - r.city.edges[q.e].w / 2);
      }
      reached = r.police.filter((c) => Math.hypot(c.car.x - r.player.x, c.car.z - r.player.z) < 12).length;
      return reached === r.police.length;
    });
    ok(reached === run.police.length, `both police cars navigate the city to the player (${reached}/${run.police.length}, ${run.time.toFixed(1)} s)`);
    ok(insideSolidT === 0, "police never inside a building");
    ok(offRoadMax < 6, `police stay on the road network (max ${offRoadMax.toFixed(1)} m past the kerb)`);
    const busted = drive(run, IDLE, 20, (r) => r.state === STATE.BUSTED);
    ok(busted && run.bustWhy === "caught", "boxed in while stopped → BUSTED");
  }
  // follow a player who keeps changing route (bot heading to random far nodes)
  {
    const def = { ...M1, type: "survive", survive: 999, police: { start: 2, max: 1, speed: 0.98 } };
    const run = createMission(def, SHADOW, { ai: createBot() });
    let sum = 0;
    let n = 0;
    let lost = 0;
    let frozen = 0;
    const still = new Map();
    for (let i = 0; i < 120 * 120 && run.state !== STATE.BUSTED; i++) {
      run.stepN(1);
      for (const e of run.drain()) if (e.type === "copLost") lost++;
      if (run.state !== STATE.PLAYING) continue;
      for (const c of run.police) {
        if (c.state === PSTATE.LOST || c.state === PSTATE.DISABLED || !Number.isFinite(c.distToPlayer)) continue;
        sum += c.distToPlayer;
        n++;
        const s = Math.abs(c.car.fwd) < 1 && c.distToPlayer > 15 ? (still.get(c.id) || 0) + STEP : 0;
        still.set(c.id, s);
        if (s > 8) frozen++;
      }
    }
    ok(n > 0 && sum / n < 260, `police keep up with a route-changing driver (avg ${(sum / Math.max(1, n)).toFixed(0)} m)`);
    ok(frozen === 0, "no police car frozen > 8 s mid-pursuit (no deadlock)");
    void lost;
  }
  // recover after a crash: a cop jammed nose-first into a wall
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    const cop = run.police[0];
    const n = city.nodes[city.intNode(4, 4)];
    placeCar(cop.car, n.x + 8, n.z + 8, Math.PI / 4); // aimed into the block corner
    const tgt = city.nodes[city.intNode(1, 6)];
    placeCar(run.player, tgt.x, tgt.z, 0);
    run.police.length = 1;
    const reached = drive(run, IDLE, 60, (r) => Math.hypot(cop.car.x - r.player.x, cop.car.z - r.player.z) < 14);
    ok(reached, `a jammed police car recovers and resumes the pursuit (${run.time.toFixed(1)} s)`);
  }
  // DISABLED after a heavy hit, then back in the chase
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    const cop = run.police[0];
    cop.state = PSTATE.DISABLED;
    cop.disabledT = 2;
    drive(run, IDLE, 1);
    ok(cop.state === PSTATE.DISABLED && Math.abs(cop.car.fwd) < 2, "disabled police car stops");
    drive(run, IDLE, 2);
    ok(cop.state !== PSTATE.DISABLED, "…and re-joins after a moment");
  }
  // field-based routing is recomputed, not per frame
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    let changes = 0;
    let last = null;
    drive(run, GAS, 3, (r) => {
      if (r.fieldP !== last) {
        changes++;
        last = r.fieldP;
      }
      return false;
    });
    ok(changes > 5 && changes < 15, `pathfinding runs a few times a second, not every frame (${changes} in 3 s)`);
  }
}

// ==========================================================================================
function gate() {
  console.log("— Quality gate: Mission 1 (First Pursuit) —");
  const M1 = getMission(1);
  let wins = 0;
  const times = [];
  for (let seed = 0; seed < 5; seed++) {
    const { run } = botRun(M1, SHADOW, { seed });
    if (run.state === STATE.COMPLETE) {
      wins++;
      times.push(run.results.time);
    }
  }
  ok(wins === 5, `the bot escapes in Mission 1 on every seed (${wins}/5, ${times.map((t) => t.toFixed(0)).join(", ")} s)`);
  const { run, ev } = botRun(M1, SHADOW, { seed: 1 });
  ok(ev.some((e) => e.type === "go") && run.police.length >= 2, "pursuit starts with two police cars");
  ok(run.results && run.results.stars >= 1, `stars awarded (${run.results?.stars})`);
  const c = run.city;
  ok(!!c.zone && c.zone.node != null, "escape zone exists with a driveway node");
  ok(run.traffic.cars.length >= 6, "traffic present");
  ok(c.edges.some((e) => e.kind === "alley"), "an alley shortcut exists");
  ok(run.nitros.length === 1, "one nitro pickup");
}

// ==========================================================================================
function torture() {
  console.log("— Torture tests —");
  const M1 = getMission(1);
  // pause freezes everything
  {
    const run = playing(M1);
    drive(run, GAS, 3);
    const snap = JSON.stringify([run.player.x, run.player.z, run.time, run.police.map((c) => [c.car.x, c.car.z]), run.traffic.cars.map((t) => [t.x, t.z])]);
    run.paused = true;
    for (let i = 0; i < 60; i++) run.tick(1 / 60, null);
    ok(JSON.stringify([run.player.x, run.player.z, run.time, run.police.map((c) => [c.car.x, c.car.z]), run.traffic.cars.map((t) => [t.x, t.z])]) === snap, "pause freezes player, police, traffic and the timer");
  }
  // restart = a fresh mission
  {
    const a = playing(M1);
    drive(a, GAS, 5);
    const b = createMission(M1, SHADOW);
    ok(b.time === 0 && b.integrity === 100 && b.state === STATE.COUNTDOWN && Math.abs(b.player.nitro - 0.6) < 1e-9, "restart resets timer, integrity, nitro, state");
  }
  // reverse during the pursuit, nitro while turning, reset when stuck
  {
    const run = playing(M1);
    drive(run, GAS, 3);
    drive(run, { ...IDLE, brake: 1, steer: 1 }, 3);
    run.player.nitro = 1;
    drive(run, { ...GAS, steer: 1, nitro: true }, 2);
    ok(Number.isFinite(run.player.x) && !insideSolid(run.city, run.player.x, run.player.z, -0.1), "reverse + nitro while turning: stable");
    const sp = startPose(run.city, M1);
    placeCar(run.player, sp.x + 40, sp.z, Math.PI);
    drive(run, GAS, 1.5);
    run.ai = () => ({ ...IDLE, reset: true });
    run.stepN(1);
    ok(onRoad(run.city, run.player.x, run.player.z), "R puts the car back on the road");
  }
  // integrity to zero → BUSTED (wrecked), never frozen
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    run.police.length = 0;
    run.integrity = 3;
    const sp = startPose(run.city, M1);
    placeCar(run.player, sp.x + 40, sp.z, Math.PI);
    drive(run, GAS, 4, (r) => r.state === STATE.BUSTED);
    ok(run.state === STATE.BUSTED && run.bustWhy === "wrecked", "integrity 0 → BUSTED");
    const t = run.time;
    drive(run, GAS, 1);
    ok(run.time === t, "BUSTED stops the clock (no soft lock: the UI offers Retry)");
  }
  // reaching the zone with low health / health hitting zero on the finish step → escape
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    run.police.length = 0;
    run.integrity = 1;
    const z = run.city.zone;
    placeCar(run.player, (z.rect.x0 + z.rect.x1) / 2, (z.rect.z0 + z.rect.z1) / 2, 0);
    run.stepN(1);
    ok(run.state === STATE.COMPLETE && run.results.stars >= 1, "reaching the zone with 1% integrity still escapes");
  }
  // time limit
  {
    const run = playing({ ...M1, timeLimit: 2 });
    drive(run, IDLE, 3);
    ok(run.state === STATE.BUSTED && run.bustWhy === "time", "time limit → BUSTED (time)");
  }
  // collide with police and traffic: speed loss, sparks event, limited damage
  {
    const run = playing(M1, SHADOW, { traffic: 0 });
    const cop = run.police[0];
    const p = run.player;
    placeCar(cop.car, p.x + 30, p.z, -Math.PI / 2);
    cop.state = PSTATE.DISABLED;
    cop.disabledT = 5;
    p.vx = 30;
    let hits = 0;
    drive(run, GAS, 2, (r) => {
      for (const e of r.events) if (e.type === "hit" && e.kind === "police") hits++;
      r.events.length = 0;
      return false;
    });
    ok(hits > 0 && run.integrity < 100 && run.integrity >= 70, `ramming a police car: impact + limited damage (${run.integrity.toFixed(0)})`);
  }
  // traffic: lights, spacing, pool
  {
    const run = playing(M1, SHADOW, { traffic: 12 });
    let overlaps = 0;
    let redRuns = 0;
    drive(run, IDLE, 30, (r) => {
      const act = r.traffic.cars.filter((t) => t.active);
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) if (Math.hypot(act[i].x - act[j].x, act[i].z - act[j].z) < 3) overlaps++;
      return false;
    });
    ok(run.traffic.cars.length === 12 && run.traffic.cars.filter((t) => t.active).length >= 8, "pooled traffic stays populated near the player");
    ok(overlaps < 30, `traffic keeps its spacing (${overlaps} close frames)`);
    void redRuns;
    const n = run.city.nodes.find((x) => x.light);
    ok(n && lightFor(n, "x", 1) !== lightFor(n, "z", 1), "crossing directions never both green");
  }
}

// ==========================================================================================
function validateMission(def, verbose = false) {
  const city = cityFor(def);
  const tag = `M${def.id} ${def.name}`;
  const sp = startPose(city, def);
  ok(!!sp.edge && onRoad(city, sp.x, sp.z) && !insideSolid(city, sp.x, sp.z, 1.5), `${tag}: valid player spawn`);
  // graph: every node not inside a solid, every edge centreline clear
  let badNodes = 0;
  for (const n of city.nodes) if (insideSolid(city, n.x, n.z, 0.5)) badNodes++;
  let badEdges = 0;
  for (const e of city.edges) for (let t = 2; t < e.len - 2; t += 4) {
    const p = edgePoint(city, e, t, 0);
    if (insideSolid(city, p.x, p.z, 0.5)) {
      badEdges++;
      break;
    }
  }
  ok(badNodes === 0 && badEdges === 0, `${tag}: road graph clear of buildings (${badNodes} nodes, ${badEdges} edges blocked)`);
  const field = fieldFrom(city, [{ node: sp.node, cost: 0 }]);
  const unreach = city.nodes.filter((n) => !Number.isFinite(field[n.id])).length;
  ok(unreach === 0, `${tag}: road network connected (${unreach} unreachable nodes)`);
  ok(!!city.zone && Number.isFinite(field[city.zone.node]), `${tag}: escape zone reachable (${Math.round(field[city.zone?.node])} m by road)`);
  const run0 = createMission(def, SHADOW);
  ok(run0.police.length === (def.police?.start ?? 2), `${tag}: ${run0.police.length} police spawned`);
  ok(run0.police.every((c) => onRoad(city, c.car.x, c.car.z) && Math.hypot(c.car.x - sp.x, c.car.z - sp.z) > 30), `${tag}: police spawns on the road, not on top of the player`);
  for (const cp of run0.checkpoints) ok(Number.isFinite(field[cp.node]), `${tag}: checkpoint reachable`);
  for (const rb of run0.roadblocks) {
    const e = city.edges[rb.e];
    const gap = rb.gapSide === "L" ? e.w / 2 - rb.hi : rb.lo + e.w / 2;
    ok(gap >= 5.5, `${tag}: roadblock leaves a ${gap.toFixed(1)} m gap`);
  }
  for (const nt of run0.nitros) ok(onRoad(city, nt.x, nt.z), `${tag}: nitro pickup on the road`);
  // the bot completes it (best of 3 seeds must win, majority must win)
  const res = [];
  for (let seed = 0; seed < 3; seed++) {
    const { run, ev } = botRun(def, SHADOW, { seed });
    res.push(run);
    if (verbose && seed === 0) for (const e of ev) if (!["count", "nitro", "nearMiss"].includes(e.type)) console.log(`    ${e.t.toFixed(1)} ${e.type} ${e.why || ""}${e.dmg ? " dmg " + e.dmg.toFixed(0) : ""}`);
  }
  const wins = res.filter((r) => r.state === STATE.COMPLETE);
  ok(wins.length >= 2, `${tag}: bot escapes on ${wins.length}/3 seeds (${res.map((r) => (r.results ? r.results.time.toFixed(0) + "s" : r.bustWhy || "timeout")).join(", ")})`);
  return { id: def.id, times: wins.map((r) => r.results.time), integrity: wins.map((r) => r.results.integrity) };
}

function missions(only) {
  console.log("— Mission validation —");
  const out = [];
  for (const def of MISSIONS) {
    if (only && def.id !== only) continue;
    let r;
    try {
      r = validateMission(def, !!only);
    } catch (err) {
      ok(false, `M${def.id} ${def.name}: ${err.message}`);
      continue;
    }
    out.push(r);
    console.log(`  M${def.id} ${def.name.padEnd(22)} ${def.type.padEnd(10)} bot ${r.times.map((t) => t.toFixed(0)).join("/")} s  integrity ${r.integrity.join("/")}`);
  }
  return out;
}

function cars() {
  console.log("— Every car on every mission —");
  for (const c of CARS) {
    let done = 0;
    const missed = [];
    for (const def of MISSIONS) {
      let won = false;
      for (let seed = 0; seed < 3 && !won; seed++) won = botRun(def, c, { seed }).run.state === STATE.COMPLETE;
      if (won) done++;
      else missed.push(`M${def.id}`);
    }
    ok(done === MISSIONS.length, `${c.name}: completes ${done}/${MISSIONS.length}${missed.length ? ` (misses ${missed.join(", ")})` : ""}`);
  }
}

async function save() {
  console.log("— Save / unlocks —");
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  const S = await import("../engine/storage.js");
  store.set("other-game-progress", "keep me");
  let st = S.loadState();
  ok(st.car === "shadow" && S.isMissionUnlocked(st, 1) && !S.isMissionUnlocked(st, 2), "fresh save: mission 1 open, SHADOW selected");
  let r = S.recordEscape(st, 1, { time: 80, stars: 2, stats: { time: 80, distance: 1500, evaded: 1 } });
  st = r.state;
  ok(S.isMissionUnlocked(st, 2) && r.nextUnlocked, "escaping mission 1 unlocks mission 2");
  r = S.recordEscape(st, 1, { time: 95, stars: 1, stats: { time: 95 } });
  ok(r.state.best[1].time === 80 && r.state.best[1].stars === 2, "worse replay keeps best time and stars");
  st = S.recordAttempt(r.state, { time: 30, distance: 300 }, true);
  ok(st.stats.busted === 1, "busted attempts are counted");
  S.saveState(st);
  const re = S.loadState();
  ok(JSON.stringify(re.best) === JSON.stringify(st.best) && re.stats.distance === st.stats.distance, "reload restores progress");
  ok(store.get("other-game-progress") === "keep me", "other games' keys untouched");
  store.set(S.STORAGE_KEY, "{oops");
  ok(S.loadState().v === 1, "corrupt save → defaults");
  store.set(S.STORAGE_KEY, JSON.stringify({ v: 1, car: "legend", best: { 1: { time: -1 } }, settings: { sfx: 4, shadows: "ultra" } }));
  const bad = S.loadState();
  ok(bad.car === "shadow" && !bad.best[1] && bad.settings.sfx <= 1 && bad.settings.shadows === "medium", "tampered save sanitised");
  let s2 = S.defaultState();
  for (let id = 1; id <= 6; id++) s2 = S.recordEscape(s2, id, { time: 60, stars: 3, stats: {} }).state;
  ok(S.isCarUnlocked(s2, "spark") && !S.isCarUnlocked(s2, "titan"), "SPARK unlocks after 6 missions; TITAN not yet");
  ok(S.selectCar(s2, "titan").car === s2.car && S.selectCar(s2, "spark").car === "spark", "only unlocked cars can be selected");
}

function targets(write) {
  console.log("— Star target times (bot, SHADOW, median of 3 seeds) —");
  const lines = [];
  for (const def of MISSIONS) {
    const times = [];
    for (let seed = 0; seed < 3; seed++) {
      const { run } = botRun(def, SHADOW, { seed });
      if (run.results) times.push(run.results.time);
    }
    if (!times.length) {
      console.log(`  M${def.id}: no escape`);
      continue;
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    const target = Math.ceil(med * 1.3 + 8);
    lines.push(`  ${def.id}: ${target}, // bot ${times.map((t) => t.toFixed(1)).join(" / ")} s`);
    console.log(`  M${def.id} ${def.name.padEnd(22)} bot ${med.toFixed(1)}  target ≤ ${target}`);
  }
  if (write) {
    const file = fileURLToPath(new URL("../data/targets.js", import.meta.url));
    writeFileSync(file, `/**\n * Police Escape 3D — star target times (seconds), generated by\n * tools/simTest.mjs targets --write: median bot time × 1.3 + 8 s.\n */\nexport const TARGETS = {\n${lines.join("\n")}\n};\n`);
    console.log("  wrote data/targets.js");
  }
}

const cmd = process.argv[2] || "all";
const arg = process.argv[3];
const t0 = Date.now();
if (cmd === "drive" || cmd === "all") driveTests();
if (cmd === "police" || cmd === "all") policeTests();
if (cmd === "gate" || cmd === "all") gate();
if (cmd === "torture" || cmd === "all") torture();
if (cmd === "missions" || cmd === "all") missions(arg ? Number(arg) : null);
if (cmd === "cars" || cmd === "all") cars();
if (cmd === "save" || cmd === "all") await save();
if (cmd === "targets") targets(arg === "--write");
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (fail) {
  console.log("FAILURES:\n  " + fails.join("\n  "));
  process.exitCode = 1;
}
void placePolice;
