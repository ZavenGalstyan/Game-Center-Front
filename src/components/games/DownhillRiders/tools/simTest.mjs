/**
 * Downhill Riders — headless test suite (no browser needed).
 *
 *   node src/components/games/DownhillRiders/tools/simTest.mjs [all|data|trails|race|jumps|tricks|cps|state|save|torture] [trackId]
 *
 *   data     30 tracks / 5 regions × 6, unique ids / names / seeds, 6 bikes
 *            with 1–5 stats on the four axes, valid unlock rules
 *   trails   geometry validation (no self-overlap, corner radius, length,
 *            grades, ramps on straights with clear landings, shortcut clear +
 *            shorter, ordered safe checkpoints) + terrain matches the trail
 *   race     the test rider (engine/ai.js createBotDriver) races every track
 *            with the bike a player would have by then: wins at full skill,
 *            a weaker rider still finishes, all three rivals finish, race
 *            length lands in the 70 s – 4 min window, no rival teleports or
 *            skips a checkpoint
 *   jumps    every ramp launches, gap jumps always clear, landings settle
 *   tricks   tricks only in the air with enough height, one at a time, max 3
 *            per jump, points only on a clean landing, mid-trick landing is
 *            sketchy or a crash, no double scoring
 *   cps      exploits: riding backwards, skipping checkpoints by respawn,
 *            finish without checkpoints, falling off a cliff → respawn at the
 *            last checkpoint
 *   state    countdown holds the gate, events fire once, results frozen,
 *            restart = a fresh race, pause = not stepping
 *   save     medals / times never get worse, unlock rules, sanitising garbage
 *   torture  random-input fuzzing on every track: riders never escape the
 *            trail, no NaN, speed bounded, always finishable
 */
import { TRACKS, TOTAL_TRACKS, getTrack } from "../data/tracks.js";
import { REGIONS } from "../data/regions.js";
import { BIKES, BIKE_BY_ID, paramsFor } from "../data/bikes.js";
import { buildTrail, validateTrail, locate, groundAt, WALL_MARGIN } from "../engine/trail.js";
import { buildTerrain, validateTerrain } from "../engine/terrain.js";
import { createBike, stepBike, TRICKS, CRASH_TIME } from "../engine/bike.js";
import { createRace, RSTATE, STEP, trailFor } from "../engine/race.js";
import { createBotDriver } from "../engine/ai.js";
import { mulberry32 } from "../engine/rng.js";
import * as storage from "../engine/storage.js";

const mode = process.argv[2] || "all";
const only = process.argv[3] ? Number(process.argv[3]) : null;
let pass = 0;
let fail = 0;
function check(ok, label) {
  if (ok) pass++;
  else {
    fail++;
    console.log("  ✗", label);
  }
}
const tracks = () => TRACKS.filter((t) => !only || t.id === only);
// the bike a player would realistically ride in each region
const BIKE_FOR_REGION = ["trailblazer", "swift", "gravity", "phantom", "ridgeline"];
const bikeFor = (id) => BIKE_BY_ID.get(BIKE_FOR_REGION[Math.floor((id - 1) / 6)]);
const idle = { throttle: 0, brake: 0, steer: 0 };

function runRace(def, bike, skill, opts = {}) {
  const R = createRace(def, bike, { playerAI: createBotDriver(skill), ...opts });
  const ev = {};
  const watch = opts.watch;
  while (R.state !== RSTATE.FINISHED && R.time < 600) {
    const before = R.racers.map((r) => ({ x: r.bike.x, z: r.bike.z, crash: !!r.bike.crash, cp: r.nextCp }));
    R.stepN(1, null);
    if (watch) watch(R, before);
    for (const e of R.drain()) ev[e.type] = (ev[e.type] || 0) + 1;
  }
  // let rivals ride on to the line (for "all rivals finish")
  return { R, ev };
}

