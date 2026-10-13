/**
 * Headless checks for the Checkers Classic (Russian checkers) rules and AI.
 *   node src/components/games/CheckersClassic/tools/rulesTest.mjs
 */
import assert from "node:assert/strict";
import {
  initialPosition, legalMoves, applyMove, nextSteps, newGame, playMove, notation, count, isDark, WHITE, BLACK,
} from "../rules.js";
import { chooseMove } from "../ai.js";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };
const sq = (n) => (8 - Number(n[1])) * 8 + "abcdefgh".indexOf(n[0]);
/** pos({ c3: "w", d4: "b", a1: "W" }) — lower case men, upper case kings. */
const pos = (spec, side = WHITE) => {
  const b = Array(64).fill(0);
  for (const [k, v] of Object.entries(spec)) b[sq(k)] = { w: 1, W: 2, b: -1, B: -2 }[v];
  return { b, side };
};
const list = (p) => legalMoves(p).map(notation).sort();

/** Independent validator: re-walks a move jump by jump with Russian rules. */
function validate(p, m) {
  const side = p.side, b = p.b.slice();
  let king = Math.abs(b[m.from]) === 2, at = m.from;
  b[m.from] = 0;
  const caps = new Set();
  if (!m.caps.length) {
    const to = m.path[0], dr = (to >> 3) - (at >> 3), dc = (to & 7) - (at & 7);
    assert.equal(Math.abs(dr), Math.abs(dc), "diagonal");
    if (!king) assert.ok(dr === -side && Math.abs(dc) === 1, "man steps one forward");
    for (let k = 1; k <= Math.abs(dr); k++) assert.equal(b[at + k * Math.sign(dr) * 8 + k * Math.sign(dc)], 0, "path clear");
    return;
  }
  m.path.forEach((to, i) => {
    const dr = (to >> 3) - (at >> 3), dc = (to & 7) - (at & 7), n = Math.abs(dr);
    assert.equal(n, Math.abs(dc), "diagonal jump");
    if (!king) assert.equal(n, 2, "man jumps exactly two");
    const cells = [];
    for (let k = 1; k < n; k++) cells.push(at + k * Math.sign(dr) * 8 + k * Math.sign(dc));
    const occ = cells.filter((c) => b[c] !== 0);
    assert.equal(occ.length, 1, "exactly one piece jumped (captured pieces still block)");
    assert.equal(occ[0], m.caps[i]);
    assert.equal(Math.sign(b[occ[0]]), -side, "jumps an enemy");
    assert.ok(!caps.has(occ[0]), "never captured twice");
    assert.equal(b[to], 0, "lands on empty");
    caps.add(occ[0]);
    at = to;
    if ((to >> 3) === (side === WHITE ? 0 : 7)) king = true;
  });
  assert.equal(m.king, king, "final king flag");
}

test("1 initial setup", () => {
  const p = initialPosition();
  const n = count(p.b);
  assert.deepEqual([n[1].men, n[-1].men, n[1].kings, n[-1].kings], [12, 12, 0, 0]);
  p.b.forEach((v, i) => { if (v) assert.ok(isDark(i)); });
  assert.ok(isDark(sq("a1")) && p.b[sq("a1")] === 1 && p.b[sq("h8")] === -1);
  assert.equal(p.b[sq("a3")], 1); assert.equal(p.b[sq("b4")], 0); assert.equal(p.b[sq("h6")], -1);
  assert.equal(p.side, WHITE);
  assert.deepEqual(list(p), ["a3-b4", "c3-b4", "c3-d4", "e3-d4", "e3-f4", "g3-f4", "g3-h4"]);
});

test("2 normal diagonal movement (men forward only)", () => {
  assert.deepEqual(list(pos({ c3: "w" })), ["c3-b4", "c3-d4"]);
  assert.deepEqual(list(pos({ d6: "b" }, BLACK)), ["d6-c5", "d6-e5"]);
  assert.deepEqual(list(pos({ h2: "w", g3: "w" })), ["g3-f4", "g3-h4"]); // h2 is blocked by g3
});

test("3 mandatory capture", () => {
  assert.deepEqual(list(pos({ c3: "w", g3: "w", d4: "b" })), ["c3:e5"]);
});

