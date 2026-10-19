/**
 * Paired difficulty match-up (headless): the same deals are played twice with
 * the teams swapped, so card luck cancels out.
 *   node src/components/games/ArmenianBlot/tools/aiVs.mjs hard easy [hands=300]
 */
import { shuffledDeck, seeded, intFrom } from "../engine/deck.js";
import { makeRules } from "../engine/rules.js";
import { newMatch, bid, play, collect, redeal, nextHand, viewFor } from "../engine/match.js";
import { chooseBid, choosePlay } from "../engine/ai.js";
const R = makeRules();
const [A, B, N] = [process.argv[2], process.argv[3], +(process.argv[4] || 300)];
// same deals played twice with the teams swapped → removes card luck
function run(dA, dB, seed) {
  const rng = seeded(seed), ri = intFrom(seeded(seed * 7 + 1));
  let m = newMatch({ rules: R, deck: shuffledDeck(ri), dealer: 0, target: 1e9 });
  const pts = [0, 0]; let n = 0;
  const d = (s) => (s % 2 === 0 ? dA : dB);
  while (n < N) {
    const h = m.hand;
    if (h.phase === "bidding") m = bid(m, h.turn, chooseBid({ ...viewFor(m, h.turn), difficulty: d(h.turn) }, rng)).match;
    else if (h.phase === "play") m = play(m, h.turn, choosePlay({ ...viewFor(m, h.turn), difficulty: d(h.turn), samples: 24 }, rng)).match;
    else if (h.phase === "trickEnd") m = collect(m).match;
    else if (h.phase === "redeal") m = redeal(m, shuffledDeck(ri)).match;
    else { n++; pts[0] += h.result.score[0]; pts[1] += h.result.score[1]; m = nextHand(m, shuffledDeck(ri)).match; }
  }
  return pts;
}
const a = run(A, B, 11), b = run(B, A, 11);
console.log(`${A} vs ${B} over ${N}×2 hands (same deals, seats swapped): ${A} ${a[0] + b[1]} – ${B} ${a[1] + b[0]}`);