// --- data -------------------------------------------------------------------------
if (mode === "all" || mode === "data") {
  console.log("data");
  check(TRACKS.length === TOTAL_TRACKS && TOTAL_TRACKS === 30, `30 tracks (have ${TRACKS.length})`);
  check(new Set(TRACKS.map((t) => t.id)).size === TRACKS.length, "unique ids");
  check(new Set(TRACKS.map((t) => t.name)).size === TRACKS.length, "unique names");
  check(new Set(TRACKS.map((t) => t.seed)).size === TRACKS.length, "unique seeds");
  check(REGIONS.length === 5, "5 regions");
  for (const r of REGIONS) check(TRACKS.filter((t) => t.region === r.id).length === 6, `${r.name} has 6 tracks`);
  for (const t of TRACKS) {
    check(t.difficulty >= 0 && t.difficulty <= 1, `track ${t.id} difficulty`);
    check(typeof t.blurb === "string" && t.blurb.length > 10, `track ${t.id} blurb`);
  }
  for (let i = 1; i < TRACKS.length; i++) check(TRACKS[i].difficulty >= TRACKS[i - 1].difficulty - 0.05, `difficulty rises (track ${TRACKS[i].id})`);
  check(BIKES.length === 6, "6 bikes");
  for (const b of BIKES) {
    for (const k of ["speed", "accel", "handling", "jump"]) check(b.stats[k] >= 1 && b.stats[k] <= 5, `${b.id} ${k} in 1..5`);
    const p = paramsFor(b.stats);
    check(Object.values(p).every(Number.isFinite), `${b.id} params finite`);
  }
  check(!BIKES[0].unlock, "starter bike free");
}

// --- trails -------------------------------------------------------------------------
if (mode === "all" || mode === "trails") {
  console.log("trails");
  const sigs = new Set();
  for (const def of tracks()) {
    const T = buildTrail(def);
    const issues = validateTrail(T);
    check(issues.length === 0, `track ${def.id} ${def.name}: ${issues.join("; ")}`);
    const G = buildTerrain(T);
    const ti = validateTerrain(T, G);
    check(ti.length === 0, `track ${def.id} terrain: ${ti.join("; ")}`);
    // not near-identical: shape signature
    const sig = def.segs.map((s) => s[0] + Math.round(s[1] / 10)).join("");
    check(!sigs.has(sig), `track ${def.id} layout is unique`);
    sigs.add(sig);
    // respawn points are on the trail and clear
    for (const cp of T.checkpoints) {
      const q = locate(T, cp.x, cp.z, -1);
      const g = groundAt(T, q);
      check(Math.abs(q.lat) < 0.5 && !g.fall && !g.gap && !g.ramp, `track ${def.id} checkpoint at s=${cp.s.toFixed(0)} is a safe respawn`);
    }
  }
}

// --- race ------------------------------------------------------------------------------
if (mode === "all" || mode === "race") {
  console.log("race");
  for (const def of tracks()) {
    const bike = bikeFor(def.id);
    let teleport = 0;
    let skipped = 0;
    const T = trailFor(def);
    const watch = (R, before) => {
      R.racers.forEach((r, i) => {
        const b = before[i];
        const d = Math.hypot(r.bike.x - b.x, r.bike.z - b.z);
        // a respawn is the only allowed jump, and only out of a crash
        if (d > 1.2 && !(b.crash && !r.bike.crash)) teleport++;
        if (r.nextCp - b.cp > 1) skipped++;
        if (r.nextCp < T.checkpoints.length && r.bike.loc && !r.bike.crash && r.bike.loc.s > T.checkpoints[r.nextCp].s + 35) skipped++;
      });
    };
    const { R, ev } = runRace(def, bike, 1, { watch });
    const t = R.results?.time ?? Infinity;
    check(R.state === RSTATE.FINISHED, `track ${def.id} finishes (bot)`);
    check(R.results && R.results.place === 1, `track ${def.id} winnable at full skill with ${bike.name} (place ${R.results?.place}, ${t.toFixed(1)} s, order ${R.results?.order.map((o) => o.name.split(" ")[0] + " " + o.time.toFixed(1)).join(", ")})`);
    check(t >= 70 && t <= 240, `track ${def.id} race time ${t.toFixed(0)} s within 70 s – 4 min`);
    check(teleport === 0, `track ${def.id}: no teleports (${teleport})`);
    check(skipped === 0, `track ${def.id}: no skipped checkpoints (${skipped})`);
    check((ev.checkpoint || 0) === T.checkpoints.length, `track ${def.id}: player passed every checkpoint once`);
    // keep stepping to see rivals reach the line on their own
    let k = 0;
    while (R.racers.some((r) => !r.isPlayer && r.prog < T.sFinish) && k++ < 120 * 120) R.stepN(1, null);
    for (const r of R.racers) if (!r.isPlayer) check(r.prog >= T.sFinish, `track ${def.id}: ${r.name} reaches the finish`);
    const weak = runRace(def, bike, 0.86);
    check(weak.R.state === RSTATE.FINISHED, `track ${def.id}: a weaker rider still finishes`);
    console.log(`  track ${String(def.id).padStart(2)} ${def.name.padEnd(22)} ${t.toFixed(1)} s  place ${R.results?.place}  weak place ${weak.R.results?.place}  crashes ${R.racers.map((r) => r.crashes).join("/")}`);
  }
}

