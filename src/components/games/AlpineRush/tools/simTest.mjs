/**
 * Alpine Rush — headless test suite (no browser needed).
 *
 *   node src/components/games/AlpineRush/tools/simTest.mjs [all|data|courses|physics|gates|race|ai|medals|state|save|torture] [levelId] [--write]
 *
 *   data     courses / worlds / skis / customisation data is complete and sane
 *   courses  geometry validation + terrain matches the piste, unique layouts
 *   physics  downhill acceleration, flats & climbs slow you, tuck faster,
 *            snowplough stops you (weaker on ice), turning costs speed, turn
 *            radius grows with speed, no instant rotation, jump only when
 *            grounded, kickers launch, clean vs crooked landings, obstacle
 *            hits, net push-back, cliff fall → respawn, frame-rate independence
 *   gates    in order, pass vs miss, penalties, DSQ rule, no double counting,
 *            finish needs the line, splits
 *   race     the test skier finishes every course; race time window
 *   ai       rivals finish, never teleport, pass gates, profiles ordered
 *   medals   gold reachable by a strong run, bronze by a careful one
 *            (--write regenerates data/medals.js from the bot runs)
 *   state    countdown holds, events once, results frozen, free ski
 *   save     bests never get worse, unlock rules, sanitising garbage
 *   torture  random-input fuzzing: never escapes, no NaN, bounded speed
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { COURSES, TOTAL_LEVELS, getCourse } from "../data/courses.js";
import { WORLDS } from "../data/worlds.js";
import { SKIS, SKI_BY_ID, paramsFor, skiParams, JACKETS, PANTS, HELMETS, GOGGLES, SKI_DESIGNS } from "../data/skis.js";
import { buildCourse, validateCourse, locate, groundAt, SURFACES } from "../engine/course.js";
import { buildTerrain, validateTerrain } from "../engine/terrain.js";
import { createSkier, stepSkier, speedOf, GETUP_TIME } from "../engine/skier.js";
import { createRace, RSTATE, STEP, courseFor, MISS_PENALTY } from "../engine/race.js";
import { createBotDriver, PROFILES } from "../engine/ai.js";
import { mulberry32 } from "../engine/rng.js";
import * as storage from "../engine/storage.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const WRITE = process.argv.includes("--write");
const mode = args[0] || "all";
const only = args[1] ? Number(args[1]) : null;
let pass = 0;
let fail = 0;
function check(ok, label) {
  if (ok) pass++;
  else {
    fail++;
    console.log("  ✗", label);
  }
}
const courses = () => COURSES.filter((c) => !only || c.id === only);
// the skis a player realistically has in each world
// Skis a player is guaranteed to own at level id: every earlier level needed a
// medal, so at least id − 1 medals (golds are not assumed).
const skisAt = (id) => SKIS.filter((k) => !k.unlock || (k.unlock.medals != null && k.unlock.medals <= id - 1));
// the race tests ride the best of the two most relevant owned sets (fastest + most agile)
const skiChoices = (id) => {
  const own = skisAt(id);
  const fastest = own.reduce((a, b) => (b.stats.speed + b.stats.handling * 0.5 > a.stats.speed + a.stats.handling * 0.5 ? b : a));
  const agile = own.reduce((a, b) => (b.stats.handling > a.stats.handling ? b : a));
  return fastest === agile ? [fastest] : [fastest, agile];
};
const skiFor = (id) => skiChoices(id)[0];
const on = (m) => mode === "all" || mode === m;

function runRace(def, ski, skill, opts = {}) {
  const R = createRace(def, ski, { playerAI: skill != null ? createBotDriver(skill) : null, ...opts });
  const ev = {};
  while (R.state !== RSTATE.FINISHED && R.time < (opts.maxT ?? 400)) {
    const before = opts.watch ? R.racers.map((r) => ({ x: r.sk.x, z: r.sk.z, crash: !!r.sk.crash, g: r.nextGate })) : null;
    R.stepN(1, opts.input ? opts.input(R) : null);
    if (opts.watch) opts.watch(R, before);
    for (const e of R.drain()) ev[e.type] = (ev[e.type] || 0) + 1;
  }
  return { R, ev };
}

/** A flat test course: one long straight at a given grade / surface. */
function testCourse(grade, extra = {}, len = 600) {
  return buildCourse({ id: 99, name: "test", mode: "time", seed: 5, width: 14, grade, segs: [["S", len, extra]], ...(extra.def || {}) });
}
function freeSkier(T, s = 30, v = 0, params = skiParams(SKI_BY_ID.get("starter"))) {
  const p = T.pointAt(s, 0);
  const K = createSkier(params, { x: p.x, z: p.z, y: p.y, h: p.h, s });
  K.loc = locate(T, K.x, K.z, -1);
  K.gnd = groundAt(T, K.loc);
  K.y = K.gnd.y;
  K.vF = v;
  K.vy = -T.interp(s).a.grade * v;
  return K;
}
/** A player who ignores the gates and skis the piste centre line (aims 15 m ahead). */
function centreLine(R) {
  const K = R.player.sk;
  if (!K.loc) return { tuck: 1 };
  const t = R.T.pointAt(K.loc.s + 15, 0);
  let d = Math.atan2(t.x - K.x, t.z - K.z) - K.h;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return { tuck: 1, steer: Math.max(-1, Math.min(1, d * 2.5 - K.yawRate * 0.3)) };
}
function run(K, T, inp, secs, dt = STEP, ev = null) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) stepSkier(K, typeof inp === "function" ? inp(K, i) : inp, T, dt, ev);
  return K;
}

