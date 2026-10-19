/**
 * Headless rules-engine tests for Armenian Blot Heritage.
 *   node src/components/games/ArmenianBlot/tools/engineTest.mjs
 * Deterministic: every random input comes from seeded() fixtures.
 */
import { freshDeck, shuffledDeck, deal, seeded, intFrom, parseCard as C, parseCards, suitOf, rankOf, validDeck, shuffle } from "../engine/deck.js";
import { makeRules, cardPoints, deckPoints, NT, AT, strength, PRESETS } from "../engine/rules.js";
import { legalMoves, legalMovesWhy, trickWinner, beats } from "../engine/play.js";
import { newAuction, applyBid, legalBids, contractOf } from "../engine/bidding.js";
import { detectDeclarations, resolveDeclarations, beloteHolder } from "../engine/declarations.js";
import { scoreHand, matchWinner } from "../engine/scoring.js";
import { newMatch, bid, play, collect, nextHand, redeal, viewFor, validateMatch, legalFor } from "../engine/match.js";
import { chooseBid, choosePlay, decide, evaluateHand } from "../engine/ai.js";
import { loadSave, writeSave, recordHand, recordMatch, defaultStats, SAVE_KEY } from "../engine/save.js";

let pass = 0, fail = 0;
const t0 = Date.now();
const results = [];
function test(name, fn) {
  try {
    fn();
    pass++;
    results.push(`  ok   ${name}`);
  } catch (e) {
    fail++;
    results.push(`  FAIL ${name}\n       ${e.message}`);
  }
}
const eq = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, m = "assertion failed") => { if (!v) throw new Error(m); };
const R = makeRules();
const H = 0, D = 1, CL = 2, S = 3;
const T = (...pairs) => pairs.map(([seat, c]) => ({ seat, card: C(c) }));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** A deck that deals exactly `hands` (seat-indexed card strings) for `dealer`. */
function deckFor(hands, dealer = 3, pattern = R.dealPattern) {
  const hs = hands.map((h) => (typeof h === "string" ? parseCards(h) : h.slice()));
  const deck = [];
  const idx = [0, 0, 0, 0];
  for (const n of pattern) for (let i = 1; i <= 4; i++) { const s = (dealer + i) % 4; for (let j = 0; j < n; j++) deck.push(hs[s][idx[s]++]); }
  if (!validDeck(deck)) throw new Error("fixture hands are not a full deck");
  return deck;
}
/** Plays an auction from a list of [seat, action]. */
function auction(m, acts) {
  for (const [seat, a] of acts) {
    const r = bid(m, seat, a);
    if (r.error) throw new Error(`bid ${JSON.stringify(a)} by ${seat}: ${r.error}`);
    m = r.match;
  }
  return m;
}
const P = { type: "pass" };
const B = (level, strain) => ({ type: "bid", level, strain });

// Fixture: dealer 3 → seat 0 speaks first and leads.
const FIX = [
  "JH 9H AH 10H KH QH 7D 8D", // seat 0: big hearts + belote + terz/quinte
  "AD 10D KD QD JD 9D 7C 8C", // seat 1
  "AC 10C KC QC JC 9C 8H 7H", // seat 2
  "AS 10S KS QS JS 9S 8S 7S", // seat 3
];

/* ================================================================ DECK */
test("1. deck has exactly 32 cards", () => eq(freshDeck().length, 32));
test("2. deck cards are unique", () => eq(new Set(shuffledDeck(intFrom(seeded(1)))).size, 32));
test("3. four suits", () => eq(new Set(freshDeck().map(suitOf)).size, 4));
test("4. eight ranks per suit", () => { for (let s = 0; s < 4; s++) eq(freshDeck().filter((c) => suitOf(c) === s).map(rankOf).sort(), [0, 1, 2, 3, 4, 5, 6, 7]); });
test("5. dealing follows the 3-2-3 packets from the dealer's left", () => {
  const d = freshDeck();
  const hs = deal(d, 3, [3, 2, 3]);
  eq(hs[0].slice(0, 3), [0, 1, 2], "seat 0 first packet");
  eq(hs[1].slice(0, 3), [3, 4, 5], "seat 1 first packet");
  eq(hs[0].slice(3, 5), [12, 13], "seat 0 second packet");
  const all = hs.flat();
  eq(new Set(all).size, 32);
});
test("6. eight cards per player after a completed deal", () => { for (let k = 0; k < 20; k++) deal(shuffledDeck(intFrom(seeded(k))), k % 4).forEach((h) => eq(h.length, 8)); });
test("6b. Fisher-Yates is unbiased (chi-square on first position)", () => {
  const rng = intFrom(seeded(42));
  const counts = new Array(32).fill(0);
  const N = 32000;
  for (let i = 0; i < N; i++) counts[shuffle(freshDeck(), rng)[0]]++;
  const exp = N / 32;
  const chi = counts.reduce((t, c) => t + (c - exp) ** 2 / exp, 0);
  ok(chi < 60, `chi-square ${chi.toFixed(1)} too high`); // df=31, p≈0.001 at 61
});

