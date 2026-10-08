/**
 * Mountain Journey — headless test suite (no browser needed).
 *
 *   node src/components/games/MountainJourney/tools/simTest.mjs [all|data|levels|bot|escape|state|save|platform] [levelId]
 *
 *   data      30 levels / 5 regions × 6, unique ids, seeds and names
 *   levels    builder validation: trail heights, enclosure, object placement
 *   bot       engine/bot.js plays every level through real input: completes,
 *             0 falls, 3/3 badges, the viewpoint used
 *   escape    torture: from points all along every trail, run + spam jump in
 *             8 directions — nobody may end up out on the hills
 *   state     transition safety: climb-while-climbing, interaction spam,
 *             pause, completion once, respawn movement lock, checkpoints
 *   save      storage idempotency + sanitising garbage
 *   platform  riders stay locked to moving platforms over many cycles
 */
import { LEVELS, TOTAL_LEVELS, getLevel } from "../data/levels.js";
import { REGIONS, regionOfLevel } from "../data/regions.js";
import { createGame } from "../engine/game.js";
import { validateLevel } from "../engine/builder.js";
import { runBot, createBot } from "../engine/bot.js";
import { STATE } from "../engine/constants.js";
import * as storage from "../engine/storage.js";

const mode = process.argv[2] || "all";
const only = process.argv[3] ? Number(process.argv[3]) : null;
let pass = 0;
let fail = 0;
const failures = [];
function check(ok, label) {
  if (ok) pass++;
  else {
    fail++;
    failures.push(label);
    console.log("  ✗", label);
  }
}
const levels = () => LEVELS.filter((l) => !only || l.id === only);
const idle = { mx: 0, mz: 0, run: false, jumpPressed: false, interactPressed: false, lookDX: 0, lookDY: 0 };

function testData() {
  console.log("— data");
  check(LEVELS.length === TOTAL_LEVELS, `${TOTAL_LEVELS} levels (got ${LEVELS.length})`);
  check(REGIONS.length === 5, "5 regions");
  for (const r of REGIONS) check(LEVELS.filter((l) => regionOfLevel(l.id) === r).length === 6, `region ${r.name} has 6 levels`);
  check(new Set(LEVELS.map((l) => l.id)).size === LEVELS.length, "unique level ids");
  check(new Set(LEVELS.map((l) => l.seed)).size === LEVELS.length, "unique seeds");
  check(new Set(LEVELS.map((l) => l.name)).size === LEVELS.length, "unique names");
  for (let i = 1; i <= TOTAL_LEVELS; i++) check(!!getLevel(i), `level ${i} exists`);
  check(LEVELS[TOTAL_LEVELS - 1].segs.some(([t, o]) => t === "finish" && o.kind === "summit"), "level 30 ends on the summit");
}

function testLevels() {
  console.log("— levels (builder validation)");
  for (const def of levels()) {
    const G = createGame(def);
    const issues = validateLevel(G.L).filter((s) => !s.startsWith("weak wall"));
    check(issues.length === 0, `L${def.id} valid${issues.length ? ": " + issues.slice(0, 3).join("; ") : ""}`);
    check(G.L.checkpoints.length >= 1, `L${def.id} has a checkpoint`);
    check(G.L.length >= 140, `L${def.id} trail ≥ 140 m (${G.L.length.toFixed(0)})`);
  }
}

function testBot() {
  console.log("— bot plays every level");
  for (const def of levels()) {
    const G = createGame(def);
    const r = runBot(G);
    check(r.ok, `L${def.id} completed${r.ok ? "" : ": " + r.why}`);
    if (!r.ok) continue;
    check(r.falls === 0, `L${def.id} no falls`);
    check(r.badges === 3, `L${def.id} 3/3 badges (${r.badges})`);
    check(r.viewpoints >= 1, `L${def.id} viewpoint used`);
    console.log(`  L${def.id} ${def.name}: ${r.time.toFixed(0)}s, ${r.jumps} jumps, ${r.distance.toFixed(0)} m`);
  }
}