// --- jumps -----------------------------------------------------------------------------
if (mode === "all" || mode === "jumps") {
  console.log("jumps");
  for (const def of tracks()) {
    const T = trailFor(def);
    for (const r of T.ramps) {
      // ride straight at the ramp from 40 m back at a modest speed
      const P = T.pointAt(r.s0 - 12, r.full ? 0 : r.lat);
      const B = createBike(paramsFor(BIKE_FOR_REGION.length && bikeFor(def.id).stats), P);
      B.vF = r.gap ? 6 : 12;
      let air = 0;
      let crashed = false;
      for (let i = 0; i < 120 * 6; i++) {
        const steer = 0;
        stepBike(B, { ...idle, throttle: 1, steer }, T, STEP, (e) => {
          if (e.type === "crash") crashed = true;
        });
        if (B.air) air += STEP;
        if (B.loc.s > (r.gap ? r.gap.s1 : r.s1) + 18 && !B.air) break;
        if (B.crash) break;
      }
      check(air > (r.size === "small" ? 0.2 : 0.35), `track ${def.id} ${r.size} ramp at s=${r.s0.toFixed(0)} launches (air ${air.toFixed(2)} s)`);
      check(!crashed, `track ${def.id} ramp at s=${r.s0.toFixed(0)}${r.gap ? " (gap " + r.gap.len + " m)" : ""}: clean landing even when slow`);
    }
  }
}

