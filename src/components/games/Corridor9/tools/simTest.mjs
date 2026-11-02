/**
 * Corridor 9 — headless rule checks (Node, no browser):
 *   node src/components/games/Corridor9/tools/simTest.mjs [rules|loop|move|bag|symmetry|all]
 */
import { createGame, free, obstaclesFor, rng, START, regionAt } from "../sim.js";
import { W, L, J0, J1, T, GOAL, ANOMALY_IDS, WALK_RECTS, RADIUS } from "../data.js";
import { createBot, correctChoice } from "./bot.mjs";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL:", msg);
  }
};
const DT = 1 / 60;

/** play until `n` decisions were made (or win); returns the decision events */
function play(g, bot, n, maxFrames = 60 * 60 * 30) {
  const decisions = [];
  for (let f = 0; f < maxFrames && g.state === "play" && decisions.length < n; f++) {
    g.update(DT, bot.step(DT));
    for (const e of g.events) if (e.type === "decision") decisions.push(e);
    g.events.length = 0;
  }
  return decisions;
}

const suites = {
  rules() {
    console.log("rules: forward/back judging, progress, reset, win");
    // forced sequence: normal, anomaly, normal ... with correct choices
    const g = createGame({ seed: 1, forced: [null, "clock", null, "leak", "bench", null, "door", null, "floor"] });
    ok(g.progress === 0 && g.loop.exit === 0, "starts at Exit 0");
    const bot = createBot(g);
    const ds = play(g, bot, 9);
    ok(ds.length === 9, `9 decisions made (${ds.length})`);
    ok(ds.every((d) => d.correct), "all correct with the correct bot");
    ok(ds.map((d) => d.after).join() === "1,2,3,4,5,6,7,8,9", `progress 1..9 (${ds.map((d) => d.after)})`);
    ok(ds[1].dir === "back" && ds[0].dir === "forward", "anomaly → back, normal → forward");
    ok(g.loop.final && g.loop.anomaly === null && g.loop.exit === 9, "Exit 9 loop is final and normal");
    ok(g.found === 5, `5 anomalies found (${g.found})`);
    // walk out of the final loop
    for (let f = 0; f < 60 * 60 && g.state === "play"; f++) g.update(DT, bot.step(DT));
    ok(g.state === "won", "walking out of Exit 9 wins");
    ok(g.events.filter((e) => e.type === "win").length === 1, "exactly one win event");

    // wrong decisions reset to 0
    const g2 = createGame({ seed: 2, forced: [null, null, "shadow", null, "flicker"] });
    const wrong = createBot(g2, { decide: (loop) => (loop.index === 2 || loop.index === 3 ? (loop.anomaly ? "forward" : "back") : correctChoice(loop)) });
    const d2 = play(g2, wrong, 5);
    ok(d2.map((d) => d.after).join() === "1,2,0,0,1", `wrong turns reset (${d2.map((d) => `${d.dir}:${d.after}`)})`);
    ok(g2.mistakes === 2, "two mistakes counted");
    ok(!d2[2].correct && d2[2].dir === "forward" && d2[2].anomaly === "shadow", "kept going past an anomaly is wrong");
    ok(!d2[3].correct && d2[3].dir === "back" && d2[3].anomaly === null, "turning back in a normal loop is wrong");

    // first loop of a run is always normal
    for (let s = 0; s < 50; s++) ok(createGame({ seed: s * 7919 }).loop.anomaly === null, `seed ${s}: first loop normal`);

    // determinism
    const seq = (seed) => {
      const gg = createGame({ seed });
      const b = createBot(gg);
      return play(gg, b, 12).map((d) => `${d.anomaly}:${d.dir}`).join();
    };
    ok(seq(42) === seq(42), "same seed → same loops");
    ok(seq(42) !== seq(43), "different seed → different loops");
  },

  loop() {
    console.log("loop: crossings fire once, teleports land inside, jitter at the lines");
    const g = createGame({ seed: 5 });
    let decisions = 0;
    // stand on the start line and wiggle back and forth across J0
    const P = g.player;
    P.yaw = -Math.PI / 2;
    for (let i = 0; i < 600; i++) {
      const back = Math.floor(i / 70) % 2 === 0;
      g.update(DT, { f: !back, b: back });
      for (const e of g.events) if (e.type === "decision") decisions++;
      g.events.length = 0;
      ok(P.x >= J0.x - 0.15 && P.x <= J1.x + 0.15, `frame ${i}: never left the loop (${P.x.toFixed(2)})`);
    }
    ok(decisions >= 1 && decisions <= 15, `wiggling at J0 → a bounded number of decisions (${decisions})`);
    ok(g.history.every((h, i, a) => i === 0 || h.loop > a[i - 1].loop), "each decision belongs to a new loop");

    // forward teleport keeps the offset into the connector + velocity
    const g2 = createGame({ seed: 9, forced: [null] });
    g2.player.x = J1.x - 0.05;
    g2.player.z = L + W / 2 + 0.3;
    g2.player.yaw = -Math.PI / 2;
    g2.player.vx = WALKV();
    g2.update(0.05, { f: true });
    ok(g2.loop.index === 1, "crossing J1 starts loop 1");
    ok(Math.abs(g2.player.z - (L + W / 2 + 0.3 - T.z)) < 1e-9, "forward teleport keeps the lateral offset");
    ok(g2.player.x > J0.x && g2.player.x < J0.x + 0.3, `lands just past J0 (${g2.player.x.toFixed(3)})`);
    // backward teleport rotates about J0
    const g3 = createGame({ seed: 9, forced: ["clock"] });
    g3.player.x = J0.x + 0.05;
    g3.player.z = J0.z - 0.4;
    g3.player.yaw = Math.PI / 2; // facing west
    g3.player.vx = -WALKV();
    g3.update(0.05, { f: true });
    ok(g3.loop.index === 1 && g3.history[0].dir === "back" && g3.history[0].correct, "crossing J0 is a correct turn-back");
    ok(Math.abs(g3.player.z - (J0.z + 0.4)) < 1e-9, "back teleport mirrors the lateral offset");
    ok(Math.abs(Math.abs(g3.player.yaw) - Math.PI / 2) < 1e-9 && g3.player.yaw < 0, `now facing east (${g3.player.yaw.toFixed(3)})`);
    ok(g3.player.vx > 0, "velocity turned with you");

    // big dt can't skip the line or tunnel
    const g4 = createGame({ seed: 3, forced: [null, null] });
    const b4 = createBot(g4);
    let d4 = 0;
    for (let i = 0; i < 4000 && d4 < 2; i++) {
      g4.update(0.25, b4.step(0.25));
      d4 += g4.events.filter((e) => e.type === "decision").length;
      g4.events.length = 0;
    }
    ok(d4 === 2, `dt=0.25 still makes exactly 2 decisions (${d4})`);

    // long random-choice runs: one decision per loop, loop indices strictly +1
    const g5 = createGame({ seed: 77 });
    const r = rng(1);
    const b5 = createBot(g5, { decide: () => (r() < 0.5 ? "back" : "forward"), sprint: true });
    const d5 = play(g5, b5, 300, 60 * 60 * 120);
    ok(d5.length === 300 || g5.state === "won", `random bot made 300 decisions or won (${d5.length}, ${g5.state})`);
    ok(d5.every((d, i) => d.loop === i), "decision i judges loop i");
    ok(d5.every((d) => d.correct === (d.dir === (d.anomaly ? "back" : "forward"))), "judging matches the rule every time");
    let prog = 0, okProg = true;
    for (const d of d5) {
      prog = d.correct ? prog + 1 : 0;
      if (d.after !== prog) okProg = false;
    }
    ok(okProg, "progress = consecutive correct decisions");
  },

  move() {
    console.log("move: collisions keep you inside, bench + ajar door block");
    const r = rng(11);
    for (const anomaly of [null, "bench", "door"]) {
      const g = createGame({ seed: 3, forced: [anomaly] });
      let bad = 0, steps = 0;
      const obs = () => g.obstacles;
      for (let i = 0; i < 40000; i++) {
        if (i % 30 === 0) g.player.yaw = r() * Math.PI * 2;
        g.update(DT, { f: r() < 0.8, l: r() < 0.2, r: r() < 0.2, sprint: r() < 0.3 });
        g.events.length = 0;
        steps++;
        if (!free(g.player.x, g.player.z, obs(), RADIUS - 1e-6)) bad++;
      }
      ok(bad === 0, `${anomaly || "normal"}: ${steps} random steps never inside a wall/obstacle (${bad})`);
    }
    const ob = obstaclesFor(null);
    ok(!free(-W / 2 + 0.3, 12.8, ob), "baseline bench blocks the west wall at z=12.8");
    ok(free(0.6, 12.8, ob), "corridor is open beside the bench");
    const obm = obstaclesFor("bench");
    ok(!free(-0.3, 13.4, obm) && free(-W / 2 + 0.35, 12.0, obm), "moved bench blocks the middle, frees its old spot");
    // there is a gap past the moved bench
    let gap = false;
    for (let x = -W / 2; x < W / 2; x += 0.02) if (free(x, 13.4, obm)) gap = true;
    ok(gap, "you can squeeze past the moved bench");
    ok(!free(-W / 2 + 0.3, 19.0, obstaclesFor("door")), "ajar door blocks its swing");
    ok(!free(0, -W - 0.01, ob) && !free(W / 2 + 0.01, 10, ob) && !free(-W / 2 - 0.01, 10, ob), "walls are solid");
    ok(regionAt(START.x, START.z) === "south-connector" && regionAt(0, 10) === "main" && regionAt(J1.x - 1, L + 1) === "north-connector", "regions");
  },

  bag() {
    console.log("bag: every anomaly shows up, no immediate repeats, rate ~60%");
    const g = createGame({ seed: 1234 });
    const b = createBot(g);
    // keep progress below the goal so the run never ends: cheat by resetting
    const seen = new Map();
    let last = null, repeats = 0, normal = 0, total = 0;
    for (let n = 0; n < 2000; n++) {
      const d = play(g, b, 1)[0];
      if (!d) break;
      total++;
      if (d.anomaly) {
        seen.set(d.anomaly, (seen.get(d.anomaly) || 0) + 1);
        if (d.anomaly === last) repeats++;
        last = d.anomaly;
      } else normal++;
      if (g.progress >= GOAL - 1) g.progress = 0; // stay in the game
    }
    ok(ANOMALY_IDS.every((id) => seen.get(id) > 0), `all 12 anomalies appeared (${seen.size})`);
    ok(repeats === 0, `no anomaly twice in a row (${repeats})`);
    const rate = 1 - normal / total;
    ok(rate > 0.5 && rate < 0.7, `anomaly rate ${rate.toFixed(2)}`);
    const counts = [...seen.values()];
    ok(Math.max(...counts) - Math.min(...counts) <= 2, `shuffle bag keeps counts even (${counts})`);
  },

  symmetry() {
    console.log("symmetry: the walkable shape matches across both teleports");
    const r = rng(5);
    let mis = 0;
    for (let i = 0; i < 20000; i++) {
      // a point in the south piece (connector + corner)
      const x = J0.x + 0.01 + r() * (W + 8 - 0.02), z = -W + r() * W;
      const a = free(x, z, []);
      // rotated about the corridor centre → north piece
      const b = free(-x, L - z, []);
      // the backward teleport: rotate about J0 → previous loop's north piece
      // (approximated by the north piece of THIS loop shifted by -T)
      const px = 2 * J0.x - x, pz = 2 * J0.z - z; // a point west of J0
      const c = free(px + T.x, pz + T.z, []) || px + T.x > J1.x; // past J1 counts as open
      if (a !== b) mis++;
      if (a && x > J0.x + RADIUS + 0.01 && !c) mis++;
    }
    ok(mis === 0, `walkable symmetry (${mis} mismatches)`);
    ok(WALK_RECTS.length === 3, "three walkable rects");
  },
};
function WALKV() {
  return 1.9;
}

const which = process.argv[2] || "all";
for (const [name, fn] of Object.entries(suites)) if (which === "all" || which === name) fn();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
