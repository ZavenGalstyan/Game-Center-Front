/**
 * Headless rules + AI checks:  node src/components/games/CrazyCards/tools/engineTest.mjs
 */
import * as E from "../engine.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));
const P = (n) => [{ name: "You" }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: `AI${i}`, ai: true }))];
let nid = 1000;
const C = (code) => ({ id: nid++, s: code.at(-1), r: { A: 1, J: 11, Q: 12, K: 13 }[code.slice(0, -1)] ?? Number(code.slice(0, -1)) });

/** Build a state by hand: hands[seat] = ["7h", "Ks", …], top card, suit, stock (last = next draw). */
function rig({ hands, topCard, suit, stock = [], discard = [], turn = 0, difficulty = "normal" }) {
  const s = E.newRound({ players: P(hands.length), seed: 7, difficulty });
  s.players.forEach((p, i) => (p.hand = hands[i].map(C)));
  s.discard = [...discard.map(C), C(topCard)];
  s.suit = suit ?? E.top(s).s;
  s.stock = stock.map(C);
  s.turn = turn;
  s.events = [];
  return s;
}
const idOf = (s, seat, code) => s.players[seat].hand.find((c) => `${E.rankLabel(c.r)}${c.s}` === code).id;
const total = (s) => s.players.reduce((a, p) => a + p.hand.length, 0) + s.stock.length + s.discard.length;

// deck + deal
const deck = E.buildDeck();
ok(deck.length === 52 && new Set(deck.map((c) => c.id)).size === 52, "52 unique cards");
ok(deck.filter(E.isEight).length === 4, "four eights");
ok(E.cardPoints(C("8s")) === 50 && E.cardPoints(C("Kh")) === 10 && E.cardPoints(C("Jd")) === 10 && E.cardPoints(C("Ac")) === 1 && E.cardPoints(C("7c")) === 7, "card points");
for (let seed = 1; seed < 300; seed++) {
  const n = 2 + (seed % 3);
  const s = E.newRound({ players: P(n), seed, dealer: seed % n });
  ok(s.players.every((p) => p.hand.length === (n === 2 ? 7 : 5)), `seed ${seed}: hand size`);
  ok(total(s) === 52, `seed ${seed}: conserve cards`);
  ok(!E.isEight(E.top(s)) && s.suit === E.top(s).s, `seed ${seed}: start card not an eight`);
  ok(s.turn === (s.dealer + 1) % n, `seed ${seed}: left of dealer starts`);
}
// starting eight gets buried
{
  const d = E.buildDeck().filter((c) => c.r !== 8);
  const deckArr = [...E.buildDeck().filter((c) => c.r === 8).slice(0, 1), ...d.slice(0, 20), E.buildDeck().find((c) => c.r === 8 && c.s === "h"), ...d.slice(20, 20 + 14)];
  const s = E.newRound({ players: P(2), seed: 3, deck: deckArr });
  ok(!E.isEight(E.top(s)) && total(s) === deckArr.length, "eight on the turn-up is buried");
}

// legal / illegal plays
{
  const s = rig({ hands: [["7h", "Kc", "8s", "9d"], ["2c", "3c"]], topCard: "7s" });
  ok(E.canPlay(s, s.players[0].hand[0]), "rank match legal");
  ok(!E.canPlay(s, s.players[0].hand[1]), "off-suit off-rank illegal");
  ok(E.play(s, 0, idOf(s, 0, "Kc")) === s, "illegal play is a no-op");
  ok(E.play(s, 1, s.players[1].hand[0].id) === s, "out-of-turn play is a no-op");
  ok(E.play(s, 0, idOf(s, 0, "8s")) === s, "eight without a suit is a no-op");
  const a = E.play(s, 0, idOf(s, 0, "7h"));
  ok(a.suit === "h" && a.turn === 1 && E.top(a).r === 7, "rank match switches suit, turn passes");
  const b = E.play(s, 0, idOf(s, 0, "8s"), "d");
  ok(b.suit === "d" && E.isEight(E.top(b)) && b.events.some((e) => e.type === "suit" && e.suit === "d"), "eight names the suit");
  ok(E.canPlay(b, C("2d")) && !E.canPlay(b, C("2s")) && E.canPlay(b, C("8c")), "named suit is followed; eight on eight");
  ok(E.draw(s, 0) === s, "cannot draw while holding a legal card");
}