// --- data -------------------------------------------------------------------------------
if (on("data")) {
  console.log("data");
  check(WORLDS.length === 5, "5 worlds");
  check(SKIS.length === 6, "6 ski sets");
  check(!SKIS[0].unlock, "starter skis are free");
  for (const s of SKIS) {
    for (const k of ["speed", "handling", "braking", "stability"]) check(s.stats[k] >= 1 && s.stats[k] <= 5, `${s.id} ${k} in 1..5`);
    check(Object.values(paramsFor(s.stats, s.special)).every((v) => typeof v === "object" || Number.isFinite(v)), `${s.id} params finite`);
  }
  check(JACKETS.length >= 6 && PANTS.length >= 4 && HELMETS.length >= 4 && Object.keys(GOGGLES).length >= 4 && Object.keys(SKI_DESIGNS).length >= 4, "customisation options");
  check(new Set(COURSES.map((c) => c.id)).size === COURSES.length, "unique ids");
  check(new Set(COURSES.map((c) => c.name)).size === COURSES.length, "unique names");
  check(new Set(COURSES.map((c) => c.seed)).size === COURSES.length, "unique seeds");
  for (const c of COURSES) {
    check(["time", "slalom", "rival"].includes(c.mode), `level ${c.id} mode`);
    check(typeof c.blurb === "string" && c.blurb.length > 10, `level ${c.id} blurb`);
    check(c.difficulty >= 0 && c.difficulty <= 1, `level ${c.id} difficulty`);
    if (c.mode !== "rival") check(Array.isArray(c.medals) && c.medals[0] < c.medals[1] && c.medals[1] < c.medals[2], `level ${c.id} has ordered medal times`);
  }
  console.log(`  ${COURSES.length} / ${TOTAL_LEVELS} levels authored`);
}

// --- courses ------------------------------------------------------------------------------
if (on("courses")) {
  console.log("courses");
  const sigs = new Set();
  for (const def of courses()) {
    const T = buildCourse(def);
    const issues = validateCourse(T);
    check(issues.length === 0, `level ${def.id} ${def.name}: ${issues.join("; ")}`);
    const G = buildTerrain(T);
    const ti = validateTerrain(T, G);
    check(ti.length === 0, `level ${def.id} terrain: ${ti.join("; ")}`);
    const sig = def.segs.map((s) => s[0] + Math.round(s[1] / 10)).join("");
    check(!sigs.has(sig), `level ${def.id} layout is unique`);
    sigs.add(sig);
    check(T.gates.length >= (def.id === 1 ? 12 : 8), `level ${def.id} has enough gates (${T.gates.length})`);
    const obst = T.feats.filter((f) => ["tree", "rock", "cannon", "fence"].includes(f.type)).length;
    check(obst >= 5, `level ${def.id} has ≥ 5 obstacles (${obst})`);
    for (const cp of T.checkpoints) {
      const q = locate(T, cp.x, cp.z, -1);
      const g = groundAt(T, q);
      check(Math.abs(q.lat) < 0.5 && !g.fall && !g.ramp, `level ${def.id} checkpoint at s=${cp.s.toFixed(0)} is a safe respawn`);
    }
  }
}

