/**
 * AI self-play statistics (headless).
 *   node src/components/games/ArmenianBlot/tools/aiSim.mjs [hands=300] [preset]
 * Reports: auction outcomes, contract levels/strains, success rate, points
 * per hand, hand count for each match target, and difficulty match-ups.
 */
import { shuffledDeck, seeded, intFrom } from "../engine/deck.js";
import { makeRules } from "../engine/rules.js";
import { newMatch, bid, play, collect, redeal, nextHand, viewFor } from "../engine/match.js";
import { chooseBid, choosePlay } from "../engine/ai.js";

const N = +(process.argv[2] || 300);
const R = makeRules(process.argv[3] || "armenianClassic");
const rng = seeded(2024);
const ri = intFrom(seeded(99));

function step(m, diffOf) {
  const h = m.hand;
  if (h.phase === "bidding") return bid(m, h.turn, chooseBid({ ...viewFor(m, h.turn), difficulty: diffOf(h.turn) }, rng)).match;
  if (h.phase === "play") return play(m, h.turn, choosePlay({ ...viewFor(m, h.turn), difficulty: diffOf(h.turn), samples: 20 }, rng)).match;
  if (h.phase === "trickEnd") return collect(m).match;
  if (h.phase === "redeal") return redeal(m, shuffledDeck(ri)).match;
  return null;
}

function hands(diffOf, n) {
  const st = { hands: 0, redeals: 0, made: 0, levels: {}, strains: {}, contra: 0, kaput: 0, capot: 0, pts: [0, 0], made0: 0, c0: 0 };
  let m = newMatch({ rules: R, deck: shuffledDeck(ri), dealer: 0, target: 1e9 });
  while (st.hands < n) {
    while (m.hand.phase !== "scored") {
      if (m.hand.phase === "redeal") st.redeals++;
      m = step(m, diffOf);
    }
    const h = m.hand, c = h.contract;
    st.hands++;
    if (h.result.made) st.made++;
    st.levels[c.kaput ? "K" : c.level] = (st.levels[c.kaput ? "K" : c.level] || 0) + 1;
    st.strains[c.strain] = (st.strains[c.strain] || 0) + 1;
    if (c.mult > 1) st.contra++;
    if (h.result.capotTeam != null) st.capot++;
    st.pts[0] += h.result.score[0]; st.pts[1] += h.result.score[1];
    if (c.team === 0) { st.c0++; if (h.result.made) st.made0++; }
    m = nextHand(m, shuffledDeck(ri)).match;
  }
  return st;
}

const t0 = Date.now();
const med = hands(() => "medium", N);
console.log(`medium self-play, ${N} hands (${R.id})`);
console.log(`  redeals ${med.redeals}, contracts made ${(100 * med.made / med.hands).toFixed(0)}%, contra'd ${med.contra}, capots ${med.capot}`);
console.log(`  levels`, med.levels, "strains", med.strains);
console.log(`  avg match points per hand ${((med.pts[0] + med.pts[1]) / med.hands).toFixed(1)} → hands to 101/201/301 ≈ ${[101, 201, 301].map((t) => (t / ((med.pts[0] + med.pts[1]) / med.hands / 2)).toFixed(0)).join("/")}`);
for (const [a, b] of [["hard", "medium"], ["medium", "easy"], ["hard", "easy"]]) {
  const s = hands((seat) => (seat % 2 === 0 ? a : b), Math.round(N / 2));
  console.log(`${a} (team A) vs ${b}: ${s.pts[0]} – ${s.pts[1]}  (team A contracts ${s.made0}/${s.c0} made)`);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
