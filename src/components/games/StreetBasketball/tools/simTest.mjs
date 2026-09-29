/**
 * Street Basketball — headless engine tests. Run from this folder:
 *   node tools/simTest.mjs [shots|fps|torture|matches|layups|all]
 *
 * Drives the REAL engine (engine/match.js) with scripted controllers — the
 * same intent format the keyboard produces — with invariant assertions on
 * every fixed step (one owner or none, owner ⇔ carried mode, no NaN, no
 * body overlap, ball above the floor).
 */
import { createGame, setController, step, drainEvents, enableAsserts, advance } from "../engine/match.js";
import { createAI, wrapAI } from "../engine/ai.js";
import { createRng } from "../engine/rng.js";
import { METER_TIME } from "../engine/shot.js";
import { PHYS_DT } from "../engine/constants.js";
import { OPPONENTS } from "../data/opponents.js";

enableAsserts(true);
const which = process.argv[2] || "all";
const DT = PHYS_DT;
const look = {};
const R5 = { shooting: 5, finishing: 5, speed: 5, defense: 5, stamina: 5 };

function scripted(script) {
  // script(g, a, t) → {mx, mz, sprint, events}
  return { intent: (g, a, dt) => script(g, a, dt) || { mx: 0, mz: 0, events: [] } };
}

/* ------------------------------------------------------------------ shots */
function shotOnce({ x, z, meter, moving = 0, seed = 1, ratings = R5 }) {
  const g = createGame({ mode: "free", seed, player: { ratings, look } });
  const P = g.P;
  P.x = x; P.z = z; P.facing = Math.atan2(-x, -z);
  let pressed = false;
  let released = false;
  let t0 = 0;
  let scoreEvents = 0;
  let first = null;
  let swish = false;
  let rim = 0;
  let board = 0;
  setController(g, "p", scripted((gg, a) => {
    const ev = [];
    const t = gg.time;
    let mx = 0;
    if (moving) mx = t < 1.2 + (pressed ? 0 : 0) ? moving : 0;
    if (!pressed && t > 1.2) { pressed = true; t0 = t; ev.push("shootDown"); }
    if (pressed && !released && t - t0 >= meter * METER_TIME) { released = true; ev.push("shootUp"); }
    return { mx, mz: 0, events: ev };
  }));
  for (let i = 0; i < 240 * 6; i++) {
    step(g, DT);
    for (const e of drainEvents(g)) {
      if (e.type === "score") { scoreEvents++; swish = e.swish; }
      if (e.type === "rim") rim++;
      if (e.type === "board") board++;
      if (e.type === "release") first = e;
    }
  }
  return { made: scoreEvents > 0, scoreEvents, swish, rim, board, release: first, pts: g.score.p };
}