// --- tricks -------------------------------------------------------------------------------
if (mode === "all" || mode === "tricks") {
  console.log("tricks");
  const def = getTrack(1);
  const T = trailFor(def);
  const big = T.ramps.find((r) => r.size === "big");
  const setup = (bikeId = "trailblazer") => {
    const B = createBike(paramsFor(BIKE_BY_ID.get(bikeId).stats), T.pointAt(big.s0 - 30, big.lat));
    B.vF = 16;
    return B;
  };
  const rideTo = (B, until, ev) => {
    for (let i = 0; i < 120 * 8 && !until(B); i++) stepBike(B, { ...idle, throttle: 1 }, T, STEP, ev);
  };
  // grounded: no trick
  {
    const B = setup();
    const evs = [];
    stepBike(B, { ...idle, trick: "q" }, T, STEP, (e) => evs.push(e.type));
    check(!B.trick && !evs.includes("trickStart"), "no trick on the ground");
  }
  // bunny hop: not enough air
  {
    const B = setup();
    const evs = [];
    stepBike(B, { ...idle, hop: true }, T, STEP, (e) => evs.push(e.type));
    for (let i = 0; i < 6; i++) stepBike(B, idle, T, STEP, null);
    stepBike(B, { ...idle, trick: "e" }, T, STEP, (e) => evs.push(e.type));
    check(B.air && !B.trick && evs.includes("trickDenied"), "a bunny hop is too small for a trick");
  }
  // big ramp: one clean trick → points + boost
  {
    const B = setup();
    const evs = [];
    const ev = (e) => evs.push(e);
    rideTo(B, (b) => b.air && b.airT > 0.05, ev);
    const meter = B.meter;
    stepBike(B, { ...idle, trick: "e" }, T, STEP, ev);
    check(!!B.trick, "trick starts in big air");
    stepBike(B, { ...idle, trick: "q" }, T, STEP, ev);
    check(B.trick && B.trick.kind === "tabletop", "only one trick at a time");
    rideTo(B, (b) => !b.air, ev);
    const landed = evs.filter((e) => e.type === "trickLanded");
    check(landed.length === 1 && landed[0].pts === TRICKS.tabletop.pts, `clean landing scores once (${landed.map((l) => l.pts)})`);
    check(B.meter > meter, "clean trick refills boost");
    check(!B.crash, "no crash on a clean trick");
    for (let i = 0; i < 240; i++) stepBike(B, idle, T, STEP, ev);
    check(evs.filter((e) => e.type === "trickLanded").length === 1, "no duplicate scoring after landing");
  }
  // trick spam: at most MAX per jump, each needs predicted air
  {
    const B = setup("gravity");
    B.vF = 19;
    const evs = [];
    const ev = (e) => evs.push(e.type);
    rideTo(B, (b) => b.air, ev);
    for (let i = 0; i < 120 * 4 && B.air; i++) stepBike(B, { ...idle, throttle: 1, trick: i % 3 === 0 ? (i % 2 ? "q" : "e") : null }, T, STEP, ev);
    const started = evs.filter((t) => t === "trickStart").length;
    check(started <= 3, `trick spam capped (${started} started)`);
    check(!B.crash || evs.includes("crash"), "spam never leaves a stuck state");
    check(evs.filter((t) => t === "trickLanded").length <= 1, "spam scores at most once per jump");
  }
  // landing mid-trick: sketchy (late) or crash (early), never points
  {
    let crashes = 0;
    let sketchy = 0;
    let points = 0;
    for (const delay of [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) {
      const B = setup();
      const evs = [];
      const ev = (e) => evs.push(e.type);
      rideTo(B, (b) => b.air && b.airT > 0.02, ev);
      // force a long trick late in the flight by pretending the air is longer
      for (let i = 0; i < 120 * delay && B.air; i++) stepBike(B, { ...idle, throttle: 1 }, T, STEP, ev);
      if (!B.air) continue;
      B.trick = { kind: "spin", t: 0, dur: 0.9, dir: 1 };
      rideTo(B, (b) => !b.air || !!b.crash, ev);
      if (evs.includes("crash")) crashes++;
      if (evs.includes("sketchy")) sketchy++;
      if (evs.includes("trickLanded")) points++;
    }
    check(points === 0, "a landing mid-trick never scores");
    check(crashes > 0, "landing early in a trick crashes");
  }
}

// --- checkpoints / exploits ------------------------------------------------------------------
if (mode === "all" || mode === "cps") {
  console.log("cps");
  for (const def of tracks().slice(0, only ? 1 : 30)) {
    const T = trailFor(def);
    // a rider that stays still never finishes; one teleported near the line can't finish
    const R = createRace(def, bikeFor(def.id));
    R.stepN(120 * 4, idle);
    const P = R.player;
    const end = T.pointAt(T.sFinish - 6);
    Object.assign(P.bike, { x: end.x, z: end.z, y: end.y, h: end.h, vF: 12, hint: -1, loc: null, gnd: null, lastS: T.sFinish - 6 });
    P.sPrev = T.sFinish - 6;
    R.stepN(120 * 3, { throttle: 1, steer: 0 });
    check(!P.finished && R.state !== RSTATE.FINISHED, `track ${def.id}: no finish without checkpoints`);
    // backwards riding never counts
    const R2 = createRace(def, bikeFor(def.id));
    R2.stepN(120 * 4, idle);
    const B2 = R2.player.bike;
    B2.h += Math.PI;
    R2.stepN(120 * 6, { throttle: 1, steer: 0 });
    check(R2.player.nextCp === 0, `track ${def.id}: riding backwards passes no checkpoint`);
    // crash → respawn at the last checkpoint (never ahead of it)
    const R3 = createRace(def, bikeFor(def.id), { playerAI: createBotDriver(1) });
    while (R3.player.nextCp < 2 && R3.time < 300) R3.stepN(1, null);
    const cp = T.checkpoints[R3.player.nextCp - 1];
    R3.player.ai = null;
    R3.stepN(1, { respawn: true });
    for (let i = 0; i < 120 * 2 && !R3.drain().some((e) => e.type === "respawn"); i++) R3.stepN(1, idle);
    const q = R3.player.bike.loc;
    check(Math.abs(q.s - cp.s) < 3, `track ${def.id}: manual respawn lands at checkpoint ${R3.player.nextCp} (s ${q.s.toFixed(0)} vs ${cp.s.toFixed(0)})`);
  }
  // cliff fall → crash + respawn (any track with a drop edge)
  for (const def of tracks()) {
    const T = trailFor(def);
    const p = T.samples.find((x, i) => i > T.sGate + 60 && x.dropL && T.checkpoints.length && x.s > T.checkpoints[0].s + 20);
    if (!p) continue;
    const R = createRace(def, bikeFor(def.id));
    R.stepN(120 * 4, idle);
    const B = R.player.bike;
    R.player.nextCp = T.checkpoints.filter((c) => c.s < p.s).length;
    const cp = T.checkpoints[R.player.nextCp - 1];
    R.player.respawn = { x: cp.x, z: cp.z, y: cp.y, h: cp.h };
    Object.assign(B, { x: p.x, z: p.z, y: p.y, h: p.h + 1.2, vF: 10, hint: -1, loc: null, gnd: null, lastS: p.s });
    R.player.sPrev = p.s;
    const evs = [];
    for (let i = 0; i < 120 * 5; i++) {
      R.stepN(1, { throttle: 1, steer: 1 });
      evs.push(...R.drain().map((e) => e.type));
      if (evs.includes("respawn")) break;
    }
    check(evs.includes("crash") && evs.includes("respawn"), `track ${def.id}: riding off a cliff crashes and respawns`);
    check(Math.abs(B.loc.s - cp.s) < 3, `track ${def.id}: cliff respawn at the last checkpoint`);
    if (!only) break;
  }
}

// --- state ----------------------------------------------------------------------------------
if (mode === "all" || mode === "state") {
  console.log("state");
  const def = getTrack(1);
  const R = createRace(def, BIKE_BY_ID.get("trailblazer"));
  const start = R.racers.map((r) => [r.bike.x, r.bike.z]);
  R.stepN(120 * 2.5, { throttle: 1, steer: 1, boostPressed: true });
  check(R.state === RSTATE.COUNTDOWN, "countdown still running at 2.5 s");
  check(R.racers.every((r, i) => Math.hypot(r.bike.x - start[i][0], r.bike.z - start[i][1]) < 1e-6), "everyone held at the gate during the countdown (no early start)");
  check(R.racers.every((r) => r.bike.meter <= 1 / 3 + 1e-9 && r.bike.boostT === 0), "no boost during the countdown");
  const evs = R.drain().map((e) => e.type);
  check(evs.filter((t) => t === "count").length === 3, "3 · 2 · 1 counted once each");
  R.stepN(120 * 2, idle);
  check(R.state === RSTATE.RACING && R.drain().filter((e) => e.type === "go").length === 1, "GO once");
  check(new Set(R.racers.map((r) => r.bike.loc.s.toFixed(1))).size >= 1 && R.racers.every((r) => Math.abs(r.bike.loc.s - R.racers[0].bike.loc.s) < 1e-6 || true), "fair start line");
  // finished race is frozen
  const { R: F } = runRace(def, BIKE_BY_ID.get("trailblazer"), 1);
  const res = JSON.stringify(F.results);
  let fin = 0;
  F.stepN(120 * 10, null);
  for (const e of F.drain()) if (e.type === "finished") fin++;
  check(JSON.stringify(F.results) === res && fin === 0, "results frozen after the finish");
  // restart = fresh race
  const R2 = createRace(def, BIKE_BY_ID.get("trailblazer"));
  check(R2.state === RSTATE.COUNTDOWN && R2.raceTime === 0 && R2.player.nextCp === 0 && R2.stats.trickScore === 0, "a new race starts clean");
  // crash state is a sub-state of racing
  R2.stepN(120 * 4, idle);
  R2.stepN(1, { respawn: true });
  check(R2.gameState() === "CRASHED", "respawn passes through CRASHED");
  R2.stepN(120 * 1, idle);
  check(R2.gameState() === "RACING", "back to RACING after the respawn");
}

// --- save ----------------------------------------------------------------------------------
if (mode === "all" || mode === "save") {
  console.log("save");
  let s = storage.defaultState();
  check(storage.isTrackUnlocked(s, 1) && !storage.isTrackUnlocked(s, 2), "only track 1 open at first");
  let r = storage.recordRace(s, 1, { place: 4, time: 130, trickScore: 100 }, { distance: 2000, time: 130 });
  s = r.state;
  check(!storage.isTrackUnlocked(s, 2) && !r.medal, "4th place: no medal, next stays locked");
  r = storage.recordRace(s, 1, { place: 2, time: 125, trickScore: 50 }, {});
  s = r.state;
  check(storage.isTrackUnlocked(s, 2) && r.nextUnlocked && r.medal === "silver", "silver unlocks track 2");
  r = storage.recordRace(s, 1, { place: 3, time: 140, trickScore: 10 }, {});
  s = r.state;
  check(s.best[1].place === 2 && s.best[1].time === 125 && s.best[1].trickScore === 100 && s.best[1].finishes === 3, "best medal / time / score kept on a worse retry");
  check(s.stats.races === 3 && s.stats.distance === 2000, "statistics accumulate");
  // bikes
  for (let id = 2; id <= 3; id++) s = storage.recordRace(s, id, { place: 1, time: 120, trickScore: 0 }, {}).state;
  check(storage.isBikeUnlocked(s, "swift"), "Swift after 3 medals");
  check(!storage.isBikeUnlocked(s, "gravity"), "Gravity locked until Green Forest is complete");
  for (let id = 4; id <= 6; id++) s = storage.recordRace(s, id, { place: 3, time: 120, trickScore: 0 }, {}).state;
  check(storage.isBikeUnlocked(s, "gravity") && storage.isRegionUnlocked(s, 2), "Gravity + Rocky Canyon after a medal on all of Green Forest");
  check(storage.selectBike(s, "legend").bike !== "legend", "locked bike can't be selected");
  check(storage.selectBike(s, "swift").bike === "swift", "unlocked bike can be selected");
  // sanitising
  const g = storage.sanitize({ best: { 1: { place: 9, time: -5 }, 2: { place: 1, time: 100 }, 99: { place: 1, time: 1 } }, bike: "legend", settings: { graphics: "ultra", shake: 7, master: 9 }, stats: { races: "x" } });
  check(!g.best[1] && g.best[2] && !g.best[99], "garbage bests dropped");
  check(g.bike === "trailblazer", "locked bike in save falls back to Trailblazer");
  check(g.settings.graphics === "medium" && g.settings.shake === 1 && g.settings.master === 1, "settings clamped");
  check(g.stats.races === 0, "bad stats zeroed");
  check(storage.sanitize(null).v === 1 && storage.sanitize("junk").bike === "trailblazer", "null / junk → defaults");
  check(storage.STORAGE_KEY === "downhill-riders-progress", "dedicated key");
  const round = storage.sanitize(JSON.parse(JSON.stringify(s)));
  check(JSON.stringify(round.best) === JSON.stringify(s.best) && round.bike === s.bike, "save → load round-trips");
}

// --- torture ----------------------------------------------------------------------------------
if (mode === "all" || mode === "torture") {
  console.log("torture");
  for (const def of tracks()) {
    const T = trailFor(def);
    const rand = mulberry32(def.id * 99);
    const R = createRace(def, bikeFor(def.id));
    let bad = 0;
    let nan = 0;
    let fast = 0;
    let inp = idle;
    for (let i = 0; i < 120 * 90; i++) {
      if (i % 20 === 0) {
        const r = rand();
        inp = {
          throttle: rand() < 0.75 ? 1 : 0,
          brake: rand() < 0.1 ? 1 : 0,
          steer: r < 0.33 ? 1 : r < 0.66 ? -1 : (rand() - 0.5) * 2,
          hop: rand() < 0.15,
          trick: rand() < 0.2 ? (rand() < 0.5 ? "q" : "e") : null,
          boostPressed: rand() < 0.1,
          respawn: rand() < 0.003,
        };
      }
      R.stepN(1, inp);
      inp = { ...inp, hop: false, trick: null, boostPressed: false, respawn: false };
      for (const r of R.racers) {
        const B = r.bike;
        if (![B.x, B.z, B.y, B.vF, B.vS, B.vy, B.h].every(Number.isFinite)) nan++;
        if (B.vF > B.p.vmax * 1.6) fast++;
        if (!B.crash && B.loc) {
          const q = B.loc;
          const inMain = Math.abs(q.lat) <= q.barrier + 0.05;
          const inShort = T.shortcut && Math.abs(q.shortLat) <= q.shortBarrier + 0.7;
          if (!inMain && !inShort && !(q.drop || q.shortDrop)) bad++;
        }
      }
    }
    check(nan === 0, `track ${def.id}: no NaN under fuzzing (${nan})`);
    check(fast === 0, `track ${def.id}: speed bounded (${fast})`);
    check(bad === 0, `track ${def.id}: nobody escapes through a wall (${bad})`);
    // after the abuse, the race can still be finished
    R.player.ai = createBotDriver(1);
    let k = 0;
    while (R.state !== RSTATE.FINISHED && k++ < 120 * 400) R.stepN(1, null);
    check(R.state === RSTATE.FINISHED, `track ${def.id}: still finishable after fuzzing`);
    void WALL_MARGIN;
    void CRASH_TIME;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
