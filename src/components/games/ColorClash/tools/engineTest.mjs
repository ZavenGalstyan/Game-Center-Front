/**
 * Headless rules + AI checks:  node src/components/games/ColorClash/tools/engineTest.mjs
 */
import * as E from "../engine.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));
const PLAYERS = [{ name: "You" }, { name: "A", ai: true }, { name: "B", ai: true }, { name: "C", ai: true }];
const C = (c, v, id) => ({ id, c, v });
let nid = 1000;

/** Build a state by hand: hands[seat] = [[c,v],...], top card, colour. */
function rig({ hands, topCard, color, turn = 0, dir = 1, pile, difficulty = "normal" }) {
  const s = E.newRound({ players: PLAYERS, seed: 7, difficulty });
  s.players.forEach((p, i) => (p.hand = hands[i].map(([c, v]) => C(c, v, nid++))));
  s.discard = [C(topCard[0], topCard[1], nid++)];
  s.color = color ?? topCard[0];
  s.turn = turn;
  s.dir = dir;
  s.events = [];
  if (pile) s.drawPile = pile.map(([c, v]) => C(c, v, nid++));
  return s;
}
const idOf = (s, seat, c, v) => s.players[seat].hand.find((x) => x.c === c && x.v === v).id;
const filler = [["r", "5"], ["y", "6"], ["g", "7"]];

// deck composition
const deck = E.buildDeck();
ok(deck.length === 108, "108 cards");
ok(deck.filter((c) => c.v === "0").length === 4, "four zeros");
ok(deck.filter((c) => c.v === "wd4").length === 4 && deck.filter((c) => c.v === "wild").length === 4, "wilds");
ok(deck.filter((c) => c.c === "r").length === 25, "25 per colour");
ok(new Set(deck.map((c) => c.id)).size === 108, "unique ids");

// deal
for (let seed = 1; seed < 200; seed++) {
  const s = E.newRound({ players: PLAYERS, seed, dealer: seed % 4 });
  const total = s.players.reduce((a, p) => a + p.hand.length, 0) + s.drawPile.length + s.discard.length;
  ok(total === 108, `seed ${seed}: conserve cards`);
  ok(!E.isWild(E.top(s)), `seed ${seed}: start card not wild`);
  const t = E.top(s);
  if (t.v === "d2") ok(s.players[(s.dealer + 1) % 4].hand.length === 9, "start d2 penalises first player");
  if (t.v === "rev") ok(s.turn === s.dealer && s.dir === -1, "start reverse → dealer first, counter-clockwise");
  if (t.v === "skip") ok(s.turn === (s.dealer + 2) % 4, "start skip");
  if (/^\d$/.test(t.v)) ok(s.turn === (s.dealer + 1) % 4, "left of dealer starts");
}

// legal matching
{
  const s = rig({ hands: [[["r", "3"], ["b", "7"], ["g", "skip"], ["w", "wild"], ["y", "2"]], ...[1, 2, 3].map(() => filler)], topCard: ["b", "3"] });
  const legal = E.legalPlays(s, 0).map((c) => c.c + c.v).sort();
  ok(JSON.stringify(legal) === JSON.stringify(["b7", "r3", "wwild"]), "legal by colour/number/wild: " + legal);
  const bad = E.play(s, 0, idOf(s, 0, "y", "2"));
  ok(bad === s, "illegal play rejected");
  ok(E.play(s, 1, idOf(s, 1, "r", "5")) === s, "out-of-turn play rejected");
  ok(E.play(s, 0, idOf(s, 0, "w", "wild")) === s, "wild without colour rejected");
  const w = E.play(s, 0, idOf(s, 0, "w", "wild"), "g");
  ok(w.color === "g" && w.turn === 1, "wild sets colour, turn passes");
  ok(E.canPlay(w, C("g", "9", 1)) && !E.canPlay(w, C("b", "9", 2)), "wild colour is matched");
  const sym = rig({ hands: [[["r", "skip"], ["y", "1"]], filler, filler, filler], topCard: ["b", "skip"] });
  ok(E.legalPlays(sym, 0).length === 1, "symbol match");
}

