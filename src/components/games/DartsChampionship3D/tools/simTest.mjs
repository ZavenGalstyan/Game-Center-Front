// Darts Championship 3D — headless checks.
// node src/components/games/DartsChampionship3D/tools/simTest.mjs
import { ORDER, R, SEG, scoreAt, targetPoint, segmentAt } from "../board.js";
import { evaluate, newMatch, applyDart, nextTurn, FIN, chooseTarget, checkoutRoute, aiThrow, average, DIFFICULTY } from "../rules.js";

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
const at = (deg, r) => [r * Math.sin((deg * Math.PI) / 180), r * Math.cos((deg * Math.PI) / 180)];
const hitAt = (deg, r) => scoreAt(...at(deg, r));

/* ---------- board geometry */
eq([...ORDER].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1), "order holds 1..20 once");
eq(ORDER.slice(0, 5), [20, 1, 18, 4, 13], "clockwise from top");
eq([ORDER[5], ORDER[10], ORDER[15]], [6, 3, 11], "6 right, 3 bottom, 11 left");
for (let i = 0; i < 20; i++) {
  const n = ORDER[i], a = i * SEG;
  eq(hitAt(a, 60).score, n, `inner single ${n}`);
  eq(hitAt(a, 130).score, n, `outer single ${n}`);
  eq([hitAt(a, 103).score, hitAt(a, 103).label], [3 * n, `T${n}`], `treble ${n}`);
  eq([hitAt(a, 166).score, hitAt(a, 166).double], [2 * n, true], `double ${n}`);
  eq(hitAt(a, 175).score, 0, `miss beyond ${n}`);
  // segment edges: just inside each side stays this number
  eq(hitAt(a - SEG / 2 + 0.05, 130).num, n, `left edge ${n}`);
  eq(hitAt(a + SEG / 2 - 0.05, 130).num, n, `right edge ${n}`);
  eq(hitAt(a + SEG / 2 + 0.05, 130).num, ORDER[(i + 1) % 20], `next past ${n}`);
  const tp = targetPoint(`T${n}`), dp = targetPoint(`D${n}`), sp = targetPoint(`S${n}`);
  eq(scoreAt(tp.x, tp.y).label, `T${n}`, `T target ${n}`);
  eq(scoreAt(dp.x, dp.y).label, `D${n}`, `D target ${n}`);
  eq(scoreAt(sp.x, sp.y).label, `${n}`, `S target ${n}`);
}
eq(hitAt(8.99, 130).num, 20, "8.99° is 20");
eq(hitAt(9.01, 130).num, 1, "9.01° is 1");
eq(hitAt(351.01, 130).num, 20, "351.01° is 20");
eq(hitAt(350.99, 130).num, 5, "350.99° is 5");
eq(segmentAt(359.999), 20, "wraps to 20");
// ring boundaries (wire positions are inclusive of the scoring bed)
const ring = (r) => hitAt(0, r).ring;
eq([ring(0), ring(R.bull), ring(R.bull + 0.01), ring(R.outerBull), ring(R.outerBull + 0.01)], ["inner-bull", "inner-bull", "outer-bull", "outer-bull", "single"], "bull rings");
eq([ring(98.99), ring(99), ring(107), ring(107.01)], ["single", "treble", "treble", "single"], "treble ring");
eq([ring(161.99), ring(162), ring(170), ring(170.01)], ["single", "double", "double", "miss"], "double ring");
eq(scoreAt(0, 0), { score: 50, mult: 2, num: 25, ring: "inner-bull", label: "BULL", double: true }, "bullseye");
eq(scoreAt(10, 3).score, 25, "outer bull");
eq(scoreAt(10, 3).double, false, "outer bull is not a double");
eq(scoreAt(0, -103).label, "T3", "bottom treble is 3");
eq(scoreAt(-103, 0).label, "T11", "left treble is 11");
eq(scoreAt(103, 0).label, "T6", "right treble is 6");

/* ---------- rules */
const H = (label) => {
  const p = targetPoint(label);
  return scoreAt(p.x, p.y);
};
eq(evaluate(40, H("D20")), { type: "win", rem: 0 }, "D20 checks out 40");
eq(evaluate(50, H("BULL")), { type: "win", rem: 0 }, "bull checks out 50");
eq(evaluate(20, H("S20")), { type: "bust", rem: 20 }, "single to zero busts");
eq(evaluate(20, H("T20")), { type: "bust", rem: 20 }, "below zero busts");
eq(evaluate(21, H("S20")), { type: "bust", rem: 21 }, "leaving 1 busts");
eq(evaluate(25, H("25")), { type: "bust", rem: 25 }, "outer bull can't finish");
eq(evaluate(100, H("T20")), { type: "ok", rem: 40 }, "normal score");
eq(evaluate(30, scoreAt(500, 0)), { type: "ok", rem: 30 }, "miss scores zero");