test("4 backward capture by a man", () => {
  assert.deepEqual(list(pos({ e5: "w", d4: "b" })), ["e5:c3"]);
});

test("5 multiple capture must be completed", () => {
  assert.deepEqual(list(pos({ c3: "w", d4: "b", f6: "b" })), ["c3:e5:g7"]);
  assert.deepEqual(list(pos({ a1: "w", b2: "b", d4: "b", f6: "b" })), ["a1:c3:e5:g7"]);
});

test("6 alternative capture sequences — longest NOT mandatory", () => {
  assert.deepEqual(list(pos({ c3: "w", b4: "b", d4: "b", f6: "b" })), ["c3:a5", "c3:e5:g7"]);
});

test("7 king promotion", () => {
  const p = pos({ b7: "w" });
  const ms = legalMoves(p);
  assert.deepEqual(ms.map(notation).sort(), ["b7-a8", "b7-c8"]);
  assert.ok(ms.every((m) => m.king));
  assert.equal(applyMove(p, ms[0]).b[ms[0].path[0]], 2);
  const q = pos({ g2: "b" }, BLACK);
  assert.ok(legalMoves(q).every((m) => m.king));
});

test("8 flying king movement", () => {
  assert.equal(legalMoves(pos({ a1: "W" })).length, 7);
  assert.equal(legalMoves(pos({ d4: "W" })).length, 13);
  assert.deepEqual(list(pos({ a1: "W", e5: "w" })).length, 3 + 2); // b2,c3,d4 + e5's two steps
});

test("9 flying king captures (any landing beyond; must keep capturing if possible)", () => {
  assert.deepEqual(list(pos({ a1: "W", d4: "b" })), ["a1:e5", "a1:f6", "a1:g7", "a1:h8"]);
  // only landing on e5 lets the capture continue (over f4) — so e5 is the only legal landing
  assert.deepEqual(list(pos({ a1: "W", c3: "b", f4: "b" })), ["a1:e5:g3", "a1:e5:h2"]);
  const ms = list(pos({ a1: "W", c3: "b", e3: "b" }));
  assert.deepEqual(ms, ["a1:d4:f2", "a1:d4:g1"]);
  // a king can't jump two pieces in a row or a piece of its own
  assert.deepEqual(list(pos({ a1: "W", c3: "b", d4: "b", h2: "w" })), ["a1-b2", "h2-g3"]);
  assert.deepEqual(list(pos({ a1: "W", c3: "w", e5: "b" })).some((m) => m.startsWith("a1:")), false);
});

test("10 promotion during a multi-capture continues as a king", () => {
  const p = pos({ b6: "w", c7: "b", f6: "b" });
  const ms = legalMoves(p);
  assert.deepEqual(ms.map(notation).sort(), ["b6:d8:g5", "b6:d8:h4"]);
  assert.ok(ms.every((m) => m.king));
  const st = nextSteps(p, ms, sq("b6"), []);
  assert.deepEqual([...st.keys()], [sq("d8")]);
  assert.equal(st.get(sq("d8")).crown, true);
  // a man that lands on the back rank with nothing more to take just stops there as a king
  assert.deepEqual(list(pos({ b6: "w", c7: "b" })), ["b6:d8"]);
});

test("11 captured pieces block the path and are never taken twice (Turkish strike)", () => {
  // c1 king: d2 → e3, d4 → c5, d6 → e7. From c5 the f2 man sits behind the
  // already-captured d4, so c5 can't continue down-right towards g1.
  const p = pos({ c1: "W", d2: "b", d4: "b", d6: "b", f2: "b", f4: "w", b6: "w", f8: "w" });
  const ms = legalMoves(p);
  ms.forEach((m) => validate(p, m));
  assert.ok(ms.some((m) => m.path.includes(sq("c5"))), "the scenario reaches c5");
  for (const m of ms) {
    const i = m.path.indexOf(sq("c5"));
    if (i >= 0) assert.notEqual(m.path[i + 1], sq("g1"));
    assert.equal(new Set(m.caps).size, m.caps.length);
  }
});