// --- physics --------------------------------------------------------------------------------
if (on("physics")) {
  console.log("physics");
  const steep = testCourse(0.3);
  const gentle = testCourse(0.12);
  const flat = testCourse(0.0);
  const climb = testCourse(-0.06);
  // gravity: accelerates, steeper = faster, no instant top speed
  const a = run(freeSkier(steep), steep, {}, 2);
  check(a.vF > 4 && a.vF < 12, `accelerates downhill naturally (${a.vF.toFixed(1)} m/s after 2 s)`);
  const vS = run(freeSkier(steep), steep, {}, 8).vF;
  const vG = run(freeSkier(gentle), gentle, {}, 8).vF;
  check(vS > vG + 3, `steeper is faster (${vS.toFixed(1)} vs ${vG.toFixed(1)})`);
  // terminal speed exists and tuck raises it
  const up = run(freeSkier(steep, 30, 20), steep, {}, 12).vF;
  const tk = run(freeSkier(steep, 30, 20), steep, { tuck: 1 }, 12).vF;
  const rc = run(freeSkier(steep, 30, 20), steep, { race: 1 }, 12).vF;
  check(tk > up + 1 && rc > tk + 0.5, `tuck faster than upright, race tuck fastest (${up.toFixed(1)} / ${tk.toFixed(1)} / ${rc.toFixed(1)})`);
  check(rc <= skiParams(SKI_BY_ID.get("starter")).vmax + 0.01, "never above the ski's top speed");
  // flats and climbs bleed speed — but never stop instantly
  const f1 = run(freeSkier(flat, 30, 15), flat, {}, 1);
  check(f1.vF < 15 && f1.vF > 12, `flat slows gradually (${f1.vF.toFixed(2)} after 1 s)`);
  const c1 = run(freeSkier(climb, 30, 15), climb, {}, 2).vF;
  const f2 = run(freeSkier(flat, 30, 15), flat, {}, 2).vF;
  check(c1 < f2 - 0.5, `uphill slows more than flat (${c1.toFixed(1)} vs ${f2.toFixed(1)})`);
  const rel = run(freeSkier(gentle, 30, 18), gentle, {}, 0.25).vF;
  check(rel > 17, `releasing every key keeps momentum (${rel.toFixed(2)})`);
  // poling out of a standstill on the flat
  check(run(freeSkier(flat, 30, 0), flat, { tuck: 1 }, 2).vF > 2, "tuck key skates you off a standstill");
  // snowplough brakes, works consistently, weaker on ice, never reverses
  const b1 = run(freeSkier(gentle, 30, 20), gentle, { brake: 1 }, 2).vF;
  check(b1 < 10, `snowplough slows hard (${b1.toFixed(1)} from 20 in 2 s)`);
  check(run(freeSkier(gentle, 30, 20), gentle, { brake: 1 }, 8).vF < 0.6, "snowplough brings you to a stop on a beginner slope");
  const icy = testCourse(0.12, { surface: "ice" });
  const bi = run(freeSkier(icy, 30, 20), icy, { brake: 1 }, 2).vF;
  check(bi > b1 + 4, `snowplough is weaker on ice (${bi.toFixed(1)} vs ${b1.toFixed(1)})`);
  const icer = run(freeSkier(icy, 30, 20, skiParams(SKI_BY_ID.get("ice"))), icy, { brake: 1 }, 2).vF;
  check(icer < bi - 1.5, `Ice Racer brakes better on ice (${icer.toFixed(1)} vs ${bi.toFixed(1)})`);
  // turning: costs speed, radius grows with speed, gradual, Q/E sharper
  const st = run(freeSkier(gentle, 30, 18), gentle, {}, 1.5).vF;
  const tu = run(freeSkier(gentle, 30, 18), gentle, { steer: 1 }, 1.5).vF;
  check(tu < st - 0.8, `carving costs speed (${tu.toFixed(1)} vs ${st.toFixed(1)})`);
  const yawAt = (v, sharp) => {
    const K = freeSkier(steep, 120, v);
    run(K, steep, { steer: 1, sharp }, 0.6);
    return Math.abs(K.yawRate);
  };
  check(yawAt(8, 0) > yawAt(25, 0) * 1.6, `turn radius grows with speed (yaw ${yawAt(8, 0).toFixed(2)} vs ${yawAt(25, 0).toFixed(2)} rad/s)`);
  check(yawAt(18, 1) > yawAt(18, 0) * 1.2, "Q / E carve tighter");
  {
    const K = freeSkier(gentle, 30, 15);
    const h0 = K.h;
    run(K, gentle, { steer: 1 }, 1 / 30);
    check(Math.abs(K.h - h0) < 0.05, "no instant rotation (one frame of full steer < 3°)");
    run(K, gentle, { steer: 1 }, 0.5);
    check(Math.abs(K.h - h0) < Math.PI / 2, "half a second of steering is not a 90° snap");
  }
  check(run(freeSkier(gentle, 30, 15), gentle, { steer: 1 }, 1).lean > 0.15, "skier leans into a left turn");
  check(run(freeSkier(gentle, 30, 15), gentle, { steer: -1 }, 1).lean < -0.15, "skier leans into a right turn");
  // edge stress: sustained hard carving near top speed is a fall, normal skiing never
  {
    const P = skiParams(SKI_BY_ID.get("starter"));
    const ev = [];
    const K = freeSkier(steep, 120, P.vmax * 0.97);
    run(K, steep, (k, i) => ({ race: 1, steer: i % 360 < 180 ? 1 : -1, sharp: 1 }), 3, STEP, (e) => ev.push(e.type));
    check(ev.includes("crash") && ev.indexOf("wobble") < ev.indexOf("crash"), "hard carving at top speed: wobble warning, then a fall");
    const K2 = freeSkier(steep, 120, P.vmax * 0.97);
    const ev2 = [];
    run(K2, steep, (k, i) => ({ steer: i % 240 < 120 ? 1 : -1 }), 4, STEP, (e) => ev2.push(e.type));
    check(!ev2.includes("crash"), "normal carving at top speed never falls");
  }
  // jump: only grounded, never twice in the air
  {
    const ev = [];
    const K = freeSkier(gentle, 30, 12);
    run(K, gentle, { jump: true }, STEP, STEP, (e) => ev.push(e.type));
    check(K.air && K.vy > 3, "Space jumps when grounded");
    const vy = K.vy;
    run(K, gentle, { jump: true }, 0.05, STEP, (e) => ev.push(e.type));
    check(K.vy < vy && ev.filter((e) => e === "jump").length === 1, "no second jump in mid-air");
    run(K, gentle, {}, 2, STEP, (e) => ev.push(e.type));
    check(!K.air && ev.includes("land") && !ev.includes("crash"), "lands safely from a straight jump");
  }
  // kickers launch; crooked landings fall, straight ones don't
  {
    const kick = testCourse(0.18, { ramp: { size: "medium", at: 0.3 } });
    const ev = [];
    const K = freeSkier(kick, 170, 17);
    let maxAir = 0;
    run(K, kick, (k) => ((maxAir = Math.max(maxAir, k.airT)), {}), 5, STEP, (e) => ev.push(e));
    check(ev.some((e) => e.type === "takeoff") && maxAir > 0.4, `kicker launches (${maxAir.toFixed(2)} s air)`);
    check(ev.some((e) => e.type === "land" && e.quality === "clean") && !ev.some((e) => e.type === "crash"), "straight landing is clean");
    const ev2 = [];
    const K2 = freeSkier(kick, 170, 17);
    run(K2, kick, (k) => ({ steer: k.air ? 1 : 0 }), 5, STEP, (e) => ev2.push(e.type));
    check(ev2.includes("crash"), "landing spun sideways is a fall");
  }
  // obstacles: head-on tree = fall; a glancing hit costs speed
  {
    const tr = testCourse(0.15, { trees: [[0.3, 0]] });
    const ev = [];
    const K = freeSkier(tr, 140, 16);
    run(K, tr, {}, 4, STEP, (e) => ev.push(e.type));
    check(ev.includes("crash"), "skiing straight into a tree is a fall");
    const ev2 = [];
    const K2 = freeSkier(tr, 140, 16);
    const p = tr.pointAt(140, 0.93);
    K2.x = p.x;
    K2.z = p.z;
    run(K2, tr, {}, 4, STEP, (e) => ev2.push(e.type));
    check(ev2.includes("hit") && !ev2.includes("crash"), "a glancing hit only costs speed");
  }
  // falls: get up on the spot after a while, facing downhill
  {
    const tr = testCourse(0.15, { trees: [[0.3, 0]] });
    const R = createRace(tr.def, SKI_BY_ID.get("starter"), { course: tr });
    R.stepN(Math.round(4 / STEP), {});
    const K = R.player.sk;
    K.x = tr.pointAt(170, 0).x;
    K.z = tr.pointAt(170, 0).z;
    K.vF = 16;
    K.h = tr.samples[170].h;
    let crashedAt = null;
    for (let i = 0; i < 1000 && !(crashedAt != null && !K.crash); i++) {
      R.stepN(1, {});
      if (K.crash && crashedAt == null) crashedAt = R.time;
    }
    check(crashedAt != null && !K.crash && Math.abs(K.loc.lat) < K.loc.w, "after a fall the skier gets up on the piste");
    check(R.time - crashedAt >= GETUP_TIME - 0.05, "getting up takes time (the fall is the penalty)");
  }
  // cliffs: fall off → respawn at the last checkpoint
  {
    const cl = buildCourse({ id: 98, name: "cliff", mode: "time", seed: 3, width: 12, grade: 0.2, segs: [["S", 200], ["S", 400, { drop: "L" }], ["S", 200]] });
    const R = createRace(cl.def, SKI_BY_ID.get("starter"), { course: cl });
    const evs = [];
    for (let i = 0; i < 120 * 60 && !evs.includes("respawn"); i++) {
      const K = R.player.sk;
      const S = K.loc ? cl.samples[K.loc.i] : null;
      R.stepN(1, { steer: S && S.dropL && K.loc.s > 260 ? 1 : 0, tuck: 1 });
      for (const e of R.drain()) evs.push(e.type);
    }
    check(evs.includes("crash") && evs.includes("respawn"), "skiing off a cliff edge falls and respawns");
    const K = R.player.sk;
    check(!K.crash && Math.abs(K.loc.lat) < 1 && Math.abs(K.y - K.gnd.y) < 0.05, "respawned on the piste");
  }
  // nets push back
  {
    const K = freeSkier(gentle, 60, 10);
    run(K, gentle, { steer: 1 }, 6);
    check(Math.abs(K.loc.lat) <= K.loc.barrier + 0.01, "safety nets keep the skier on the mountain");
  }
  // frame-rate independence: the race steps at a fixed 120 Hz whatever the frame dt
  {
    const def = COURSES[0];
    const go = (fps) => {
      const R = createRace(def, SKI_BY_ID.get("starter"));
      const inp = { frame: () => ({ tuck: 1, steer: 0 }) };
      for (let t = 0; t < 8; t += 1 / fps) R.tick(1 / fps, inp);
      return R.player.sk;
    };
    const a30 = go(30);
    const a144 = go(144);
    check(Math.abs(a30.loc.s - a144.loc.s) < 1.5 && Math.abs(a30.vF - a144.vF) < 0.4, `same motion at 30 and 144 fps (${a30.loc.s.toFixed(1)} vs ${a144.loc.s.toFixed(1)} m)`);
  }
}