function testEscape() {
  console.log("— escape torture");
  const dirs = 8;
  for (const def of levels()) {
    const G0 = createGame(def);
    const samples = [];
    for (const path of G0.L.paths) {
      const N = path.nodes;
      let acc = 0;
      for (let i = 1; i < N.length; i++) {
        acc += Math.hypot(N[i].x - N[i - 1].x, N[i].z - N[i - 1].z);
        if (acc >= 9 && !N[i].tag) {
          acc = 0;
          samples.push(N[i]);
        }
      }
    }
    let escapes = 0;
    let worst = null;
    for (const n of samples) {
      for (let d = 0; d < dirs; d++) {
        const G = createGame(def);
        const P = G.player;
        P.x = n.x;
        P.z = n.z;
        P.y = G.L.terrain.height(n.x, n.z);
        P.lastSafeY = P.y;
        G.cam.yaw = (d / dirs) * Math.PI * 2;
        G.opts.noAutoCam = true;
        for (let k = 0; k < 120 * 3.5; k++) {
          G.stepN(1, { ...idle, mz: 1, run: true, jumpPressed: k % 30 === 0 });
          if (G.state === STATE.CLIMBING || G.state === STATE.VIEWPOINT) {
            // let those play out, then keep pushing
            G.stepN(200, idle);
          }
        }
        G.drain();
        if (G.state !== STATE.PLAYING) continue; // fell → respawned elsewhere: fine
        const q = G.L.terrain.query(P.x, P.z);
        if (q.e > 7 && P.y > n.y - 3) {
          escapes++;
          worst = `from (${n.x.toFixed(3)}, ${n.z.toFixed(3)}) dir ${d} to (${P.x.toFixed(1)}, ${P.y.toFixed(1)}, ${P.z.toFixed(1)}) e=${q.e.toFixed(1)}`;
        }
      }
    }
    check(escapes === 0, `L${def.id} no escapes over ${samples.length * dirs} attempts${worst ? " — " + worst : ""}`);
  }
}

function testState() {
  console.log("— state machine");
  const def = getLevel(3);
  // climb-while-climbing: pressing interact mid-climb never restarts it
  // (Jump on a ladder deliberately lets go, so it isn't spammed here)
  {
    const G = createGame(def);
    const bot = createBot(G);
    let climbs = 0;
    while (!bot.done && !bot.failed && G.time < 20) {
      G.stepN(1, bot.input(1 / 120));
      for (const e of G.drain()) if (e.type === "climbStart" || e.type === "ladderStart") climbs++;
      if (G.state === STATE.CLIMBING) G.stepN(1, { ...idle, mz: 1, interactPressed: true });
    }
    check(climbs === 2, `spamming during climbs doesn't re-trigger (${climbs} climb starts)`);
  }
  // interaction spam on a lever: one lever event
  {
    const G = createGame(def);
    const bot = createBot(G);
    let lever = 0;
    let spam = 0;
    while (!bot.done && !bot.failed && G.time < 120) {
      const inp = bot.input(1 / 120);
      if (inp.interactPressed) spam = 40; // keep hammering E after every real press
      G.stepN(1, { ...inp, interactPressed: inp.interactPressed || (spam-- > 0 && spam % 4 === 0 && G.state !== STATE.VIEWPOINT) });
      for (const e of G.drain()) if (e.type === "lever") lever++;
    }
    check(bot.done, "level 3 completes under interaction spam");
    check(lever === 1, `lever fires once under spam (${lever})`);
  }
  // completion is emitted exactly once, and the state is terminal
  {
    const G = createGame(getLevel(1));
    const r = runBot(G);
    let completes = 0;
    G.stepN(240, { ...idle, mz: 1, jumpPressed: true, interactPressed: true });
    for (const e of G.drain()) if (e.type === "complete") completes++;
    check(r.ok && G.state === STATE.LEVEL_COMPLETE && completes === 0, "LEVEL_COMPLETE is terminal (no second complete)");
    G.toCheckpoint();
    check(G.state === STATE.LEVEL_COMPLETE, "no respawn out of LEVEL_COMPLETE");
  }
  // falling into a gap respawns at the checkpoint, movement locked meanwhile
  {
    const G = createGame(getLevel(2));
    const P = G.player;
    const pit = G.L.pits[0];
    P.x = (pit.ax + pit.bx) / 2;
    P.z = (pit.az + pit.bz) / 2;
    P.y = pit.y + 0.5;
    P.grounded = false;
    let fell = false;
    let movedWhileRespawning = false;
    let at = null;
    for (let k = 0; k < 600; k++) {
      const before = [P.x, P.z];
      G.stepN(1, { ...idle, mz: 1, mx: 1, jumpPressed: true });
      for (const e of G.drain()) {
        if (e.type === "fall") fell = true;
        if (e.type === "respawn") at = Math.hypot(P.x - G.checkpoint.x, P.z - G.checkpoint.z);
      }
      if (G.state === STATE.RESPAWNING && G.respawn.moved && (Math.abs(P.x - before[0]) > 1e-6 || Math.abs(P.z - before[1]) > 1e-6) && G.respawn.t > 0.4) movedWhileRespawning = true;
    }
    check(fell, "falling into a gap is detected");
    check(G.state === STATE.PLAYING, "back to PLAYING after respawn");
    check(at !== null && at < 0.01, "respawned exactly at the checkpoint");
    check(!movedWhileRespawning, "no movement during respawn");
    check(G.run.falls === 1, "one fall counted");
  }
  // a restart mid-jump is a fresh game: nothing carries over
  {
    const G = createGame(getLevel(1));
    G.stepN(1, { ...idle, jumpPressed: true });
    const G2 = createGame(getLevel(1));
    check(G2.player.grounded && G2.player.vy === 0 && G2.collected.size === 0, "restart mid-jump starts clean");
  }
}