/* ================================================================ TRUMP */
test("7. trump Jack beats trump Nine", () => eq(trickWinner(T([1, "9H"], [2, "JH"]), H), 2));
test("8. trump Nine beats trump Ace", () => eq(trickWinner(T([1, "AH"], [2, "9H"]), H), 2));
test("9. non-trump Ace beats non-trump Ten", () => eq(trickWinner(T([1, "10S"], [2, "AS"], [3, "7S"], [0, "KS"]), H), 2));
test("10. trump beats the led non-trump suit", () => eq(trickWinner(T([1, "AS"], [2, "7H"], [3, "10S"], [0, "KS"]), H), 2));
test("11. an off-suit card cannot win without trump", () => eq(trickWinner(T([1, "8S"], [2, "AD"], [3, "7S"], [0, "AC"]), H), 1));
test("11b. full trump ranking J 9 A 10 K Q 8 7", () => {
  const order = ["JH", "9H", "AH", "10H", "KH", "QH", "8H", "7H"].map(C);
  for (let i = 0; i < order.length - 1; i++) ok(beats(order[i], order[i + 1], H, H), `${i}`);
});
test("11c. full plain ranking A 10 K Q J 9 8 7", () => {
  const order = ["AS", "10S", "KS", "QS", "JS", "9S", "8S", "7S"].map(C);
  for (let i = 0; i < order.length - 1; i++) ok(beats(order[i], order[i + 1], S, H), `${i}`);
});
test("11d. No Trump: no card trumps; All Trump: led suit wins, J high", () => {
  eq(trickWinner(T([1, "7S"], [2, "JH"]), NT), 1);
  eq(trickWinner(T([1, "AS"], [2, "JS"], [3, "JH"]), AT), 2);
});

/* ================================================================ LEGAL MOVES */
test("12. following suit is enforced", () => {
  const hand = parseCards("7S AS 9D JH");
  eq(legalMoves(hand, T([1, "KS"]), H, 2, R).sort(), parseCards("7S AS").sort());
});
test("13. void in the led suit with an opponent winning → must trump", () => {
  const hand = parseCards("7H JD AD 8C");
  eq(legalMovesWhy(hand, T([1, "KS"]), H, 2, R), { cards: [C("7H")], reason: "trump" });
});
test("14. overtrump obligation when an opponent has trumped", () => {
  const hand = parseCards("7H JH AD 8C");
  // seat 1 leads ♠, seat 2 (partner of 0) plays ♠, seat 3 trumps with 9H; seat 0 must overtrump with JH
  const r = legalMovesWhy(hand, T([1, "KS"], [2, "7S"], [3, "9H"]), H, 0, R);
  eq(r, { cards: [C("JH")], reason: "overtrump" });
});
test("14b. trump led: must play a higher trump if able", () => {
  const hand = parseCards("7H JH AD");
  eq(legalMoves(hand, T([1, "9H"]), H, 2, R), [C("JH")]);
});
test("14c. cannot beat the opponent's trump → free discard (Armenian Classic)", () => {
  const hand = parseCards("7H AD 8C");
  eq(legalMovesWhy(hand, T([1, "KS"], [2, "7S"], [3, "JH"]), H, 0, R).reason, "cannotBeat");
  const strict = makeRules("classicPoints");
  eq(legalMoves(hand, T([1, "KS"], [2, "7S"], [3, "JH"]), H, 0, strict), [C("7H")], "undertrump required in classicPoints");
});
test("15. partner-winning exception follows the preset", () => {
  const hand = parseCards("7H AD 8C");
  const trick = T([2, "AS"], [3, "7S"]); // partner (2) winning with the ace
  eq(legalMovesWhy(hand, trick, H, 0, R).reason, "partner");
  eq(legalMoves(hand, trick, H, 0, R).length, 3);
  const noEx = makeRules("armenianClassic", { partnerException: false });
  eq(legalMoves(hand, trick, H, 0, noEx), [C("7H")]);
});
test("16. no led suit and no trump → any card", () => {
  const hand = parseCards("AD 8C 9C");
  eq(legalMoves(hand, T([1, "KS"]), H, 2, R).length, 3);
});
test("17. illegal cards are rejected by the engine", () => {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 });
  m = auction(m, [[0, B(8, H)], [1, P], [2, P], [3, P]]);
  m = play(m, 0, C("JH")).match; // seat 0 leads trump J
  const r = play(m, 1, C("AD")); // seat 1 has no hearts, no trump → any card OK; try a card not in hand
  ok(!r.error);
  const bad = play(r.match, 2, C("AC")); // seat 2 holds 8H 7H → must follow hearts
  eq(bad.error, "illegal-card");
  eq(play(r.match, 3, C("AS")).error, "not-your-turn");
  eq(play(r.match, 2, C("JH")).error, "not-in-hand");
});
test("18. AI and human use the same legal-move generator", () => {
  const rng = seeded(7);
  for (let g = 0; g < 30; g++) {
    let m = newMatch({ rules: R, deck: shuffledDeck(intFrom(seeded(100 + g))), dealer: g % 4, difficulty: ["easy", "medium", "hard"][g % 3] });
    m = forceContract(m);
    if (!m) continue;
    for (let i = 0; i < 32; i++) {
      if (m.hand.phase === "trickEnd") { m = collect(m).match; i--; continue; }
      if (m.hand.phase !== "play") break;
      const s = m.hand.turn;
      const v = viewFor(m, s);
      const card = choosePlay({ ...v, samples: 6 }, rng);
      ok(legalFor(m, s).cards.includes(card), "AI card must be in legalFor");
      ok(legalMoves(v.hand, v.trick, v.contract.strain, s, v.rules).includes(card));
      m = play(m, s, card).match;
    }
  }
});
function forceContract(m) {
  const t = m.hand.turn;
  const r = bid(m, t, B(8, H));
  if (r.error) return null;
  m = r.match;
  for (let k = 1; k <= 3; k++) m = bid(m, (t + k) % 4, P).match;
  return m.hand.phase === "play" ? m : null;
}