// drawing
{
  const s = rig({ hands: [["Kc", "2d"], ["3c", "4c"]], topCard: "7s", stock: ["5c", "9s"] });
  const a = E.draw(s, 0);
  ok(a.phase === "drawn" && a.turn === 0 && a.players[0].hand.length === 3, "playable draw waits for play/pass");
  ok(E.play(a, 0, idOf(a, 0, "Kc")) === a, "only the drawn card may be played");
  ok(E.draw(a, 0) === a, "only one draw per turn");
  const b = E.play(a, 0, idOf(a, 0, "9s"));
  ok(b.suit === "s" && b.turn === 1, "drawn card played");
  const c = E.pass(a, 0);
  ok(c.turn === 1 && c.players[0].hand.length === 3, "drawn card kept with pass");
  ok(a.players[0].voids.includes("s"), "void recorded");
  const s2 = rig({ hands: [["Kc", "2d"], ["3c", "4c"]], topCard: "7s", stock: ["5c", "9h"] });
  const d = E.draw(s2, 0);
  ok(d.turn === 1 && d.phase === "play" && d.events.some((e) => e.type === "pass"), "unplayable draw passes automatically");
  ok(E.pass(s2, 0) === s2, "cannot pass while a draw is possible");
}

// reshuffle keeps the top card
{
  const s = rig({ hands: [["Kc", "2d"], ["3c", "4c"]], topCard: "7s", discard: ["9h", "Jd", "4s"], stock: [] });
  const a = E.draw(s, 0);
  ok(a.events[0].type === "reshuffle" && E.top(a).r === 7 && E.top(a).s === "s" && a.discard.length === 1, "reshuffle preserves the top card");
  ok(a.stock.length === 2 && a.players[0].hand.length === 3, "reshuffled stock supplies the draw");
}

// blocked round
{
  let s = rig({ hands: [["Kc", "2d"], ["3c", "4h"], ["Qd"]], topCard: "7s", stock: [] });
  ok(!E.canDraw(s), "nothing to draw");
  ok(E.draw(s, 0) === s, "draw refused when stock is empty");
  s = E.pass(s, 0);
  s = E.pass(s, 1);
  ok(s.phase === "play" && s.passes === 2, "two passes so far");
  s = E.pass(s, 2);
  ok(s.phase === "over" && s.blocked && s.winner === 1 && s.points === 12 - 7 + (10 - 7), "blocked: lowest hand wins the differences");
  let t = rig({ hands: [["Kc"], ["Qh"]], topCard: "7s", stock: [] });
  t = E.pass(E.pass(t, 0), 1);
  ok(t.phase === "over" && t.winner === null && t.points === 0, "blocked tie scores nobody");
  // a play resets the pass streak
  let u = rig({ hands: [["Kc", "2d"], ["7c", "4h"], ["Qd", "5d"]], topCard: "7s", stock: [] });
  u = E.pass(u, 0);
  u = E.play(u, 1, idOf(u, 1, "7c"));
  ok(u.passes === 0 && u.phase === "play", "play resets passes");
}

// going out + scoring
{
  const s = rig({ hands: [["9s"], ["8c", "Kd", "Ah"], ["5c", "Qh"]], topCard: "7s" });
  const a = E.play(s, 0, idOf(s, 0, "9s"));
  ok(a.phase === "over" && a.winner === 0 && a.points === 50 + 10 + 1 + 5 + 10, "winner scores everyone's leftovers");
  const b = rig({ hands: [["8s"], ["2c"]], topCard: "7h" });
  const c = E.play(b, 0, idOf(b, 0, "8s"), "c");
  ok(c.phase === "over" && c.winner === 0 && c.points === 2, "going out on an eight");
}

