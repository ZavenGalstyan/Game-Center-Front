/**
 * Headless tests for Wild West: Card Showdown's rules layer.
 *   node src/components/games/WildWestShowdown/tools/engineTest.mjs [quick]
 * Covers: deck + shuffle, the evaluator (named cases + brute-force cross
 * check), hand text, pots/side pots/odd chips, betting flow, AI legality and
 * hidden information, AI sanity (not random), stage data, full matches on
 * every stage (chip conservation, termination, sundown, blinds), saves.
 */
import {
  freshDeck, shuffledDeck, shuffle, seeded, intFrom, parseCards, scoreHand, evaluate, describeHand, handName, rankClass, holeLabel,
  createTable, startHand, legalActions, applyAction, advance, viewFor, decide, buildPots, distribute, chipsAtTable, rankOf, suitOf,
} from "../engine/poker.js";
import { STAGES, STAGE_COUNT, blindLevels, stageById, titleFor } from "../engine/stages.js";
import { RIVALS, ARCHETYPES, profileFor } from "../engine/rivals.js";
import { createMatch, dealNext, act, afterHand, validateMatch, playOutHand, HUMAN, bankOf } from "../engine/match.js";
import { sanitizeProgress, freshProgress, recordResult, sanitizeSettings } from "../engine/save.js";

const QUICK = process.argv.includes("quick");
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; fails.push(name); console.log("  FAIL", name); }
}
const section = (s) => console.log(`\n== ${s}`);

/* ------------------------------------------------------------ deck */
section("deck & shuffle");
{
  const d = freshDeck();
  ok(d.length === 52 && new Set(d).size === 52, "fresh deck has 52 unique cards");
  const suits = [0, 0, 0, 0], ranks = new Array(15).fill(0);
  d.forEach((c) => { suits[suitOf(c)]++; ranks[rankOf(c)]++; });
  ok(suits.every((n) => n === 13), "13 cards per suit");
  ok(ranks.slice(2).every((n) => n === 4), "4 cards per rank 2..A");
  let allOk = true;
  for (let i = 0; i < 2000; i++) { const s = shuffledDeck(); if (s.length !== 52 || new Set(s).size !== 52) allOk = false; }
  ok(allOk, "2000 crypto shuffles: no duplicates or missing cards");
  // uniformity: where does card 0 land? chi-square over 52 positions
  const rnd = intFrom(seeded(7));
  const N = 52000, pos = new Array(52).fill(0), pair = new Array(52).fill(0);
  for (let i = 0; i < N; i++) { const s = shuffle(freshDeck(), rnd); pos[s.indexOf(0)]++; pair[s[0]]++; }
  const chi = (arr) => arr.reduce((a, o) => a + (o - N / 52) ** 2 / (N / 52), 0);
  ok(chi(pos) < 90 && chi(pair) < 90, `Fisher–Yates uniform (chi² ${chi(pos).toFixed(1)}, ${chi(pair).toFixed(1)}; 51 dof, crit≈77 @1%)`);
}