/* ================================================================ BIDDING */
test("19. bidding starts left of the dealer and goes clockwise", () => {
  let a = newAuction(1);
  eq(a.turn, 2);
  a = applyBid(a, 2, P, R).auction;
  eq(a.turn, 3);
  a = applyBid(a, 3, B(8, S), R).auction;
  eq(a.turn, 0);
});
test("20. a legal bid is accepted", () => {
  const r = applyBid(newAuction(3), 0, B(8, H), R);
  ok(!r.error);
  eq(r.auction.high, { seat: 0, level: 8, strain: H, kaput: false });
});
test("21. illegal bids are rejected (too low, out of turn, not a raise, bad strain)", () => {
  eq(applyBid(newAuction(3), 0, B(7, H), R).error, "illegal-bid");
  eq(applyBid(newAuction(3), 1, B(8, H), R).error, "not-your-turn");
  const a = applyBid(newAuction(3), 0, B(9, H), R).auction;
  eq(applyBid(a, 1, B(9, S), R).error, "illegal-bid", "same level, other suit");
  eq(applyBid(a, 1, B(17, S), R).error, "illegal-bid", "above max");
  eq(applyBid(a, 1, B(10, AT), R).error, "illegal-bid", "All Trump disabled in Armenian Classic");
  eq(applyBid(a, 1, { type: "contra" }, R).error, undefined, "contra by an opponent is fine");
  eq(applyBid(a, 1, { type: "recontra" }, R).error, "illegal-bid");
});
test("22. pass is accepted and passed players may bid again", () => {
  let a = applyBid(newAuction(3), 0, P, R).auction;
  a = applyBid(a, 1, B(8, D), R).auction;
  a = applyBid(a, 2, P, R).auction;
  a = applyBid(a, 3, P, R).auction;
  const r = applyBid(a, 0, B(9, H), R);
  ok(!r.error, "seat 0 passed first, may bid now");
});
test("23. four opening passes → redeal by the next dealer", () => {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 });
  m = auction(m, [[0, P], [1, P], [2, P], [3, P]]);
  eq(m.hand.phase, "redeal");
  const r = redeal(m, shuffledDeck(intFrom(seeded(5))));
  eq(r.match.hand.dealer, 0);
  eq(r.match.hand.phase, "bidding");
  eq(r.match.handNo, 1);
  const same = makeRules("armenianClassic", { allPass: "sameDealer" });
  let m2 = auction(newMatch({ rules: same, deck: deckFor(FIX), dealer: 3 }), [[0, P], [1, P], [2, P], [3, P]]);
  eq(redeal(m2, freshDeck()).match.hand.dealer, 3);
});
test("24. the contract belongs to the last bidder's team after three passes", () => {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 });
  m = auction(m, [[0, B(8, H)], [1, B(9, D)], [2, B(10, CL)], [3, P], [0, P], [1, P]]);
  eq(m.hand.phase, "play");
  eq(m.hand.contract.seat, 2);
  eq(m.hand.contract.team, 0);
  eq(m.hand.contract.level, 10);
  eq(m.hand.contract.target, 100);
  eq(m.hand.leader, 0, "left of dealer leads");
});
test("25. trump selection follows the contract strain (incl. No Trump)", () => {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 });
  m = auction(m, [[0, B(8, H)], [1, B(9, NT)], [2, P], [3, P], [0, P]]);
  eq(m.hand.contract.strain, NT);
  eq(m.hand.belote.seat, null, "no belote in No Trump");
});
test("25b. contra ×2 then recontra ×4; Kaput outranks numbers", () => {
  let a = applyBid(newAuction(3), 0, B(10, H), R).auction;
  a = applyBid(a, 1, { type: "contra" }, R).auction;
  eq(a.stage, "contra");
  eq(a.turn, 2, "contract side answers");
  eq(legalBids(a, 2, R).bids.length, 0, "no more bids after contra");
  a = applyBid(a, 2, { type: "recontra" }, R).auction;
  eq(a.result, "contract");
  eq(contractOf(a, R).mult, 4);
  let k = applyBid(newAuction(3), 0, B(16, H), R).auction;
  k = applyBid(k, 1, { type: "kaput", strain: S }, R).auction;
  eq(legalBids(k, 2, R).bids.length, 0);
  eq(contractOf({ ...k, result: "contract" }, R).value, 25);
});