// AI choices
{
  const s = rig({ hands: [["2c"], ["8h", "9s", "Kd"]], topCard: "7s", turn: 1 });
  const a = E.aiAct(s);
  ok(E.top(a).r === 9, "AI saves the eight when a plain card fits");
  const s2 = rig({ hands: [["2c"], ["8h", "Kd", "Qd", "3d"]], topCard: "7s", turn: 1 });
  const b = E.aiAct(s2);
  ok(E.isEight(E.top(b)) && b.suit === "d", "AI plays the eight when forced and names its long suit");
  const s3 = rig({ hands: [["2c"], ["Kd", "Qd"]], topCard: "7s", turn: 1, stock: ["4h", "9s"] });
  const c = E.aiAct(s3);
  ok(c.phase === "drawn" && c.turn === 1, "AI draws when stuck");
  const d = E.aiAct(c);
  ok(E.top(d).r === 9 && d.turn === 0, "AI plays a playable drawn card");
  const s4 = rig({ hands: [["2c", "3c", "4s", "5s"], ["8h", "Kd", "Qd", "3d", "4c"]], topCard: "7s", turn: 1, difficulty: "hard" });
  s4.players[0].voids = ["c"];
  ok(E.chooseSuit(s4, 1, idOf(s4, 1, "8h")) === "d", "hard AI still keeps long suit with a void hint");
  const s5 = rig({ hands: [["2h"], ["8h", "Kd", "4c"]], topCard: "7s", turn: 1, difficulty: "hard" });
  s5.players[0].voids = ["c"];
  ok(E.chooseSuit(s5, 1, idOf(s5, 1, "8h")) === "c", "hard AI steers into a 1-card opponent's void");
}

// full-game fuzz: every round ends, cards conserved, only legal moves
const stats = { rounds: 0, blocked: 0, capped: 0, maxTurns: 0, reshuffles: 0 };
for (let seed = 1; seed <= 3000; seed++) {
  const n = 2 + (seed % 3);
  const difficulty = ["easy", "normal", "hard"][seed % 3];
  let s = E.newRound({ players: P(n).map((p) => ({ ...p, ai: true })), seed, dealer: seed % n, difficulty });
  let steps = 0;
  while (s.phase !== "over" && steps < 5000) {
    const before = s;
    s = E.aiAct(s);
    ok(s !== before, `seed ${seed}: AI made no progress`);
    if (s === before) break;
    for (const e of s.events) {
      if (e.type === "play") ok(E.isEight(e.card) || e.card.s === before.suit || e.card.r === E.top(before).r, `seed ${seed}: illegal AI play`);
      if (e.type === "reshuffle") stats.reshuffles++;
    }
    ok(total(s) === 52, `seed ${seed}: conservation`);
    steps++;
  }
  ok(s.phase === "over", `seed ${seed}: round ended`);
  if (s.winner === 0 || s.winner) ok(s.blocked || s.players[s.winner].hand.length === 0, `seed ${seed}: winner went out`);
  stats.rounds++;
  if (s.blocked) stats.blocked++;
  if (s.turns >= E.TURN_CAP) stats.capped++;
  stats.maxTurns = Math.max(stats.maxTurns, s.turns);
}
console.log("fuzz:", stats);

// difficulty strength: hard vs easy heads-up
for (const [a, b, n] of [["hard", "easy", 2], ["normal", "easy", 2], ["hard", "normal", 2], ["hard", "easy", 4], ["normal", "easy", 4]]) {
  let wins = 0, games = 4000;
  for (let seed = 1; seed <= games; seed++) {
    let s = E.newRound({ players: P(n).map((p) => ({ ...p, ai: true })), seed, dealer: seed % n, difficulty: a });
    while (s.phase !== "over") {
      s.difficulty = s.turn === 0 ? a : b;
      s = E.aiAct(s);
    }
    if (s.winner === 0) wins++;
  }
  console.log(`${a} vs ${n - 1}× ${b}: ${((wins / games) * 100).toFixed(1)}% wins`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