function testShots() {
  const rng = createRng(99);
  const rows = [];
  let total = 0;
  let doubles = 0;
  let noRelease = 0;
  const buckets = {};
  const dists = [1.3, 2.5, 4, 5.3, 6.6, 7.4];
  const angles = [-75, -50, -25, 0, 25, 50, 75];
  const meters = [0.5, 0.7, 0.83, 0.91, 0.99];
  for (const d of dists) for (const ang of angles) for (const m of meters) {
    const a = (ang * Math.PI) / 180;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const r = shotOnce({ x, z, meter: m, seed: 1 + Math.floor(rng.next() * 1e6) });
    total++;
    if (!r.release) noRelease++;
    if (r.scoreEvents > 1) doubles++;
    const zone = r.release ? r.release.zone : "none";
    const key = `${zone}`;
    buckets[key] = buckets[key] || { n: 0, m: 0, sw: 0, bank: 0 };
    buckets[key].n++;
    if (r.made) buckets[key].m++;
    if (r.swish) buckets[key].sw++;
    if (r.made && r.board && !r.rim) buckets[key].bank++;
    const dk = `d${d}`;
    buckets[dk] = buckets[dk] || { n: 0, m: 0, sw: 0, bank: 0 };
    if (zone === "perfect") { buckets[dk].n++; if (r.made) buckets[dk].m++; }
    // points must match the arc
    if (r.made && r.pts !== (d > 6 ? 2 : 1)) rows.push(`POINTS MISMATCH d=${d} pts=${r.pts}`);
  }
  // moving shots
  let movN = 0;
  let movM = 0;
  for (let i = 0; i < 60; i++) {
    const r = shotOnce({ x: -3 + (i % 6), z: 4.5, meter: 0.83, moving: i % 2 ? 1 : -1, seed: 500 + i });
    movN++;
    if (r.made) movM++;
    if (r.scoreEvents > 1) doubles++;
    total++;
  }
  console.log(`SHOTS: ${total} shots fired, doubles=${doubles}, noRelease=${noRelease}`);
  for (const [k, b] of Object.entries(buckets)) console.log(`  ${k.padEnd(8)} n=${String(b.n).padStart(3)} make=${b.n ? ((b.m / b.n) * 100).toFixed(0) : "-"}% swish=${b.n ? ((b.sw / b.n) * 100).toFixed(0) : "-"}% bank-ins=${b.bank}`);
  console.log(`  moving perfect: ${movM}/${movN} (${((movM / movN) * 100).toFixed(0)}%)`);
  rows.forEach((r) => console.log(r));
  if (doubles) throw new Error("basket counted twice");
  return total;
}

/* ------------------------------------------------------------------ fps */
function testFps() {
  // identical scripted input (engine-time based) at different frame rates
  const outcome = (fps) => {
    const g = createGame({ mode: "free", seed: 42, player: { ratings: R5, look } });
    g.P.x = 3.1; g.P.z = 5.2;
    let pressed = false;
    let released = false;
    const log = [];
    setController(g, "p", scripted((gg) => {
      const ev = [];
      if (!pressed && gg.time >= 1.0) { pressed = true; ev.push("shootDown"); }
      if (pressed && !released && gg.time >= 1.0 + 0.6) { released = true; ev.push("shootUp"); }
      return { mx: gg.time < 0.8 ? 0.6 : 0, mz: gg.time < 0.8 ? -0.4 : 0, events: ev };
    }));
    const fdt = 1 / fps;
    for (let t = 0; t < 5; t += fdt) {
      advance(g, fdt + (fps === 37 ? (Math.sin(t * 13) * 0.004) : 0));
      for (const e of drainEvents(g)) if (["rim", "board", "score", "floor", "bounce"].includes(e.type)) log.push(`${e.type}@${e.t.toFixed(3)}`);
    }
    return { log: log.slice(0, 8).join(" "), p: `${g.ball.p.x.toFixed(4)},${g.ball.p.z.toFixed(4)}` };
  };
  const a = outcome(30);
  const b = outcome(60);
  const c = outcome(144);
  const d = outcome(37);
  console.log("FPS 30 :", a.log, a.p);
  console.log("FPS 60 :", b.log, b.p);
  console.log("FPS 144:", c.log, c.p);
  console.log("FPS ~37 jitter:", d.log, d.p);
  const same = a.log === b.log && b.log === c.log && c.log === d.log;
  console.log(same ? "FPS: identical outcomes ✓" : "FPS: OUTCOMES DIFFER ✗");
  // huge frame after tab return must not explode
  const g = createGame({ mode: "free", seed: 3, player: { ratings: R5, look } });
  advance(g, 30);
  console.log("30s frame gap → steps simulated:", Math.round(g.time / DT), "(clamped)");
  if (!same) throw new Error("fps dependence");
}