/* ================================================================ DECLARATIONS */
test("26. terz detection", () => {
  const d = detectDeclarations(parseCards("7H 8H 9H JD AS 10C KC 8S"), S, R);
  eq(d.length, 1); eq(d[0].len, 3); eq(d[0].value, 20);
});
test("27. four-card sequence detection (Fifty)", () => {
  const d = detectDeclarations(parseCards("10D JD QD KD 7H 9S 8C AC"), H, R);
  eq(d.map((x) => x.value), [50]);
});
test("28. five-card sequence detection (Hundred)", () => {
  const d = detectDeclarations(parseCards("9C 10C JC QC KC 7H 8S AD"), H, R);
  eq(d.map((x) => [x.len, x.value]), [[5, 100]]);
});
test("29. four-of-a-kind detection (Jacks 200, Nines 150, Aces 100, none for 7s)", () => {
  eq(detectDeclarations(parseCards("JH JD JC JS 7H 9D AS 8C"), H, R).map((x) => x.value), [200]);
  eq(detectDeclarations(parseCards("9H 9D 9C 9S 7H JD AS 8C"), H, R).map((x) => x.value), [150]);
  eq(detectDeclarations(parseCards("AH AD AC AS 7H JD 9S 8C"), H, R).map((x) => x.value), [100]);
  eq(detectDeclarations(parseCards("7H 7D 7C 7S 9H JD AS 10C"), H, R).length, 0);
  eq(detectDeclarations(parseCards("9H 9D 9C 9S 7H JD AS 8C"), NT, R).length, 0, "no nines in No Trump");
});
test("29b. one card belongs to one combination (best partition)", () => {
  // JH QH KH terz + four kings: kings (100) beat terz (20); using KH in the quad kills the terz
  const d = detectDeclarations(parseCards("JH QH KH KD KC KS 7D 8C"), S, R);
  eq(d.map((x) => x.value).sort(), [100]);
});
test("30. declaration priority: higher value wins; only that side scores", () => {
  const bySeat = [
    detectDeclarations(parseCards("7H 8H 9H AD 10D 7C 8S 9S"), S, R), // terz (20)
    detectDeclarations(parseCards("10D JD QD KD 7C 9C AS KS"), S, R), // fifty (50)
    detectDeclarations(parseCards("AC KC QC 9D 8D JS 10S QS"), S, R), // terz (20)
    [],
  ];
  const r = resolveDeclarations(bySeat, S, 0, R);
  eq(r.team, 1);
  eq(r.points, [0, 50]);
});
test("31. equal declarations: trump sequence wins, else cancel (or eldest by preset)", () => {
  const terzH = detectDeclarations(parseCards("7H 8H 9H"), S, R);
  const terzD = detectDeclarations(parseCards("7D 8D 9D"), S, R);
  const terzS = detectDeclarations(parseCards("7S 8S 9S"), S, R);
  eq(resolveDeclarations([terzH, terzD, [], []], S, 0, R).team, null, "same strength → cancel");
  eq(resolveDeclarations([terzH, terzS, [], []], S, 0, R).team, 1, "trump terz wins");
  const eld = makeRules("armenianClassic", { declTie: "eldest" });
  eq(resolveDeclarations([terzH, terzD, [], []], S, 1, eld).team, 1, "seat 1 led → eldest");
  // higher top card wins between equal lengths
  const terzHigh = detectDeclarations(parseCards("QD KD AD"), S, R);
  eq(resolveDeclarations([terzH, terzHigh, [], []], S, 0, R).team, 1);
});
test("32. declaration scoring: the winning side scores all its declarations", () => {
  const bySeat = [
    detectDeclarations(parseCards("10D JD QD KD 7C 8C 9C AS"), H, R), // fifty + terz = 70
    detectDeclarations(parseCards("7H 8H 9H"), H, R), // trump terz
    detectDeclarations(parseCards("7S 8S 9S"), H, R), // terz
    [],
  ];
  eq(resolveDeclarations(bySeat, H, 0, R).points, [90, 0]);
});
test("33. Belote/Rebelote awarded when the holder plays trump K and Q", () => {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 });
  m = auction(m, [[0, B(8, H)], [1, P], [2, P], [3, P]]);
  eq(m.hand.belote.seat, 0);
  m = playOut(m, (mm, s, legal) => (s === 0 ? legal.find((c) => c === C("KH")) ?? legal.find((c) => c === C("QH")) ?? legal[0] : legal[0]));
  const types = m.hand.events.filter((e) => e.type === "belote" || e.type === "rebelote").map((e) => e.type);
  eq(types, ["belote", "rebelote"]);
  ok(m.hand.result.raw.belote[0] === 20, "belote counted for team 0");
});
test("34. Belote/Rebelote is not duplicated", () => {
  const r = scoreHand({ contract: { team: 0, value: 8, target: 80, mult: 1 }, cards: [100, 62], tricks: [5, 3], decl: { team: null, points: [0, 0] }, beloteTeam: 0 }, R);
  eq(r.raw.belote, [20, 0]);
  eq(r.lines.filter((l) => l.key === "belote").length, 1);
  ok(beloteHolder(FIX.map(parseCards), H, R) === 0);
  eq(beloteHolder(FIX.map(parseCards), NT, R), null);
});