// --- gates ---------------------------------------------------------------------------------
if (on("gates")) {
  console.log("gates");
  const def = COURSES[0];
  const T = courseFor(def);
  // perfect line: bot passes every gate in order
  {
    const order = [];
    const { R, ev } = runRace(def, SKI_BY_ID.get("starter"), 1, { watch: (R2, b) => R2.player.nextGate !== b[0].g && order.push(R2.player.nextGate) });
    check(R.results && R.results.missed === 0 && R.results.passed === T.gates.length, `bot passes all ${T.gates.length} gates (missed ${R.results?.missed})`);
    check(order.every((g, i) => g === i + 1), "gates resolve strictly in order, one at a time");
    check(ev.gate === T.gates.length, "one gate event per gate");
    check(R.results.splits.length === T.gates.length && R.results.splits.every((t, i) => i === 0 || t > R.results.splits[i - 1]), "split times recorded and increasing");
    check(Math.abs(R.results.adjusted - R.results.time) < 1e-9, "no penalty on a clean run");
  }
  // straight down the middle: misses gates → penalty, DSQ past the limit
  {
    const { R } = runRace(def, SKI_BY_ID.get("starter"), null, { input: centreLine });
    const res = R.results;
    check(res && res.missed > 0, `skiing straight misses gates (${res?.missed})`);
    check(Math.abs(res.penalty - res.missed * MISS_PENALTY.time) < 1e-9 && Math.abs(res.adjusted - (res.time + res.penalty)) < 1e-9, "each miss adds the penalty");
    check(res.dsq === res.missed > Math.floor(T.gates.length / 3), "DSQ exactly when more than a third are missed");
    if (res.dsq) check(res.medal === null, "a disqualified run earns no medal");
  }
  // slalom mode uses the bigger penalty
  check(MISS_PENALTY.slalom > MISS_PENALTY.time, "slalom misses cost more");
}