/* ------------------------------------------------------------------ layups & dunks */
function testFinishes() {
  let lay = 0;
  let layM = 0;
  let dunk = 0;
  let dunkM = 0;
  let bankIn = 0;
  for (let i = 0; i < 80; i++) {
    const g = createGame({ mode: "free", seed: 900 + i, player: { ratings: { ...R5, finishing: 6 }, look, dunks: ["one", "two", "power", "reverse", "windmill"] } });
    const ang = ((i % 9) - 4) * 0.33;
    const d0 = 6.4;
    g.P.x = Math.sin(ang) * d0; g.P.z = Math.cos(ang) * d0;
    let held = false;
    const sprint = i % 2 === 0;
    let rel = false;
    let kind = null;
    let maxY = 0;
    let jumpPos = null;
    let prevPos = null;
    let teleport = false;
    const walkIn = i % 3 === 0; // walk in and press L inside range: a layup
    setController(g, "p", scripted((gg, a) => {
      const ev = [];
      const dd = Math.hypot(a.x, a.z) || 1;
      if (walkIn) {
        if (!held && dd < 2.9) { held = true; ev.push("driveDown"); }
      } else if (!held && gg.time > 0.6) { held = true; ev.push("driveDown"); }
      if (gg.time > 4 && !rel) { rel = true; ev.push("driveUp"); }
      return { mx: -a.x / dd * (walkIn ? 0.7 : 1), mz: -a.z / dd * (walkIn ? 0.7 : 1), sprint: walkIn ? false : sprint, events: ev };
    }));
    for (let s = 0; s < 240 * 5; s++) {
      step(g, DT);
      const a = g.P;
      if (prevPos && Math.hypot(a.x - prevPos.x, a.y - prevPos.y, a.z - prevPos.z) > 0.08) teleport = true;
      prevPos = { x: a.x, y: a.y, z: a.z };
      maxY = Math.max(maxY, a.y);
      for (const e of drainEvents(g)) {
        if (e.type === "layupStart") { kind = "layup"; lay++; }
        if (e.type === "dunkStart") { kind = "dunk"; dunk++; }
        if (e.type === "score") {
          if (e.kind === "layup") { layM++; if (e.bank) bankIn++; }
          if (e.kind === "dunk") dunkM++;
        }
        if (e.type === "takeoff") jumpPos = Math.hypot(a.x, a.z);
      }
    }
    if (teleport) throw new Error(`teleport during ${kind}`);
  }
  console.log(`FINISHES: layups ${layM}/${lay} made (${bankIn} off glass), dunks ${dunkM}/${dunk} made, no teleports ✓`);
  // sprinting drives by a non-dunker: every one must be a proper layup
  let dl = 0;
  let dlM = 0;
  let minRel = 9;
  for (let i = 0; i < 60; i++) {
    const g = createGame({ mode: "free", seed: 3000 + i, player: { ratings: { ...R5, finishing: 3 }, look } });
    const ang = ((i % 11) - 5) * 0.24;
    g.P.x = Math.sin(ang) * 7; g.P.z = Math.cos(ang) * 7;
    let held = false;
    setController(g, "p", scripted((gg, a) => {
      const dd = Math.hypot(a.x, a.z) || 1;
      const ev = [];
      if (!held && gg.time > 0.5) { held = true; ev.push("driveDown"); }
      return { mx: -a.x / dd, mz: -a.z / dd, sprint: true, events: ev };
    }));
    for (let s = 0; s < 240 * 5; s++) {
      step(g, DT);
      for (const e of drainEvents(g)) {
        if (e.type === "layupStart") dl++;
        if (e.type === "release" && e.zone === "layup") minRel = Math.min(minRel, Math.hypot(g.ball.p.x, g.ball.p.z));
        if (e.type === "score" && e.kind === "layup") dlM++;
      }
    }
  }
  console.log(`DRIVING LAYUPS (sprint, non-dunker): ${dlM}/${dl} made, closest release ${minRel.toFixed(2)} m from rim centre`);
  if (minRel < 0.4) throw new Error("layup released under the rim");
}

/* ------------------------------------------------------------------ matches */
function aiProfileFor(op) {
  return { ...op.ai };
}

