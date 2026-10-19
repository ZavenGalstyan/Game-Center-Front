/**
 * Texas Hold'em hand evaluator.
 *
 * evaluate(cards) takes 5–7 cards and returns the best five-card hand as a
 * single comparable integer `score` (higher wins, equal = exact tie):
 *
 *   score = category · 16^5 + k1 · 16^4 + k2 · 16^3 + k3 · 16^2 + k4 · 16 + k5
 *
 * where category is 0 (High Card) … 8 (Straight Flush) and k1..k5 are the
 * ranks that decide ties inside the category, most significant first
 * (e.g. Full House = [trips rank, pair rank]; Two Pair = [high pair, low pair,
 * kicker]; Straight = [top card], with the wheel A-2-3-4-5 topping at 5).
 * A Royal Flush is the ace-high Straight Flush.
 *
 * The evaluator works directly on rank/suit counts (no 21-combination loop),
 * so the AI can run thousands of Monte Carlo showdowns per decision. The test
 * suite cross-checks it against a naive brute-force evaluator.
 */
import { rankOf, suitOf, rankWord, rankPlural } from "./cards.js";

export const CATEGORY_NAMES = [
  "High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight",
  "Flush", "Full House", "Four of a Kind", "Straight Flush",
];
export const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8 };
const BASE = 16 ** 5;

const pack = (cat, ks) => {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] || 0);
  return cat * BASE + v;
};
export const categoryOf = (score) => Math.floor(score / BASE);
export const kickersOf = (score) => {
  const out = [];
  let v = score % BASE;
  for (let i = 0; i < 5; i++) { out.unshift(v % 16); v = Math.floor(v / 16); }
  return out;
};

/** Highest straight top-card in a rank bitmask (bit r = rank r present), or 0. */
function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 1 << 1; // ace plays low in the wheel
  for (let h = 14; h >= 5; h--) {
    if (((mask >> (h - 4)) & 0x1f) === 0x1f) return h;
  }
  return 0;
}

/** Ranks present in a bitmask, high → low, at most n of them, skipping `skip`. */
function topRanks(mask, n, skip = []) {
  const out = [];
  for (let r = 14; r >= 2 && out.length < n; r--) {
    if (mask & (1 << r) && !skip.includes(r)) out.push(r);
  }
  return out;
}

/** Score of the best 5-card hand contained in `cards` (5–7 card ints). */
export function scoreHand(cards) {
  const counts = new Array(15).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitMask = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = rankOf(c), s = suitOf(c);
    counts[r]++;
    suitCount[s]++;
    suitMask[s] |= 1 << r;
    mask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMask[flushSuit]);
    if (sf) return pack(CAT.STRAIGHT_FLUSH, [sf]);
  }

  const quads = [], trips = [], pairs = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quads.length) return pack(CAT.QUADS, [quads[0], topRanks(mask, 1, [quads[0]])[0]]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pair = Math.max(trips[1] || 0, pairs[0] || 0);
    return pack(CAT.FULL_HOUSE, [trips[0], pair]);
  }
  if (flushSuit >= 0) return pack(CAT.FLUSH, topRanks(suitMask[flushSuit], 5));
  const st = straightHigh(mask);
  if (st) return pack(CAT.STRAIGHT, [st]);
  if (trips.length) return pack(CAT.TRIPS, [trips[0], ...topRanks(mask, 2, [trips[0]])]);
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return pack(CAT.TWO_PAIR, [a, b, topRanks(mask, 1, [a, b])[0]]);
  }
  if (pairs.length) return pack(CAT.PAIR, [pairs[0], ...topRanks(mask, 3, [pairs[0]])]);
  return pack(CAT.HIGH, topRanks(mask, 5));
}

/** Every k-combination of arr (small inputs only). */
export function combinations(arr, k) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i <= arr.length - (k - acc.length); i++) {
      acc.push(arr[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

/** Human-readable description of a score, e.g. "Full House, Kings full of Sevens". */
export function describe(score) {
  const cat = categoryOf(score);
  const k = kickersOf(score);
  switch (cat) {
    case CAT.STRAIGHT_FLUSH: return k[0] === 14 ? "Royal Flush" : `Straight Flush, ${rankWord(k[0])} high`;
    case CAT.QUADS: return `Four of a Kind, ${rankPlural(k[0])}`;
    case CAT.FULL_HOUSE: return `Full House, ${rankPlural(k[0])} full of ${rankPlural(k[1])}`;
    case CAT.FLUSH: return `Flush, ${rankWord(k[0])} high`;
    case CAT.STRAIGHT: return `Straight, ${rankWord(k[0])} high`;
    case CAT.TRIPS: return `Three of a Kind, ${rankPlural(k[0])}`;
    case CAT.TWO_PAIR: return `Two Pair, ${rankPlural(k[0])} and ${rankPlural(k[1])}`;
    case CAT.PAIR: return `Pair of ${rankPlural(k[0])}`;
    default: return `High Card, ${rankWord(k[0])}`;
  }
}

/** Display name of the category (with Royal Flush split out). */
export function handName(score) {
  const cat = categoryOf(score);
  if (cat === CAT.STRAIGHT_FLUSH && kickersOf(score)[0] === 14) return "Royal Flush";
  return CATEGORY_NAMES[cat];
}

export const isRoyal = (score) => categoryOf(score) === CAT.STRAIGHT_FLUSH && kickersOf(score)[0] === 14;

/**
 * Full evaluation for showdown display: score, names and the actual best five
 * cards (chosen among all 5-card subsets with the winning score; the first
 * such subset in sorted order, so the result is deterministic).
 */
export function evaluate(cards) {
  const score = scoreHand(cards);
  let best = cards.slice(0, 5);
  if (cards.length > 5) {
    for (const combo of combinations(cards, 5)) {
      if (scoreHand(combo) === score) { best = combo; break; }
    }
  }
  best = best.slice().sort((a, b) => rankOf(b) - rankOf(a) || suitOf(b) - suitOf(a));
  return { score, category: categoryOf(score), name: handName(score), desc: describe(score), best };
}

/** Compare two scores: >0 if a wins, <0 if b wins, 0 tie. */
export const compare = (a, b) => a - b;