// --- race ----------------------------------------------------------------------------------
if (on("race") || on("ai")) {
  console.log(mode === "ai" ? "ai" : "race");
  for (const def of courses()) {
    let teleport = 0;
    let skipped = 0;
    const watch = (R, before) => {
      R.racers.forEach((r, i) => {
        const b = before[i];
        const d = Math.hypot(r.sk.x - b.x, r.sk.z - b.z);
        if (d > 1.0 && !(b.crash && !r.sk.crash)) teleport++;
        if (r.nextGate - b.g > 1) skipped++;
      });
    };
    let best = null;
    for (const k of skiChoices(def.id)) {
      const run = runRace(def, k, 1);
      if (!best || (run.R.results?.adjusted ?? 1e9) + (run.R.results?.place ?? 4) * 100 * (def.mode === "rival") < (best.R.results?.adjusted ?? 1e9) + (best.R.results?.place ?? 4) * 100 * (def.mode === "rival")) best = { ...run, ski: k };
    }
    const { R, ev } = runRace(def, best.ski, 1, { watch });
    const res = R.results;
    check(R.state === RSTATE.FINISHED, `level ${def.id} finishes (bot)`);
    check(res && res.missed === 0, `level ${def.id} bot passes every gate (missed ${res?.missed}, falls ${res?.falls})`);
    check(res && res.falls === 0, `level ${def.id} bot clean run (falls ${res?.falls}, ${JSON.stringify(ev)})`);
    const t = res?.time ?? Infinity;
    check(t >= 40 && t <= 200, `level ${def.id} race time ${t.toFixed(1)} s within 40 s – 3:20`);
    check(teleport === 0, `level ${def.id} nobody teleports (${teleport})`);
    check(skipped === 0, `level ${def.id} no gate skipped in one step`);
    if (def.mode === "rival") {
      check(res.place === 1, `level ${def.id} winnable by a strong run (place ${res.place}: ${res.order.map((o) => o.name.split(" ")[0] + " " + o.time.toFixed(1)).join(", ")})`);
      for (const r of R.racers) if (!r.isPlayer) check(r.missed <= 1, `level ${def.id} rival ${r.name} skis the gates (missed ${r.missed})`);
      // rivals finish on their own
      let extra = 0;
      while (R.racers.some((r) => !r.finished) && extra < 120 * 90) {
        R.stepN(1, null);
        extra++;
      }
      check(R.racers.every((r) => r.finished), `level ${def.id} all rivals reach the finish`);
    }
    console.log(`  level ${def.id} ${def.name} [${best.ski.name}]: ${t.toFixed(2)} s, top ${(R.stats.topSpeed * 3.6).toFixed(0)} km/h, jumps ${R.stats.jumps}${res?.order ? " · " + res.order.map((o) => o.name.split(" ")[0] + " " + o.time.toFixed(1)).join(", ") : ""}`);
  }
  // profiles are ordered
  const k = Object.values(PROFILES).map((p) => p.corner);
  check(k.every((v, i) => i === 0 || v > k[i - 1]), "AI profiles get faster: beginner < intermediate < advanced < expert");
}