/* ------------------------------------------------------------ evaluator */
section("hand rankings");
const S = (str) => scoreHand(parseCards(str));
const cls = (str) => rankClass(S(str));
{
  ok(cls("Ah Kh Qh Jh Th 2c 3d") === 9, "royal flush");
  ok(cls("9s 8s 7s 6s 5s Ad Ac") === 8, "straight flush");
  ok(cls("As 2s 3s 4s 5s Kd Kc") === 8 && describeHand(S("As 2s 3s 4s 5s Kd Kc")) === "Straight Flush, Five-high", "steel wheel = 5-high straight flush");
  ok(cls("Ac 2d 3h 4s 5c 9d Kh") === 4 && describeHand(S("Ac 2d 3h 4s 5c 9d Kh")) === "Straight, Five-high", "wheel straight A-2-3-4-5");
  ok(S("2c 3d 4h 5s 6c 9d Kh") > S("Ac 2d 3h 4s 5c 9d Kh"), "6-high straight beats the wheel");
  ok(cls("Tc Jd Qh Ks Ac 2d 3h") === 4 && describeHand(S("Tc Jd Qh Ks Ac 2d 3h")) === "Straight, Ace-high", "broadway");
  ok(cls("Qc Kd Ah 2s 3c 9d 8h") === 0, "no wrap-around straight (Q-K-A-2-3)");
  ok(cls("2h 7h 9h Jh Kh Ac Ad") === 5, "flush");
  ok(S("2h 7h 9h Jh Kh 3c 4d") > S("5c 6d 7h 8s 9c Ac Ad"), "flush beats straight");
  ok(cls("Kc Kd Kh 7s 7c 2d 3h") === 6 && describeHand(S("Kc Kd Kh 7s 7c 2d 3h")) === "Full House, Kings over Sevens", "full house text");
  ok(cls("Kc Kd Kh 7s 7c 7d 3h") === 6 && describeHand(S("Kc Kd Kh 7s 7c 7d 3h")) === "Full House, Kings over Sevens", "two trips make a full house (higher trips)");
  ok(S("2c 2d 2h 3s 3c 9d Kh") > S("Ah Kh Qh 9h 2h 2c 3c"), "full house beats flush");
  ok(cls("9c 9d 9h 9s 2c 3d Kh") === 7 && S("9c 9d 9h 9s Ac 3d 4h") > S("9c 9d 9h 9s Kc Qd Jh"), "quads + kicker");
  ok(cls("Ac Ad Kc Kd Qc Qd 2h") === 2 && describeHand(S("Ac Ad Kc Kd Qc Qd 2h")) === "Two Pair, Aces and Kings", "three pairs → best two pair, kicker from third pair");
  ok(S("Ac Ad Kc Kd Qc 3d 2h") > S("Ac Ad Kc Kd Jc 3d 2h"), "two pair kicker decides");
  ok(cls("Ac Ad 3c 5d 9h Jc Ks") === 1 && describeHand(S("Ac Ad 3c 5d 9h Jc Ks")) === "Pair of Aces", "one pair");
  ok(cls("Ac 3d 5c 7d 9h Jc 2s") === 0 && describeHand(S("Ac 3d 5c 7d 9h Jc 2s")) === "High Card, Ace", "high card");
  ok(S("Ac Kd 5c 7d 9h") === S("As Kh 5d 7c 9s"), "identical ranks in different suits tie exactly");
  ok(handName(S("Ah Kh Qh Jh Th")) === "Royal Flush" && handName(S("2c 2d 5h 7s 9c")) === "One Pair", "hand names");
  ok(holeLabel(parseCards("Ah Ad")) === "Pocket Aces" && holeLabel(parseCards("Kh Qh")) === "Suited connectors" && holeLabel(parseCards("As 9d")) === "Ace-Nine offsuit", "hole labels");
  const ev = evaluate(parseCards("Kc Kd Kh 7s 7c 2d 3h"));
  ok(ev.best.length === 5 && ev.best.filter((c) => rankOf(c) === 13).length === 3 && ev.best.filter((c) => rankOf(c) === 7).length === 2, "evaluate() returns the winning five cards");
}

section("brute-force cross-check");
{
  // independent naive 5-card evaluator: returns comparable array
  const naive5 = (cs) => {
    const r = cs.map(rankOf).sort((a, b) => b - a);
    const flush = new Set(cs.map(suitOf)).size === 1;
    const uniq = [...new Set(r)];
    let straightHi = 0;
    if (uniq.length === 5 && r[0] - r[4] === 4) straightHi = r[0];
    if (uniq.join() === "14,5,4,3,2") straightHi = 5;
    const cnt = {}; r.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
    const groups = Object.entries(cnt).map(([k, v]) => [v, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const ks = groups.map((g) => g[1]);
    if (straightHi && flush) return [8, straightHi];
    if (groups[0][0] === 4) return [7, ...ks];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...ks];
    if (flush) return [5, ...r];
    if (straightHi) return [4, straightHi];
    if (groups[0][0] === 3) return [3, ...ks];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...ks];
    if (groups[0][0] === 2) return [1, ...ks];
    return [0, ...r];
  };
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  const best7 = (cs) => {
    let best = null;
    for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
      const five = cs.filter((_, i) => i !== a && i !== b);
      const v = naive5(five);
      if (!best || cmp(v, best) > 0) best = v;
    }
    return best;
  };
  const rnd = intFrom(seeded(42));
  let mism = 0, catSeen = new Set();
  const N = QUICK ? 3000 : 20000;
  for (let i = 0; i < N; i++) {
    const d = shuffle(freshDeck(), rnd);
    const a = d.slice(0, 7), b = d.slice(7, 14);
    const sa = scoreHand(a), sb = scoreHand(b);
    const na = best7(a), nb = best7(b);
    catSeen.add(na[0]);
    if (Math.sign(sa - sb) !== Math.sign(cmp(na, nb))) mism++;
    if (Math.floor(sa / 16 ** 5) !== na[0]) mism++;
  }
  ok(mism === 0, `${N} random 7-card pairs: evaluator agrees with brute force (${mism} mismatches, categories seen ${[...catSeen].sort().join("")})`);
}

