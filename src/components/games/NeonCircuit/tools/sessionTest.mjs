/**
 * Session checks:  node src/components/games/NeonCircuit/tools/sessionTest.mjs
 * Progress / unlocking / stars / records, a scripted play-through of every
 * level with undo + restart, Time Challenge runs, and the pausable clock.
 */
import * as E from "../engine.js";
import * as G from "../game.js";
import { LEVELS } from "../levels.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));

// load / normalize
ok(JSON.stringify(G.normalize(null)) === JSON.stringify(G.DEFAULT), "empty save → defaults");
ok(G.normalize({ unlocked: 999 }).unlocked === 99 && G.normalize({ unlocked: -3 }).unlocked === 0, "unlocked clamped");
ok(G.normalize({ stars: "x" }).stars && typeof G.normalize({ stars: "x" }).stars === "object", "corrupt maps reset");

// a full Classic campaign simulated the way the UI does it: presses + undo + restart, hints only
let p = G.normalize(null);
const r = E.rng(5);
let bad = 0;
for (let lvl = 0; lvl < LEVELS.length; lvl++) {
  if (lvl > p.unlocked) { bad++; break; }
  const { n, board: start, opt } = G.levelPuzzle(lvl);
  let board = start, hist = [];
  // some wrong presses, undone again → move count back to 0
  for (let k = 0; k < 3; k++) { const i = Math.floor(r() * n * n); board = E.press(n, board, i); hist.push(i); }
  while (hist.length) board = E.press(n, board, hist.pop());
  if (board !== start) bad++;
  // random presses then Restart Level
  board = E.press(n, board, 0); hist = [0];
  board = start; hist = [];
  // follow hints (each hint from the CURRENT board)
  while (board) { const h = E.hint(n, board); board = E.press(n, board, h); hist.push(h); }
  if (hist.length !== opt) bad++;
  ({ prog: p } = G.recordLevel(p, lvl, hist.length, 1000 + lvl));
}
ok(bad === 0, "every level: undo restores the start, restart resets, hints solve in exactly the optimum");
ok(p.unlocked === 99 && Object.keys(p.stars).length === 100 && Object.values(p.stars).every((s) => s === 3), "campaign: all unlocked, 3★ everywhere");

// unlocking + records
{
  let q = G.normalize(null);
  ok(G.nextUnsolved(q) === 0, "fresh save starts at level 1");
  let res;
  ({ prog: q, result: res } = G.recordLevel(q, 0, 5, 9000)); // opt of L1 is 2 → 5 moves = 1★? (2+2=4 → 2★ limit)
  ok(q.unlocked === 1 && res.stars === 1 && q.stars[0] === 1, "5 moves on a 2-move level → 1★, unlocks level 2");
  ({ prog: q, result: res } = G.recordLevel(q, 0, 2, 12000));
  ok(res.stars === 3 && q.stars[0] === 3 && q.best[0] === 2 && q.time[0] === 9000 && res.newBest && !res.newTime, "better moves kept, faster time kept separately");
  ({ prog: q, result: res } = G.recordLevel(q, 0, 4, 3000));
  ok(q.stars[0] === 3 && q.best[0] === 2 && q.time[0] === 3000 && res.stars === 2 && res.newTime, "stars never drop; best time improves");
  ok(q.unlocked === 1 && G.nextUnsolved(q) === 1, "replaying doesn't over-unlock");
  ({ prog: q } = G.recordLevel(q, 99, 20, 1));
  ok(q.unlocked === 99, "unlock capped at last level");
}

// Time Challenge
for (const tier of Object.keys(G.CHALLENGES)) {
  const run = G.makeRun(tier, E.rng(11));
  const specs = G.CHALLENGES[tier].specs;
  ok(run.length === specs.length && run.every((pz, k) => pz && pz.n === specs[k][0] && pz.board && E.minMoves(pz.n, pz.board) === pz.opt && pz.opt <= specs[k][2]), `${tier} run: ${run.map((x) => x?.opt).join(",")}`);
  const total = G.CHALLENGES[tier].time * 1000;
  ok(G.timeLeft(tier, total + 5) === 0 && G.timeLeft(tier, 1000) === total - 1000, `${tier} countdown`);
  ok(G.challengeStars(total * 0.6, tier) === 3 && G.challengeStars(total * 0.3, tier) === 2 && G.challengeStars(1, tier) === 1, `${tier} stars by time left`);
}
{
  let q = G.normalize(null), res;
  ({ prog: q, result: res } = G.recordChallenge(q, "easy", 40000));
  ok(q.ch.easy.ms === 40000 && res.stars === 3 && res.newTime && q.ch.easy.wins === 1, "first challenge win recorded");
  ({ prog: q, result: res } = G.recordChallenge(q, "easy", 80000));
  ok(q.ch.easy.ms === 40000 && q.ch.easy.stars === 3 && res.stars === 1 && !res.newTime && q.ch.easy.wins === 2, "slower run keeps best");
}

// clock: pause / resume / penalty
{
  const c = G.createClock();
  c.start(1000); ok(c.elapsed(1500) === 500, "clock runs");
  c.stop(2000); ok(c.elapsed(9000) === 1000 && !c.running(), "paused clock holds");
  c.start(10000); c.start(11000); ok(c.elapsed(12000) === 3000, "double start is harmless");
  c.add(G.HINT_PENALTY); ok(c.elapsed(12000) === 13000, "hint penalty added");
  c.reset(20000); ok(c.elapsed(25000) === 5000 && c.running(), "reset while running restarts from now");
  c.stop(30000); c.reset(40000); ok(c.elapsed(50000) === 0 && !c.running(), "reset while paused stays paused");
  ok(G.fmt(0) === "0:00" && G.fmt(90000) === "1:30" && G.fmt(9001) === "0:10" && G.fmtExact(61500) === "1:01.5", "formatting");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
