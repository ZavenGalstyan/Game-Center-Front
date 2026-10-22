/**
 * Headless rules + level checks:  node src/components/games/BlockEscape/tools/engineTest.mjs
 * Movement / collision rules, the solver, stars, and every level in
 * ../levels.js: well-formed, not already solved, BFS optimum === stored par,
 * and following hints from random mid-game states always reaches the exit.
 */
import * as E from "../engine.js";
import { LEVELS } from "../levels.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));

// a hand-made board
//   row0: B B . . . C
//   row1: . . . D . C
//   row2: A A . D . C      ← exit on the right of this row
//   row3: . . . D . .
//   row4: . E E E . .
//   row5: . . . . . .
const L = "BB...C" + "...D.C" + "AA.D.C" + "...D.." + ".EEE.." + "......";
const { blocks, pos } = E.parse(L);
const idx = (ch) => blocks.findIndex((b) => b.ch === ch);
ok(blocks[0].target && blocks[0].h && blocks[0].line === 2 && pos[0] === 0, "target parsed first, horizontal, row 2");
ok(blocks[idx("C")].h === false && blocks[idx("C")].len === 3 && pos[idx("C")] === 0, "vertical length-3 block");
ok(E.serialize(blocks, pos) === L, "serialize round-trips");
ok(JSON.stringify(E.range(blocks, pos, 0)) === "[0,1]", "target stops at D");
ok(JSON.stringify(E.range(blocks, pos, idx("D"))) === "[0,1]", "D can rise to row 0, E stops it below");
ok(JSON.stringify(E.range(blocks, pos, idx("B"))) === "[0,3]", "B slides right until C");
ok(JSON.stringify(E.range(blocks, pos, idx("E"))) === "[0,3]", "E slides along row 4");
ok(JSON.stringify(E.range(blocks, pos, idx("C"))) === "[0,3]", "C slides down to the floor");
ok(E.moves(blocks, pos).every(([i, q]) => q !== pos[i]), "moves never no-op");
ok(E.moves(blocks, pos).every(([i, q]) => { const [lo, hi] = E.range(blocks, pos, i); return q >= lo && q <= hi; }), "moves stay in range");
// collision: no move ever overlaps
for (const [i, q] of E.moves(blocks, pos)) {
  const np = pos.slice();
  np[i] = q;
  const g = E.grid(blocks, np);
  ok([...g].filter((v) => v >= 0).length === blocks.reduce((a, b) => a + b.len, 0), `move ${i}->${q} keeps blocks disjoint`);
}
const sol = E.solve(blocks, pos);
ok(Array.isArray(sol) && sol.length >= 2, "hand board solvable");
let p = pos.slice();
for (const [i, q] of sol) {
  const [lo, hi] = E.range(blocks, p, i);
  ok(q >= lo && q <= hi && q !== p[i], "solution moves legal");
  p[i] = q;
}
ok(E.isSolved(blocks, p), "solution reaches the exit");
// unsolvable: horizontal blocker on the exit row
const bad = E.parse("......" + "......" + "AA..BB" + "......" + "......" + "......");
ok(E.solve(bad.blocks, bad.pos) === null, "blocked exit row is unsolvable");
// stars
ok(E.stars(10, 10) === 3 && E.stars(13, 10) === 2 && E.stars(15, 10) === 2 && E.stars(16, 10) === 1, "stars (par 10)");
ok(E.stars(4, 4) === 3 && E.stars(7, 4) === 2 && E.stars(8, 4) === 1, "stars (par 4)");

// every level
const seen = new Set();
const tiers = { easy: [], medium: [], hard: [] };
let rnd = 12345;
const r = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
LEVELS.forEach(([str, par, tier], n) => {
  ok(str.length === 36 && !seen.has(str), `L${n + 1}: 36 cells, unique`);
  seen.add(str);
  tiers[tier]?.push(par);
  const lv = E.parse(str);
  ok(lv.blocks[0].target && lv.blocks[0].h && lv.blocks[0].line === E.EXIT_ROW && lv.blocks[0].len === 2, `L${n + 1}: target on the exit row`);
  ok(lv.blocks.every((b) => b.len === 2 || b.len === 3), `L${n + 1}: blocks are 2 or 3 long`);
  ok(lv.blocks.every((b, i) => E.cells(b, lv.pos[i]).every((c) => str[c] === b.ch)), `L${n + 1}: straight blocks`);
  ok(!E.isSolved(lv.blocks, lv.pos), `L${n + 1}: not pre-solved`);
  const s = E.solve(lv.blocks, lv.pos);
  ok(s && s.length === par, `L${n + 1}: BFS optimum ${s?.length} === par ${par}`);
  // wander randomly, then follow hints (first step of a fresh BFS each time)
  let q = lv.pos.slice();
  for (let k = 0; k < 15; k++) {
    const ms = E.moves(lv.blocks, q);
    const [i, to] = ms[Math.floor(r() * ms.length)];
    q[i] = to;
  }
  let steps = 0;
  while (!E.isSolved(lv.blocks, q) && steps < 200) {
    const path = E.solve(lv.blocks, q);
    const [i, to] = path[0];
    q = q.slice();
    q[i] = to;
    steps++;
    ok(E.solve(lv.blocks, q).length === path.length - 1, `L${n + 1}: hint step reduces distance by one`);
  }
  ok(E.isSolved(lv.blocks, q), `L${n + 1}: hints reach the exit`);
});
ok(LEVELS.length === 100, "100 levels");
for (const t in tiers) {
  const ps = tiers[t];
  ok(ps.every((v, i) => !i || v >= ps[i - 1]), `${t}: ascending difficulty`);
  console.log(`${t}: ${ps.length} levels, par ${Math.min(...ps)}–${Math.max(...ps)}`);
}
ok(Math.max(...tiers.easy) < Math.min(...tiers.medium) && Math.max(...tiers.medium) < Math.min(...tiers.hard), "tiers separated by par");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
