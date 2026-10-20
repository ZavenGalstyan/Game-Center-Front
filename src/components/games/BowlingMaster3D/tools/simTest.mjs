// Bowling Master 3D — headless checks.
// node src/components/games/BowlingMaster3D/tools/simTest.mjs [all|scoring|physics|sweep]
import { splitFrames, nextRoll, frameTotals, frameMarks, totalScore, gameStats } from "../scoring.js";
import { createSim, rackPins, sweepFallen, simulateThrow, standingCount, powerToSpeed, stepSim, isStanding, predictPath, HEAD_Z } from "../physics.js";

const mode = process.argv[2] || "all";
let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("FAIL:", msg);
  }
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// play rolls through nextRoll, checking each is legal
function play(rolls) {
  const done = [];
  for (const r of rolls) {
    const n = nextRoll(done);
    ok(!n.over, `roll after game over in ${rolls}`);
    ok(r <= n.standing, `roll ${r} > standing ${n.standing}`);
    done.push(r);
  }
  return done;
}

if (mode === "all" || mode === "scoring") {
  const perfect = play(Array(12).fill(10));
  ok(nextRoll(perfect).over, "300 game ends after 12 balls");
  eq(totalScore(perfect), 300, "perfect game");
  eq(frameTotals(perfect), [30, 60, 90, 120, 150, 180, 210, 240, 270, 300], "perfect totals");
  eq(frameMarks(perfect)[9], ["X", "X", "X"], "perfect 10th marks");
  eq(gameStats(perfect), { strikes: 12, spares: 0 }, "perfect stats");
  const gut = play(Array(20).fill(0));
  ok(nextRoll(gut).over, "gutter game ends after 20");
  eq(totalScore(gut), 0, "gutter game");
  eq(frameMarks(gut)[0], ["-", "-"], "gutter marks");
  const spares = play(Array(21).fill(5));
  ok(nextRoll(spares).over, "all-spares ends after 21");
  eq(totalScore(spares), 150, "all 5-spares");
  eq(frameMarks(spares)[9], ["5", "/", "5"], "spare 10th marks");
  eq(totalScore(play(Array(20).fill(4))), 80, "all fours");
  const nine = play([9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0, 9, 0]);
  eq(totalScore(nine), 90, "all 9-0");
  ok(nextRoll(nine).over, "open 10th ends after 2 balls");
  const sample = play([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]);
  eq(frameTotals(sample), [20, 39, 48, 66, 74, 84, 90, 120, 148, 167], "sample game totals");
  eq(frameMarks(sample)[1], ["7", "/"], "spare mark");
  eq(frameMarks(sample)[9], ["X", "8", "1"], "10th X-8-1 marks");
  const t1 = Array(18).fill(0);
  eq(nextRoll([...t1, 10]), { over: false, frame: 9, ball: 1, fullRack: true, standing: 10 }, "10th strike -> fresh rack");
  eq(nextRoll([...t1, 10, 3]), { over: false, frame: 9, ball: 2, fullRack: false, standing: 7 }, "10th X-3 -> 7 standing");
  eq(nextRoll([...t1, 4, 6]), { over: false, frame: 9, ball: 2, fullRack: true, standing: 10 }, "10th spare -> fresh rack");
  ok(nextRoll([...t1, 10, 3, 7]).over, "10th X-3-7 over");
  eq(frameMarks([...t1, 10, 3, 7])[9], ["X", "3", "/"], "X 3 / marks");
  eq(totalScore([...t1, 10, 3, 7]), 20, "X 3 / total");
  eq(frameMarks([...t1, 0, 10, 10])[9], ["-", "/", "X"], "- / X marks");
  eq(totalScore([...t1, 0, 10, 10]), 20, "-/X total");
  eq(frameTotals([10, 10]).slice(0, 2), [null, null], "pending strike bonuses");
  eq(frameTotals([10, 10, 10])[0], 30, "turkey first frame");
  eq(frameTotals([5, 5])[0], null, "pending spare");
  eq(nextRoll([3]), { over: false, frame: 0, ball: 1, fullRack: false, standing: 7 }, "second ball standing");
  eq(splitFrames([10, 3, 4, 10]), [[10], [3, 4], [10]], "split frames");
  eq(totalScore([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9]), 299, "299 game");
  const r = rng(5);
  for (let g = 0; g < 2000; g++) {
    const rolls = [];
    let n = 0;
    while (!nextRoll(rolls).over && n++ < 30) rolls.push(Math.floor(r() * (nextRoll(rolls).standing + 1)));
    ok(n <= 21 && totalScore(rolls) <= 300 && frameTotals(rolls)[9] !== null, `random game ${rolls}`);
  }
}