function testSave() {
  console.log("— save / load");
  let s = storage.defaultState();
  s = storage.recordBadge(s, 1, 0);
  const s2 = storage.recordBadge(s, 1, 0);
  check(s2 === s, "re-collecting a badge is a no-op");
  s = storage.recordBadge(s, 1, 2);
  check(storage.progressOf(s).badges === 2, "badge count");
  const a = storage.completeLevel(s, 1, 100);
  check(a.reward.first && a.state.unlocked === 2, "first completion unlocks next");
  const b = storage.completeLevel(a.state, 1, 80);
  check(!b.reward.first && b.state.bestTime[1] === 80 && storage.progressOf(b.state).levels === 1, "second completion: no double count, best time kept");
  const c = storage.completeLevel(b.state, 1, 120);
  check(c.state.bestTime[1] === 80, "slower run doesn't overwrite best");
  const z = storage.completeLevel(c.state, 30, 300);
  check(z.state.stats.summit === true, "summit flag on level 30");
  const j = JSON.parse(JSON.stringify(z.state));
  check(JSON.stringify(storage.sanitize(j)) === JSON.stringify(storage.sanitize(storage.sanitize(j))), "sanitize is idempotent");
  const g = storage.sanitize({ unlocked: "999", completed: { 1: true, 99: true }, badges: { 3: [1, "x", 5, 1] }, stats: { jumps: -5, distance: "NaN" }, look: { jacket: "#000000", hat: "explorer" } });
  check(g.unlocked === 30 && !g.completed[99] && g.badges[3].join("") === "100" && g.stats.jumps === 0 && g.stats.distance === 0, "sanitize clamps garbage");
  check(g.look.jacket === storage.defaultState().look.jacket && g.look.hat === storage.defaultState().look.hat, "locked / unknown cosmetics fall back");
  check(storage.sanitize(null).unlocked === 1, "null save → defaults");
  const r = storage.addRunStats(storage.defaultState(), { distance: 10, jumps: 3, falls: 1, playtime: 5 });
  check(r.stats.jumps === 3 && r.stats.falls === 1, "run stats fold in");
}

function testPlatform() {
  console.log("— moving platforms");
  for (const def of levels()) {
    const G = createGame(def);
    for (const pl of G.platforms) {
      const P = G.player;
      // stand in the middle of the platform at rest and ride several cycles
      for (let k = 0; k < 4000 && (pl.f !== 0 || pl.moving); k++) G.stepN(1, idle);
      P.x = pl.x;
      P.z = pl.z;
      P.y = pl.y + pl.h;
      P.vy = 0;
      P.grounded = true;
      P.groundSolid = pl.solid;
      P.lastSafeY = P.y;
      let maxOff = 0;
      for (let k = 0; k < 120 * 30; k++) {
        G.stepN(1, idle);
        maxOff = Math.max(maxOff, Math.hypot(P.x - pl.x, P.z - pl.z), Math.abs(P.y - (pl.y + pl.h)));
        if (G.state !== STATE.PLAYING) break;
      }
      check(G.state === STATE.PLAYING && maxOff < 0.05, `L${def.id} ${pl.id} rider stays put over 30 s (max drift ${maxOff.toFixed(3)} m)`);
    }
  }
}

const t0 = Date.now();
if (mode === "all" || mode === "data") testData();
if (mode === "all" || mode === "levels") testLevels();
if (mode === "all" || mode === "bot") testBot();
if (mode === "all" || mode === "state") testState();
if (mode === "all" || mode === "save") testSave();
if (mode === "all" || mode === "platform") testPlatform();
if (mode === "all" || mode === "escape") testEscape();
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (fail) {
  console.log(failures.slice(0, 30).join("\n"));
  process.exit(1);
}
