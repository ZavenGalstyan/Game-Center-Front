/**
 * The poker rules come from the Game Center's existing, tested No-Limit
 * Hold'em engine (../../TexasHoldemPoker/engine): integer cards, unbiased
 * Fisher–Yates shuffle (crypto RNG), the rank/suit-count evaluator, the pure
 * table state machine (blinds, streets, legal actions, short all-ins, uncalled
 * bets), side pots with the odd-chip rule and the Monte Carlo AI.
 * This module is the single import point for Wild West: Card Showdown and adds
 * the hand descriptions the game shows (written as whole template sentences so
 * the Game Center translator can localise them).
 */
export {
  freshDeck, shuffle, shuffledDeck, seeded, intFrom, secureInt, rankOf, suitOf, makeCard, parseCard, parseCards, cardStr, isCard,
} from "../../TexasHoldemPoker/engine/cards.js";
export { scoreHand, evaluate, categoryOf, kickersOf, CAT } from "../../TexasHoldemPoker/engine/evaluator.js";
export { buildPots, distribute } from "../../TexasHoldemPoker/engine/pots.js";
export {
  createTable, startHand, legalActions, applyAction, advance, viewFor, live, potTotal, potCollected, chipsAtTable, activeSeats,
  validateTable, currentScore, needsToAct, bettingClosed, STREETS,
} from "../../TexasHoldemPoker/engine/table.js";
export { decide, observeHand, readTendency, equity, chen, finalize, DIFFICULTY } from "../../TexasHoldemPoker/engine/ai.js";

import { categoryOf, kickersOf, CAT } from "../../TexasHoldemPoker/engine/evaluator.js";

const ONE = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const MANY = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];
const one = (r) => ONE[r - 2];
const many = (r) => MANY[r - 2];

export const HAND_NAMES = [
  "High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush",
];

/** 0 … 9 (9 = Royal Flush, split out of the straight flushes). */
export function rankClass(score) {
  const c = categoryOf(score);
  return c === CAT.STRAIGHT_FLUSH && kickersOf(score)[0] === 14 ? 9 : c;
}
export const handName = (score) => HAND_NAMES[rankClass(score)];

/** e.g. "Full House, Kings over Sevens". */
export function describeHand(score) {
  const k = kickersOf(score);
  switch (rankClass(score)) {
    case 9: return "Royal Flush";
    case 8: return `Straight Flush, ${one(k[0])}-high`;
    case 7: return `Four of a Kind, ${many(k[0])}`;
    case 6: return `Full House, ${many(k[0])} over ${many(k[1])}`;
    case 5: return `Flush, ${one(k[0])}-high`;
    case 4: return `Straight, ${one(k[0])}-high`;
    case 3: return `Three of a Kind, ${many(k[0])}`;
    case 2: return `Two Pair, ${many(k[0])} and ${many(k[1])}`;
    case 1: return `Pair of ${many(k[0])}`;
    default: return `High Card, ${one(k[0])}`;
  }
}

/** Short name of the two hole cards before the flop ("Pocket Aces", "Suited connectors"). */
export function holeLabel(hole) {
  const [a, b] = hole;
  const ra = (a >> 2) + 2, rb = (b >> 2) + 2;
  if (ra === rb) return `Pocket ${many(ra)}`;
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  const suited = (a & 3) === (b & 3);
  if (hi - lo === 1) return suited ? "Suited connectors" : "Connectors";
  if (suited) return `${one(hi)}-${one(lo)} suited`;
  return `${one(hi)}-${one(lo)} offsuit`;
}
