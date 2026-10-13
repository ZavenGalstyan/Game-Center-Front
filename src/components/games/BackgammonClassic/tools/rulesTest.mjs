/**
 * Headless checks for the Backgammon Classic rules and AI, with fixed dice.
 *   node src/components/games/BackgammonClassic/tools/rulesTest.mjs
 */
import assert from "node:assert/strict";
import {
  initialPosition, legalMoves, destinations, applyMove, allTurns, singleMoves,
  pipCount, allHome, diceToPlay, winner, BAR, OFF,
} from "../rules.js";
import { chooseTurn } from "../ai.js";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("  ok  " + name); };
const empty = () => ({ pts: Array(26).fill(0), bar: [0, 0], off: [0, 0] });
const sig = (ms) => ms.map((m) => `${m.from}>${m.to}`).sort();
const count = (pos, pl) => pos.bar[pl] + pos.off[pl] + pos.pts.reduce((a, v) => a + (pl === 0 ? Math.max(v, 0) : Math.max(-v, 0)), 0);

test("initial position", () => {
  const p = initialPosition();
  assert.deepEqual([p.pts[24], p.pts[13], p.pts[8], p.pts[6]], [2, 5, 3, 5]);
  assert.deepEqual([p.pts[1], p.pts[12], p.pts[17], p.pts[19]], [-2, -5, -3, -5]);
  assert.equal(count(p, 0), 15); assert.equal(count(p, 1), 15);
  assert.equal(pipCount(p, 0), 167); assert.equal(pipCount(p, 1), 167);
});

test("opening 3-1 moves and blocked points", () => {
  const p = initialPosition();
  const ms = legalMoves(p, 0, [3, 1]);
  // 24 with a 1 → 23 open; 6 with 1 → 5; 13-3=10; 24-3=21; 8-3=5; 6-3=3; 8-1=7; 13-1=12 is blocked (5 AI checkers)
  assert.ok(!ms.some((m) => m.to === 12), "12 is blocked");
  assert.ok(ms.some((m) => m.from === 8 && m.to === 5));
  assert.ok(ms.some((m) => m.from === 6 && m.to === 5));
  // 6-5 from 24: 24-6=18 open, 24-5=19 blocked
  const m2 = legalMoves(p, 0, [6, 5]);
  assert.ok(!m2.some((m) => m.from === 24 && m.to === 19));
  assert.ok(m2.some((m) => m.from === 24 && m.to === 18));
  // AI mirrored: 1→4 legal with 3, 1→6 blocked with 5
  const a = legalMoves(p, 1, [5, 3]);
  assert.ok(a.some((m) => m.from === 1 && m.to === 4));
  assert.ok(!a.some((m) => m.from === 1 && m.to === 6));
});

test("combined-dice destination only through open intermediate", () => {
  const p = initialPosition();
  // 24 with 6-5: 24→18→13 via 18 (19 blocked) is fine
  const d = destinations(p, 0, [6, 5], 24);
  assert.ok(d.has(13));
  assert.deepEqual(sig(d.get(13)), ["18>13", "24>18"].sort());
  // block both 18 and 19: no combined move 24→13
  const q = initialPosition(); q.pts[18] = -2; q.pts[12] = -3; q.pts[1] = 0;
  assert.ok(!destinations(q, 0, [6, 5], 24).has(13));
});

test("hitting a blot sends it to the bar", () => {
  const p = empty(); p.pts[10] = 1; p.pts[7] = -1; p.pts[20] = -14; p.pts[2] = 14;
  const m = legalMoves(p, 0, [3, 6]).find((x) => x.from === 10 && x.to === 7);
  assert.ok(m && m.hit);
  const r = applyMove(p, 0, m);
  assert.equal(r.pts[7], 1); assert.equal(r.bar[1], 1);
  assert.equal(count(r, 0), 15); assert.equal(count(r, 1), 15);
});

test("bar re-entry is forced and uses valid entry points", () => {
  const p = initialPosition(); p.pts[24] = 1; p.bar[0] = 1;
  // entry with die d → 25-d; 19 is blocked (die 6), 20..24 open
  let ms = legalMoves(p, 0, [6, 2]);
  assert.ok(ms.every((m) => m.from === BAR[0]), "must enter first");
  assert.deepEqual(sig(ms), ["25>23"]);
  // after entering, the 6 can be played anywhere
  const after = applyMove(p, 0, ms[0]);
  assert.ok(legalMoves(after, 0, [6]).length > 1);
  // AI entering: die d → point d
  const q = initialPosition(); q.pts[1] = -1; q.bar[1] = 1;
  assert.deepEqual(sig(legalMoves(q, 1, [6, 6, 6, 6])), ["0>6"].filter(() => false), "6 is blocked by the player");
  assert.deepEqual(sig(legalMoves(q, 1, [4, 6])), ["0>4"]);
});

test("closed board: no legal moves, turn passes", () => {
  const p = empty(); p.bar[0] = 1; for (let i = 19; i <= 24; i++) p.pts[i] = -2; p.pts[1] = -3; p.pts[10] = 14;
  assert.equal(legalMoves(p, 0, [3, 5]).length, 0);
  assert.deepEqual(allTurns(p, 0, [3, 5]), [{ moves: [], pos: p }]);
});

test("doubles give four moves", () => {
  const p = initialPosition();
  const turns = allTurns(p, 0, diceToPlay(2, 2));
  assert.ok(turns.length > 10);
  assert.ok(turns.every((t) => t.moves.length === 4));
  // chained destination: 13 → 11 → 9 → 7 → 5
  const d = destinations(p, 0, [2, 2, 2, 2], 13);
  assert.equal(d.get(5).length, 4);
});