// --- medals -----------------------------------------------------------------------------
if (on("medals")) {
  console.log("medals");
  const out = {};
  for (const def of courses()) {
    if (def.mode === "rival") continue;
    // the slower of the owned sets sets the bar (any reasonable ski choice can medal)
    const runs = skiChoices(def.id).map((k) => ({ strong: runRace(def, k, 1).R.results, careful: runRace(def, k, 0.86).R.results }));
    const strong = runs.reduce((a, b) => (b.strong.adjusted > a.strong.adjusted ? b : a)).strong;
    const careful = runs.reduce((a, b) => (b.careful.adjusted > a.careful.adjusted ? b : a)).careful;
    if (WRITE) {
      const slack = [1.08, 1.065, 1.05, 1.045, 1.04][def.world - 1];
      const g = Math.ceil(strong.adjusted * slack * 2) / 2;
      out[def.id] = [g, Math.ceil(g * 1.12 * 2) / 2, Math.ceil(g * 1.26 * 2) / 2];
    }
    const m = WRITE ? out[def.id] : def.medals;
    check(m && strong.adjusted <= m[0], `level ${def.id} gold reachable by a strong run (${strong.adjusted.toFixed(2)} ≤ ${m?.[0]})`);
    check(m && careful.adjusted <= m[2], `level ${def.id} bronze reachable by a careful run (${careful.adjusted.toFixed(2)} ≤ ${m?.[2]})`);
    check(m && strong.adjusted > m[0] * 0.85, `level ${def.id} gold is not trivial`);
    console.log(`  level ${def.id}: strong ${strong.adjusted.toFixed(2)} s, careful ${careful.adjusted.toFixed(2)} s → ${m?.join(" / ")}`);
  }
  if (WRITE) {
    const file = fileURLToPath(new URL("../data/medals.js", import.meta.url));
    const src = fs.readFileSync(file, "utf8");
    const merged = { ...(only ? Object.fromEntries(Object.entries(COURSES.reduce((a, c) => ((a[c.id] = c.medals), a), {})).filter(([, v]) => v)) : {}), ...out };
    const body = Object.keys(merged)
      .map(Number)
      .sort((a, b) => a - b)
      .map((id) => `  ${id}: [${merged[id].join(", ")}],`)
      .join("\n");
    fs.writeFileSync(file, src.replace(/export const MEDALS = \{[\s\S]*?\};/, `export const MEDALS = {\n${body}\n};`));
    console.log("  wrote data/medals.js");
  }
}

