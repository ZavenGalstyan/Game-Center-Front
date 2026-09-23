/**
 * Laser Maze — engine rule tests (Node, no framework):
 *   node src/components/games/LaserMaze/tools/engineTests.mjs
 * Each case builds a tiny board with the real parser and checks the real
 * tracer. Covers the reflection tables and every anti-bug case the design
 * calls out (walls, loops, portals, splitter recursion, colors, gates).
 */
import { compileLevel, initialState, sanitizeState } from "../engine/level.js";
import { traceBeams } from "../engine/trace.js";
import { applyMove, solve, listMoves } from "../engine/moves.js";
import { REFLECT, UP, RIGHT, DOWN, LEFT } from "../engine/constants.js";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error("✗", name);
  }
}
const L = (map, id = 999) => compileLevel({ id, name: "t", map });
const T = (map) => {
  const lv = L(map);
  return { lv, tr: traceBeams(lv, initialState(lv)) };
};

// Reflection tables exactly as specified.
check("/ UP→RIGHT", REFLECT["/"][UP] === RIGHT);
check("/ RIGHT→UP", REFLECT["/"][RIGHT] === UP);
check("/ DOWN→LEFT", REFLECT["/"][DOWN] === LEFT);
check("/ LEFT→DOWN", REFLECT["/"][LEFT] === DOWN);
check("\\ UP→LEFT", REFLECT["\\"][UP] === LEFT);
check("\\ LEFT→UP", REFLECT["\\"][LEFT] === UP);
check("\\ DOWN→RIGHT", REFLECT["\\"][DOWN] === RIGHT);
check("\\ RIGHT→DOWN", REFLECT["\\"][RIGHT] === DOWN);

