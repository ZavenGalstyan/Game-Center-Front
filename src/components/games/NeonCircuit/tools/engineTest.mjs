/**
 * Headless rules + level checks:  node src/components/games/NeonCircuit/tools/engineTest.mjs
 * Toggle pattern (centre / edges / corners, no diagonals), solver vs brute
 * force, stars, every level in ../levels.js (solvable, optimum, not solved,
 * no duplicates, tiers ordered by complexity), and hint-following from
 * random mid-game states.
 */
import * as E from "../engine.js";
import { LEVELS } from "../levels.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));
const cells = (n, b) => [...Array(n * n).keys()].filter((i) => E.isOn(b, i)).sort((a, z) => a - z).join(",");

// toggle pattern on 5×5 (index r*5+c)
ok(cells(5, E.press(5, 0, 12)) === "7,11,12,13,17", "centre toggles self + 4 neighbours");
ok(cells(5, E.press(5, 0, 0)) === "0,1,5", "top-left corner toggles 3");
ok(cells(5, E.press(5, 0, 24)) === "19,23,24", "bottom-right corner toggles 3");
ok(cells(5, E.press(5, 0, 2)) === "1,2,3,7", "top edge toggles 4");
ok(cells(5, E.press(5, 0, 10)) === "5,10,11,15", "left edge toggles 4 (no wrap to row above)");
ok(cells(5, E.press(5, 0, 14)) === "9,13,14,19", "right edge toggles 4 (no wrap to next row)");
ok(cells(3, E.press(3, 0, 4)) === "1,3,4,5,7", "3×3 centre");
ok(cells(4, E.press(4, 0, 3)) === "2,3,7", "4×4 top-right corner");
for (const n of [3, 4, 5])
  for (let i = 0; i < n * n; i++) {
    const b = E.press(n, 0, i), r = (i / n) | 0, c = i % n;
    const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dr, dc]) => r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n && E.isOn(b, (r + dr) * n + c + dc));
    ok(!diag, `no diagonal toggles n=${n} i=${i}`);
    ok(E.press(n, b, i) === 0, `pressing twice restores n=${n} i=${i}`);
  }

// solver vs brute force (3×3 exhaustive, 4×4 exhaustive)
for (const n of [3, 4]) {
  const N = n * n, best = new Map();
  for (let s = 0; s < 1 << N; s++) {
    const b = E.apply(n, s), w = E.lit(s);
    if (!best.has(b) || best.get(b) > w) best.set(b, w);
  }
  let bad = 0;
  for (const [b, w] of best) {
    const sol = E.solve(n, b);
    if (E.lit(sol) !== w || E.apply(n, sol) !== b) bad++;
  }
  ok(bad === 0, `solver optimum matches brute force on every ${n}×${n} board (${best.size})`);
  if (n === 4) ok(best.size === 4096, "4×4 has 2^12 solvable boards (nullity 4)");
}
// 5×5: random cross-checks, and unsolvable boards rejected
{
  const r = E.rng(7);
  let bad = 0;
  for (let t = 0; t < 3000; t++) {
    const s = Math.floor(r() * 2 ** 25), b = E.apply(5, s), sol = E.solve(5, b);
    if (sol == null || E.apply(5, sol) !== b || E.lit(sol) > E.lit(s)) bad++;
  }
  ok(bad === 0, "5×5 solver solutions clear the board and are never heavier than the generating set");
  ok(E.solve(5, 1) === null, "single lit corner on 5×5 is unsolvable");
  ok(E.solve(4, 1) === null, "single lit corner on 4×4 is unsolvable");
  ok(E.minMoves(5, 0) === 0 && E.hint(5, 0) === -1, "solved board: 0 moves, no hint");
}

// stars
ok(E.stars(5, 5) === 3 && E.stars(4, 5) === 3, "optimum = 3 stars");
ok(E.stars(8, 5) === 2 && E.stars(9, 5) === 1, "opt 5: +3 → 2 stars, +4 → 1 star");
ok(E.stars(4, 2) === 2 && E.stars(5, 2) === 1, "opt 2: +2 → 2 stars");

// levels
ok(LEVELS.length === 100, "100 levels");
const seen = new Set(), tiers = { easy: 0, medium: 0, hard: 0 };
let prevTier = 0;
LEVELS.forEach(([n, b, opt, tier], i) => {
  ok([3, 4, 5].includes(n) && b >= 0 && b < 2 ** (n * n), `L${i + 1} well-formed`);
  ok(b !== 0 && E.lit(b) >= 3 && opt >= 2, `L${i + 1} not solved / not trivial`);
  ok(E.minMoves(n, b) === opt, `L${i + 1} stored optimum ${opt} = GF(2) optimum ${E.minMoves(n, b)}`);
  const key = `${n}:${E.canonical(n, b)}`;
  ok(!seen.has(key), `L${i + 1} unique up to symmetry`);
  seen.add(key);
  const t = ["easy", "medium", "hard"].indexOf(tier);
  ok(t >= prevTier, `L${i + 1} tiers in order`);
  prevTier = t;
  tiers[tier]++;
});
ok(tiers.easy === 30 && tiers.medium === 35 && tiers.hard === 35, `tier sizes ${JSON.stringify(tiers)}`);
const avg = (t) => { const l = LEVELS.filter((x) => x[3] === t); return l.reduce((a, x) => a + x[2], 0) / l.length; };
ok(avg("easy") < avg("medium") && avg("medium") < avg("hard"), `avg optimum rises by tier ${avg("easy").toFixed(1)} / ${avg("medium").toFixed(1)} / ${avg("hard").toFixed(1)}`);

// hints: from random mid-game states, following hints reaches 0 in exactly the optimum
{
  const r = E.rng(99);
  let bad = 0, runs = 0;
  for (const [n, start] of LEVELS)
    for (let k = 0; k < 4; k++) {
      let b = start;
      for (let j = 0; j < Math.floor(r() * 6); j++) b = E.press(n, b, Math.floor(r() * n * n));
      const need = E.minMoves(n, b);
      let steps = 0;
      while (b && steps < 40) {
        const h = E.hint(n, b, Math.floor(r() * n * n));
        if (E.minMoves(n, E.press(n, b, h)) !== E.minMoves(n, b) - 1) bad++;
        b = E.press(n, b, h);
        steps++;
      }
      runs++;
      if (b || steps !== need) bad++;
    }
  ok(bad === 0, `hints from ${runs} random mid-game states each cut the optimum by 1 and finish in exactly the optimum`);
}

// runtime generator (Time Challenge)
{
  const r = E.rng(3);
  let bad = 0;
  for (const [n, lo, hi] of [[3, 3, 5], [4, 4, 6], [5, 5, 8], [5, 9, 12]])
    for (let k = 0; k < 40; k++) {
      const p = E.generate(n, lo, hi, r);
      if (!p || p.board === 0 || p.opt < lo || p.opt > hi || E.minMoves(n, p.board) !== p.opt) bad++;
    }
  ok(bad === 0, "Time Challenge generator yields in-range solvable puzzles");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