// skip / reverse / draw two
{
  const s = rig({ hands: [[["r", "skip"], ["r", "1"], ["r", "2"]], filler, filler, filler], topCard: ["r", "9"] });
  const t = E.play(s, 0, idOf(s, 0, "r", "skip"));
  ok(t.turn === 2, "skip jumps seat 1");
  const r = E.play(s, 0, s.players[0].hand[1].id);
  ok(r.turn === 1, "number → next clockwise");
  const s2 = rig({ hands: [[["r", "rev"], ["r", "1"], ["r", "2"]], filler, filler, filler], topCard: ["r", "9"] });
  const rv = E.play(s2, 0, idOf(s2, 0, "r", "rev"));
  ok(rv.dir === -1 && rv.turn === 3, "reverse → seat 3");
  const rv2 = E.play(rv, 3, idOf(rv, 3, "r", "5"));
  ok(rv2.turn === 2, "counter-clockwise continues");
  const s3 = rig({ hands: [[["r", "d2"], ["r", "1"], ["r", "2"]], filler, filler, filler], topCard: ["r", "9"] });
  const d = E.play(s3, 0, idOf(s3, 0, "r", "d2"));
  ok(d.players[1].hand.length === 5 && d.turn === 2, "draw two: +2 and skipped");
  // no stacking: seat 1 holding a d2 still draws
  const s4 = rig({ hands: [[["r", "d2"], ["r", "1"], ["r", "2"]], [["b", "d2"], ["y", "1"]], filler, filler], topCard: ["r", "9"] });
  const d4 = E.play(s4, 0, idOf(s4, 0, "r", "d2"));
  ok(d4.players[1].hand.length === 4 && d4.turn === 2, "no penalty stacking");
}

// reshuffle
{
  const s = rig({ hands: [[["y", "1"], ["y", "2"]], filler, filler, filler], topCard: ["r", "9"], pile: [] });
  s.discard = [C("g", "4", 1), C("b", "4", 2), C("r", "9", 3)];
  const t = E.draw(s, 0);
  ok(t.discard.length === 1 && t.discard[0].id === 3, "reshuffle keeps top");
  ok(t.players[0].hand.length === 3 && t.drawPile.length === 1, "drew from reshuffled pile");
  ok(t.events.some((e) => e.type === "reshuffle"), "reshuffle event");
  const empty = rig({ hands: [[["y", "1"], ["y", "2"]], filler, filler, filler], topCard: ["r", "9"], pile: [] });
  const e2 = E.draw(empty, 0);
  ok(e2.players[0].hand.length === 2 && e2.turn === 1, "nothing to draw → pass");
}

// draw then play/keep
{
  const s = rig({ hands: [[["y", "1"], ["y", "2"]], filler, filler, filler], topCard: ["r", "9"], pile: [["b", "3"], ["r", "4"]] });
  const t = E.draw(s, 0);
  ok(t.phase === "drawn" && t.turn === 0, "playable drawn card → choose");
  ok(E.play(t, 0, idOf(t, 0, "y", "1")) === t, "only the drawn card may be played");
  ok(E.draw(t, 0) === t, "one draw per turn");
  const p = E.play(t, 0, t.drawnId);
  ok(p.turn === 1 && p.players[0].hand.length === 2, "play drawn card");
  const k = E.keep(t, 0);
  ok(k.turn === 1 && k.players[0].hand.length === 3 && k.phase === "play", "keep drawn card");
  const s2 = rig({ hands: [[["y", "1"], ["y", "2"]], filler, filler, filler], topCard: ["r", "9"], pile: [["b", "3"]] });
  const t2 = E.draw(s2, 0);
  ok(t2.turn === 1 && t2.phase === "play", "unplayable drawn card ends turn");
}