// Straight shot into a target.
check("straight hit", T(`>r . Tr`).tr.solved);
// Wall blocks, target behind never lit.
check("wall blocks", !T(`>r # Tr`).tr.solved);
// Beam does not stop before a valid target (long corridor).
check("long corridor", T(`>r . . . . . . . Tr`).tr.solved);
// Every source direction.
check("source up", T(`Tr\n.\n^r`).tr.solved);
check("source down", T(`vr\n.\nTr`).tr.solved);
check("source left", T(`Tr . <r`).tr.solved);
// Mirrors in both orientations, in the real (x,y) sense.
check("/ reflects right→up", T(`. . Tr\n>r . /!`).tr.solved);
check("\\ reflects right→down", T(`>r . \\!\n. . Tr`).tr.solved);
// Rotating toggles and matches.
{
  const lv = L(`>r . /\n. . Tr`);
  let s = initialState(lv);
  check("rot start unsolved", !traceBeams(lv, s).solved);
  s = applyMove(lv, s, { t: "rot", i: 0 });
  check("rot once solves", traceBeams(lv, s).solved);
  s = applyMove(lv, s, { t: "rot", i: 0 });
  check("rot twice back", !traceBeams(lv, s).solved && s.rot[0] === 0);
}
// Wrong color: red into blue target → not lit, flagged wrong.
{
  const { tr } = T(`>r . Tb`);
  check("wrong color not lit", !tr.solved && tr.targetWrong[0]);
}
// Additive: red+blue at a purple target lights it; red alone does not.
check("purple needs both", T(`>r . Tp . <b`).tr.solved);
check("red alone ≠ purple", !T(`>r . Tp . .`).tr.solved);
// Extra light is a mismatch: red+blue at a red target.
check("extra color mismatches", !T(`>r . Tr . <b`).tr.solved);
// Mirror loop terminates (4 fixed mirrors in a ring + splitter feeding it).
{
  const { tr } = T(`
    . /! . \\!
    >r S\\! . .
    . \\! . /!
    Tr . . .
  `);
  check("mirror loop terminates", !tr.capped && tr.segments.length < 100);
}
// Portal loop terminates: two portals facing each other through mirrors.
{
  const { tr } = T(`
    >r @1 . @1 .
    .  .  . .  Tr
  `);
  check("portal pass-through", !tr.capped);
  const { tr: tr2 } = T(`>r @1 . @1 Tr`);
  check("portal delivers", tr2.solved);
  const { tr: tr3 } = T(`
    . . . . .
    >r @1 /! . .
    . .  @1 . Tr
  `);
  check("portal+mirror loop terminates", !tr3.capped);
}
// Splitter: both branches.
{
  const { tr } = T(`
    >r . S\\! . Ta
  `.replace("Ta", "Tr"));
  check("splitter passes straight", tr.solved);
  const { tr: t2 } = T(`>r . S\\! .\n. . Tr .`);
  check("splitter reflects", t2.solved);
}
// Splitter lattice doesn't explode (dense grid of splitters).
{
  const row = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? "S/!" : "S\\!")).join(" ");
  const map = [`>r ${row(9)}`, ...Array.from({ length: 8 }, () => `. ${row(9)}`)].join("\n");
  const { tr } = T(map + "\n. . . . . . . . . Tr");
  check("splitter lattice bounded", !tr.capped && tr.segments.length < 2000);
}
// Filters.
check("yellow filter on white passes", !T(`>w Fy Ty`).tr.targetWrong[0] && T(`>w Fy Ty`).tr.solved);
check("blue filter on red blocks", !T(`>r Fb Tr`).tr.solved && T(`>r Fb Tr`).tr.targetWrong[0] === false);
check("red filter on yellow → red", T(`>y Fr Tr`).tr.solved);
// Prism: white moving right → red turns left (up), green straight, blue right (down).
{
  const { tr } = T(`
    .  .  Tr .
    >w .  P  Tg
    .  .  Tb .
  `);
  check("prism splits RGB", tr.solved);
  check("prism single blue bends right", T(`>b P .\n. Tb .`).tr.solved);
}
// Gates: switch in the beam opens the gate further along.
check("switch opens gate", T(`>r *1 G1 Tr`).tr.solved);
check("closed gate blocks", !T(`>r . G1 Tr\n. . . *1`).tr.solved);
// Gate fixed point: beam opens gate A, which lets it reach switch B for gate B.
check("chained gates", T(`>r *1 G1 *2 G2 Tr`).tr.solved);
// Order dependence: gate before its own switch stays shut (no self-opening).
check("gate before its switch stays shut", !T(`>r G1 *1 Tr`).tr.solved);
// Target activation disappears with the beam (pure function of state).
{
  const lv = L(`>r . \\ Tr`);
  let s = initialState(lv);
  check("lit→unlit start", !traceBeams(lv, s).solved);
  s = applyMove(lv, s, { t: "rot", i: 0 });
  check("unlit after rotate away", !traceBeams(lv, s).solved);
}
// Movable mirrors: only designated empty slots.
{
  const lv = L(`>r . o Tr\n. . M/ .`);
  const s0 = initialState(lv);
  const mv = listMoves(lv, s0);
  check("movable only to empty slot", mv.length === 1 && mv[0].s === 0);
  const s1 = applyMove(lv, s0, mv[0]);
  check("moved mirror reflects", !traceBeams(lv, s1).solved);
  const lv2 = L(`>r . o .\n. . M\\ .\n. . Tr .`);
  const r2 = solve(lv2, initialState(lv2));
  check("movable solve = 1", r2 && r2.solution.length === 1);
}
// Gears: crank flips geared mirror & toggles shutter.
{
  const lv = L(`>r h1:01 g1:/\\ .\nC1 . . .\n. . Tr .`);
  let s = initialState(lv);
  check("gears start shut", !traceBeams(lv, s).solved);
  s = applyMove(lv, s, { t: "crank", i: 0 });
  check("gears one turn", traceBeams(lv, s).solved);
  s = applyMove(lv, s, { t: "crank", i: 0 });
  check("gears wrap around", s.crank[0] === 0);
}
// Source blocks beams.
check("source blocks", !T(`>r . <b . Tr`).tr.solved);
// Save sanitizer rejects malformed state.
{
  const lv = L(`>r . / Tr`);
  check("sanitize ok", sanitizeState(lv, { rot: [1], mov: [], crank: [] }) !== null);
  check("sanitize bad", sanitizeState(lv, { rot: [2], mov: [], crank: [] }) === null);
  check("sanitize missing", sanitizeState(lv, { rot: [] }) === null);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
