/**
 * Headless tests for the Texas Hold'em engine (rules, pots, flow, AI, saves).
 *   node src/components/games/TexasHoldemPoker/tools/engineTest.mjs [filter]
 */
import assert from "node:assert/strict";
import { parseCards, parseCard, freshDeck, shuffle, seeded, intFrom, rankOf, suitOf, shuffledDeck } from "../engine/cards.js";
import { scoreHand, evaluate, categoryOf, CAT, describe, combinations } from "../engine/evaluator.js";
import { buildPots, distribute } from "../engine/pots.js";
import {
  createTable, startHand, applyAction, advance, legalActions, viewFor, chipsAtTable, timeoutAction, validateTable, potTotal,
} from "../engine/table.js";
import { decide, PROFILES, finalize, equity, observeHand } from "../engine/ai.js";
import { newTournament, afterHand, blindsAt, standings } from "../engine/tournament.js";
import { playHand, finishTournament } from "../engine/simulate.js";
import { handFacts, recordHand, defaultProfile, sanitizeProfile, levelInfo } from "../engine/progress.js";
import { reducer, initialApp, loadSave, writeSave, validateSession } from "../engine/session.js";

const filter = process.argv[2];
let passed = 0, failed = 0, n = 0;
function test(name, fn) {
  n++;
  const label = `${String(n).padStart(2)}. ${name}`;
  if (filter && !label.toLowerCase().includes(filter.toLowerCase())) return;
  try { fn(); passed++; console.log("  ok  " + label); } catch (e) { failed++; console.log("  FAIL " + label + "\n       " + (e.stack || e).toString().split("\n").slice(0, 3).join("\n       ")); }
}
const S = (str) => scoreHand(parseCards(str));
const cat = (str) => categoryOf(S(str));

/* ---------- table builders ---------- */
function table(stacks, { sb = 5, bb = 10 } = {}) {
  return createTable({ players: stacks.map((st, i) => ({ id: `p${i}`, name: `P${i}`, stack: st, ai: i > 0, profile: "jack", diff: "medium" })), blinds: { sb, bb } });
}
/** Deck that deals `holes[seat]` (strings) and the `board` given the dealer. */
function rig(nSeats, dealer, holes, board = "", active = null) {
  const seats = [];
  for (let k = 1; k <= nSeats; k++) { const i = (dealer + k) % nSeats; if (!active || active.includes(i)) seats.push(i); }
  const used = new Set();
  const want = [];
  const H = holes.map((h) => (h ? parseCards(h) : null));
  const B = parseCards(board);
  [...H.flat().filter((x) => x != null), ...B].forEach((c) => used.add(c));
  const spare = freshDeck().filter((c) => !used.has(c));
  const take = () => spare.shift();
  for (let pass = 0; pass < 2; pass++) for (const i of seats) want.push(H[i] ? H[i][pass] : take());
  const b = B.slice();
  const nb = () => (b.length ? b.shift() : take());
  want.push(take(), nb(), nb(), nb(), take(), nb(), take(), nb());
  return [...want, ...spare];
}
const start = (t, deck, dealer) => { const r = startHand(t, deck, { dealer }); assert.equal(r.error, null, r.error); return r.state; };
const act = (s, seat, type, amount) => { const r = applyAction(s, seat, { type, amount }); assert.equal(r.error, null, `${type} ${amount ?? ""} by ${seat}: ${r.error}`); return r.state; };
const bad = (s, seat, type, amount) => { const r = applyAction(s, seat, { type, amount }); assert.ok(r.error, `${type} should be illegal`); assert.equal(r.state, s); };
const adv = (s) => { const r = advance(s); assert.equal(r.error, null, r.error); return r.state; };
const runToEnd = (s) => { let g = 0; while (s.phase === "street-end" || s.phase === "showdown") { s = adv(s); if (++g > 10) throw new Error("loop"); } return s; };
const totalChips = (s) => chipsAtTable(s);

