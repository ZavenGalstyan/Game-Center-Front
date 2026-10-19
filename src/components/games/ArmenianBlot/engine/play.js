/**
 * LegalMoveEngine + TrickEngine.
 *
 * A trick is an array of { seat, card } in play order. Seats: 0 bottom
 * (human), 1 left, 2 top (partner), 3 right; play goes clockwise
 * (seat + 1) % 4 and team = seat % 2. The human UI and every AI call
 * `legalMoves` — there is no other source of legality.
 */
import { suitOf } from "./deck.js";
import { isTrump, strength, cardPoints, NT, AT } from "./rules.js";

export const nextSeat = (s) => (s + 1) % 4;
export const teamOf = (s) => s % 2;
export const partnerOf = (s) => (s + 2) % 4;

/** Is card `a` stronger than card `b` given the led suit and strain? */
export function beats(a, b, led, strain) {
  const ta = isTrump(a, strain) && strain !== AT, tb = isTrump(b, strain) && strain !== AT;
  if (ta && !tb) return true;
  if (tb && !ta) return false;
  const sa = suitOf(a), sb = suitOf(b);
  if (sa !== sb) {
    // neither is (a distinct) trump: only the led suit can win
    return sa === led && sb !== led;
  }
  return strength(a, strain) > strength(b, strain);
}

/** Index (into the trick array) of the card currently winning. */
export function winningIndex(trick, strain) {
  if (!trick.length) return -1;
  const led = suitOf(trick[0].card);
  let w = 0;
  for (let i = 1; i < trick.length; i++) if (beats(trick[i].card, trick[w].card, led, strain)) w = i;
  return w;
}
export const trickWinner = (trick, strain) => trick[winningIndex(trick, strain)].seat;
export const trickPoints = (trick, strain) => trick.reduce((t, p) => t + cardPoints(p.card, strain), 0);

/**
 * Legal cards for `seat` holding `hand`, given the cards already in `trick`.
 * Returns { cards, reason } where reason explains the obligation (for the UI
 * and Practice mode): lead | follow | followBeat | trump | overtrump |
 * partner | free | cannotBeat.
 */
export function legalMovesWhy(hand, trick, strain, seat, rules) {
  if (!trick.length) return { cards: hand.slice(), reason: "lead" };
  const led = suitOf(trick[0].card);
  const wi = winningIndex(trick, strain);
  const winCard = trick[wi].card;
  const partnerWinning = teamOf(trick[wi].seat) === teamOf(seat);
  const ofLed = hand.filter((c) => suitOf(c) === led);

  if (strain === NT) return ofLed.length ? { cards: ofLed, reason: "follow" } : { cards: hand.slice(), reason: "free" };

  if (strain === AT) {
    if (!ofLed.length) return { cards: hand.slice(), reason: "free" };
    if (!rules.allTrumpMustBeat || (partnerWinning && !rules.overtrumpOnTrumpLead)) return { cards: ofLed, reason: "follow" };
    // winner of the trick is necessarily of the led suit under All Trump
    const higher = ofLed.filter((c) => strength(c, strain) > strength(winCard, strain));
    return higher.length ? { cards: higher, reason: "followBeat" } : { cards: ofLed, reason: "follow" };
  }

  const trumpLed = led === strain;
  const trumps = hand.filter((c) => suitOf(c) === strain);
  const trickTrumps = trick.filter((p) => suitOf(p.card) === strain);
  const topTrump = trickTrumps.length ? trickTrumps.reduce((m, p) => (strength(p.card, strain) > strength(m, strain) ? p.card : m), trickTrumps[0].card) : null;
  const higherTrumps = topTrump == null ? trumps : trumps.filter((c) => strength(c, strain) > strength(topTrump, strain));

  if (ofLed.length) {
    if (!trumpLed) return { cards: ofLed, reason: "follow" };
    // trump led: must go higher when possible (over the partner too, if the preset says so)
    if (partnerWinning && !rules.overtrumpOnTrumpLead) return { cards: ofLed, reason: "follow" };
    return higherTrumps.length ? { cards: higherTrumps, reason: "followBeat" } : { cards: ofLed, reason: "follow" };
  }

  // void in the led suit
  if (!trumps.length) return { cards: hand.slice(), reason: "free" };
  if (partnerWinning && rules.partnerException) return { cards: hand.slice(), reason: "partner" };
  if (!rules.mustTrump) return { cards: hand.slice(), reason: "free" };
  if (topTrump == null) return { cards: trumps, reason: "trump" };
  if (higherTrumps.length && rules.mustOvertrump) return { cards: higherTrumps, reason: "overtrump" };
  if (higherTrumps.length) return { cards: trumps, reason: "trump" };
  // an opponent's trump we cannot beat
  if (rules.undertrumpRequired) return { cards: trumps, reason: "trump" };
  return { cards: hand.slice(), reason: "cannotBeat" };
}

export const legalMoves = (hand, trick, strain, seat, rules) => legalMovesWhy(hand, trick, strain, seat, rules).cards;
export const isLegal = (card, hand, trick, strain, seat, rules) => hand.includes(card) && legalMoves(hand, trick, strain, seat, rules).includes(card);