/* ================================================================ SCORING */
test("35. trump point values", () => eq(["JH", "9H", "AH", "10H", "KH", "QH", "8H", "7H"].map((c) => cardPoints(C(c), H)), [20, 14, 11, 10, 4, 3, 0, 0]));
test("36. non-trump point values", () => eq(["AS", "10S", "KS", "QS", "JS", "9S", "8S", "7S"].map((c) => cardPoints(C(c), H)), [11, 10, 4, 3, 2, 0, 0, 0]));
test("37. standard base total is 162 (152 + last trick)", () => {
  for (const s of [0, 1, 2, 3, NT]) eq(deckPoints(s) + 10, 162, `strain ${s}`);
  eq(deckPoints(AT) + 10, 166, "All Trump");
});
test("38. last trick bonus of 10", () => {
  const m = playOut(auction(newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 }), [[0, B(8, H)], [1, P], [2, P], [3, P]]));
  const last = m.hand.tricks[7];
  ok(last.last);
  const pts = last.cards.reduce((t, p) => t + cardPoints(p.card, H), 0);
  eq(last.points, pts + 10);
  eq(m.hand.cards[0] + m.hand.cards[1], 162);
});
test("39. successful contract (Armenian Classic): 16 + bid to the contract side", () => {
  const r = scoreHand({ contract: { team: 0, value: 9, target: 90, mult: 1 }, cards: [95, 67], tricks: [5, 3], decl: { team: null, points: [0, 0] }, beloteTeam: null }, R);
  ok(r.made);
  eq(r.score, [25, 0]);
});
test("40. failed contract: 16 + bid and all declarations to the defenders", () => {
  const r = scoreHand({ contract: { team: 0, value: 10, target: 100, mult: 1 }, cards: [70, 92], tricks: [4, 4], decl: { team: 0, points: [20, 0] }, beloteTeam: 1 }, R);
  ok(!r.made);
  eq(r.score, [0, 26 + 2 + 2]); // 16+10, the contract side's terz, defenders' belote
  const keep = scoreHand({ contract: { team: 0, value: 10, target: 100, mult: 1 }, cards: [70, 92], tricks: [4, 4], decl: { team: 0, points: [20, 0] }, beloteTeam: null }, makeRules("armenianClassic", { failedDecl: "keepOwn" }));
  eq(keep.score, [2, 26]);
});
test("40c. reaching the target exactly makes the contract (≥)", () => {
  const r = scoreHand({ contract: { team: 0, value: 10, target: 100, mult: 1 }, cards: [80, 82], tricks: [4, 4], decl: { team: 0, points: [20, 0] }, beloteTeam: null }, R);
  ok(r.made);
  eq(r.score, [28, 0]);
});
test("41. capot: all eight tricks makes the hand worth 25; Kaput needs all tricks", () => {
  const r = scoreHand({ contract: { team: 1, value: 8, target: 80, mult: 1 }, cards: [0, 162], tricks: [0, 8], decl: { team: null, points: [0, 0] }, beloteTeam: null }, R);
  eq(r.capotTeam, 1);
  eq(r.score, [0, 33]);
  const k = scoreHand({ contract: { team: 1, value: 25, kaput: true, target: null, mult: 1 }, cards: [10, 152], tricks: [1, 7], decl: { team: null, points: [0, 0] }, beloteTeam: null }, R);
  ok(!k.made);
  eq(k.score, [41, 0]);
  const k2 = scoreHand({ contract: { team: 1, value: 25, kaput: true, target: null, mult: 2 }, cards: [0, 162], tricks: [0, 8], decl: { team: null, points: [0, 0] }, beloteTeam: null }, R);
  eq(k2.score, [0, 100]);
});
test("42. team totals accumulate across hands", () => {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3, target: 1000 });
  m = playOut(auction(m, [[0, B(8, H)], [1, P], [2, P], [3, P]]));
  const s1 = m.scores.slice();
  eq(s1[0] + s1[1], m.hand.result.score[0] + m.hand.result.score[1]);
  m = nextHand(m, shuffledDeck(intFrom(seeded(9)))).match;
  eq(m.hand.dealer, 0, "dealer rotates clockwise");
  m = forceContract(m);
  m = playOut(m);
  eq(m.scores, [s1[0] + m.hand.result.score[0], s1[1] + m.hand.result.score[1]]);
  eq(m.history.length, 2);
});
test("43. match victory at the target; tie above target plays on", () => {
  eq(matchWinner([101, 90], 101), 0);
  eq(matchWinner([100, 90], 101), null);
  eq(matchWinner([120, 130], 101), 1, "both cross → higher wins");
  eq(matchWinner([120, 120], 101), null);
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3, target: 20 });
  m = playOut(auction(m, [[0, B(8, H)], [1, P], [2, P], [3, P]]));
  ok(m.over && m.over.winner === 0, "team 0 wins at 20");
  eq(nextHand(m, freshDeck()).error, "match-over");
});
test("44. preset-dependent scoring (Classic Points keeps each side's points)", () => {
  const cp = makeRules("classicPoints");
  const r = scoreHand({ contract: { team: 0, value: 9, target: 90, mult: 1 }, cards: [97, 65], tricks: [5, 3], decl: { team: null, points: [0, 0] }, beloteTeam: null }, cp);
  eq(r.score, [10 + 9, 6]); // defenders 65 → 6 (5 rounds down), contract side 16−6, + bid
  const f = scoreHand({ contract: { team: 0, value: 9, target: 90, mult: 1 }, cards: [81, 81], tricks: [4, 4], decl: { team: null, points: [0, 0] }, beloteTeam: null }, makeRules("classicPoints"));
  ok(!f.made, "tie in raw points fails under mustBeatDefenders");
  ok(PRESETS.armenianClassic.scoring !== PRESETS.classicPoints.scoring);
});