/* ------------------------------------------------------------ pots */
section("pots, side pots, splits");
{
  // A all-in 100, B all-in 300, C calls 500 / D covers 500, D folded later? (folded chips stay)
  const players = [
    { total: 100, folded: false }, { total: 300, folded: false }, { total: 500, folded: false }, { total: 500, folded: true },
  ];
  const pots = buildPots(players);
  ok(pots.length === 3 && pots[0].amount === 400 && pots[1].amount === 600 && pots[2].amount === 400, "main pot 400, side pots 600 and 400");
  ok(pots[0].eligible.join() === "0,1,2" && pots[1].eligible.join() === "1,2" && pots[2].eligible.join() === "2", "folded player is never eligible; eligibility by contribution");
  // A has best hand, B second, C worst
  const { awards } = distribute(pots, { 0: 900, 1: 800, 2: 100 }, 4, 3);
  ok(awards[0] === 400 && awards[1] === 600 && awards[2] === 400 && awards[3] === 0, "short all-in wins only the main pot; side pots go to the best eligible hand");
  ok(awards.reduce((a, b) => a + b, 0) === 1400, "all chips distributed");
  // split with odd chip: 3 winners of 101 chips, dealer seat 2 → order 0,1,2? seats left of dealer first: 0,1,2
  const sp = distribute([{ amount: 101, eligible: [0, 1, 2] }], { 0: 5, 1: 5, 2: 5 }, 3, 2);
  ok(sp.awards[0] === 34 && sp.awards[1] === 34 && sp.awards[2] === 33, "split pot: odd chips to the first seats left of the button");
  const sp2 = distribute([{ amount: 100, eligible: [0, 2] }], { 0: 7, 2: 7 }, 3, 0);
  ok(sp2.awards[0] === 50 && sp2.awards[2] === 50, "even split between tied hands");
}