/* ---------- independent brute-force evaluator for cross-checks ---------- */
function naive5(cards) {
  const rs = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(rs)];
  let straight = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straight = rs[0];
    if (rs.join() === "14,5,4,3,2") straight = 5;
  }
  const groups = uniq.map((r) => [rs.filter((x) => x === r).length, r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map((g) => g[0]).join("");
  const ks = groups.map((g) => g[1]);
  let c;
  if (straight && flush) return [8, straight];
  if (shape === "41") c = 7; else if (shape === "32") c = 6; else if (flush) return [5, ...rs];
  else if (straight) return [4, straight]; else if (shape === "311") c = 3; else if (shape === "221") c = 2; else if (shape === "2111") c = 1; else c = 0;
  return [c, ...ks];
}
const cmpArr = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function naiveBest(cards) {
  let best = null;
  for (const c of combinations(cards, 5)) { const v = naive5(c); if (!best || cmpArr(v, best) > 0) best = v; }
  return best;
}

console.log("Hand evaluation");
test("Royal flush", () => { assert.equal(evaluate(parseCards("Ah Kh Qh Jh Th 2c 3d")).name, "Royal Flush"); });
test("Straight flush", () => { assert.equal(cat("9s 8s 7s 6s 5s Ad Ac"), CAT.STRAIGHT_FLUSH); assert.ok(S("9s 8s 7s 6s 5s") > S("8s 7s 6s 5s 4s")); });
test("Four of a kind", () => { assert.equal(cat("7c 7d 7h 7s Kd 2c 3c"), CAT.QUADS); assert.ok(S("7c 7d 7h 7s Kd") > S("7c 7d 7h 7s Qd")); });
test("Full house", () => { assert.equal(cat("Kc Kd Kh 2s 2d 9c 8c"), CAT.FULL_HOUSE); assert.equal(describe(S("Kc Kd Kh 2s 2d")), "Full House, Kings full of Twos"); });
test("Flush", () => { assert.equal(cat("Ah 9h 7h 4h 2h Kc Kd"), CAT.FLUSH); });
test("Straight", () => { assert.equal(cat("9c 8d 7h 6s 5d Kc 2d"), CAT.STRAIGHT); assert.equal(cat("Ac Kd Qh Js Td 2c 3d"), CAT.STRAIGHT); });
test("Three of a kind", () => { assert.equal(cat("Qc Qd Qh 9s 5d 3c 2d"), CAT.TRIPS); });
test("Two pair", () => { assert.equal(cat("Jc Jd 4h 4s 9d 3c 2d"), CAT.TWO_PAIR); });
test("One pair", () => { assert.equal(cat("Tc Td 8h 6s 4d 3c 2d"), CAT.PAIR); });
test("High card", () => { assert.equal(cat("Ac Jd 8h 6s 4d 3c 2d"), CAT.HIGH); });
test("Ace-low straight (wheel)", () => {
  assert.equal(cat("Ac 2d 3h 4s 5d 9c Kd"), CAT.STRAIGHT);
  assert.ok(S("2c 3d 4h 5s 6d") > S("Ac 2d 3h 4s 5d"), "6-high beats the wheel");
  assert.equal(describe(S("Ac 2d 3h 4s 5d")), "Straight, Five high");
  assert.equal(cat("Ah 2h 3h 4h 5h"), CAT.STRAIGHT_FLUSH);
});
test("Flush comparison (kickers down to 5th card)", () => {
  assert.ok(S("Ah Jh 8h 6h 3h") > S("Ad Jd 8d 6d 2d"));
  assert.ok(S("Kh Qh 8h 6h 3h") < S("Ad 3d 4d 6d 8d"));
  assert.equal(S("Ah Jh 8h 6h 3h"), S("As Js 8s 6s 3s"));
});
test("Full house comparison (trips first, then pair)", () => {
  assert.ok(S("Qc Qd Qh 2s 2d") > S("Jc Jd Jh As Ad"));
  assert.ok(S("Qc Qd Qh 5s 5d") > S("Qc Qd Qh 4s 4d"));
  // two trips on 7 cards: best full house uses the higher trips + the other as pair
  assert.equal(describe(S("9c 9d 9h 4s 4d 4h Ac")), "Full House, Nines full of Fours");
  assert.equal(describe(S("9c 9d 9h 4s 4d Kh Kc")), "Full House, Nines full of Kings");
});
test("Two-pair kicker", () => {
  assert.ok(S("Kc Kd 7h 7s Ad") > S("Kh Ks 7c 7d Qd"));
  // three pairs: kicker may come from the third pair
  assert.equal(S("Kc Kd 7h 7s 5d 5c 2h"), S("Kc Kd 7h 7s 5d"));
  assert.ok(S("Kc Kd 7h 7s 5d 5c Qh") > S("Kc Kd 7h 7s 5d 5c 2h"));
});
test("Identical hands tie", () => { assert.equal(S("Ac Kd 8h 6s 4d"), S("Ad Kc 8s 6h 4c")); });
test("Board-only hand splits the pot", () => {
  const board = "Ac Kc Qc Jc Tc";
  assert.equal(S(`2d 3h ${board}`), S(`9s 8d ${board}`));
  let s = start(table([1000, 1000, 1000]), rig(3, 0, ["2d 3h", "9s 8d", "4h 4d"], board), 0);
  s = act(s, 0, "call"); s = act(s, 1, "call"); s = act(s, 2, "check");
  for (let k = 0; k < 3; k++) { s = adv(s); s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "check"); }
  s = runToEnd(s);
  assert.deepEqual(s.result.winners.sort(), [0, 1, 2]);
  assert.deepEqual(s.players.map((p) => p.stack), [1000, 1000, 1000]);
});
test("Best five from seven (+ 20k random hands vs brute force)", () => {
  const ev = evaluate(parseCards("2c 2d Ah Kh Qh Jh Th"));
  assert.equal(ev.name, "Royal Flush");
  assert.deepEqual(ev.best.map(rankOf), [14, 13, 12, 11, 10]);
  const rand = seeded(7), ri = intFrom(rand);
  for (let k = 0; k < 20000; k++) {
    const d = shuffle(freshDeck(), ri);
    const a = d.slice(0, 7), b = d.slice(7, 14);
    const sa = scoreHand(a), sb = scoreHand(b);
    const na = naiveBest(a), nb = naiveBest(b);
    assert.equal(Math.sign(sa - sb), Math.sign(cmpArr(na, nb)), `mismatch ${a} vs ${b}`);
    assert.equal(categoryOf(sa), na[0]);
    assert.equal(scoreHand(evaluate(a).best), sa, "reported best five reproduce the score");
  }
});

