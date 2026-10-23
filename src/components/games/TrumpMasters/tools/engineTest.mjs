/**
 * Headless rules tests for Trump Masters:
 *   node src/components/games/TrumpMasters/tools/engineTest.mjs
 */
import * as E from "../engine.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL:", msg)));
const C = (id) => ({ id, s: id[0], r: +id.slice(1) });
const H = (...ids) => ids.map(C);
/** Builds a mid-game state by hand. */
const pos = ({ n = 2, mode = "classic", trump = "H", hands, deck = [], attacker = 0, defender = 1, out, table = [] }) => ({
  mode, n, seed: 1, trump, trumpCard: C(trump + 6), deck: deck.map(C), hands: hands.map((h) => H(...h)),
  out: out || Array(n).fill(false), finish: [], discard: 0, attacker, defender, boutAttacker: attacker,
  table, limit: Math.min(6, hands[defender].length), taking: false, passed: [], phase: "play", end: null, loser: null, bout: 1, events: [],
});
const cardCount = (s) => s.hands.flat().length + s.deck.length + s.table.reduce((k, p) => k + 1 + (p.d ? 1 : 0), 0) + s.discard;

/* deck + deal */
{
  const d = E.makeDeck(7);
  ok(d.length === 36 && new Set(d.map((c) => c.id)).size === 36, "36 unique cards");
  ok(d.every((c) => c.r >= 6 && c.r <= 14), "ranks 6..A");
  ok(E.makeDeck(7).map((c) => c.id).join() === d.map((c) => c.id).join(), "deterministic shuffle");
  for (const n of [2, 3, 4]) {
    const s = E.newGame({ players: n, seed: 11 });
    ok(s.hands.every((h) => h.length === 6) && s.deck.length === 36 - 6 * n, `${n}p deal 6 each`);
    ok(s.trump === s.trumpCard.s && s.deck[0].id === s.trumpCard.id, "trump card at bottom");
    const low = Math.min(...s.hands.flat().filter((c) => c.s === s.trump).map((c) => c.r));
    if (s.lead) ok(s.hands[s.attacker].some((c) => c.s === s.trump && c.r === low), "lowest trump leads");
    ok(s.defender === (s.attacker + 1) % n, "defender is left of attacker");
  }
}

/* trump comparisons */
ok(E.beats(C("S7"), C("S9"), "H"), "higher same suit beats");
ok(!E.beats(C("S9"), C("S7"), "H"), "lower same suit doesn't");
ok(!E.beats(C("S9"), C("D14"), "H"), "other non-trump suit doesn't");
ok(E.beats(C("S14"), C("H6"), "H"), "any trump beats non-trump");
ok(!E.beats(C("H10"), C("S14"), "H"), "non-trump never beats trump");
ok(E.beats(C("H10"), C("H11"), "H") && !E.beats(C("H10"), C("H9"), "H"), "trump needs higher trump");

/* attack, throw-in ranks, limit */
{
  let s = pos({ hands: [["S7", "D7", "C7", "S8", "D9", "C14"], ["S9", "D10", "H6"]] });
  ok(s.limit === 3, "limit = defender hand (3)");
  ok(E.legal(s, 1).length === 0, "defender can't act on empty table");
  s = E.act(s, 0, { type: "attack", card: "S7" });
  ok(E.actor(s) === 1, "defender acts after lead");
  ok(E.act(s, 0, { type: "attack", card: "D7" }) === s, "attacker can't add while card unbeaten");
  ok(!E.isLegal(s, 1, { type: "defend", card: "D10", slot: 0 }), "D10 can't beat S7");
  ok(!E.legal(s, 1).some((m) => m.type === "transfer"), "no transfer in classic");
  s = E.act(s, 1, { type: "defend", card: "S9", slot: 0 });
  ok(E.actor(s) === 0, "attacker throws in after beat");
  const adds = E.legal(s, 0).filter((m) => m.type === "attack").map((m) => m.card).sort();
  ok(adds.join() === "C7,D7,D9".split(",").sort().join(), "throw-in only table ranks (7, 9): " + adds);
  s = E.act(s, 0, { type: "attack", card: "D7" });
  s = E.act(s, 1, { type: "defend", card: "D10", slot: 1 });
  s = E.act(s, 0, { type: "attack", card: "C7" });
  s = E.act(s, 1, { type: "take" });
  ok(s.phase === "end" && s.end === "take", "limit reached (3) → bout ends at take");
  ok(cardCount(s) === 9, "cards conserved");
  s = E.finishBout(s);
  ok(s.hands[1].length === 6, "taker got all 6 table cards");
  ok(s.attacker === 0 && s.defender === 1, "2p: after take, attacker attacks again");
}