/* ------------------------------------------------------------ table flow */
section("betting rounds");
const rig = (holes, board, n) => {
  // deal order: two passes starting left of the button; burn before each street
  const deck = new Array(52).fill(-1);
  const used = new Set();
  const order = holes.map((_, i) => i);
  const seq = [];
  for (let pass = 0; pass < 2; pass++) for (const i of order) seq.push(holes[i][pass]);
  const b = board;
  const flow = [...seq, null, b[0], b[1], b[2], null, b[3], null, b[4]];
  flow.forEach((c, i) => { if (c != null) { deck[i] = c; used.add(c); } });
  const rest = freshDeck().filter((c) => !used.has(c));
  for (let i = 0; i < 52; i++) if (deck[i] < 0) deck[i] = rest.shift();
  return deck;
};
{
  const t0 = createTable({ players: [{ id: "a", name: "A", stack: 1000 }, { id: "b", name: "B", stack: 1000, ai: true }, { id: "c", name: "C", stack: 1000, ai: true }], blinds: { sb: 10, bb: 20 } });
  let { state: s, error } = startHand(t0, shuffledDeck(), { dealer: 0 });
  ok(!error && s.sbSeat === 1 && s.bbSeat === 2 && s.toAct === 0, "3-handed: SB left of button, BB next, button opens preflop");
  ok(s.players[1].bet === 10 && s.players[2].bet === 20 && s.currentBet === 20, "blinds posted");
  ok(s.players.every((p) => p.hole.length === 2) && new Set(s.players.flatMap((p) => p.hole)).size === 6, "two private cards each, no duplicates");
  let la = legalActions(s, 0);
  ok(la.canCall && la.canRaise && !la.canCheck && !la.canBet && la.minTo === 40, "facing the blind: call/raise, min raise to 40");
  ok(applyAction(s, 1, { type: "call" }).error, "acting out of turn is rejected");
  ok(applyAction(s, 0, { type: "raise", amount: 30 }).error, "raise below the minimum is rejected");
  s = applyAction(s, 0, { type: "raise", amount: 60 }).state;
  s = applyAction(s, 1, { type: "call" }).state;
  la = legalActions(s, 2);
  ok(la.minTo === 100, "re-raise minimum = last raise size (60 → 100)");
  s = applyAction(s, 2, { type: "call" }).state;
  ok(s.phase === "street-end", "round closes when everyone matched");
  s = advance(s).state;
  ok(s.street === "flop" && s.board.length === 3 && s.burned.length === 1 && s.toAct === 1, "flop: 3 cards + burn; first active left of button acts");
  la = legalActions(s, 1);
  ok(la.canCheck && la.canBet && !la.canCall && la.minTo === 20, "postflop: check or bet (min = big blind)");
  s = applyAction(s, 1, { type: "check" }).state;
  s = applyAction(s, 2, { type: "check" }).state;
  s = applyAction(s, 0, { type: "check" }).state;
  ok(s.phase === "street-end", "checked around");
  s = advance(s).state;
  ok(s.street === "turn" && s.board.length === 4, "turn");
  s = applyAction(s, 1, { type: "bet", amount: 100 }).state;
  s = applyAction(s, 2, { type: "fold" }).state;
  s = applyAction(s, 0, { type: "call" }).state;
  s = advance(s).state;
  ok(s.street === "river" && s.board.length === 5, "river");
  s = applyAction(s, 1, { type: "check" }).state;
  s = applyAction(s, 0, { type: "check" }).state;
  s = advance(s).state;
  ok(s.phase === "showdown" && s.players[0].revealed && s.players[1].revealed && !s.players[2].revealed, "showdown reveals live hands only");
  s = advance(s).state;
  ok(s.phase === "complete" && chipsAtTable(s) === 3000, "pot awarded, chips conserved");
  const seen = [...s.board, ...s.burned, ...s.players.flatMap((p) => p.hole)];
  ok(new Set(seen).size === seen.length && seen.length === 5 + 3 + 6, "no card dealt twice in a hand");

  // heads-up: button = SB and acts first preflop, last postflop
  const h0 = createTable({ players: [{ id: "a", name: "A", stack: 500 }, { id: "b", name: "B", stack: 500, ai: true }], blinds: { sb: 5, bb: 10 } });
  let h = startHand(h0, shuffledDeck(), { dealer: 1 }).state;
  ok(h.sbSeat === 1 && h.bbSeat === 0 && h.toAct === 1, "heads-up: button posts SB and acts first preflop");
  h = applyAction(h, 1, { type: "call" }).state;
  ok(legalActions(h, 0).canCheck, "big blind option to check");
  h = applyAction(h, 0, { type: "check" }).state;
  h = advance(h).state;
  ok(h.toAct === 0, "heads-up: big blind acts first after the flop");

  // all-in for less than a raise does not reopen the betting
  const a0 = createTable({ players: [{ id: "a", name: "A", stack: 1000 }, { id: "b", name: "B", stack: 130, ai: true }, { id: "c", name: "C", stack: 1000, ai: true }], blinds: { sb: 10, bb: 20 } });
  let a = startHand(a0, shuffledDeck(), { dealer: 2 }).state; // A=SB(0)? dealer 2 → sb 0, bb 1, utg = 2
  a = applyAction(a, 2, { type: "raise", amount: 100 }).state;
  a = applyAction(a, 0, { type: "call" }).state;
  a = applyAction(a, 1, { type: "allin" }).state; // to 130: +30 < 80 raise
  const la2 = legalActions(a, 2);
  ok(la2 && la2.canCall && !la2.canRaise, "short all-in: previous raiser may only call");
  ok(applyAction(a, 2, { type: "raise", amount: 300 }).error, "short all-in does not reopen raising");

  // split pot when the board plays
  const board = parseCards("Ah Kd Qc Js Th");
  const deck = rig([parseCards("2c 3d"), parseCards("4c 5d"), parseCards("6c 7d")], board);
  let sp = startHand(createTable({ players: [{ id: "a", name: "A", stack: 300 }, { id: "b", name: "B", stack: 300 }, { id: "c", name: "C", stack: 300 }], blinds: { sb: 5, bb: 10 } }), deck, { dealer: 2 }).state;
  ok(sp.players[0].hole.join() === parseCards("2c 3d").join(), "rigged deck deals in order");
  let g = 0;
  while (sp.phase !== "complete" && g++ < 50) {
    if (sp.phase === "betting") {
      const la3 = legalActions(sp, sp.toAct);
      sp = applyAction(sp, sp.toAct, la3.canCheck ? { type: "check" } : { type: "call" }).state;
    } else sp = advance(sp).state;
  }
  ok(sp.result.showdown && sp.result.winners.length === 3 && sp.players.every((p) => p.stack === 300), "board plays: three-way split, everyone gets their 10 back");

  // side pot hand: short stack all-in wins main, bigger hand wins side
  const d2 = rig([parseCards("Ac Ad"), parseCards("Kc Kd"), parseCards("Qc Qd")], parseCards("2h 7s 9d 3c 4h"));
  let sh = startHand(createTable({ players: [{ id: "a", name: "A", stack: 100 }, { id: "b", name: "B", stack: 400 }, { id: "c", name: "C", stack: 400 }], blinds: { sb: 5, bb: 10 } }), d2, { dealer: 2 }).state;
  // dealer 2 → sb 0, bb 1, first to act 2
  sh = applyAction(sh, 2, { type: "allin" }).state;
  sh = applyAction(sh, 0, { type: "allin" }).state;
  sh = applyAction(sh, 1, { type: "call" }).state;
  g = 0;
  while (sh.phase !== "complete" && g++ < 20) sh = advance(sh).state;
  ok(sh.players[0].stack === 300 && sh.players[1].stack === 600 && sh.players[2].stack === 0, "AA wins the 300 main pot, KK wins the 600 side pot over QQ");
  ok(sh.result.pots.length === 2, "two pots built");
}