if (mode === "all" || mode === "physics") {
  const s = createSim();
  rackPins(s, rng(1));
  for (let i = 0; i < 600; i++) stepSim(s, 1 / 60);
  eq(standingCount(s), 10, "idle rack stays standing");
  for (const x of [-0.41, 0.41]) {
    const g = createSim();
    rackPins(g, rng(2));
    const k = simulateThrow(g, { x, angle: Math.sign(x) * 0.04, speed: powerToSpeed(0.7), spin: 0 });
    eq(k, 0, `gutter ball from ${x}`);
    ok(g.ball.state === "pit" || g.ball.state === "gutter", "ball went down the gutter");
  }
  const a = createSim();
  rackPins(a, rng(3));
  const ka = simulateThrow(a, { x: 0, angle: 0, speed: powerToSpeed(0.8), spin: 0 });
  const b = createSim();
  rackPins(b, rng(3));
  const kb = simulateThrow(b, { x: 0, angle: 0, speed: powerToSpeed(0.8), spin: 0 });
  eq(ka, kb, "deterministic");
  ok(ka >= 5, `head-on hit knocks >=5 (got ${ka})`);
  const st = standingCount(a);
  sweepFallen(a);
  eq(a.pins.filter(isStanding).length, st, "sweep keeps standing pins");
  ok(a.pins.every((p) => p.state === "up" || p.state === "gone"), "sweep clears deadwood");
  // a second ball at the leftovers can only knock what's standing
  const k2 = simulateThrow(a, { x: 0, angle: 0, speed: powerToSpeed(0.8), spin: 0 });
  ok(k2 >= 0 && k2 <= st, `second ball within standing (${k2}/${st})`);
  const left = predictPath(0.3, 0, powerToSpeed(0.6), 1);
  const right = predictPath(-0.3, 0, powerToSpeed(0.6), -1);
  ok(left.at(-1)[0] < 0.1, `positive spin hooks left (${left.at(-1)[0].toFixed(2)})`);
  ok(right.at(-1)[0] > -0.1, `negative spin hooks right (${right.at(-1)[0].toFixed(2)})`);
  ok(left.at(-1)[1] <= HEAD_Z + 0.05, "path reaches head pin");
}

if (mode === "all" || mode === "sweep") {
  let strikes = 0;
  let total = 0;
  let knocked = 0;
  let maxT = 0;
  const hist = Array(11).fill(0);
  for (let xi = -8; xi <= 8; xi++)
    for (const spin of [-1, -0.5, 0, 0.5, 1])
      for (const p of [0.3, 0.6, 0.9]) {
        const s = createSim();
        rackPins(s, rng(xi * 31 + p * 7 + spin * 3 + 100));
        const k = simulateThrow(s, { x: xi * 0.045, angle: 0, speed: powerToSpeed(p), spin });
        maxT = Math.max(maxT, s.t);
        hist[k]++;
        total++;
        knocked += k;
        if (k === 10) strikes++;
      }
  console.log(`sweep: ${total} shots, strike ${((100 * strikes) / total).toFixed(1)}%, avg ${(knocked / total).toFixed(2)} pins, max settle ${maxT.toFixed(1)}s, hist ${hist.join(",")}`);
  ok(strikes > 0, "some strikes in sweep");
  ok(strikes / total < 0.6, "strikes are not automatic");
  ok(maxT < 16, "throws settle in time");
  // aim-at-the-pocket shots: find the start x whose hook ends near the 1-3 pocket
  for (const [spin, target] of [[0.8, 0.07], [0, 0.07], [-0.8, -0.07]]) {
    const end = (x) => predictPath(x, 0, powerToSpeed(0.75), spin).at(-1)[0];
    let x0 = 0;
    for (let x = -0.41; x <= 0.41; x += 0.005) if (Math.abs(end(x) - target) < Math.abs(end(x0) - target)) x0 = x;
    let ps = 0;
    for (let i = 0; i < 40; i++) {
      const s = createSim();
      rackPins(s, rng(900 + i));
      if (simulateThrow(s, { x: x0 + (i % 5 - 2) * 0.01, angle: 0, speed: powerToSpeed(0.75), spin }) === 10) ps++;
    }
    console.log(`pocket spin ${spin}: start x ${x0.toFixed(3)}, strike rate ${((100 * ps) / 40).toFixed(0)}%`);
    ok(ps >= 8, `pocket shots strike often (spin ${spin})`);
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