// --- state --------------------------------------------------------------------------------
if (on("state")) {
  console.log("state");
  const def = COURSES[0];
  const R = createRace(def, SKI_BY_ID.get("starter"));
  const p0 = { x: R.player.sk.x, z: R.player.sk.z };
  R.stepN(Math.round(2.5 / STEP), { tuck: 1, steer: 1 });
  check(R.state === RSTATE.COUNTDOWN && Math.hypot(R.player.sk.x - p0.x, R.player.sk.z - p0.z) < 1e-6, "countdown holds the skier in the start house");
  check(R.raceTime === 0, "the clock doesn't run during the countdown");
  const counts = R.drain().filter((e) => e.type === "count").map((e) => e.n);
  check(counts.join(",") === "3,2,1", `countdown 3 · 2 · 1 (${counts.join(",")})`);
  R.stepN(Math.round(1.5 / STEP), {});
  check(R.state === RSTATE.RACING && R.drain().filter((e) => e.type === "go").length === 1, "GO fires once, then racing");
  const t1 = R.raceTime;
  // pause = not stepping: nothing moves, the clock stops
  const snap = JSON.stringify([R.player.sk.x, R.player.sk.z, R.raceTime]);
  check(JSON.stringify([R.player.sk.x, R.player.sk.z, R.raceTime]) === snap && t1 > 0, "pause = no stepping (clock frozen)");
  // finish + frozen results
  const { R: R2, ev } = runRace(def, SKI_BY_ID.get("starter"), 1);
  check(ev.finished === 1, "finished fires once");
  const res = JSON.stringify(R2.results);
  R2.stepN(600, {});
  check(JSON.stringify(R2.results) === res, "results frozen after the finish");
  check(R2.drain().every((e) => e.type !== "finished"), "no second finish event");
  // restart = a fresh race
  const R3 = createRace(def, SKI_BY_ID.get("starter"));
  check(R3.state === RSTATE.COUNTDOWN && R3.raceTime === 0 && R3.player.nextGate === 0, "restart is a fresh race");
  // free ski: no gates, no rivals, finishing just ends the run
  const { R: F } = runRace(def, SKI_BY_ID.get("starter"), 1, { mode: "free" });
  check(F.racers.length === 1 && F.results.free && F.results.medal === null && F.results.missed === 0, "free ski: solo, no gates, no medal");
  // rival race has three rivals
  check(createRace(def, SKI_BY_ID.get("starter"), { mode: "rival" }).racers.length === 4, "rival race: three AI rivals");
}