/* ------------------------------------------------------------ AI */
section("AI");
{
  const rnd = seeded(99);
  // hidden information: the view never contains other hole cards or the deck
  const m0 = dealNext(createMatch(5)).match;
  const v = viewFor(m0.table, 1);
  ok(!("deck" in v) && !("burned" in v) && v.players[0].hole.length === 0 && v.players[2].hole.length === 0 && v.players[1].hole.length === 2, "AI view hides the deck, burns and other players' cards");
  // the AI's decision cannot depend on the human's cards: same view → same action under the same seed
  const tA = JSON.parse(JSON.stringify(m0.table));
  const tB = JSON.parse(JSON.stringify(m0.table));
  const other = freshDeck().filter((c) => !tB.players.slice(1).flatMap((p) => p.hole).includes(c));
  tB.players[0].hole = [other[0], other[1]];
  const seatToAct = tA.toAct;
  if (seatToAct !== HUMAN) {
    const ctx = () => ({ profile: profileFor(tA.players[seatToAct].profile), difficulty: "hard", rand: seeded(5), memory: {}, tournament: true });
    const da = decide(viewFor(tA, seatToAct), ctx()), db = decide(viewFor(tB, seatToAct), ctx());
    ok(da.type === db.type && da.amount === db.amount, "AI decision identical whatever the human holds");
  } else ok(true, "AI decision identical whatever the human holds (human to act; skipped)");

  // fuzz: every AI action is legal for every archetype × difficulty
  let illegal = 0, hands = 0;
  for (const stage of [1, 5, 10, 15]) {
    let m = createMatch(stage);
    for (let h = 0; h < (QUICK ? 15 : 60) && !m.done; h++) {
      m = dealNext(m, shuffle(freshDeck(), intFrom(rnd))).match;
      try { m = playOutHand(m, { rand: rnd, sims: 60 }); } catch (e) { illegal++; console.log(e.message); break; }
      hands++;
      m = afterHand(m).match;
    }
  }
  ok(illegal === 0, `AI fuzz: ${hands} hands, no illegal actions`);

  // not random: premium hands never fold preflop to one raise; trash folds to a big raise
  const pre = (holeStr, raiseTo, arche, diff) => {
    let folds = 0;
    for (let i = 0; i < 60; i++) {
      const hole = parseCards(holeStr);
      const deck = rig([hole, parseCards("9s 4h"), parseCards("2c 7d")], parseCards("Jh 8c 3s Td 5c")); // deal order: seats 1, 2, 0
      let s = startHand(createTable({ players: [{ id: "you", name: "You", stack: 2000 }, { id: "x", name: "X", stack: 2000, ai: true }, { id: "y", name: "Y", stack: 2000, ai: true }], blinds: { sb: 10, bb: 20 } }), deck, { dealer: 0 }).state;
      // dealer 0 → sb 1, bb 2, human (0) acts first
      s = applyAction(s, 0, { type: "raise", amount: raiseTo }).state;
      const d = decide(viewFor(s, 1), { profile: { ...ARCHETYPES[arche].ai }, difficulty: diff, rand: seeded(i + 1), memory: {}, tournament: true });
      if (d.type === "fold") folds++;
    }
    return folds / 60;
  };
  ok(pre("As Ad", 80, "sheriff", "hard") === 0 && pre("Ks Kd", 80, "rookie", "easy") <= 0.15, "pocket aces/kings don't fold to a raise");
  ok(pre("7s 2d", 300, "sheriff", "hard") >= 0.9, "seven-deuce folds to a big raise (tight sheriff)");
  ok(pre("Jc 8d", 60, "outlaw", "medium") < pre("Jc 8d", 60, "sheriff", "medium") && pre("Jc 8d", 60, "gambler", "medium") < pre("Jc 8d", 60, "sheriff", "medium"), "outlaw and gambler continue wider than the sheriff");
}