console.log("Betting");
test("Valid check", () => {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0); // D=0 SB=1 BB=2, UTG=0
  s = act(s, 0, "call"); s = act(s, 1, "call");
  assert.equal(s.toAct, 2);
  assert.ok(legalActions(s, 2).canCheck, "big blind may check its option");
  s = act(s, 2, "check");
  assert.equal(s.phase, "street-end");
});
test("Invalid check", () => {
  const s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0);
  bad(s, 0, "check");
  bad(s, 1, "check"); // not their turn
});
test("Valid call", () => {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0);
  s = act(s, 0, "call");
  assert.equal(s.players[0].bet, 10);
  assert.equal(s.players[0].stack, 990);
});
test("Valid raise", () => {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0);
  s = act(s, 0, "raise", 30);
  assert.equal(s.currentBet, 30);
  assert.equal(s.minRaise, 20);
  s = act(s, 1, "raise", 50); // min re-raise = 30 + 20
  assert.equal(s.currentBet, 50);
});
test("Invalid raise", () => {
  const s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0);
  bad(s, 0, "raise", 15);      // below min raise-to 20
  bad(s, 0, "raise", 1001);    // more than stack
  bad(s, 0, "raise", 25.5);    // not an integer
  bad(s, 0, "bet", 40);        // there is already a bet (the blind)
});
test("Fold", () => {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0);
  s = act(s, 0, "fold");
  assert.ok(s.players[0].folded);
  assert.equal(s.toAct, 1);
});
test("All-in", () => {
  let s = start(table([300, 1000, 1000]), rig(3, 0, []), 0);
  s = act(s, 0, "allin");
  assert.equal(s.players[0].stack, 0);
  assert.ok(s.players[0].allIn);
  assert.equal(s.currentBet, 300);
  assert.equal(s.minRaise, 290);
});
test("Short all-in raise does not reopen betting", () => {
  // UTG raises to 100, SB short all-in to 150 (increment 50 < 90), BB folds, UTG may only call/fold
  let s = start(table([1000, 150, 1000]), rig(3, 0, []), 0);
  s = act(s, 0, "raise", 100);
  s = act(s, 1, "allin");
  assert.equal(s.currentBet, 150);
  assert.equal(s.minRaise, 90, "min raise unchanged by a short all-in");
  // BB has not acted yet → may raise (to at least 240)
  let la = legalActions(s, 2);
  assert.ok(la.canRaise);
  assert.equal(la.minTo, 240);
  s = act(s, 2, "fold");
  la = legalActions(s, 0);
  assert.equal(la.toCall, 50);
  assert.ok(!la.canRaise && !la.canBet, "action not reopened");
  assert.ok(!la.canAllIn, "cannot shove over a short all-in");
  bad(s, 0, "raise", 300);
  s = act(s, 0, "call");
  assert.equal(s.phase, "street-end");
});
test("Minimum raise enforcement", () => {
  let s = start(table([5000, 5000, 5000]), rig(3, 0, []), 0);
  s = act(s, 0, "raise", 60);   // raise of 50
  let la = legalActions(s, 1);
  assert.equal(la.minTo, 110);  // must raise by ≥ 50 again
  bad(s, 1, "raise", 100);
  s = act(s, 1, "raise", 110);
  s = act(s, 2, "fold");
  s = act(s, 0, "call");
  s = adv(s); // flop
  la = legalActions(s, 1);
  assert.equal(la.minTo, 10, "postflop min bet = big blind");
  bad(s, 1, "bet", 9);
  s = act(s, 1, "bet", 10);
});
test("Correct betting order", () => {
  let s = start(table([1000, 1000, 1000, 1000]), rig(4, 1, []), 1); // D=1 SB=2 BB=3 UTG=0
  assert.equal(s.sbSeat, 2); assert.equal(s.bbSeat, 3);
  assert.equal(s.toAct, 0, "preflop: left of the big blind");
  s = act(s, 0, "call"); assert.equal(s.toAct, 1);
  s = act(s, 1, "call"); assert.equal(s.toAct, 2);
  s = act(s, 2, "fold"); assert.equal(s.toAct, 3);
  s = act(s, 3, "check");
  s = adv(s);
  assert.equal(s.toAct, 3, "postflop: first active seat left of the button (SB folded)");
});
test("Correct blind posting", () => {
  const s = start(table([1000, 1000, 3, 1000], { sb: 5, bb: 10 }), rig(4, 0, []), 0); // SB=1 BB=2 (short)
  assert.equal(s.players[1].bet, 5);
  assert.equal(s.players[2].bet, 3);
  assert.ok(s.players[2].allIn, "short big blind is all-in");
  assert.equal(s.currentBet, 10, "others still owe the full big blind");
  assert.equal(potTotal(s), 8);
});
test("Heads-up blind rules", () => {
  let s = start(table([1000, 1000]), rig(2, 0, []), 0);
  assert.equal(s.sbSeat, 0, "dealer posts the small blind");
  assert.equal(s.bbSeat, 1);
  assert.equal(s.toAct, 0, "dealer acts first preflop");
  s = act(s, 0, "call");
  s = act(s, 1, "check");
  s = adv(s);
  assert.equal(s.toAct, 1, "big blind acts first postflop");
});
test("Correct dealer rotation (incl. after an elimination)", () => {
  let s = start(table([1000, 1000, 1000, 1000]), rig(4, 0, []), 0);
  const seen = [s.dealer];
  for (let h = 0; h < 4; h++) {
    while (s.phase !== "complete") s = s.phase === "betting" ? act(s, s.toAct, "fold") : adv(s);
    s = start(s, shuffledDeck());
    seen.push(s.dealer);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 0]);
  // seat 1 busts: button skips it
  while (s.phase !== "complete") s = s.phase === "betting" ? act(s, s.toAct, "fold") : adv(s);
  s = { ...s, players: s.players.map((p, i) => (i === 1 ? { ...p, stack: 0, out: true } : p)) };
  s = start(s, shuffledDeck());
  assert.equal(s.dealer, 2);
  assert.ok(!s.players[1].inHand && s.players[1].hole.length === 0, "eliminated player gets no cards");
  assert.equal(s.sbSeat, 3); assert.equal(s.bbSeat, 0);
});