test("12 win conditions", () => {
  let g = newGame(pos({ c3: "w", d4: "b" }));
  g = playMove(g, legalMoves(g.pos)[0]);
  assert.deepEqual(g.result, { winner: WHITE, reason: "All pieces captured" });
  // black's only man is blocked after white's move → white wins
  g = newGame(pos({ a7: "b", b6: "w", c5: "w", h2: "w" }));
  const m = legalMoves(g.pos).find((x) => notation(x) === "h2-g3");
  g = playMove(g, m);
  assert.equal(g.result.winner, WHITE);
  assert.equal(g.result.reason, "No legal moves left");
});

test("13 draw rules", () => {
  const find = (g, n) => legalMoves(g.pos).find((m) => notation(m) === n);
  // threefold repetition
  let g = newGame(pos({ a1: "W", h8: "B", c3: "w", f6: "b" }));
  const cycle = ["a1-b2", "h8-g7", "b2-a1", "g7-h8"];
  for (let i = 0; i < 8 && !g.result; i++) g = playMove(g, find(g, cycle[i % 4]));
  assert.equal(g.result?.reason, "Threefold repetition");
  // 15 moves of king-only play
  g = newGame(pos({ a1: "W", h8: "B", c3: "w", f6: "b", h2: "w", a7: "b" }));
  g = { ...g, quiet: 29 };
  g = playMove(g, find(g, "a1-b2"));
  assert.match(g.result.reason, /only king moves/);
  // a man move resets the counter
  g = { ...newGame(pos({ a1: "W", h8: "B", c3: "w" })), quiet: 29 };
  g = playMove(g, find(g, "c3-d4"));
  assert.equal(g.quiet, 0); assert.equal(g.result, null);
  // three kings vs a lone king: 15 moves
  g = { ...newGame(pos({ a1: "W", c1: "W", e1: "W", h8: "B" })), lone: 29 };
  g = playMove(g, find(g, "c1-d2"));
  assert.match(g.result.reason, /lone king/);
  // 4–5 pieces, both sides with kings, 30 moves without change
  g = { ...newGame(pos({ a1: "W", c1: "w", h8: "B", h6: "b" })), still: 59 };
  g = playMove(g, find(g, "a1-b2"));
  assert.match(g.result.reason, /No change in material/);
});

test("14 AI only plays legal moves; games terminate (all levels)", () => {
  for (const [w, b] of [["easy", "easy"], ["medium", "easy"], ["hard", "medium"]]) {
    const tally = { 1: 0, [-1]: 0, 0: 0 };
    for (let n = 0; n < (w === "hard" ? 3 : 20); n++) {
      let g = newGame();
      for (let ply = 0; ply < 400 && !g.result; ply++) {
        const m = chooseMove(g.pos, g.pos.side === WHITE ? w : b);
        const legal = legalMoves(g.pos).map(notation);
        assert.ok(legal.includes(notation(m)), "AI move is legal");
        validate(g.pos, m);
        g = playMove(g, m);
      }
      tally[g.result ? g.result.winner : 0]++;
    }
    console.log(`       ${w} (white) vs ${b} (black): W ${tally[1]} / B ${tally[-1]} / D ${tally[0]}`);
  }
});

test("15 hard AI finds a forced shot and stays fast", () => {
  const p = pos({ c3: "w", a1: "w", b4: "b", d4: "b", f6: "b", a7: "b" }); // double capture lands safely
  const t = performance.now();
  const m = chooseMove(p, "hard");
  assert.ok(performance.now() - t < 1000);
  assert.equal(notation(m), "c3:e5:g7");
  const t2 = performance.now();
  chooseMove(initialPosition(), "hard");
  assert.ok(performance.now() - t2 < 1000);
});

test("random-play fuzz: every generated move passes the independent validator", () => {
  let moves = 0;
  for (let n = 0; n < 300; n++) {
    let g = newGame();
    for (let ply = 0; ply < 300 && !g.result; ply++) {
      const ms = legalMoves(g.pos);
      const anyCap = ms.some((m) => m.caps.length);
      assert.ok(!anyCap || ms.every((m) => m.caps.length), "captures exclude quiet moves");
      ms.forEach((m) => validate(g.pos, m));
      moves += ms.length;
      g = playMove(g, ms[Math.floor(Math.random() * ms.length)]);
    }
  }
  console.log(`       ${moves} generated moves validated`);
});

console.log(`\n${passed} tests passed`);