/* successful defence + rotation + refill order (3 players) */
{
  let s = pos({ n: 3, hands: [["S7", "S8"], ["S9", "S10", "C6"], ["D6", "D8", "C8", "C10", "C11", "C12"]], deck: ["H14", "D14", "C14", "S14", "H13", "D13"], attacker: 0, defender: 1 });
  s = E.act(s, 0, { type: "attack", card: "S7" });
  s = E.act(s, 1, { type: "defend", card: "S9", slot: 0 });
  ok(s.phase === "end" && s.end === "beat", "nobody holds a 7/9 → auto-pass → beat");
  s = E.finishBout(s);
  ok(s.discard === 2, "beaten cards discarded");
  // refill: 0 draws 5 (needs 5) from the end of the deck, then 2 (full), then defender 1 draws last
  ok(s.hands[0].length === 6 && s.hands[1].length === 3 && s.deck.length === 0, "refill order: attacker first, defender last");
  ok(s.attacker === 1 && s.defender === 2, "after defence the defender attacks");
}
{
  let s = pos({ n: 4, hands: [["S7"], ["C6", "C7"], ["S6"], ["D6"]], attacker: 0, defender: 1 });
  s = E.act(s, 0, { type: "attack", card: "S7" });
  s = E.act(s, 1, { type: "take" });
  s = E.finishBout(s);
  ok(s.attacker === 2 && s.defender === 3, "after take, the player after the defender attacks");
  ok(s.out[0] && s.finish[0] === 0, "seat 0 out when empty and deck empty");
}

/* throw-in by other players, while taking */
{
  let s = pos({ n: 3, hands: [["S7", "D8"], ["C6", "C7", "C8", "C9"], ["H7", "D7"]], attacker: 0, defender: 1, deck: ["S14", "S13", "S12", "S11", "S10", "D14", "D13", "D12", "D11", "D10", "H14", "H13"] });
  s = E.act(s, 0, { type: "attack", card: "S7" });
  s = E.act(s, 1, { type: "take" });
  ok(E.actor(s) === 2, "attacker 0 can't add → seat 2 throws in");
  s = E.act(s, 2, { type: "attack", card: "H7" });
  ok(E.actor(s) === 2, "still seat 2 while taking");
  s = E.act(s, 2, { type: "attack", card: "D7" });
  s = E.act(s, 2, { type: "pass" });
  ok(s.phase === "end" && s.table.length === 3, "bout ends with 3 cards thrown at taker");
  s = E.finishBout(s);
  ok(s.hands[1].length === 7, "taker kept 7 cards (no refill when > 6)");
  ok(s.hands[0].length === 6 && s.hands[2].length === 6, "attackers refilled");
  ok(s.attacker === 2 && s.defender === 0, "rotation skips taker");
}

/* elimination + loser + draw */
{
  let s = pos({ hands: [["S7"], ["S8", "D6"]] });
  s = E.act(s, 0, { type: "attack", card: "S7" });
  s = E.act(s, 1, { type: "defend", card: "S8", slot: 0 });
  ok(s.phase === "end", "no more throw-ins");
  s = E.finishBout(s);
  ok(s.phase === "over" && s.loser === 1, "last with cards is the Durak");
  let t = pos({ hands: [["S7"], ["S8"]] });
  t = E.finishBout(E.act(E.act(t, 0, { type: "attack", card: "S7" }), 1, { type: "defend", card: "S8", slot: 0 }));
  ok(t.phase === "over" && t.loser === null, "both out together → draw");
  let u = pos({ hands: [[], ["S8"]], deck: ["D6"] });
  ok(u.out.every((o) => !o), "never eliminated while the deck has cards");
}

/* attack limit 6 cap with big hand */
{
  const big = ["S14", "C6", "C8", "C9", "C10", "C11", "C12", "C13"];
  let s = pos({ hands: [["S7", "D7", "H7", "C7", "S6", "D6", "H6", "D14"], big] });
  ok(s.limit === 6, "limit capped at 6");
  s = E.act(s, 0, { type: "attack", card: "S7" });
  s = E.act(s, 1, { type: "take" });
  for (const id of ["D7", "H7"]) s = E.act(s, 0, { type: "attack", card: id });
  ok(E.actor(s) === 0, "still adding");
  s = E.act(s, 0, { type: "pass" });
  ok(s.phase === "end", "pass ends");
}