console.log("Pots");
const P = (totals, folded = []) => totals.map((t, i) => ({ total: t, folded: folded.includes(i) }));
test("Single pot", () => {
  const pots = buildPots(P([100, 100, 100]));
  assert.deepEqual(pots, [{ amount: 300, eligible: [0, 1, 2] }]);
});
test("Main pot with one side pot", () => {
  const pots = buildPots(P([100, 300, 300]));
  assert.deepEqual(pots, [{ amount: 300, eligible: [0, 1, 2] }, { amount: 400, eligible: [1, 2] }]);
});
test("Multiple side pots (100 / 300 / 500 example)", () => {
  const pots = buildPots(P([100, 300, 500, 500]));
  assert.deepEqual(pots, [
    { amount: 400, eligible: [0, 1, 2, 3] },
    { amount: 600, eligible: [1, 2, 3] },
    { amount: 400, eligible: [2, 3] },
  ]);
  // A 100, B 300, C 500 with nobody covering C: C's extra 200 is an uncalled bet the
  // engine returns before pots are built (see "Unmatched bet return").
});
test("Split pot", () => {
  const { awards } = distribute([{ amount: 600, eligible: [0, 1, 2] }], { 0: 50, 1: 50, 2: 10 }, 3, 2);
  assert.deepEqual(awards, [300, 300, 0]);
});
test("Different side-pot winners (full hand)", () => {
  // P0 short all-in with the best hand wins only the main pot; P1 beats P2 for the side pot
  let s = start(table([100, 1000, 1000]), rig(3, 2, ["Ac Ad", "Kc Kd", "Qc Qd"], "2h 7s 9d 3c 4h"), 2); // D=2 SB=0 BB=1
  s = act(s, 2, "raise", 400);
  s = act(s, 0, "allin");
  s = act(s, 1, "call");
  s = runToEnd(adv(s)); // flop… (P1 & P2 still have chips: they check down)
  while (s.phase !== "complete") s = s.phase === "betting" ? act(s, s.toAct, "check") : adv(s);
  const [main, side] = s.result.pots;
  assert.equal(main.amount, 300); assert.deepEqual(main.winners, [0]);
  assert.equal(side.amount, 600); assert.deepEqual(side.winners, [1]);
  assert.deepEqual(s.players.map((p) => p.stack), [300, 1200, 600]);
});
test("Folded player cannot win", () => {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, ["Ac Ad", "7c 2d", "8h 3s"], "As Ah 5d 9c Jd"), 0);
  s = act(s, 0, "raise", 50); s = act(s, 1, "call"); s = act(s, 2, "call");
  s = adv(s);
  s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "bet", 100); s = act(s, 1, "call"); s = act(s, 2, "call");
  s = adv(s);
  s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "check");
  s = adv(s);
  s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "bet", 100); s = act(s, 1, "call"); s = act(s, 2, "call");
  // replay with seat 0 folding on the river instead
  let t = start(table([1000, 1000, 1000]), rig(3, 0, ["Ac Ad", "7c 2d", "8h 3s"], "As Ah 5d 9c Jd"), 0);
  t = act(t, 0, "raise", 50); t = act(t, 1, "call"); t = act(t, 2, "call");
  t = adv(t); t = act(t, 1, "bet", 100); t = act(t, 2, "call"); t = act(t, 0, "fold");
  while (t.phase !== "complete") t = t.phase === "betting" ? act(t, t.toAct, "check") : adv(t);
  assert.ok(!t.result.winners.includes(0), "quad aces folded and cannot win");
  assert.ok(t.result.pots.every((p) => !p.eligible.includes(0)));
  assert.equal(t.players[0].stack, 950);
});
test("Unmatched bet return", () => {
  let s = start(table([100, 300, 500]), rig(3, 2, ["Ac Ad", "Kc Kd", "Qc Qd"], "2h 7s 9d 3c 4h"), 2); // D=2 SB=0 BB=1
  s = act(s, 2, "allin");   // 500
  s = act(s, 0, "allin");   // 100
  s = act(s, 1, "allin");   // 300
  assert.equal(s.phase, "street-end");
  s = adv(s);
  assert.equal(s.players[2].total, 300, "200 of C's 500 was never matched and goes back");
  assert.deepEqual(s.lastReturned, { seat: 2, amount: 200 });
  s = runToEnd(s);
  assert.deepEqual(s.result.pots.map((p) => p.amount), [300, 400]);
  assert.deepEqual(s.players.map((p) => p.stack), [300, 400, 200]);
});
test("Odd chip distribution (left of the button first)", () => {
  const r = distribute([{ amount: 101, eligible: [0, 1, 2] }], { 0: 9, 1: 9, 2: 9 }, 4, 1);
  // order from left of dealer 1: seats 2, 3, 0, 1 → 101 = 34 + 34 + 33 → seat 2 and 0 get the odd chips
  assert.deepEqual(r.awards, [34, 33, 34, 0]);
  assert.equal(r.awards.reduce((a, b) => a + b), 101);
});
test("Total chip conservation (5,000 random self-play hands)", () => {
  const rand = seeded(42), ri = intFrom(rand);
  for (let game = 0; game < 50; game++) {
    const nP = 2 + (game % 5);
    let s = createTable({ players: Array.from({ length: nP }, (_, i) => ({ id: `x${i}`, name: `X${i}`, stack: 200 + Math.floor(rand() * 2000), ai: true, profile: Object.keys(PROFILES)[i], diff: ["easy", "medium", "hard"][i % 3] })), blinds: { sb: 5, bb: 10 } });
    const bank = chipsAtTable(s);
    for (let h = 0; h < 100; h++) {
      const r = startHand(s, shuffledDeck(ri));
      if (r.error) break;
      s = r.state;
      // random but legal actions (incl. odd raise sizes) stress side pots
      let g = 0;
      while (s.phase !== "complete") {
        assert.ok(++g < 400);
        assert.equal(chipsAtTable(s), bank);
        assert.equal(validateTable(s, bank), null);
        if (s.phase !== "betting") { s = adv(s); continue; }
        const la = legalActions(s, s.toAct);
        const opts = ["fold", "call", "check", "allin", "raise", "bet"].filter((t) =>
          t === "fold" || (t === "call" && la.canCall) || (t === "check" && la.canCheck) || (t === "allin" && la.canAllIn) || (t === "raise" && la.canRaise) || (t === "bet" && la.canBet));
        const t = opts[Math.floor(rand() * opts.length)];
        const amt = la.minTo + Math.floor(rand() * (la.maxTo - la.minTo + 1));
        s = act(s, s.toAct, t, t === "raise" || t === "bet" ? amt : undefined);
      }
      assert.equal(chipsAtTable(s), bank, "chips conserved after the hand");
      assert.ok(s.players.every((p) => p.stack >= 0));
      assert.equal(s.result.awards.reduce((a, b) => a + b, 0), s.players.reduce((a, p) => a + p.total, 0), "everything in the pot was awarded");
    }
  }
});