// wild draw four + challenge
{
  const honest = rig({ hands: [[["w", "wd4"], ["y", "1"], ["g", "2"]], filler, filler, filler], topCard: ["r", "9"] });
  ok(E.legalPlays(honest, 0).some((c) => c.v === "wd4"), "honest WD4 is legal");
  const bluffer = rig({ hands: [[["w", "wd4"], ["r", "1"], ["g", "2"]], filler, filler, filler], topCard: ["r", "9"] });
  ok(!E.legalPlays(bluffer, 0).some((c) => c.v === "wd4"), "bluff WD4 not in AI-legal list");
  ok(E.canPlay(bluffer, bluffer.players[0].hand[0]), "human may still bluff");

  const a = E.play(honest, 0, idOf(honest, 0, "w", "wd4"), "b");
  ok(a.phase === "challenge" && a.turn === 1 && a.color === "b", "WD4 → challenge phase");
  const acc = E.resolveChallenge(a, 1, false);
  ok(acc.players[1].hand.length === 7 && acc.turn === 2, "accept: +4, skipped");
  const lost = E.resolveChallenge(a, 1, true);
  ok(lost.players[1].hand.length === 9 && lost.turn === 2 && lost.players[0].hand.length === 2, "failed challenge: +6");
  const b = E.play(bluffer, 0, idOf(bluffer, 0, "w", "wd4"), "g");
  const won = E.resolveChallenge(b, 1, true);
  ok(won.players[0].hand.length === 6 && won.players[1].hand.length === 3 && won.turn === 1, "caught bluff: bluffer +4, victim plays");
  ok(E.resolveChallenge(b, 2, true) === b, "only the victim resolves");
}

// last card
{
  const s = rig({ hands: [[["r", "1"], ["y", "2"]], filler, filler, filler], topCard: ["r", "9"] });
  ok(E.canDeclare(s, 0), "may call with 2 cards on turn");
  ok(!E.canDeclare(s, 1), "not when not your turn");
  const said = E.declareLast(s, 0);
  const p = E.play(said, 0, idOf(said, 0, "r", "1"));
  ok(p.pendingLast == null && p.events.some((e) => e.type === "lastCall"), "called before play → safe");
  const p2 = E.play(s, 0, idOf(s, 0, "r", "1"));
  ok(p2.pendingLast === 0 && E.canDeclare(p2, 0), "forgot → pending, can still call");
  const late = E.declareLast(p2, 0);
  ok(late.pendingLast == null && late.players[0].hand.length === 1, "late call in time → safe");
  const caught = E.play(p2, 1, idOf(p2, 1, "r", "5"));
  ok(caught.players[0].hand.length === 3 && caught.events.some((e) => e.type === "lastPenalty"), "next player acts → +2");
  const timed = E.catchLast(p2);
  ok(timed.players[0].hand.length === 3 && timed.pendingLast == null, "grace timeout → +2");
  // pre-call then draw resets the call
  const s2 = rig({ hands: [[["b", "1"], ["y", "2"]], filler, filler, filler], topCard: ["r", "9"], pile: [["g", "3"]] });
  const d = E.draw(E.declareLast(s2, 0), 0);
  ok(!d.players[0].said, "call resets after drawing");
}

// scoring / round end
{
  const s = rig({ hands: [[["r", "1"]], [["w", "wd4"], ["r", "skip"], ["y", "7"]], [["b", "0"]], [["g", "9"], ["w", "wild"]]], topCard: ["r", "9"] });
  const t = E.play(s, 0, s.players[0].hand[0].id);
  ok(t.phase === "over" && t.winner === 0, "empty hand wins");
  ok(t.points === 50 + 20 + 7 + 0 + 9 + 50, "points " + t.points);
  ok(E.actor(t) == null, "nobody acts after round");
  const s2 = rig({ hands: [[["r", "d2"]], [["y", "7"]], [["b", "0"]], [["g", "9"]]], topCard: ["r", "9"], pile: [["b", "5"], ["g", "1"]] });
  const t2 = E.play(s2, 0, s2.players[0].hand[0].id);
  ok(t2.players[1].hand.length === 3 && t2.points === 7 + 5 + 1 + 0 + 9, "final draw two counts: " + t2.points);
}