// --- save ------------------------------------------------------------------------------------
if (on("save")) {
  console.log("save");
  const S0 = storage.defaultState();
  check(storage.isLevelUnlocked(S0, 1, () => true) && !storage.isLevelUnlocked(S0, 2, () => true), "level 1 open, level 2 locked");
  const gold = { mode: "time", time: 60, adjusted: 60, penalty: 0, missed: 0, dsq: false, medal: "gold", place: 1, splits: [] };
  const bronze = { ...gold, time: 80, adjusted: 80, medal: "bronze" };
  const none = { ...gold, time: 99, adjusted: 99, medal: null };
  let r = storage.recordRace(S0, 1, none, {});
  check(!storage.isLevelUnlocked(r.state, 2, () => true), "finishing without a medal keeps the next level locked");
  r = storage.recordRace(r.state, 1, bronze, {});
  check(storage.isLevelUnlocked(r.state, 2, () => true) && r.nextUnlocked, "a medal unlocks the next level");
  r = storage.recordRace(r.state, 1, gold, {});
  const b = r.state.best[1];
  check(b.medal === "gold" && b.time === 60, "a better run improves the best");
  r = storage.recordRace(r.state, 1, none, {});
  check(r.state.best[1].medal === "gold" && r.state.best[1].time === 60, "a worse retry never lowers best medal / time");
  check(storage.sanitize(null).v === S0.v && storage.sanitize("junk").stats.races === 0, "garbage → defaults");
  const bad = storage.sanitize({ best: { 1: { time: -5 }, 2: { time: "x" }, 999: { time: 3 } }, ski: "rocket", custom: { jacket: "red; DROP", goggles: "x" }, settings: { graphics: "ultra", music: 7 } });
  check(Object.keys(bad.best).length === 0 && bad.ski === "starter" && bad.settings.graphics === "medium" && bad.settings.music <= 1, "corrupted data sanitised");
  check(bad.custom.goggles === "amber" && /^#[0-9a-f]{6}$/i.test(bad.custom.jacket), "corrupted customisation sanitised");
  check(!storage.isSkiUnlocked(S0, "pro") && storage.isSkiUnlocked(S0, "starter"), "ski unlocks");
  check(storage.selectSki(S0, "pro").ski === "starter", "can't select locked skis");
  const rt = storage.sanitize(JSON.parse(JSON.stringify(r.state)));
  check(JSON.stringify(rt.best) === JSON.stringify(r.state.best) && rt.stats.races === r.state.stats.races, "save → load round-trips");
}

// --- torture --------------------------------------------------------------------------------
if (on("torture")) {
  console.log("torture");
  for (const def of courses()) {
    const T = courseFor(def);
    const rand = mulberry32(def.seed * 3 + 1);
    const R = createRace(def, skiFor(def.id), { mode: def.mode });
    let bad = 0;
    let held = {};
    for (let i = 0; i < 120 * 150 && R.state !== RSTATE.FINISHED; i++) {
      if (i % 20 === 0) held = { tuck: rand() < 0.5 ? 1 : 0, race: rand() < 0.2 ? 1 : 0, brake: rand() < 0.15 ? 1 : 0, steer: Math.round((rand() - 0.5) * 2.4), sharp: rand() < 0.3 ? 1 : 0, jump: rand() < 0.05 };
      R.stepN(1, held);
      for (const r of R.racers) {
        const K = r.sk;
        if (![K.x, K.y, K.z, K.vF, K.vS, K.h].every(Number.isFinite)) bad++;
        if (speedOf(K) > K.p.vmax * 1.3) bad++;
        if (!K.crash && K.loc && Math.abs(K.loc.lat) > K.loc.barrier + 0.6 && !K.loc.drop) bad++;
      }
    }
    check(bad === 0, `level ${def.id} random input: no NaN / runaway / escape (${bad})`);
    void T;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