let m = newMatch(501);
for (const l of ["T20", "T20", "T20"]) m = applyDart(m, H(l)).m;
eq([m.rem[0], m.turns[0], m.best[0]], [321, [180], 180], "180 turn");
ok(m.darts.length === 3, "turn holds 3 darts");
let threw = false;
try { applyDart(m, H("S1")); } catch { threw = true; }
ok(threw, "4th dart refused");
m = nextTurn(m);
eq([m.player, m.turnStart, m.darts.length], [1, 501, 0], "next turn to CPU");

// bust restores turn-start score and ends the turn early
m = { ...newMatch(301), rem: [32, 301], turnStart: 32 };
let r = applyDart(m, H("S10"));
eq([r.m.rem[0], r.outcome.turnOver], [22, false], "22 left");
r = applyDart(r.m, H("T10"));
eq([r.outcome.type, r.outcome.turnOver, r.m.rem[0], r.m.turns[0]], ["bust", true, 32, ["BUST"]], "bust restores 32");
eq(r.m.thrown[0], 2, "bust darts still counted");

// double-out finish
m = { ...newMatch(301), rem: [61, 120], turnStart: 61 };
r = applyDart(m, H("25"));
r = applyDart(r.m, H("D18"));
eq([r.outcome.type, r.m.over, r.m.winner, r.m.checkout], ["win", true, 0, 61], "61 checkout via 25-D18");

/* ---------- checkout table */
eq([FIN[170], FIN[169], FIN[168], FIN[167], FIN[159], FIN[2], FIN[1], FIN[50], FIN[41]], [3, 4, 4, 3, 4, 1, Infinity, 1, 2], "checkout darts");
eq(checkoutRoute(170), ["T20", "T20", "Bull"], "170 route");
eq(checkoutRoute(40), ["D20"], "40 route");
eq(checkoutRoute(3), ["1", "D1"], "3 route");
eq(checkoutRoute(169), null, "169 has no 3-dart finish");
eq(checkoutRoute(100, 1), null, "100 not a one-darter");
eq(chooseTarget(501), "T20", "scores on T20");
for (let rem = 2; rem <= 170; rem++) {
  const route = checkoutRoute(rem, 3);
  ok((route !== null) === (FIN[rem] <= 3), `route exists iff FIN<=3 at ${rem}`);
  // AI never aims at something that busts with a perfect hit
  ok(evaluate(rem, H(chooseTarget(rem))).type !== "bust", `AI aim at ${rem} safe`);
}

/* ---------- full AI matches */
const stats = {};
for (const level of Object.keys(DIFFICULTY)) {
  const rand = rng(level.length * 977);
  let darts = 0, legs = 0, maxDarts = 0, sumAvg = 0;
  for (const start of [301, 501]) {
    for (let g = 0; g < 200; g++) {
      let mm = newMatch(start, g % 2);
      let guard = 0;
      while (!mm.over && guard++ < 3000) {
        const res = applyDart(mm, aiThrow(mm.rem[mm.player], level, rand).hit);
        mm = res.m;
        ok(mm.rem[0] >= 0 && mm.rem[1] >= 0 && mm.rem[0] !== 1 && mm.rem[1] !== 1, "remaining never negative or 1");
        if (res.outcome.turnOver && !mm.over) mm = nextTurn(mm);
      }
      ok(mm.over, `${level} ${start} match finishes`);
      ok(mm.rem[mm.winner] === 0, "winner on zero");
      const wd = mm.thrown[mm.winner];
      darts += wd;
      maxDarts = Math.max(maxDarts, wd);
      sumAvg += average(mm, mm.winner);
      legs++;
    }
  }
  stats[level] = { avgDartsPerLeg: +(darts / legs).toFixed(1), maxDarts, threeDartAvg: +(sumAvg / legs).toFixed(1) };
}
console.log(stats);
ok(stats.hard.threeDartAvg > stats.medium.threeDartAvg && stats.medium.threeDartAvg > stats.easy.threeDartAvg, "harder AI scores more");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
