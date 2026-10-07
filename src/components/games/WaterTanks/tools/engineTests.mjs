/**
 * Water Tanks — rule / solver / validator tests (Node, no framework):
 *   node src/components/games/WaterTanks/tools/engineTests.mjs
 */
import {
  calculateTransfer, initialState, applyPour, applyMove, isValidPour, pourBlockReason, isSolved,
  serializeState, generateNextStates, totalWater, legalMoves, cloneState, targetStatus,
} from "../engine/rules.js";
import { solve, hintMove } from "../engine/solver.js";
import { compileLevel } from "../engine/level.js";
import { validateLevel } from "../engine/validate.js";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error("✗", name);
  }
}
const L = (raw) => compileLevel({ name: "t", ...raw }, { id: 999 });
const withAmounts = (lv, amounts) => ({ ...initialState(lv), amounts });

/* ---------- calculateTransfer */
check("8→empty 5 moves 5", calculateTransfer(8, 0, 5) === 5);
check("8→2/5 moves 3", calculateTransfer(8, 2, 5) === 3);
check("0→0/5 moves 0", calculateTransfer(0, 0, 5) === 0);
check("4→2/2 moves 0", calculateTransfer(4, 2, 2) === 0);
check("1→0/5 moves 1", calculateTransfer(1, 0, 5) === 1);

/* ---------- applyPour: spec examples */
{
  const lv = L({ tanks: [{ cap: 8, start: 8 }, { cap: 5 }], target: 3 });
  const r = applyPour(lv, initialState(lv), 0, 1);
  check("8/8→0/5 = 3/8, 5/5", r && r.state.amounts.join() === "3,5" && r.amount === 5);
  const s2 = withAmounts(lv, [8, 2]);
  const r2 = applyPour(lv, s2, 0, 1);
  check("8/8→2/5 = 5/8, 5/5", r2 && r2.state.amounts.join() === "5,5" && r2.amount === 3);
  check("input state not mutated", s2.amounts.join() === "8,2");
  const s3 = withAmounts(lv, [0, 0]);
  check("0/8→0/5 invalid", applyPour(lv, s3, 0, 1) === null && pourBlockReason(lv, s3, 0, 1) === "empty");
  check("same tank invalid", pourBlockReason(lv, initialState(lv), 0, 0) === "same" && !isValidPour(lv, initialState(lv), 1, 1));
}
{
  const lv = L({ tanks: [{ cap: 4, start: 4 }, { cap: 2, start: 2 }], target: 1 });
  check("4/4→2/2 invalid (full)", pourBlockReason(lv, initialState(lv), 0, 1) === "full" && applyPour(lv, initialState(lv), 0, 1) === null);
}

/* ---------- conservation over every reachable state of a 3-tank puzzle */
{
  const lv = L({ tanks: [{ cap: 8, start: 8 }, { cap: 5 }, { cap: 3 }], target: 4 });
  const seen = new Set();
  let frontier = [initialState(lv)];
  let ok = true;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      for (const { state } of generateNextStates(lv, s)) {
        if (totalWater(state) !== 8) ok = false;
        if (state.amounts.some((a, i) => a < 0 || a > lv.tanks[i].capacity || !Number.isInteger(a))) ok = false;
        const k = serializeState(state);
        if (!seen.has(k)) {
          seen.add(k);
          next.push(state);
        }
      }
    }
    frontier = next;
  }
  check("8-5-3: water conserved in every reachable state", ok);
  check("8-5-3: 16 reachable states", seen.size === 16);
  check("serialize plain state", serializeState(initialState(lv)) === "8,0,0");
  const sol = solve(lv, initialState(lv));
  check("8-5-3 → 4 L in 6 moves", sol.moves && sol.moves.length === 6);
  // replay the solution through the rules
  let s = initialState(lv);
  for (const m of sol.moves) s = applyMove(lv, s, m).state;
  check("solution replays to solved", isSolved(lv, s));
  const h = hintMove(lv, initialState(lv));
  check("hint is a legal first move", h && isValidPour(lv, initialState(lv), h.from, h.to));
  // no-change transitions are never generated
  check("legalMoves never no-op", legalMoves(lv, withAmounts(lv, [3, 5, 0])).every((m) => applyMove(lv, withAmounts(lv, [3, 5, 0]), m)));
}

/* ---------- win conditions */
{
  const lv = L({ tanks: [{ cap: 8, start: 4 }, { cap: 5, start: 4 }, { cap: 3 }], target: [4, 4] });
  check("two free 4 L targets need two tanks", isSolved(lv, initialState(lv)));
  check("one 4 L isn't enough", !isSolved(lv, withAmounts(lv, [4, 1, 3])));
  const lb = L({ tanks: [{ cap: 8, start: 4 }, { cap: 5, start: 4 }, { cap: 3 }], target: "B:4" });
  check("bound target on B", isSolved(lb, initialState(lb)) && !isSolved(lb, withAmounts(lb, [4, 3, 1])));
  const mix = L({ tanks: [{ cap: 8, start: 4 }, { cap: 5, start: 4 }, { cap: 3 }], target: ["A:4", 4] });
  check("bound + free must use different tanks", isSolved(mix, initialState(mix)) && !isSolved(mix, withAmounts(mix, [4, 1, 3])));
  check("targetStatus lights both", targetStatus(mix, initialState(mix)).every(Boolean));
}