/* ------------------------------------------------------------ stages */
section("stages & rivals");
{
  ok(STAGES.length === 15 && STAGE_COUNT === 15 && STAGES.every((s, i) => s.id === i + 1), "15 stages numbered 1..15");
  ok(STAGES.every((s) => s.rivals.length >= 1 && s.rivals.length <= 3 && s.rivals.every((r) => RIVALS[r]) && new Set(s.rivals).size === s.rivals.length), "every stage seats 1–3 distinct known rivals");
  ok(STAGES.filter((s) => s.rivals.length >= 2).length >= 13, "most stages have 2–3 opponents");
  const D = { easy: 0, medium: 1, hard: 2 };
  ok(STAGES.every((s, i) => i === 0 || D[s.diff] >= D[STAGES[i - 1].diff]), "difficulty never decreases along the trail");
  ok(STAGES.every((s, i) => i === 0 || s.purse > STAGES[i - 1].purse), "purses grow");
  ok(Object.values(RIVALS).every((r) => ARCHETYPES[r.archetype]) && new Set(Object.values(RIVALS).map((r) => r.archetype)).size === 5, "all five archetypes used");
  ok(STAGES.every((s) => s.story && s.goal && s.town && s.saloon && s.env.sky && s.map.length >= 2), "every stage has story, goal, environment and map position");
  const bl = blindLevels(20);
  ok(bl[0].bb === 20 && bl[0].sb === 10 && bl.every((l, i) => i === 0 || l.bb > bl[i - 1].bb), "blind ladder rises");
  ok(titleFor(0) === "Unknown Traveler" && titleFor(15) === "Grand Champion of the West", "titles");
}

section("matches on every stage");
{
  const rnd = seeded(2024);
  const ri = intFrom(rnd);
  let conserved = true, finished = 0, wins = 0, levelUps = 0, sundowns = 0, badResult = 0;
  const perStage = [];
  for (const st of STAGES) {
    const runs = QUICK ? 1 : 3;
    let w = 0;
    for (let r = 0; r < runs; r++) {
      let m = createMatch(st.id);
      const bank = bankOf(m);
      let guard = 0;
      while (!m.done && guard++ < 400) {
        m = dealNext(m, shuffle(freshDeck(), ri)).match;
        m = playOutHand(m, { rand: rnd, sims: 50 });
        if (chipsAtTable(m.table) !== bank) conserved = false;
        const res = afterHand(m);
        m = res.match;
        if (res.events.levelUp) levelUps++;
        if (validateMatch(JSON.parse(JSON.stringify(m)))) conserved = false;
      }
      if (m.done) finished++;
      if (m.result?.reason === "sundown") sundowns++;
      if (m.result?.won) { wins++; w++; }
      const alive = m.table.players.filter((p) => !p.out).length;
      if (m.result.reason === "busted-all" && !(alive === 1 && !m.table.players[0].out)) badResult++;
      if (m.result.reason === "busted" && !m.table.players[0].out) badResult++;
      if (m.result.reason === "sundown" && m.handsPlayed !== st.sundown) badResult++;
    }
    perStage.push(`${st.id}:${w}/${runs}`);
  }
  const total = STAGES.length * (QUICK ? 1 : 3);
  ok(finished === total, `all ${total} matches finished (${finished})`);
  ok(conserved, "chips conserved and saved state valid after every hand");
  ok(levelUps > 0, `blinds rose (${levelUps} level-ups)`);
  ok(badResult === 0, "results consistent with the final table");
  console.log(`  balanced bot as the player: ${wins}/${total} wins (${perStage.join(" ")}), ${sundowns} decided at sundown`);
}