/* ================================================================ AI */
test("45. AI only plays legal cards across 60 full hands (all difficulties)", () => {
  const rng = seeded(11);
  let plays = 0;
  for (let g = 0; g < 60; g++) {
    const m = aiHand(g, ["easy", "medium", "hard"][g % 3], rng, (mm, s, card) => { ok(legalFor(mm, s).cards.includes(card)); plays++; });
    ok(m.hand.phase === "scored" || m.hand.phase === "redeal");
  }
  ok(plays > 1000, `plays ${plays}`);
});
test("46. AI respects team positions (feeds a winning partner, doesn't overtake when last)", () => {
  // seat 2 (partner of 0) is winning with the master AS; seat 0 plays last and holds 10S? No — void: smear the AD
  let m = newMatch({ rules: R, deck: deckFor([
    "AD 7C 8C 9C 7D 8D 9D KD", "8S 9S QS JS 10S 7H 8H 9H", "AS AH AC KS 10H JH QH KH", "7S 10D JD QD 10C JC QC KC",
  ], 1), dealer: 1 });
  // dealer 1 → seat 2 speaks/leads first
  m = auction(m, [[2, B(8, H)], [3, P], [0, P], [1, P]]);
  m = play(m, 2, C("AS")).match;
  m = play(m, 3, C("7S")).match;
  // seat 0 is void in spades, partner winning with the master ace → may play anything; AI should smear the AD (11)
  m = { ...m };
  const v = viewFor(m, 0);
  const view = { ...v, difficulty: "medium" };
  eq(view.trick.length, 2);
  const c = choosePlay(view, seeded(1));
  // seat 1 still to play (follows spades with 10S at most, can't beat the ace)
  ok(cardPoints(c, H) >= 4 && suitOf(c) !== H, `smears points onto partner's master trick (played ${c})`);
  // last to play with the partner winning: never overtakes the partner with a trump
  let m2 = play(m, 0, c).match;
  const v2 = { ...viewFor(m2, 1), difficulty: "medium" };
  const c2 = choosePlay(v2, seeded(2));
  ok(suitOf(c2) === S, "seat 1 must follow spades");
  // seat 3 view on a fresh trick where partner (1) wins and 3 is last
  const legal3 = legalMoves(parseCards("7H 8D 9C"), T([0, "7S"], [1, "AS"], [2, "8S"]), H, 3, R);
  eq(legal3.length, 3, "partner exception");
  const c3 = choosePlay({ ...viewFor(m2, 1), seat: 3, hand: parseCards("7H 8D 9C"), trick: T([0, "7S"], [1, "AS"], [2, "8S"]), difficulty: "medium" }, seeded(3));
  ok(suitOf(c3) !== H, "does not trump the partner's winning trick");
});
test("47. AI uses only permitted information (hidden hands do not change its choice)", () => {
  const base = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3 });
  let m = auction(base, [[0, B(8, H)], [1, P], [2, P], [3, P]]);
  m = play(m, 0, C("JH")).match;
  const v1 = viewFor(m, 1);
  ok(!("hands" in v1), "view has no hands field");
  eq(v1.handSizes, [7, 8, 8, 8]);
  ok(JSON.stringify(v1).indexOf('"deck"') < 0, "no deck in view");
  // swap two hidden hands: same view → same decision
  const swapped = { ...m, hand: { ...m.hand, hands: [m.hand.hands[0], m.hand.hands[1], m.hand.hands[3], m.hand.hands[2]] } };
  eq(JSON.stringify(viewFor(swapped, 1)), JSON.stringify(v1));
  eq(choosePlay({ ...viewFor(swapped, 1), difficulty: "hard", samples: 8 }, seeded(3)), choosePlay({ ...v1, difficulty: "hard", samples: 8 }, seeded(3)));
});
test("48. AI always completes its turn (bidding and play)", () => {
  const rng = seeded(21);
  for (let g = 0; g < 40; g++) {
    let m = newMatch({ rules: makeRules(g % 2 ? "classicPoints" : "armenianClassic"), deck: shuffledDeck(intFrom(seeded(300 + g))), dealer: g % 4, difficulty: ["easy", "medium", "hard"][g % 3] });
    for (let step = 0; step < 200 && m.hand.phase === "bidding"; step++) {
      const s = m.hand.turn;
      const d = decide(viewFor(m, s), rng);
      ok(d && d.kind === "bid", "decision returned");
      const r = bid(m, s, d.action);
      ok(!r.error, `AI bid accepted (${r.error})`);
      m = r.match;
    }
    ok(m.hand.phase !== "bidding", "auction finished");
  }
});
test("49. AI chooses valid, sensible contracts", () => {
  // a monster hearts hand opens hearts, a junk hand passes
  const v = (hand, extra = {}) => ({ seat: 0, hand: parseCards(hand), rules: R, difficulty: "hard", auction: { ...newAuction(3), history: [] }, ...extra });
  const strong = chooseBid(v("JH 9H AH 10H KH AS AD 7C"), seeded(1));
  eq(strong.type, "bid");
  eq(strong.strain, H);
  ok(strong.level >= 10, `strong level ${strong.level}`);
  eq(chooseBid(v("7H 8H 7D 8D 7C 8C 7S QS"), seeded(1)).type, "pass");
  ok(evaluateHand(parseCards("JH 9H AH 10H KH AS AD 7C"), H, R) > evaluateHand(parseCards("JH 9H AH 10H KH AS AD 7C"), S, R));
});
test("50. difficulty affects strategy (hard team beats easy team over many hands)", () => {
  const rng = seeded(77);
  let hardPts = 0, easyPts = 0;
  for (let g = 0; g < 70; g++) {
    // team 0 hard, team 1 easy
    const m = aiHand(1000 + g, (s) => (s % 2 === 0 ? "hard" : "easy"), rng);
    if (m.hand.phase !== "scored") continue;
    hardPts += m.hand.result.score[0];
    easyPts += m.hand.result.score[1];
  }
  ok(hardPts > easyPts * 1.25, `hard ${hardPts} vs easy ${easyPts}`);
});