// AI: colour choice, legal moves, targeting
{
  const s = rig({ hands: [filler, [["w", "wild"], ["b", "1"], ["b", "8"], ["y", "2"]], filler, filler], topCard: ["r", "9"], turn: 1 });
  const m = E.aiChoose(s, 1);
  ok(m.type === "play" && m.color === "b", "AI wild picks its strongest colour");
  const t = rig({ hands: [[["r", "1"]], [["r", "d2"], ["r", "3"], ["y", "2"]], filler, filler], topCard: ["r", "9"], turn: 3, dir: -1 });
  t.turn = 1;
  t.dir = -1; // next of seat 1 is seat 0 (one card left)
  const m2 = E.aiChoose(t, 1);
  ok(m2.type === "play" && t.players[1].hand.find((c) => c.id === m2.id).v === "d2", "AI hits a near-winner with Draw Two");
  const n = rig({ hands: [filler, [["y", "1"], ["g", "2"]], filler, filler], topCard: ["r", "9"], turn: 1 });
  ok(E.aiChoose(n, 1).type === "draw", "AI draws with no legal move");
}

// full AI-only games: always legal, cards conserved, terminate
for (const difficulty of ["easy", "normal", "hard"]) {
  let rounds = 0, turnsMax = 0, illegal = 0, lastCalls = 0, penalties = 0, challenges = 0;
  const wins = [0, 0, 0, 0];
  for (let seed = 1; seed <= 300; seed++) {
    let s = E.newRound({ players: PLAYERS.map((p) => ({ ...p, ai: true })), seed: seed * 7919, dealer: seed % 4, difficulty });
    // let the "human" seat bluff sometimes so challenges get exercised
    s.players[0].ai = false;
    let turns = 0;
    while (s.phase !== "over" && turns < 3000) {
      const before = s;
      const seat = E.actor(s);
      if (seat === 0 && s.phase === "play") {
        const wd4 = s.players[0].hand.find((c) => c.v === "wd4");
        if (wd4 && turns % 3 === 0) s = E.play(s, 0, wd4.id, "r");
        else s = E.aiAct(s);
      } else s = E.aiAct(s);
      if (s.pendingLast != null && turns % 2) s = E.catchLast(s);
      if (s === before) { illegal++; break; }
      for (const e of s.events) {
        if (e.type === "lastCall") lastCalls++;
        if (e.type === "lastPenalty") penalties++;
        if (e.type === "challenge") challenges++;
        if (e.type === "play" && E.isWild(e.card) && !E.COLORS.includes(e.color)) illegal++;
      }
      const total = s.players.reduce((a, p) => a + p.hand.length, 0) + s.drawPile.length + s.discard.length;
      if (total !== 108) { illegal++; break; }
      turns++;
    }
    if (s.phase === "over") { rounds++; wins[s.winner]++; }
    turnsMax = Math.max(turnsMax, turns);
  }
  ok(illegal === 0, `${difficulty}: no stuck/illegal states (${illegal})`);
  ok(rounds === 300, `${difficulty}: all rounds finish (${rounds})`);
  ok(lastCalls > 0 && penalties > 0 && challenges > 0, `${difficulty}: calls ${lastCalls}, penalties ${penalties}, challenges ${challenges}`);
  console.log(`  ${difficulty}: wins by seat ${wins.join("/")}, longest round ${turnsMax} actions, calls ${lastCalls}, misses ${penalties}, challenges ${challenges}`);
}

// skill: hard AI vs easy AI (seat 1 hard, others easy)
{
  const wins = [0, 0, 0, 0];
  for (let seed = 1; seed <= 600; seed++) {
    let s = E.newRound({ players: PLAYERS.map((p) => ({ ...p, ai: true })), seed: seed * 104729, dealer: seed % 4, difficulty: "easy" });
    let guard = 0;
    while (s.phase !== "over" && guard++ < 3000) {
      const seat = E.actor(s);
      s = seat === 1 ? { ...E.aiAct({ ...s, difficulty: "hard" }), difficulty: "easy" } : E.aiAct(s);
      if (s.pendingLast != null) s = E.catchLast(s);
    }
    wins[s.winner]++;
  }
  console.log(`  hard seat-1 vs 3 easy: ${wins.join("/")}`);
  ok(wins[1] > Math.max(wins[0], wins[2], wins[3]), "hard AI beats easy AIs");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
