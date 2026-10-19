/**
 * DeclarationEngine (detector, comparator, scoring) + BeloteEngine.
 *
 * Declarations ("combinations"):
 *  - sequence of 3 in one suit (Terz) = 20, of 4 (Fifty) = 50, of 5+
 *    (Hundred) = 100; sequence order is the natural 7 8 9 10 J Q K A in
 *    every contract;
 *  - four of a kind: Jacks 200, Nines 150, Aces/Tens/Kings/Queens 100
 *    (sevens and eights never count; nines not in No Trump);
 *  - a card belongs to one combination only — the detector picks the
 *    partition worth the most.
 * Comparison: only the side holding the single best declaration scores (all
 * of its declarations); the other side's are void. Best = higher value, then
 * four-of-a-kind over sequence, then longer, then higher top card, then a
 * trump sequence over a plain one; a remaining tie is settled by
 * rules.declTie ("cancel": nobody scores, "eldest": the side of the player
 * who spoke first in the first trick).
 * Belote / Rebelote (K+Q of trump in one hand) is separate: never compared,
 * awarded when the second of the two cards is played.
 */
import { suitOf, rankOf, makeCard, RK, RQ } from "./deck.js";
import { isSuitStrain, NT, AT, strength } from "./rules.js";
import { teamOf } from "./play.js";

const seqValue = (len, rules) => (len >= 5 ? rules.seqValues[5] : rules.seqValues[len] || 0);

function sequencesOf(cards, rules) {
  const out = [];
  for (let s = 0; s < 4; s++) {
    const has = new Array(8).fill(false);
    for (const c of cards) if (suitOf(c) === s) has[rankOf(c)] = true;
    let r = 0;
    while (r < 8) {
      if (!has[r]) { r++; continue; }
      let e = r;
      while (e + 1 < 8 && has[e + 1]) e++;
      const len = e - r + 1;
      if (len >= 3) {
        const run = [];
        for (let k = r; k <= e; k++) run.push(makeCard(k, s));
        out.push({ kind: "seq", suit: s, len, top: e, cards: run, value: seqValue(len, rules) });
      }
      r = e + 1;
    }
  }
  return out;
}

function quadsOf(cards, strain, rules) {
  const out = [];
  for (let r = 0; r < 8; r++) {
    const v = rules.quadValues[r];
    if (!v) continue;
    if (strain === NT && r === 2 && !rules.quadNinesInNoTrump) continue; // rank index 2 = nine
    const set = cards.filter((c) => rankOf(c) === r);
    if (set.length === 4) out.push({ kind: "quad", rank: r, len: 4, top: r, suit: null, cards: set, value: v });
  }
  return out;
}

/** Best set of declarations for one hand (array, possibly empty). */
export function detectDeclarations(hand, strain, rules) {
  if (!rules.declarations) return [];
  if (strain === NT && !rules.declInNoTrump) return [];
  const quads = quadsOf(hand, strain, rules);
  let best = [], bestVal = -1;
  // try every subset of the (at most two) four-of-a-kinds; the rest forms sequences
  for (let mask = 0; mask < 1 << quads.length; mask++) {
    const used = quads.filter((_, i) => mask & (1 << i));
    const usedCards = new Set(used.flatMap((q) => q.cards));
    const seqs = sequencesOf(hand.filter((c) => !usedCards.has(c)), rules);
    const set = used.concat(seqs);
    const val = set.reduce((t, d) => t + d.value, 0);
    if (val > bestVal) { best = set; bestVal = val; }
  }
  return best.map((d) => ({ ...d, trump: d.kind === "seq" && (strain === AT || (isSuitStrain(strain) && d.suit === strain)) }));
}

/** Comparable key of one declaration (bigger array = stronger). */
export function declKey(d, strain) {
  // quads of equal value (A/10/K/Q) rank A > 10 > K > Q
  const top = d.kind === "quad" ? strength(makeCard(d.rank, 0), NT) : d.top;
  return [d.value, d.kind === "quad" ? 1 : 0, d.len, top, d.trump ? 1 : 0];
}
export function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Resolves the declarations of all four seats.
 * @param bySeat  detected declarations per seat
 * @param leader  seat that led the first trick (play order for "eldest")
 * @returns { team: 0|1|null, points: [raw0, raw1], best: [seat, decl] | null, tie: bool }
 */
export function resolveDeclarations(bySeat, strain, leader, rules) {
  const bestOf = [null, null]; // per team: { seat, decl, key, order }
  for (let k = 0; k < 4; k++) {
    const seat = (leader + k) % 4;
    for (const d of bySeat[seat] || []) {
      const key = declKey(d, strain);
      const t = teamOf(seat);
      if (!bestOf[t] || compareKeys(key, bestOf[t].key) > 0) bestOf[t] = { seat, decl: d, key, order: k };
    }
  }
  const total = (t) => [0, 1, 2, 3].filter((s) => teamOf(s) === t).reduce((sum, s) => sum + (bySeat[s] || []).reduce((x, d) => x + d.value, 0), 0);
  const points = [0, 0];
  if (!bestOf[0] && !bestOf[1]) return { team: null, points, best: null, tie: false };
  let team;
  let tie = false;
  if (!bestOf[1]) team = 0;
  else if (!bestOf[0]) team = 1;
  else {
    const c = compareKeys(bestOf[0].key, bestOf[1].key);
    if (c > 0) team = 0;
    else if (c < 0) team = 1;
    else {
      tie = true;
      team = rules.declTie === "eldest" ? (bestOf[0].order < bestOf[1].order ? 0 : 1) : null;
    }
  }
  if (team != null) points[team] = total(team);
  const b = team != null ? bestOf[team] : null;
  return { team, points, best: b ? [b.seat, b.decl] : null, tie };
}

/* ------------------------------------------------------------ Belote / Rebelote */

/** Seat holding trump K+Q at the start of play, or null. */
export function beloteHolder(hands, strain, rules) {
  if (!rules.belote) return null;
  if (!isSuitStrain(strain)) return null; // No Trump / All Trump have no Belote
  const k = makeCard(RK, strain), q = makeCard(RQ, strain);
  for (let s = 0; s < 4; s++) if (hands[s].includes(k) && hands[s].includes(q)) return s;
  return null;
}

/** Is this card one of the Belote pair under the strain? */
export const isBeloteCard = (card, strain) => isSuitStrain(strain) && suitOf(card) === strain && (rankOf(card) === RK || rankOf(card) === RQ);

export const DECL_NAMES = { 3: "terz", 4: "fifty", 5: "hundred" };
export const declName = (d) => (d.kind === "quad" ? "quad" : DECL_NAMES[Math.min(d.len, 5)]);