/* ================================================================ SAVE */
const memStore = () => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; }, _d: d }; };
function midMatch() {
  let m = newMatch({ rules: R, deck: deckFor(FIX), dealer: 3, target: 301 });
  m = auction(m, [[0, B(8, H)], [1, P], [2, P], [3, P]]);
  m = play(m, 0, C("JH")).match;
  m = play(m, 1, C("7C")).match;
  return m;
}
test("51. save a match", () => {
  const st = memStore();
  ok(writeSave(st, { settings: { lang: "hy" }, stats: defaultStats(), match: midMatch() }));
  ok(st.getItem(SAVE_KEY).includes('"v":1'));
});
test("52. reload a match (validated)", () => {
  const st = memStore();
  const m = midMatch();
  writeSave(st, { settings: {}, stats: defaultStats(), match: m });
  const l = loadSave(st);
  eq(l.note, null);
  eq(JSON.stringify(l.match), JSON.stringify(m));
});
test("53. all 32 card identities are preserved", () => {
  const st = memStore();
  writeSave(st, { settings: {}, stats: defaultStats(), match: midMatch() });
  const h = loadSave(st).match.hand;
  const all = h.hands.flat().concat(h.trick.map((p) => p.card)).concat(h.tricks.flatMap((t) => t.cards.map((p) => p.card)));
  eq(all.slice().sort((a, b) => a - b), freshDeck());
});
test("54. turn is preserved", () => { const st = memStore(); const m = midMatch(); writeSave(st, { match: m }); eq(loadSave(st).match.hand.turn, 2); });
test("55. scores are preserved", () => {
  const st = memStore();
  const m = { ...midMatch(), scores: [57, 88] };
  writeSave(st, { match: m });
  eq(loadSave(st).match.scores, [57, 88]);
});
test("56. contract is preserved", () => { const st = memStore(); writeSave(st, { match: midMatch() }); eq(loadSave(st).match.hand.contract, midMatch().hand.contract); });
test("57. declarations are preserved", () => {
  const st = memStore();
  const m = midMatch();
  writeSave(st, { match: m });
  const l = loadSave(st).match.hand;
  eq(l.decls, m.hand.decls);
  eq(l.announced, [true, true, false, false]);
});
test("58. no duplicated cards after loading; tampered saves are rejected", () => {
  const st = memStore();
  const m = midMatch();
  const dup = JSON.parse(JSON.stringify(m));
  dup.hand.hands[2][0] = dup.hand.hands[3][0]; // duplicate a card
  writeSave(st, { match: dup });
  const l = loadSave(st);
  eq(l.match, null);
  eq(l.note, "damaged");
  const badTurn = JSON.parse(JSON.stringify(m));
  badTurn.hand.turn = 3;
  writeSave(st, { match: badTurn });
  eq(loadSave(st).match, null, "turn out of order");
  st.setItem(SAVE_KEY, "{not json");
  eq(loadSave(st).note, "unreadable");
});
test("58b. statistics update from real hands", () => {
  let m = playOut(auction(newMatch({ rules: R, deck: deckFor(FIX), dealer: 3, target: 20 }), [[0, B(8, H)], [1, P], [2, P], [3, P]]));
  let s = recordHand(defaultStats(), m);
  eq(s.handsPlayed, 1);
  eq(s.contractsWon + s.contractsFailed, 1);
  s = recordMatch(s, m);
  eq([s.matchesPlayed, s.matchesWon, s.bestStreak], [1, 1, 1]);
});