function playMatch(pOpp, oOpp, seed, target = 11) {
  const rng = createRng(seed);
  const g = createGame({
    mode: "match", seed, target,
    player: { ratings: pOpp.ratings, look },
    opponent: { ratings: oOpp.ratings, look, dunks: ["one", "two"] },
    firstOffense: "p",
  });
  setController(g, "p", wrapAI(createAI(aiProfileFor(pOpp), createRng(seed + 1))));
  setController(g, "o", wrapAI(createAI(aiProfileFor(oOpp), createRng(seed + 2))));
  const counts = {};
  let steps = 0;
  const maxSteps = 240 * 60 * 12;
  let ends = 0;
  while (!g.over && steps < maxSteps) {
    step(g, DT);
    steps++;
    for (const e of drainEvents(g)) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.type === "matchEnd") ends++;
    }
    void rng;
  }
  // a few extra seconds after the end must not fire another result
  for (let i = 0; i < 240 * 3; i++) { step(g, DT); for (const e of drainEvents(g)) if (e.type === "matchEnd") ends++; }
  return { g, counts, minutes: g.time / 60, ends, timedOut: steps >= maxSteps };
}

function testMatches() {
  const rows = [];
  let n = 0;
  const pairs = [[0, 0], [4, 0], [9, 5], [14, 10], [19, 15], [24, 20], [24, 24], [0, 24], [12, 12], [6, 18]];
  for (const [i, j] of pairs) for (let k = 0; k < 3; k++) {
    const A = OPPONENTS[i];
    const B = OPPONENTS[j];
    const r = playMatch(A, B, 1000 + i * 31 + j * 7 + k);
    n++;
    const s = r.g.stats;
    const pts = (st) => st.fgm + st.twoM; // 1 per make, +1 for twos
    if (pts(s.p) !== r.g.score.p || pts(s.o) !== r.g.score.o) throw new Error("score/stat mismatch");
    if (r.ends !== 1) throw new Error(`matchEnd fired ${r.ends}x — ${A.id} v ${B.id} seed ${1000 + i * 31 + j * 7 + k} score ${r.g.score.p}-${r.g.score.o} t=${r.g.time.toFixed(0)}s phase=${r.g.phase} bmode=${r.g.bmode} owner=${r.g.owner} P=${r.g.P.x.toFixed(2)},${r.g.P.z.toFixed(2)} O=${r.g.O.x.toFixed(2)},${r.g.O.z.toFixed(2)} ball=${r.g.ball.p.x.toFixed(2)},${r.g.ball.p.y.toFixed(2)},${r.g.ball.p.z.toFixed(2)} counts=${JSON.stringify(r.counts)}`);
    if (r.timedOut) throw new Error("match never ended");
    rows.push(`${A.name.padEnd(22)} vs ${B.name.padEnd(22)} ${String(r.g.score.p).padStart(2)}-${String(r.g.score.o).padEnd(2)} ${r.minutes.toFixed(1)}min  FG ${s.p.fgm}/${s.p.fga} v ${s.o.fgm}/${s.o.fga}  reb ${s.p.rebounds}/${s.o.rebounds} stl ${s.p.steals}/${s.o.steals} blk ${s.p.blocks}/${s.o.blocks} dnk ${s.p.dunks}/${s.o.dunks} lay ${s.p.layups}/${s.o.layups} x ${s.p.crossovers}/${s.o.crossovers} oob ${r.counts.outOfBounds || 0}`);
  }
  rows.forEach((r) => console.log(r));
  console.log(`MATCHES: ${n} full AI-vs-AI matches, invariants held every step, one result each ✓`);
}

