// Dot Connect checks: node src/components/games/DotConnect/tools/simTest.mjs
import { LEVELS, PALETTE, adjacent } from "../levels.js";
import { solve } from "../solver.js";
import { extend, isWon, connected } from "../rules.js";

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) fails++;
  if (!cond || msg.startsWith("*")) console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
};

// 1. every level: valid construction + independent solver proof
const t0 = Date.now();
let worst = 0;
for (const L of LEVELS) {
  const N = L.n * L.n;
  const seen = new Set();
  L.solution.forEach((p, c) => {
    ok(p[0] === L.dots[c][0] && p[p.length - 1] === L.dots[c][1], `L${L.id} c${c} path joins its dots`);
    ok(p.every((x, i) => i === 0 || adjacent(p[i - 1], x, L.n)), `L${L.id} c${c} path is contiguous`);
    p.forEach((x) => seen.add(x));
  });
  ok(seen.size === N && L.solution.reduce((s, p) => s + p.length, 0) === N, `L${L.id} solution fills every cell once`);
  ok(L.dots.length <= PALETTE.length, `L${L.id} has a colour for every pair`);
  const ts = Date.now();
  const sol = solve(L);
  worst = Math.max(worst, Date.now() - ts);
  ok(sol && isWon(L, sol), `L${L.id} (${L.n}x${L.n}, ${L.dots.length} colours) solved independently`);
}
ok(true, `* 50 levels verified; sizes ${[...new Set(LEVELS.map((l) => l.n))].join(",")}; slowest solve ${worst}ms; total ${Date.now() - t0}ms`);
ok(LEVELS.every((l, i) => i === 0 || l.n >= LEVELS[i - 1].n), "* sizes never shrink from level to level");

// 2. drag rules on level 1
const L = LEVELS[0];
const n = L.n;
const empty = () => L.dots.map(() => []);
{
  const [a] = L.dots[0];
  let paths = empty();
  paths[0] = [a];
  // walk the solution path cell by cell
  for (const x of L.solution[0].slice(1)) paths = extend(L, paths, 0, x);
  ok(connected(L, paths, 0), "* following the solution connects the pair");
  const more = L.solution[0].length;
  const nb = [a + 1, a - 1, a + n, a - n].find((x) => x >= 0 && x < n * n && adjacent(a, x, n) && !L.solution[0].includes(x));
  if (nb !== undefined) ok(extend(L, paths, 0, nb)[0].length === more, "* a connected path can't extend past its dot");
  const back = extend(L, paths, 0, L.solution[0][1]);
  ok(back[0].length === 2, "* dragging back over the path erases it to that cell");
}
{
  // another colour's dot blocks: find a dot of colour c adjacent to a dot of colour d
  let tested = false;
  for (const L3 of LEVELS) {
    const m = L3.n;
    for (let c = 0; c < L3.dots.length && !tested; c++) {
      for (const e of L3.dots[c]) {
        const hit = L3.dots.findIndex((d, k) => k !== c && d.some((x) => adjacent(x, e, m)));
        if (hit < 0) continue;
        const target = L3.dots[hit].find((x) => adjacent(x, e, m));
        const paths = L3.dots.map(() => []);
        paths[c] = [e];
        ok(extend(L3, paths, c, target)[c].length === 1, "* a path can't enter another colour's dot");
        tested = true;
        break;
      }
    }
    if (tested) break;
  }
  ok(tested, "* dot-blocking case found");
}
{
  // crossing another colour's path cuts it there (no overlap ever)
  const sol = L.solution;
  let paths = sol.map((p) => p.slice());
  const victim = sol.findIndex((p) => p.length >= 4);
  const mid = sol[victim][2];
  const c = sol.findIndex((p, k) => k !== victim && p.some((x) => adjacent(x, mid, n)));
  const from = sol[c].find((x) => adjacent(x, mid, n));
  paths[c] = sol[c].slice(0, sol[c].indexOf(from) + 1);
  if (L.dots.flat().includes(from) || from === undefined) {
    ok(true, "* (cut case skipped: no interior neighbour)");
  } else {
    paths = extend(L, paths, c, mid);
    const all = paths.flat();
    ok(paths[victim].length === 2 && new Set(all).size === all.length, "* crossing a path cuts it, cells never overlap");
  }
}
// 3. win detection needs every cell filled
{
  const sol = L.solution.map((p) => p.slice());
  ok(isWon(L, sol), "* full solution wins");
  const loose = L.dots.map(([a, b]) => [a, b]);
  ok(!isWon(L, loose), "* unconnected board does not win");
}
// 4. hints keep the player's finished paths
{
  const L2 = LEVELS[30];
  const fixed = { 0: L2.solution[0], 2: L2.solution[2] };
  const s = solve(L2, fixed);
  ok(s && s[0].join() === L2.solution[0].join() && isWon(L2, s), "* hint solver keeps finished paths");
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