console.log("Game flow");
function limpedHand() {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, ["Ac Kd", "7c 7d", "Qh Js"], "2h 7s 9d 3c Th"), 0);
  s = act(s, 0, "call"); s = act(s, 1, "call"); s = act(s, 2, "check");
  return s;
}
test("Preflop to flop (burn + 3 cards)", () => {
  let s = limpedHand();
  assert.equal(s.board.length, 0);
  s = adv(s);
  assert.equal(s.street, "flop");
  assert.equal(s.board.length, 3);
  assert.equal(s.burned.length, 1);
  assert.equal(s.phase, "betting");
  assert.equal(potTotal(s), 30);
  assert.ok(s.players.every((p) => p.bet === 0));
});
test("Flop to turn", () => {
  let s = adv(limpedHand());
  s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "check");
  s = adv(s);
  assert.equal(s.street, "turn"); assert.equal(s.board.length, 4); assert.equal(s.burned.length, 2);
});
test("Turn to river", () => {
  let s = adv(limpedHand());
  for (let k = 0; k < 2; k++) { s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "check"); s = adv(s); }
  assert.equal(s.street, "river"); assert.equal(s.board.length, 5); assert.equal(s.burned.length, 3);
  const all = [...s.board, ...s.burned, ...s.players.flatMap((p) => p.hole)];
  assert.equal(new Set(all).size, all.length, "no duplicate cards");
});
test("River to showdown (cards revealed, best hand wins)", () => {
  let s = adv(limpedHand());
  for (let k = 0; k < 3; k++) { s = act(s, 1, "check"); s = act(s, 2, "check"); s = act(s, 0, "check"); s = adv(s); }
  assert.equal(s.phase, "showdown");
  assert.ok(s.players.every((p) => p.revealed));
  s = adv(s);
  assert.equal(s.phase, "complete");
  assert.deepEqual(s.result.winners, [1]); // set of sevens
  assert.equal(s.result.hands[1].name, "Three of a Kind");
  assert.equal(s.players[1].stack, 1020);
});
test("Everyone folds except one", () => {
  let s = start(table([1000, 1000, 1000]), rig(3, 0, []), 0);
  s = act(s, 0, "raise", 40); s = act(s, 1, "fold"); s = act(s, 2, "fold");
  assert.equal(s.phase, "street-end");
  s = adv(s);
  assert.equal(s.phase, "complete");
  assert.equal(s.result.showdown, false);
  assert.deepEqual(s.players.map((p) => p.stack), [1015, 995, 990]);
  assert.equal(s.board.length, 0, "no board dealt");
});
test("All players all-in (board runs out, hands tabled)", () => {
  let s = start(table([200, 300, 400]), rig(3, 0, ["Ac Ad", "Kc Kd", "Qc Qd"], "2h 7s 9d 3c 4h"), 0);
  s = act(s, 0, "allin"); s = act(s, 1, "allin");
  assert.ok(!legalActions(s, 2).canAllIn && !legalActions(s, 2).canRaise, "no raising when nobody can respond");
  s = act(s, 2, "call");
  assert.equal(s.phase, "street-end"); assert.ok(s.runout);
  assert.ok(s.players.every((p) => p.revealed));
  let streets = 0;
  while (s.phase === "street-end") { s = adv(s); streets++; assert.equal(s.toAct, -1, "nobody is asked to act"); }
  assert.equal(streets, 4);
  s = adv(s);
  assert.deepEqual(s.players.map((p) => p.stack), [600, 200, 100]);
});
test("Tournament elimination", () => {
  let t = newTournament({ tier: "bronze", handsPerLevel: 10 });
  let s = start(table([100, 1000, 1000, 1000, 1000, 1000]), rig(6, 5, ["2c 7d", "Ac Ad"], "Kh 9s 4d Jc 8h"), 5); // D=5 SB=0 BB=1
  s = act(s, 2, "fold"); s = act(s, 3, "fold"); s = act(s, 4, "fold"); s = act(s, 5, "fold");
  s = act(s, 0, "allin"); s = act(s, 1, "call");
  s = runToEnd(s);
  ({ tour: t, table: s } = afterHand(t, s));
  assert.ok(s.players[0].out);
  assert.deepEqual(t.eliminated.map((e) => [e.id, e.place]), [["p0", 6]]);
  s = start(s, shuffledDeck());
  assert.ok(!s.players[0].inHand && s.players[0].hole.length === 0);
});
test("Tournament victory (played out with the real AI)", () => {
  const rand = seeded(5), ri = intFrom(rand);
  let tour = newTournament({ tier: "silver", handsPerLevel: 6 });
  let s = createTable({ players: Object.keys(PROFILES).map((id, i) => ({ id, name: id, stack: 1500, ai: true, profile: id, diff: ["easy", "medium", "hard"][i % 3] })), blinds: blindsAt(0) });
  const r = finishTournament(s, tour, { rand, randInt: ri, sims: 40 });
  assert.ok(r.tour.done, "tournament finished");
  assert.equal(r.table.players.filter((p) => !p.out).length, 1);
  assert.equal(chipsAtTable(r.table), 9000);
  const rows = standings(r.tour, r.table);
  assert.deepEqual(rows.map((x) => x.place), [1, 2, 3, 4, 5, 6]);
  assert.equal(r.table.players.find((p) => !p.out).id, r.tour.winner.id);
});
test("Blind increases", () => {
  let t = newTournament({ tier: "bronze", handsPerLevel: 2 });
  let s = start(table([1000, 1000, 1000], blindsAt(0)), shuffledDeck(), 0);
  const levels = [];
  for (let h = 0; h < 6; h++) {
    while (s.phase !== "complete") s = s.phase === "betting" ? act(s, s.toAct, legalActions(s, s.toAct).canCheck ? "check" : "call") : adv(s);
    ({ tour: t, table: s } = afterHand(t, s));
    levels.push(`${s.blinds.sb}/${s.blinds.bb}`);
    if (t.done) break;
    s = start(s, shuffledDeck());
  }
  assert.deepEqual(levels.slice(0, 4), ["10/20", "15/30", "15/30", "25/50"]);
});