/* transfer */
{
  const base = { mode: "transfer", n: 3, hands: [["S7", "D9"], ["D7", "C7", "S14"], ["C6", "C8", "H9"]], attacker: 0, defender: 1 };
  let s = E.act(pos(base), 0, { type: "attack", card: "S7" });
  ok(E.transferTarget(s) === 2, "transfer target = next player");
  const tr = E.legal(s, 1).filter((m) => m.type === "transfer").map((m) => m.card).sort();
  ok(tr.join() === "C7,D7", "transfer with matching rank only");
  s = E.act(s, 1, { type: "transfer", card: "D7" });
  ok(s.attacker === 1 && s.defender === 2 && s.table.length === 2, "transfer rotates defender");
  ok(s.limit === 3, "limit recomputed for new defender");
  ok(E.transferTarget(s) === -1, "can't transfer: next player (0) has 1 card < 3");
  s = E.act(s, 2, { type: "take" });
  ok(E.actor(s) === 1, "new attacker throws in first");
  s = E.act(s, 1, { type: "attack", card: "C7" });
  ok(s.phase === "end", "limit 3 reached");
  s = E.finishBout(s);
  ok(s.hands[2].length === 6 && s.attacker === 0 && s.defender === 1, "after taking, next after taker attacks");

  let t = E.act(pos(base), 0, { type: "attack", card: "S7" });
  t = E.act(t, 1, { type: "defend", card: "S14", slot: 0 });
  ok(!E.legal(t, 1).length && E.transferTarget(t) === -1, "no transfer after defending");
  let c = E.act(pos({ ...base, mode: "classic" }), 0, { type: "attack", card: "S7" });
  ok(E.transferTarget(c) === -1, "classic never transfers");
  let two = E.act(pos({ mode: "transfer", hands: [["S7", "C9", "C10"], ["D7", "C6"]] }), 0, { type: "attack", card: "S7" });
  ok(E.transferTarget(two) === 0, "2p transfer back to attacker allowed when hand big enough");
  let small = E.act(pos({ mode: "transfer", hands: [["S7"], ["D7", "C6"]] }), 0, { type: "attack", card: "S7" });
  ok(E.transferTarget(small) === -1, "2p transfer blocked: attacker has 0 cards < 2");
}

/* AI fuzz: every move legal, games end, cards conserved */
{
  let games = 0, steps = 0, losers = [0, 0, 0, 0], draws = 0, bad = 0;
  for (const mode of ["classic", "transfer"]) {
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 300; seed++) {
        let s = E.newGame({ players: n, mode, seed });
        let k = 0;
        while (s.phase !== "over" && k++ < 3000) {
          if (s.phase === "end") s = E.finishBout(s);
          else {
            const a = E.actor(s), m = E.aiMove(s);
            if (!E.isLegal(s, a, m)) bad++;
            s = E.act(s, a, m);
          }
          if (cardCount(s) !== 36) bad++;
          if (s.phase === "play" && s.table.filter((p) => !p.d).length > s.hands[s.defender].length + (s.taking ? 99 : 0)) bad++;
        }
        steps += k;
        games++;
        if (s.phase !== "over") bad++;
        else if (s.loser == null) draws++;
        else losers[s.loser]++;
      }
    }
  }
  ok(bad === 0, `AI fuzz: ${bad} illegal / stuck / conservation errors`);
  console.log(`fuzz: ${games} games, avg ${(steps / games).toFixed(0)} steps, losers by seat ${losers}, draws ${draws}`);
}

/* random legal play fuzz (exercises human-style choices) */
{
  let bad = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = E.rng(seed);
    let s = E.newGame({ players: 2 + (seed % 3), mode: seed % 2 ? "transfer" : "classic", seed });
    let k = 0;
    while (s.phase !== "over" && k++ < 4000) {
      if (s.phase === "end") { s = E.finishBout(s); continue; }
      const a = E.actor(s), L = E.legal(s, a);
      if (!L.length) { bad++; break; }
      const prev = s;
      s = E.act(s, a, L[Math.floor(r() * L.length)]);
      if (s === prev) bad++;
      if (cardCount(s) !== 36) bad++;
    }
    if (s.phase !== "over") bad++;
  }
  ok(bad === 0, `random fuzz: ${bad} errors`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