test("must use both dice when possible", () => {
  // Checker on 10 can play 6 (→4) or 2 (→8). Playing 2 first then 6 lands 2 — fine.
  // Construct a position where playing the 6 first strands the 2.
  const p = empty(); p.pts[9] = 1; p.pts[1] = 14; // 9 → 3 then 2 is 3→1 ok; make 7 blocked so 2-first fails?
  p.pts[3] = -2; p.pts[24] = -13; // 9-6=3 blocked; 9-2=7 open, then 7-6=1 open
  const ms = legalMoves(p, 0, [6, 2]);
  assert.deepEqual(sig(ms), ["9>7"], "only the 2 first lets both dice play");
});

test("higher die forced when only one die can be played", () => {
  // single checker on 20; 20-5=15 and 20-3=17 both open, but nothing further is playable
  const p = empty(); p.pts[20] = 1; p.pts[1] = 14;
  p.pts[12] = -2; p.pts[14] = -2; p.pts[10] = -2; p.pts[24] = -9; // 15-3=12 blocked, 17-5=12 blocked, 20-8 =12
  const ms = legalMoves(p, 0, [5, 3]);
  assert.deepEqual(sig(ms), ["20>15"]);
  // if only the lower can be played, it must be used
  p.pts[15] = -2; p.pts[24] = -7;
  assert.deepEqual(sig(legalMoves(p, 0, [5, 3])), ["20>17"]);
});

test("bearing off: exact, oversized and blocked by checkers outside", () => {
  const p = empty(); p.pts[6] = 2; p.pts[4] = 3; p.pts[1] = 10; p.pts[24] = -15;
  assert.ok(allHome(p, 0));
  let ms = singleMoves(p, 0, 6);
  assert.ok(ms.some((m) => m.from === 6 && m.to === OFF[0]));
  // oversized 6 with nothing on 6: only from the highest point (4)
  const q = empty(); q.pts[4] = 2; q.pts[2] = 13; q.pts[24] = -15;
  ms = singleMoves(q, 0, 6);
  assert.deepEqual(sig(ms), ["4>0"]);
  // 5 with checker on 6: cannot bear off from 4 with a 5
  const r = empty(); r.pts[6] = 1; r.pts[4] = 14; r.pts[24] = -15;
  assert.ok(!singleMoves(r, 0, 5).some((m) => m.from === 4 && m.to === 0));
  // one checker outside home → no bearing off
  const s = empty(); s.pts[7] = 1; s.pts[1] = 14; s.pts[24] = -15;
  assert.ok(!allHome(s, 0));
  assert.ok(!singleMoves(s, 0, 1).some((m) => m.to === OFF[0]));
  assert.deepEqual(sig(legalMoves(s, 0, [6, 1])), ["7>1", "7>6"]); // must bring it home first
  // AI bears off toward 25
  const a = empty(); a.pts[22] = -15; a.pts[1] = 15;
  assert.deepEqual(sig(legalMoves(a, 1, [3, 3, 3, 3])), ["22>25"]);
});

test("doubles bearing off and the winning condition", () => {
  const p = empty(); p.pts[2] = 3; p.off[0] = 12; p.pts[24] = -15;
  const t = allTurns(p, 0, [4, 4, 4, 4]);
  assert.equal(t.length, 1);
  assert.equal(t[0].moves.length, 3, "game ends after the third checker");
  assert.equal(winner(t[0].pos), 0);
});

test("AI self-play: every move legal, checkers conserved, games finish", () => {
  for (const [a, b] of [["easy", "hard"], ["hard", "medium"], ["medium", "easy"], ["hard", "hard"]]) {
    const wins = [0, 0];
    for (let g = 0; g < 15; g++) {
      let pos = initialPosition(), pl = g % 2, turns = 0;
      while (winner(pos) < 0) {
        assert.ok(++turns < 1000, "game too long");
        const r1 = 1 + Math.floor(Math.random() * 6), r2 = 1 + Math.floor(Math.random() * 6);
        let left = diceToPlay(r1, r2);
        const plan = chooseTurn(pos, pl, left, pl === 0 ? a : b);
        for (const m of plan) {
          const legal = legalMoves(pos, pl, left);
          assert.ok(legal.some((x) => x.from === m.from && x.to === m.to && x.die === m.die), "AI move is legal");
          pos = applyMove(pos, pl, m);
          left = left.slice(); left.splice(left.indexOf(m.die), 1);
        }
        if (winner(pos) < 0) assert.equal(legalMoves(pos, pl, left).length, 0, "AI used every playable die");
        assert.equal(count(pos, 0), 15); assert.equal(count(pos, 1), 15);
        pl = 1 - pl;
      }
      wins[winner(pos)]++;
    }
    console.log(`       ${a} vs ${b}: ${wins[0]}-${wins[1]}`);
  }
});

test("hard beats easy most of the time", () => {
  let hard = 0;
  for (let g = 0; g < 40; g++) {
    let pos = initialPosition(), pl = g % 2;
    while (winner(pos) < 0) {
      const plan = chooseTurn(pos, pl, diceToPlay(1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)), pl ? "hard" : "easy");
      for (const m of plan) pos = applyMove(pos, pl, m);
      pl = 1 - pl;
    }
    hard += winner(pos);
  }
  console.log(`       hard won ${hard}/40 vs easy`);
  assert.ok(hard >= 24);
});

console.log(`\n${passed} tests passed`);