/* ------------------------------------------------------------------ torture */
function testTorture() {
  // random key-spam player vs a real AI: shoot/cross/steal/jump/drive spam
  const rng = createRng(77);
  let seconds = 0;
  const seen = {};
  for (let m = 0; m < 12; m++) {
    const opp = OPPONENTS[(m * 5) % OPPONENTS.length];
    const g = createGame({ mode: "match", seed: 300 + m, target: 11, player: { ratings: R5, look }, opponent: { ratings: opp.ratings, look }, firstOffense: m % 2 ? "o" : "p" });
    setController(g, "o", wrapAI(createAI(opp.ai, createRng(9 + m))));
    let shootHeld = false;
    let driveHeld = false;
    setController(g, "p", scripted((gg, a) => {
      const ev = [];
      const keys = ["shootDown", "shootUp", "cross", "driveDown", "driveUp", "jump", "steal"];
      if (rng.chance(0.06)) {
        const k = rng.pick(keys);
        if (k === "shootDown") { if (!shootHeld) { shootHeld = true; ev.push(k); } }
        else if (k === "shootUp") { if (shootHeld) { shootHeld = false; ev.push(k); } }
        else if (k === "driveDown") { if (!driveHeld) { driveHeld = true; ev.push(k); } }
        else if (k === "driveUp") { if (driveHeld) { driveHeld = false; ev.push(k); } }
        else ev.push(k);
      }
      // wander toward the ball / rim
      const tx = gg.owner === "p" ? 0 : gg.ball.p.x;
      const tz = gg.owner === "p" ? 0 : gg.ball.p.z;
      const dx = tx - a.x + (rng.next() - 0.5) * 3;
      const dz = tz - a.z + (rng.next() - 0.5) * 3;
      const l = Math.hypot(dx, dz) || 1;
      return { mx: dx / l, mz: dz / l, sprint: rng.chance(0.5), events: ev };
    }));
    for (let i = 0; i < 240 * 60 * 4 && !g.over; i++) {
      step(g, DT);
      for (const e of drainEvents(g)) seen[e.type] = (seen[e.type] || 0) + 1;
    }
    seconds += g.time;
  }
  // restart-during-shot: a new game object replaces the old; the old one is simply dropped
  console.log(`TORTURE: ${(seconds / 60).toFixed(1)} simulated minutes of key spam vs AI, invariants held ✓`);
  console.log("  events seen:", Object.entries(seen).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
}

/* ------------------------------------------------------------------ drills */
function runDrill(mode, script, maxSec = 120, opts = {}) {
  const opp = mode === "defense" ? OPPONENTS[6] : null;
  const g = createGame({ mode, seed: 77, player: { ratings: R5, look, dunks: ["one"] }, opponent: opp ? { ratings: opp.ratings, look } : null, firstOffense: mode === "defense" ? "o" : "p", ...opts });
  setController(g, "p", scripted(script));
  if (opp) setController(g, "o", wrapAI(createAI(opp.ai, createRng(3))));
  let ends = 0;
  let result = null;
  for (let i = 0; i < 240 * maxSec && !g.over; i++) {
    step(g, DT);
    for (const e of drainEvents(g)) if (e.type === "drillEnd") { ends++; result = e; }
  }
  for (let i = 0; i < 240 * 2; i++) { step(g, DT); for (const e of drainEvents(g)) if (e.type === "drillEnd") ends++; }
  return { g, ends, result };
}
function testDrills() {
  // 3-point challenge: walk to the lit spot, shoot with a perfect-ish release
  let pressedAt = -1;
  const three = runDrill("three", (g, a) => {
    const d = g.drill;
    const spot = d.spots[Math.min(d.spot, 4)];
    const ev = [];
    const dx = spot.x - a.x;
    const dz = spot.z + 0.3 - a.z;
    const dist = Math.hypot(dx, dz);
    if (g.owner === "p" && !a.act && dist < 0.5 && pressedAt < 0) { pressedAt = g.time; ev.push("shootDown"); }
    if (pressedAt >= 0 && g.time - pressedAt >= 0.83 * METER_TIME) { pressedAt = -1; ev.push("shootUp"); }
    return { mx: dist > 0.3 ? dx / dist : 0, mz: dist > 0.3 ? dz / dist : 0, events: ev };
  });
  console.log(`DRILL three: ended ${three.ends}x, ${JSON.stringify(three.result && { score: three.result.score, makes: three.result.makes })}, spots done ${three.g.drill.spot}`);
  // dunk practice: sprint + drive from wherever the pass arrives, then walk back out
  let phase = 0;
  const dunk = runDrill("dunk", (g, a) => {
    const ev = [];
    const d = Math.hypot(a.x, a.z) || 1;
    if (g.owner === "p" && !a.act && d > 5 && phase === 0) { phase = 1; ev.push("driveDown"); }
    if (phase === 1 && g.owner !== "p" && !a.act) { phase = 2; ev.push("driveUp"); }
    if (phase === 2 && d > 6) phase = 0;
    const out = phase === 2 || (phase === 0 && d < 5);
    return { mx: out ? a.x / d : -a.x / d, mz: out ? a.z / d : -a.z / d, sprint: phase === 1, events: ev };
  }, 90);
  console.log(`DRILL dunk: ended ${dunk.ends}x, ${JSON.stringify(dunk.result && { score: dunk.result.score, dunks: dunk.result.dunks, layups: dunk.result.layups })}`);
  // dribble practice: follow the gates with a crossover at each
  let lastGate = -1;
  const drib = runDrill("dribble", (g, a) => {
    const c = g.drill.cones[Math.min(g.drill.gate, g.drill.cones.length - 1)];
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ev = [];
    if (g.drill.gate !== lastGate && dist < 2.2 && g.owner === "p") { lastGate = g.drill.gate; ev.push("cross"); }
    return { mx: dx / dist, mz: dz / dist, sprint: true, events: ev };
  }, 60);
  console.log(`DRILL dribble: ended ${drib.ends}x, time ${drib.result && drib.result.time.toFixed(2)}s, gates ${drib.g.drill.gate}/${drib.g.drill.cones.length}, crosses ${drib.result && drib.result.crosses}`);
  // defense practice: a defender that stays between the attacker and the rim and jumps at shots
  const def = runDrill("defense", (g, a) => {
    const o = g.O;
    const d = Math.hypot(o.x, o.z) || 1;
    const tx = o.x - (o.x / d) * 1.1;
    const tz = o.z - (o.z / d) * 1.1;
    const dx = tx - a.x;
    const dz = tz - a.z;
    const dist = Math.hypot(dx, dz);
    const ev = [];
    if (o.act && (o.act.kind === "shoot" || o.act.kind === "layup") && o.act.t > 0.2 && Math.hypot(o.x - a.x, o.z - a.z) < 1.8) ev.push("jump");
    if (!g.owner && g.bmode === "loose") {
      const bx = g.ball.p.x - a.x;
      const bz = g.ball.p.z - a.z;
      const bl = Math.hypot(bx, bz) || 1;
      return { mx: bx / bl, mz: bz / bl, sprint: true, events: ev };
    }
    return { mx: dist > 0.2 ? dx / dist : 0, mz: dist > 0.2 ? dz / dist : 0, sprint: dist > 1.5, events: ev };
  }, 240);
  console.log(`DRILL defense: ended ${def.ends}x, ${JSON.stringify(def.result && { stops: def.result.stops, allowed: def.result.allowed })}, reps ${def.g.drill.rep}`);
  for (const [n, r] of [["three", three], ["dunk", dunk], ["dribble", drib], ["defense", def]]) if (r.ends !== 1) throw new Error(`drill ${n} ended ${r.ends}x`);
}

const t0 = Date.now();
if (which === "drills" || which === "all") testDrills();
if (which === "shots" || which === "all") testShots();
if (which === "fps" || which === "all") testFps();
if (which === "layups" || which === "all") testFinishes();
if (which === "matches" || which === "all") testMatches();
if (which === "torture" || which === "all") testTorture();
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