section("difficulty curve");
if (!QUICK) {
  const rate = (stageId, n) => {
    const rnd = seeded(stageId * 77);
    const ri = intFrom(rnd);
    let w = 0;
    for (let k = 0; k < n; k++) {
      let m = createMatch(stageId);
      while (!m.done) {
        m = dealNext(m, shuffle(freshDeck(), ri)).match;
        m = playOutHand(m, { rand: rnd, sims: 40 });
        m = afterHand(m).match;
      }
      if (m.result.won) w++;
    }
    return w / n;
  };
  const N = 14;
  const early = (rate(1, N) + rate(2, N)) / 2;
  const late = (rate(13, N) + rate(15, N)) / 2;
  console.log(`  bot win rate: stages 1–2 ${(early * 100).toFixed(0)}%, stages 13/15 ${(late * 100).toFixed(0)}%`);
  ok(early > late, "early stages are easier than the late ones for the same player");
} else console.log("  (skipped in quick mode)");

/* ------------------------------------------------------------ saves */
section("saves");
{
  ok(JSON.stringify(sanitizeProgress(null)) === JSON.stringify(freshProgress()), "missing save → fresh career");
  ok(sanitizeProgress({ v: 99, unlocked: 9 }).unlocked === 1, "wrong version → fresh career");
  ok(sanitizeProgress({ v: 1, unlocked: 99, completed: { 3: { wins: 1 } } }).unlocked === 4, "out-of-range unlock clamped; completed stage unlocks the next");
  ok(sanitizeProgress({ v: 1, unlocked: 1, completed: { 77: { wins: 1 }, x: 5 } }).unlocked === 1, "unknown stages ignored");
  let m = dealNext(createMatch(2)).match;
  m = act(m, m.table.toAct, { type: "call" }).match;
  const roundTrip = JSON.parse(JSON.stringify({ v: 1, unlocked: 2, completed: { 1: { wins: 1, bestHands: 20 } }, winnings: 500, matchesPlayed: 1, current: m }));
  const p = sanitizeProgress(roundTrip);
  ok(p.current && p.current.table.seq === m.table.seq, "mid-hand match survives a save/load round trip");
  const broken = JSON.parse(JSON.stringify(roundTrip));
  broken.current.table.players[1].stack += 500;
  ok(sanitizeProgress(broken).current === null && sanitizeProgress(broken).unlocked === 2, "tampered chip count → match dropped, career kept");
  const locked = JSON.parse(JSON.stringify(roundTrip));
  locked.current = dealNext(createMatch(9)).match;
  ok(sanitizeProgress(locked).current === null, "a match on a locked stage is dropped");
  const won = { ...createMatch(1), done: true, handsPlayed: 30, result: { won: true, place: 1 } };
  const p2 = recordResult(freshProgress(), won);
  ok(p2.unlocked === 2 && p2.completed[1].wins === 1 && p2.winnings === stageById(1).purse && p2.current === null, "win records, unlocks next, pays the purse");
  const lost = { ...createMatch(1), done: true, result: { won: false } };
  const p3 = recordResult(freshProgress(), lost);
  ok(p3.unlocked === 1 && !p3.completed[1] && p3.matchesPlayed === 1, "loss unlocks nothing");
  const p4 = recordResult(recordResult(freshProgress(), won), { ...won, handsPlayed: 22 });
  ok(p4.completed[1].wins === 2 && p4.completed[1].bestHands === 22 && p4.winnings === 2 * stageById(1).purse, "replaying a stage keeps the best result");
  ok(sanitizeSettings({ quality: "ultra", volume: 3, cardAssist: false }).quality === "auto" && sanitizeSettings({ volume: 3 }).volume === 1 && sanitizeSettings({ cardAssist: false }).cardAssist === false, "settings sanitised");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log(fails.map((f) => " - " + f).join("\n")); process.exit(1); }