/* ---------- valves */
{
  const lv = L({ tanks: [{ cap: 5, start: 5 }, { cap: 3, start: 1 }], target: 4, valves: ["A>B"] });
  check("valve allows A→B", isValidPour(lv, withAmounts(lv, [5, 0]), 0, 1));
  check("valve blocks B→A", pourBlockReason(lv, initialState(lv), 1, 0) === "valve");
}

/* ---------- locks */
{
  const lv = L({ tanks: [{ cap: 5, start: 5 }, { cap: 3 }, { cap: 4, lock: "A:2" }], target: "C:2" });
  const s0 = initialState(lv);
  check("locked dest refuses", pourBlockReason(lv, s0, 0, 2) === "locked-dest");
  const r = applyPour(lv, s0, 0, 1);
  check("unlocks when A = 2", r.state.unlocked[2] && r.unlockedNow.join() === "2");
  const r2 = applyPour(lv, r.state, 1, 0); // A back to 5 — stays unlocked
  check("stays unlocked", r2.state.unlocked[2]);
  check("lock puzzle solvable", solve(lv, s0).moves.length === 2);
  check("serialize includes lock bits", serializeState(s0).includes("|001") || serializeState(s0).includes("|110"));
}

/* ---------- inlet-only */
{
  const lv = L({ tanks: [{ cap: 5, start: 5 }, { cap: 3, inlet: true }], target: 2 });
  const r = applyPour(lv, initialState(lv), 0, 1);
  check("inlet can't pour", pourBlockReason(lv, r.state, 1, 0) === "inlet");
}

/* ---------- fill / drain with limited uses */
{
  const lv = L({ tanks: [{ cap: 5, fill: 2 }, { cap: 3, drain: true }], target: 4 });
  const s0 = initialState(lv);
  const f = applyMove(lv, s0, { kind: "fill", tank: 0 });
  check("fill tops up", f.state.amounts.join() === "5,0" && f.state.fillLeft[0] === 1 && f.amount === 5);
  check("fill full tank invalid", applyMove(lv, f.state, { kind: "fill", tank: 0 }) === null);
  const d = applyMove(lv, applyPour(lv, f.state, 0, 1).state, { kind: "drain", tank: 1 });
  check("drain empties", d.state.amounts.join() === "2,0" && d.amount === 3);
  check("no drain on A", applyMove(lv, f.state, { kind: "drain", tank: 0 }) === null);
  const sol = solve(lv, s0);
  check("5/3 fill+drain → 4 solvable", sol.moves !== null);
  // uses run out
  const one = L({ tanks: [{ cap: 5, fill: 1 }, { cap: 3 }], target: 1 });
  check("one fill only → 1 L unreachable", solve(one, initialState(one)).moves === null);
}

/* ---------- undo restoration (history = snapshots, as the game does) */
{
  const lv = L({ tanks: [{ cap: 8, start: 8 }, { cap: 5 }, { cap: 3 }], target: 4 });
  let s = initialState(lv);
  const history = [];
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    history.push(cloneState(s));
    s = applyPour(lv, s, a, b).state;
  }
  check("three pours", s.amounts.join() === "6,2,0");
  s = history.pop();
  check("undo 1", s.amounts.join() === "3,2,3");
  s = history.pop();
  s = history.pop();
  check("undo to start", serializeState(s) === "8,0,0" && history.length === 0);
}

/* ---------- validator */
{
  check("valid level passes", validateLevel(L({ tanks: [{ cap: 4, start: 4 }, { cap: 2 }], target: 2, optimal: 1 })).ok);
  check("over-capacity start fails", !validateLevel(L({ tanks: [{ cap: 4, start: 5 }, { cap: 2 }], target: 2 })).ok);
  check("unsolvable fails", !validateLevel(L({ tanks: [{ cap: 4, start: 4 }, { cap: 2 }], target: 3 })).ok);
  check("wrong optimal fails", !validateLevel(L({ tanks: [{ cap: 4, start: 4 }, { cap: 2 }], target: 2, optimal: 3 })).ok);
  check("already solved fails", !validateLevel(L({ tanks: [{ cap: 4, start: 2 }, { cap: 2 }], target: 2 })).ok);
  check("target bigger than any tank fails", !validateLevel(L({ tanks: [{ cap: 4, start: 4 }, { cap: 2 }], target: 6 })).ok);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