console.log("AI");
const aiCtx = (profile = "jack", difficulty = "medium", seed = 1) => ({ profile: PROFILES[profile], difficulty, rand: seeded(seed), memory: {} });
test("AI uses only legal actions (3,000 decisions, every profile × difficulty)", () => {
  const rand = seeded(9), ri = intFrom(rand);
  let count = 0;
  for (let g = 0; g < 18; g++) {
    const ids = Object.keys(PROFILES);
    let s = createTable({ players: ids.map((id, i) => ({ id, name: id, stack: 300 + Math.floor(rand() * 3000), ai: true, profile: ids[(i + g) % 6], diff: ["easy", "medium", "hard"][(g + i) % 3] })), blinds: { sb: 10, bb: 20 } });
    for (let h = 0; h < 25 && count < 3000; h++) {
      const r = startHand(s, shuffledDeck(ri));
      if (r.error) break;
      s = r.state;
      while (s.phase !== "complete") {
        if (s.phase !== "betting") { s = adv(s); continue; }
        const p = s.players[s.toAct];
        const a = decide(viewFor(s, s.toAct), { profile: PROFILES[p.profile], difficulty: p.diff, rand, memory: {}, sims: 60 });
        const res = applyAction(s, s.toAct, a);
        assert.equal(res.error, null, `${p.profile}/${p.diff} → ${JSON.stringify(a)}`);
        s = res.state;
        count++;
      }
    }
  }
  assert.ok(count >= 1000, `made ${count} decisions`);
});
test("AI does not read hidden player cards", () => {
  const base = start(table([1000, 1000, 1000]), rig(3, 0, ["2c 7d", "Ac Kd", "9h 9s"]), 0);
  const v = viewFor(base, 1);
  assert.deepEqual(v.players[0].hole, []);
  assert.deepEqual(v.players[2].hole, []);
  assert.equal(v.deck, undefined); assert.equal(v.burned, undefined);
  // same view whatever the opponents hold → identical decision with the same RNG
  const other = start(table([1000, 1000, 1000]), rig(3, 0, ["Qs Qd", "Ac Kd", "3h 4s"]), 0);
  const s1 = act(base, 0, "call"), s2 = act(other, 0, "call");
  assert.deepEqual(viewFor(s1, 1), viewFor(s2, 1));
  for (const d of ["easy", "medium", "hard"]) assert.deepEqual(decide(viewFor(s1, 1), aiCtx("leo", d, 3)), decide(viewFor(s2, 1), aiCtx("leo", d, 3)));
});
test("AI respects chip limits", () => {
  const s = start(table([1000, 37, 1000]), rig(3, 0, ["2c 7d", "Ac Ad", "9h 9s"]), 0);
  const s1 = act(s, 0, "raise", 200);
  for (const prof of Object.keys(PROFILES)) for (const d of ["easy", "medium", "hard"]) {
    const a = decide(viewFor(s1, 1), aiCtx(prof, d, 4));
    const r = applyAction(s1, 1, a);
    assert.equal(r.error, null);
    assert.ok(r.state.players[1].stack >= 0 && r.state.players[1].total <= 37);
  }
  const la = legalActions(s1, 1);
  assert.equal(finalize({ type: "raise", amount: 99999 }, la).type, "call", "a stack that can't cover the bet can only call all-in");
  assert.equal(finalize({ type: "raise", amount: 99999 }, legalActions(s, 0)).type, "allin", "oversized raise clamps to all-in");
  assert.equal(finalize({ type: "raise", amount: 1 }, legalActions(s, 0)).amount, 20);
});
test("AI finishes its turn (whole hands complete, no stalls)", () => {
  const rand = seeded(11), ri = intFrom(rand);
  let s = createTable({ players: Object.keys(PROFILES).map((id) => ({ id, name: id, stack: 1500, ai: true, profile: id, diff: "hard" })), blinds: { sb: 10, bb: 20 } });
  for (let h = 0; h < 40; h++) {
    const r = startHand(s, shuffledDeck(ri));
    if (r.error) break;
    s = playHand(r.state, { rand, sims: 80 });
    assert.equal(s.phase, "complete");
  }
});
test("AI difficulty changes behavior", () => {
  // same spots, same seeds: easy makes noticeably different (worse) choices than hard
  const rand = seeded(21), ri = intFrom(rand);
  let diffs = 0, spots = 0, easyCallsJunk = 0, hardCallsJunk = 0;
  for (let k = 0; k < 300; k++) {
    let s = start(table([2000, 2000, 2000]), shuffledDeck(ri), 0);
    s = act(s, 0, "raise", 200);
    s = act(s, 1, "fold");
    const v = viewFor(s, 2);
    const e = decide(v, aiCtx("jack", "easy", k)), h = decide(v, aiCtx("jack", "hard", k));
    spots++;
    if (e.type !== h.type) diffs++;
    const eqv = equity(v.players[2].hole, [], 1, 400, seeded(k));
    if (eqv < 0.4) { if (e.type !== "fold") easyCallsJunk++; if (h.type !== "fold") hardCallsJunk++; }
  }
  assert.ok(diffs > spots * 0.08, `decisions differ in ${diffs}/${spots} spots`);
  assert.ok(easyCallsJunk > hardCallsJunk, `easy continues with weak hands more often (${easyCallsJunk} vs ${hardCallsJunk})`);
  // personalities differ too
  const vpip = {};
  for (const prof of ["alex", "leo"]) {
    vpip[prof] = 0;
    const r2 = seeded(3), ri2 = intFrom(r2);
    for (let k = 0; k < 300; k++) {
      const s = start(table([2000, 2000, 2000]), shuffledDeck(ri2), 2); // D=2 → UTG = 2? (SB 0, BB 1, UTG 2)
      const a = decide(viewFor(s, 2), aiCtx(prof, "medium", k));
      if (a.type !== "fold") vpip[prof]++;
    }
  }
  assert.ok(vpip.leo > vpip.alex * 1.3, `Leo plays more hands than Alex (${vpip.leo} vs ${vpip.alex})`);
});