/* ================================================================ helpers */
function playOut(m, chooser) {
  const pick = chooser || ((mm, s, legal) => legal[0]);
  for (let guard = 0; guard < 80; guard++) {
    if (m.hand.phase === "trickEnd") { m = collect(m).match; continue; }
    if (m.hand.phase !== "play") break;
    const s = m.hand.turn;
    const legal = legalFor(m, s).cards;
    const r = play(m, s, pick(m, s, legal));
    if (r.error) throw new Error(r.error);
    m = r.match;
  }
  return m;
}
function aiHand(seed, diff, rng, onPlay) {
  const dOf = typeof diff === "function" ? diff : () => diff;
  let m = newMatch({ rules: R, deck: shuffledDeck(intFrom(seeded(seed))), dealer: seed % 4, target: 9999 });
  for (let i = 0; i < 300; i++) {
    const h = m.hand;
    if (h.phase === "bidding") {
      const s = h.turn;
      m = bid(m, s, chooseBid({ ...viewFor(m, s), difficulty: dOf(s) }, rng)).match;
    } else if (h.phase === "play") {
      const s = h.turn;
      const card = choosePlay({ ...viewFor(m, s), difficulty: dOf(s), samples: 20 }, rng);
      if (onPlay) onPlay(m, s, card);
      const r = play(m, s, card);
      if (r.error) throw new Error(r.error);
      m = r.match;
    } else if (h.phase === "trickEnd") m = collect(m).match;
    else break;
  }
  return m;
}


console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (fail) process.exit(1);