console.log("Progress & saves");
test("Achievements unlock only on real conditions", () => {
  // win with a flush at showdown
  let s = start(table([1000, 1000]), rig(2, 0, ["Ah 9h", "Kc Kd"], "2h 5h Jh Ks 3c"), 0);
  s = act(s, 0, "call"); s = act(s, 1, "check");
  while (s.phase !== "complete") s = s.phase === "betting" ? act(s, s.toAct, "check") : adv(s);
  const f = handFacts(s, 0);
  assert.ok(f.showdownWin && f.category === CAT.FLUSH);
  const { profile, events } = recordHand(defaultProfile(), f);
  assert.ok(profile.achievements.flush_master && profile.achievements.first_win);
  assert.ok(!profile.achievements.full_house && !profile.achievements.allin_hero && !profile.achievements.royal_legend);
  assert.equal(profile.stats.handsWon, 1); assert.equal(profile.stats.showdownsWon, 1);
  assert.ok(events.xp > 0);
  // losing hand: nothing
  const lost = recordHand(defaultProfile(), handFacts(s, 1));
  assert.equal(Object.keys(lost.profile.achievements).length, 0);
  assert.equal(lost.profile.stats.handsWon, 0);
});
test("Save validation rejects malformed data and never duplicates chips", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadSave(storage).session, null);
  mem.set("texas-holdem-poker-save", "{not json");
  assert.equal(loadSave(storage).profile.bankroll, 10000);
  mem.set("texas-holdem-poker-save", JSON.stringify({ v: 1, profile: { xp: -5, bankroll: "lots", settings: { timer: 999 } }, session: { v: 1, mode: "quick" } }));
  const l = loadSave(storage);
  assert.equal(l.profile.xp, 0); assert.equal(l.profile.settings.timer, 30); assert.equal(l.session, null);
  // a real session round-trips; starting a quick game moves the buy-in off the bankroll
  let app = initialApp();
  app = reducer(app, { type: "start", mode: "quick", cfg: { players: 3, difficulty: "easy", stack: 2000, blinds: { sb: 10, bb: 20 } }, roster: [{ name: "Mia", profile: "mia", diff: "easy" }, { name: "Leo", profile: "leo", diff: "easy" }], deck: shuffledDeck(), dealer: 0 });
  assert.equal(app.profile.bankroll, 8000);
  writeSave(storage, app.profile, app.session);
  const back = loadSave(storage);
  assert.equal(validateSession(back.session), null);
  assert.equal(back.profile.bankroll + back.session.table.players[0].stack + back.session.table.players[0].total, 10000);
  // tampered chips → session rejected, buy-in refunded once
  const bad2 = JSON.parse(mem.get("texas-holdem-poker-save"));
  bad2.session.table.players[1].stack += 5000;
  mem.set("texas-holdem-poker-save", JSON.stringify(bad2));
  const t = loadSave(storage);
  assert.equal(t.session, null);
  assert.equal(t.profile.bankroll, 10000);
  assert.ok(sanitizeProfile({ cosmetics: { theme: "neon" } }).cosmetics.theme === "green", "locked theme rejected");
  assert.equal(levelInfo(1e9).level, 30);
});
test("Reducer rejects stale / duplicate actions", () => {
  let app = initialApp();
  app = reducer(app, { type: "start", mode: "practice", cfg: { players: 2, difficulty: "easy", stack: 1000, blinds: { sb: 5, bb: 10 } }, roster: [{ name: "Alex", profile: "alex", diff: "easy" }], deck: rig(2, 0, []), dealer: 0 });
  const seq = app.session.table.seq;
  assert.equal(app.session.table.toAct, 0);
  const a1 = reducer(app, { type: "act", seq, seat: 0, action: { type: "call" } });
  const a2 = reducer(a1, { type: "act", seq, seat: 0, action: { type: "call" } });
  assert.equal(a2, a1, "second click with the old seq is ignored");
  assert.equal(reducer(app, { type: "timeout", seq: seq - 1 }), app);
  const to = reducer(app, { type: "timeout", seq });
  assert.ok(to.session.table.players[0].folded, "timeout folds when a check is not possible");
  assert.deepEqual(timeoutAction(a1.session.table, 1), { type: "check" });
});

console.log(`\n${passed} passed, ${failed} failed (${n} tests)`);
process.exit(failed ? 1 : 0);
